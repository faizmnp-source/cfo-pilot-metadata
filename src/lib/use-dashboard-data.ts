// Pulls live numbers for the Executive Dashboard. Hits report APIs.
// Falls back to the static cfo-data values if nothing has been loaded yet
// (so the dashboard never looks broken in a fresh tenant).
"use client";
import { useEffect, useState } from "react";

interface Member { id: string; code: string; name: string; properties?: any }

export interface DashboardKpis {
  revenue: { value: number; delta: number; trend: "up"|"down"|"neutral"; sparkline: number[] };
  ebitda:  { value: number; delta: number; trend: "up"|"down"|"neutral"; sparkline: number[] };
  cash:    { value: number; delta: number; trend: "up"|"down"|"neutral"; sparkline: number[] };
  burnRate:{ value: number; delta: number; trend: "up"|"down"|"neutral"; sparkline: number[] };
  loaded:  boolean;
  hasData: boolean;
  yearCode: string;
  entityName: string;
  ccy: string;
  // Monthly trend for the line chart
  monthly: { code: string; revenue: number; expense: number; netIncome: number }[];
}

async function fetchMembers(slug: string): Promise<Member[]> {
  const r = await fetch(`/api/v2/members/${slug}?pageSize=500`, { credentials: "include" });
  const j = await r.json().catch(() => null);
  return (j?.data?.data ?? []).filter((m: any) => m.isActive);
}

async function fetchReport(kind: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params);
  const r = await fetch(`/api/v2/reports/${kind}?${qs}`, { credentials: "include" });
  const j = await r.json().catch(() => null);
  if (!r.ok) return null;
  return j?.data ?? null;
}

export function useDashboardData() {
  const [data, setData] = useState<DashboardKpis>({
    revenue: { value: 0, delta: 0, trend: "neutral", sparkline: [] },
    ebitda:  { value: 0, delta: 0, trend: "neutral", sparkline: [] },
    cash:    { value: 0, delta: 0, trend: "neutral", sparkline: [] },
    burnRate:{ value: 0, delta: 0, trend: "neutral", sparkline: [] },
    loaded: false, hasData: false, yearCode: "", entityName: "", ccy: "USD",
    monthly: [],
  });

  useEffect(() => {
    (async () => {
      try {
        const [scenarios, entities, times] = await Promise.all([
          fetchMembers("scenario"), fetchMembers("entity"), fetchMembers("time"),
        ]);

        const scenarioId = (scenarios.find(s => /^(ACT|ACTUAL)/i.test(s.code)) ?? scenarios[0])?.id;
        const yearMember = times.find(t => /^FY\d{4}$/.test(t.code));
        if (!scenarioId || !yearMember || entities.length === 0) {
          setData(d => ({ ...d, loaded: true, hasData: false }));
          return;
        }

        // Pull report PER entity in parallel. Aggregate across entities so
        // dashboard shows true "group" numbers even before consolidation
        // has been run (facts live at leaves, parent GRP is empty until
        // consol). This matches what a CFO expects to see on day-1.
        const reports = await Promise.all(entities.map(async (ent) => {
          const [is, bs] = await Promise.all([
            fetchReport("income-statement", { scenarioId, entityId: ent.id, yearCode: yearMember.code }),
            fetchReport("balance-sheet",    { scenarioId, entityId: ent.id, yearCode: yearMember.code }),
          ]);
          let revenue = 0, expense = 0, cash = 0;
          if (is?.sections) for (const s of is.sections) {
            if (s.type === "REVENUE") revenue += s.subtotal?.value ?? 0;
            if (s.type === "EXPENSE") expense += s.subtotal?.value ?? 0;
          }
          if (bs?.sections) for (const s of bs.sections) {
            if (s.type === "ASSET") {
              const cashLine = s.lines?.find((l: any) => /cash/i.test(l.name));
              if (cashLine) cash += cashLine.value;
            }
          }
          return { ent, revenue, expense, cash, hasFacts: (is?.meta?.rowsRead ?? 0) > 0 };
        }));

        // Prefer GRP/parent if it has facts (means consolidation has run).
        // Otherwise sum across leaf entities (raw multi-entity view).
        const grpReport = reports.find(r => r.ent.code === "GRP" && r.hasFacts);
        let revenue = 0, expense = 0, cash = 0;
        let entityName = "All entities";
        if (grpReport) {
          revenue = grpReport.revenue; expense = grpReport.expense; cash = grpReport.cash;
          entityName = (grpReport.ent as any).memberName ?? grpReport.ent.name ?? grpReport.ent.code;
        } else {
          // Sum leaves (entities other than GRP/parent rollups)
          const leaves = reports.filter(r => r.ent.code !== "GRP" && r.hasFacts);
          for (const r of leaves) { revenue += r.revenue; expense += r.expense; cash += r.cash; }
          if (leaves.length === 1) entityName = (leaves[0].ent as any).memberName ?? leaves[0].ent.code;
          else if (leaves.length > 1) entityName = `${leaves.length} entities (pre-consolidation)`;
        }

        const netIncome = revenue - expense;
        const ebitda    = netIncome;
        const hasData = revenue !== 0 || expense !== 0 || cash !== 0;

        // Pull monthly trend for chart + sparklines
        const targetEntityIds = grpReport ? [grpReport.ent.id] : reports.filter(r => r.ent.code !== "GRP" && r.hasFacts).map(r => r.ent.id);
        const monthlyResp = targetEntityIds.length > 0
          ? await fetch(`/api/v2/reports/monthly-trend?scenarioId=${scenarioId}&entityId=${targetEntityIds.join(",")}&yearCode=${yearMember.code}`, { credentials: "include" })
              .then(r => r.json()).catch(() => null)
          : null;
        const monthly = (monthlyResp?.data?.months ?? []) as { code: string; revenue: number; expense: number; netIncome: number }[];

        // Fetch reporting currency for symbol display
        const settingsResp = await fetch("/api/settings", { credentials: "include" }).then(r => r.json()).catch(() => null);
        const ccy = settingsResp?.data?.reportingCurrency ?? "USD";

        setData({
          revenue:  { value: revenue,   delta: 0, trend: revenue   > 0 ? "up"   : "neutral", sparkline: monthly.map(m => m.revenue) },
          ebitda:   { value: ebitda,    delta: 0, trend: ebitda    > 0 ? "up"   : "down",    sparkline: monthly.map(m => m.netIncome) },
          cash:     { value: cash,      delta: 0, trend: cash      > 0 ? "up"   : "neutral", sparkline: [] },
          burnRate: { value: Math.abs(expense) / 12, delta: 0, trend: "up",                  sparkline: monthly.map(m => m.expense) },
          loaded: true, hasData,
          yearCode: yearMember.code,
          entityName,
          ccy,
          monthly,
        });
      } catch (e) {
        console.error("dashboard load failed:", e);
        setData(d => ({ ...d, loaded: true, hasData: false }));
      }
    })();
  }, []);

  return data;
}
