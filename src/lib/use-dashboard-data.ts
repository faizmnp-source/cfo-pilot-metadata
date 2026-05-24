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
    loaded: false, hasData: false, yearCode: "", entityName: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const [scenarios, entities, times] = await Promise.all([
          fetchMembers("scenario"), fetchMembers("entity"), fetchMembers("time"),
        ]);

        // Pick ACTUAL scenario, GRP/parent entity, latest FY
        const scenarioId = (scenarios.find(s => /^(ACT|ACTUAL)/i.test(s.code)) ?? scenarios[0])?.id;
        const entity = entities.find(e => e.code === "GRP") ?? entities[0];
        const yearMember = times.find(t => /^FY\d{4}$/.test(t.code));
        if (!scenarioId || !entity || !yearMember) {
          setData(d => ({ ...d, loaded: true, hasData: false }));
          return;
        }

        const [is, bs] = await Promise.all([
          fetchReport("income-statement", { scenarioId, entityId: entity.id, yearCode: yearMember.code }),
          fetchReport("balance-sheet",    { scenarioId, entityId: entity.id, yearCode: yearMember.code }),
        ]);

        // Extract revenue + opex from IS, net income from totals
        let revenue = 0, expense = 0, cash = 0;
        if (is?.sections) {
          for (const s of is.sections) {
            if (s.type === "REVENUE") revenue = s.subtotal?.value ?? 0;
            if (s.type === "EXPENSE") expense = s.subtotal?.value ?? 0;
          }
        }
        if (bs?.sections) {
          for (const s of bs.sections) {
            if (s.type === "ASSET") {
              // Find the Cash & Bank account specifically
              const cashLine = s.lines?.find((l: any) => /cash/i.test(l.name));
              if (cashLine) cash = cashLine.value;
            }
          }
        }
        const netIncome = revenue - expense;
        const ebitda    = netIncome;  // pre-tax / pre-interest approx for v1

        const hasData = revenue !== 0 || expense !== 0 || cash !== 0;

        setData({
          revenue:  { value: revenue,   delta: 0, trend: revenue   > 0 ? "up"   : "neutral", sparkline: [] },
          ebitda:   { value: ebitda,    delta: 0, trend: ebitda    > 0 ? "up"   : "down",    sparkline: [] },
          cash:     { value: cash,      delta: 0, trend: cash      > 0 ? "up"   : "neutral", sparkline: [] },
          burnRate: { value: Math.abs(expense) / 12, delta: 0, trend: "up",                  sparkline: [] },
          loaded: true, hasData,
          yearCode: yearMember.code,
          entityName: (entity as any).memberName ?? entity.name ?? entity.code,
        });
      } catch (e) {
        console.error("dashboard load failed:", e);
        setData(d => ({ ...d, loaded: true, hasData: false }));
      }
    })();
  }, []);

  return data;
}
