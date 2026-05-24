"use client";
import { useEffect, useState } from "react";

export default function DashboardPulse() {
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
    document.body.classList.add("pulse-theme");
    return () => { document.body.classList.remove("pulse-theme"); };
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
    return (n < 0 ? "−" : "") + sym + body;
  };

  const ni = data?.kpis?.netIncome?.value ?? 0;
  const rev = data?.kpis?.revenue?.value ?? 0;

  return (
    <main className="flex-1 overflow-y-auto p-10" style={{ background: "var(--p-bg)", fontFamily: "var(--font-pulse)" }}>
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: "var(--p-ink-3)" }}>Direction B · Pulse</span>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--p-violet)" }} />
          </div>
          <h1 className="pulse-serif" style={{ fontSize: 56, lineHeight: 1, letterSpacing: "-0.03em" }}><em>The pulse of</em> your business.</h1>
          <p className="mt-3 text-sm" style={{ color: "var(--p-ink-3)" }}>Apollo Hospitals · FY2026 · {data?.meta?.factsRead?.toLocaleString() ?? "—"} facts</p>
        </div>
        <a href="/design-prototype/direction-b.html" target="_blank" className="text-xs px-4 py-2 rounded-full font-semibold" style={{ background: "var(--p-violet)", color: "white" }}>View raw prototype →</a>
      </div>

      <div className="pulse-hero-dark p-10 mb-6 grid grid-cols-[2fr_1fr] gap-8 items-center">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: "var(--p-violet-2)" }}>Net Income · FY2026</p>
          <p className="pulse-num mt-3" style={{ fontSize: 96, lineHeight: 0.95, color: "white" }}>{fmt(ni)}</p>
          <p className="mt-3 pulse-serif italic" style={{ fontSize: 20, color: "var(--p-ink-3)" }}>{ni >= 0 ? "Strong year across all 4 hospitals." : "Margin pressure from drug procurement."}</p>
        </div>
        <div className="flex flex-col gap-4">
          {[
            { l: "Revenue", v: rev },
            { l: "Gross Profit", v: data?.kpis?.grossProfit?.value ?? 0 },
            { l: "Operating Exp", v: data?.kpis?.opex?.value ?? 0 },
          ].map((k, i) => (
            <div key={i} className="flex justify-between items-baseline">
              <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--p-ink-3)" }}>{k.l}</span>
              <span className="pulse-num" style={{ fontSize: 22, color: "white" }}>{fmt(k.v)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { l: "OPD",      v: 35e7,  d: "+12%" },
          { l: "IPD",      v: 70e7,  d: "+18%" },
          { l: "Surgery",  v: 54e7,  d: "+9%" },
          { l: "Pharmacy", v: 27e7,  d: "−3%" },
        ].map((k, i) => (
          <div key={i} className="pulse-glass p-5">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: "var(--p-ink-3)" }}>{k.l}</p>
            <p className="pulse-num mt-2" style={{ fontSize: 28 }}>{fmt(k.v)}</p>
            <p className="text-[11px] mt-1" style={{ color: k.d.startsWith("+") ? "var(--p-emerald)" : "var(--p-rose)" }}>{k.d}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-6">
        <div className="pulse-glass p-7">
          <div className="flex justify-between items-baseline mb-3">
            <h3 className="pulse-serif" style={{ fontSize: 24 }}><em>By</em> hospital</h3>
            <span className="text-xs" style={{ color: "var(--p-ink-3)" }}>{(data?.byEntity ?? []).length} entities</span>
          </div>
          {(data?.byEntity ?? []).slice(0, 6).map((e: any) => (
            <div key={e.id} className="flex justify-between items-baseline py-3 border-t" style={{ borderColor: "var(--p-line)" }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{e.name}</span>
              <span className="pulse-num" style={{ fontSize: 18 }}>{fmt(e.value)}</span>
            </div>
          ))}
        </div>
        <div className="pulse-hero-dark p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "linear-gradient(135deg, #5a3fff, #8b75ff)" }}>L</span>
            <div>
              <p className="text-sm font-semibold">Lyra</p>
              <p className="text-[10px] uppercase tracking-wider opacity-60">live narrator</p>
            </div>
          </div>
          <p className="pulse-serif italic" style={{ fontSize: 22, lineHeight: 1.3 }}>
            {ni >= 0 ? "Bangalore led the comeback. Cardiac volumes up 18% — recurring, not seasonal." : "Drug procurement up 14% vs budget. Renegotiate before Q3 close."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="text-[11px] px-3 py-1.5 rounded-full pulse-accent font-semibold">Why?</button>
            <button className="text-[11px] px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)", color: "white" }}>Drill down</button>
          </div>
        </div>
      </div>
    </main>
  );
}
