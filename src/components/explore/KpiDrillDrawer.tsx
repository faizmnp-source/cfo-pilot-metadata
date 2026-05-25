"use client";
import { useEffect, useState } from "react";
import { FactDetailDrawer } from "./FactDetailDrawer";

type Contributor = {
  entityId: string; entityCode: string; entityName: string;
  accountId?: string; accountCode?: string; accountName?: string;
  value: number;
};

export function KpiDrillDrawer({
  open, onClose, kpiLabel, kpi, povIds, currencySymbol = "₹",
}: {
  open: boolean;
  onClose: () => void;
  kpiLabel: string;
  kpi: "revenue"|"opex"|"netIncome"|"cash"|"grossProfit";
  povIds: { scenarioId: string | null; timeId: string | null; entityIds: string[] };
  currencySymbol?: string;
}) {
  const [contribs, setContribs] = useState<Contributor[] | null>(null);
  const [drillFact, setDrillFact] = useState<{ entityId: string; accountId: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!povIds.scenarioId || !povIds.timeId) { setError("POV not fully resolved"); return; }
    setLoading(true); setError(null); setContribs(null);
    fetch("/api/v2/intelligence/top-contributors", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kpi, povIds, top: 12 }),
    })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`); setContribs(j?.data?.contributors ?? []); })
      .catch(e => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [open, kpi, povIds.scenarioId, povIds.timeId, povIds.entityIds.join(",")]);

  if (!open) return null;
  const fmt = (n: number) => {
    if (!Number.isFinite(n) || n === 0) return "—";
    const abs = Math.abs(n);
    const s = abs >= 1e9 ? (abs/1e9).toFixed(1)+"B" : abs >= 1e6 ? (abs/1e6).toFixed(1)+"M" : abs >= 1e3 ? (abs/1e3).toFixed(0)+"K" : abs.toFixed(0);
    return (n < 0 ? "(" : "") + currencySymbol + s + (n < 0 ? ")" : "");
  };
  const total = (contribs ?? []).reduce((a, c) => a + c.value, 0);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.32)", zIndex: 50 }} />
      <aside role="dialog" aria-label={`Drill: ${kpiLabel}`}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px, 100vw)", background: "var(--paper, #f5efe2)", borderLeft: "1px solid var(--ink, #1a1612)", boxShadow: "-12px 0 32px -16px rgba(26,22,18,0.32)", zIndex: 51, overflowY: "auto" }}>
        <header className="px-7 pt-7 pb-4 border-b" style={{ borderColor: "var(--ink)" }}>
          <div className="atelier-eyebrow" style={{ color: "var(--accent)", fontSize: 10.5 }}>Drill · Top contributors</div>
          <h2 className="atelier-serif" style={{ fontSize: 24, fontWeight: 600, marginTop: 4, letterSpacing: "-0.01em" }}>{kpiLabel}</h2>
          <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3)" }}>
            {loading && "Aggregating contributors…"}
            {error && <span style={{ color: "var(--accent)" }}>⚠ {error}</span>}
            {contribs && `Top ${contribs.length} entity × account contributions · total ${fmt(total)}`}
          </p>
          <button onClick={onClose} style={{ position: "absolute", top: 18, right: 22, fontSize: 18, background: "transparent", border: "none", cursor: "pointer" }}>✕</button>
        </header>
        <div className="px-7 py-5">
          {contribs && contribs.length === 0 && <p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>No facts found for this POV.</p>}
          {contribs && contribs.length > 0 && (
            <div>
              <div className="grid atelier-eyebrow border-b pb-1.5 mb-1" style={{ gridTemplateColumns: "1.4fr 1.2fr auto", columnGap: 14, fontSize: 10.5, borderColor: "var(--ink)" }}>
                <span>Entity</span><span>Account</span><span style={{ textAlign: "right" }}>Value</span>
              </div>
              {contribs.map((c, i) => (
                <div key={i} onClick={() => c.accountId && setDrillFact({ entityId: c.entityId, accountId: c.accountId, label: `${c.entityName} · ${c.accountName}` })} className="grid items-baseline py-2 border-b transition-colors" style={{ gridTemplateColumns: "1.4fr 1.2fr auto", columnGap: 14, fontSize: 13, borderColor: "var(--rule)", cursor: c.accountId ? "pointer" : "default" }}>
                  <span className="atelier-serif">{c.entityName} <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, color: "var(--ink-3)" }}>{c.entityCode}</span></span>
                  <span className="atelier-serif" style={{ color: "var(--ink-2)" }}>{c.accountName} <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, color: "var(--ink-3)" }}>{c.accountCode}</span></span>
                  <span className="atelier-serif tnum" style={{ textAlign: "right", fontWeight: 500, color: c.value < 0 ? "var(--accent)" : "var(--ink)" }}>{fmt(c.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
      {drillFact && (
        <FactDetailDrawer
          open={!!drillFact}
          onClose={() => setDrillFact(null)}
          label={drillFact.label}
          scenarioId={povIds.scenarioId}
          timeId={povIds.timeId}
          entityId={drillFact.entityId}
          accountId={drillFact.accountId}
          currencySymbol={currencySymbol}
        />
      )}
    </>
  );
}
