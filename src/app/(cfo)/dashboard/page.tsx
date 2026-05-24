"use client";
import { useEffect, useState } from "react";

export default function DashboardAtelier() {
  const [data, setData] = useState<any>(null);
  const [ccy, setCcy] = useState("INR");

  useEffect(() => {
    (async () => {
      const s = await fetch("/api/settings", { credentials: "include" }).then(r => r.json()).catch(() => null);
      const pov = s?.data?.defaultPov ?? {};
      setCcy(s?.data?.reportingCurrency ?? "INR");
      const scn = (await fetch("/api/v2/members/scenario?pageSize=20", { credentials: "include" }).then(r => r.json())).data?.data ?? [];
      const actId = scn.find((x: any) => x.memberCode === (pov.scenarioCode || "Actual"))?.id ?? scn[0]?.id;
      if (!actId) return;
      const qs = new URLSearchParams({ scenarioId: actId, yearCode: pov.periodCode || "FY2026" });
      const r = await fetch(`/api/v2/dashboard/summary?${qs}`, { credentials: "include" });
      const j = await r.json();
      if (r.ok) setData(j.data);
    })();
    document.body.classList.add("atelier-theme");
    return () => { document.body.classList.remove("atelier-theme"); };
  }, []);

  const fmt = (n: number) => {
    if (!Number.isFinite(n) || n === 0) return "—";
    const abs = Math.abs(n);
    const sym = ccy === "INR" ? "₹" : ccy === "USD" ? "$" : ccy + " ";
    let body: string;
    if (abs >= 1e9) body = (abs/1e9).toFixed(1) + "B";
    else if (abs >= 1e6) body = (abs/1e6).toFixed(1) + "M";
    else if (abs >= 1e3) body = (abs/1e3).toFixed(0) + "K";
    else body = abs.toFixed(0);
    return (n < 0 ? "(" : "") + sym + body + (n < 0 ? ")" : "");
  };

  const ni = data?.kpis?.netIncome?.value ?? 0;
  const rev = data?.kpis?.revenue?.value ?? 0;
  const gp = data?.kpis?.grossProfit?.value ?? 0;
  const ox = data?.kpis?.opex?.value ?? 0;

  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <div className="px-12 pt-8 pb-4 border-b flex items-end justify-between" style={{ borderColor: "var(--ink)" }}>
        <div>
          <p className="atelier-eyebrow">Direction A · Atelier · FY2026 Edition</p>
          <h1 className="atelier-serif mt-2" style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.02em" }}>The Executive Brief</h1>
          <p className="mt-2 italic" style={{ fontFamily: "var(--font-serif)", color: "var(--ink-3)", fontSize: 14 }}>Curated by Lyra — your FP&A Copilot</p>
        </div>
        <a href="/design-prototype/direction-a.html" target="_blank" className="text-xs px-3 py-1.5 rounded-full border" style={{ borderColor: "var(--ink)", color: "var(--ink)" }}>View raw prototype →</a>
      </div>

      <div className="px-12 py-3 border-b text-xs" style={{ borderColor: "var(--rule)", color: "var(--ink-3)" }}>
        Apollo Hospitals · {data?.meta?.factsRead?.toLocaleString() ?? "—"} facts read
      </div>

      <div className="px-12 py-10 grid grid-cols-[1.6fr_1fr] gap-12">
        <div>
          <p className="atelier-eyebrow" style={{ color: "var(--accent)" }}>Net Income · FY2026</p>
          <p className="atelier-serif" style={{ fontSize: 110, lineHeight: 0.9, fontWeight: 400, marginTop: 6 }}>
            <span className={ni < 0 ? "atelier-neg" : ""}>{fmt(ni)}</span>
          </p>
          <p className="italic mt-4" style={{ fontFamily: "var(--font-serif)", fontSize: 17, color: "var(--ink-2)", maxWidth: 520 }}>
            {ni >= 0 ? "Strong year across all four hospitals." : "Drug procurement led the pressure on margin."}
          </p>
        </div>
        <div className="flex flex-col">
          {[
            { l: "Revenue", v: rev, neg: false },
            { l: "Gross Profit", v: gp, neg: false },
            { l: "Operating Exp", v: ox, neg: true },
            { l: "Net Income", v: ni, neg: ni < 0 },
          ].map((row, i) => (
            <div key={i} className="flex justify-between items-baseline py-2 border-t" style={{ borderColor: "var(--rule)" }}>
              <span className="atelier-eyebrow">{row.l}</span>
              <span className="atelier-serif" style={{ fontSize: 26, color: row.neg ? "var(--accent)" : "var(--ink)" }}>{fmt(row.v)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-12 pb-12 grid grid-cols-[1fr_380px] gap-12">
        <div className="atelier-card">
          <h3 className="atelier-eyebrow">By Hospital</h3>
          {(data?.byEntity ?? []).slice(0, 6).map((e: any) => (
            <div key={e.id} className="flex justify-between py-3 border-t" style={{ borderColor: "var(--rule)" }}>
              <span className="atelier-serif" style={{ fontSize: 18 }}>{e.name} <span className="atelier-eyebrow ml-2">{e.code}</span></span>
              <span className="atelier-serif" style={{ fontSize: 18 }}>{fmt(e.value)}</span>
            </div>
          ))}
        </div>
        <div className="atelier-card">
          <div className="flex items-center gap-2 pb-3 border-b" style={{ borderColor: "var(--ink)" }}>
            <span className="atelier-serif italic" style={{ fontSize: 16, fontWeight: 600, border: "1.5px solid var(--ink)", borderRadius: "50%", width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>L</span>
            <div>
              <p className="atelier-serif italic" style={{ fontWeight: 600, fontSize: 16 }}>Lyra</p>
              <p className="atelier-eyebrow">FP&A Copilot · Morning Brief</p>
            </div>
          </div>
          <h4 className="atelier-serif mt-4" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.15 }}>
            {ni >= 0 ? "Profitable year — investigate Q4 momentum." : "Net loss — drug cost is the pressure point."}
          </h4>
          <p className="mt-3" style={{ fontFamily: "var(--font-serif)", fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)" }}>
            <span style={{ fontSize: 60, lineHeight: 0.85, float: "left", paddingRight: 8, paddingTop: 4, fontWeight: 600 }}>{ni >= 0 ? "S" : "T"}</span>
            {ni >= 0 ? "trip the seasonal lift out of December and FY2026 still closes ahead. Bangalore over-indexed on IPD; Chennai held the line." : "he expense block is led by drug procurement. Renegotiate vendor terms before Q3 close."}
          </p>
          <p className="mt-4 italic atelier-neg" style={{ fontFamily: "var(--font-serif)" }}>"The numbers tell you what — Lyra tells you why."</p>
        </div>
      </div>
    </main>
  );
}
