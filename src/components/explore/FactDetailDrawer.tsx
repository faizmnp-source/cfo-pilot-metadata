"use client";
import { useEffect, useState } from "react";

type Fact = {
  id: string;
  scenarioId: string; accountId: string; entityId: string;
  timeId: string; timeCode: string;
  currencyId: string;
  icpId: string; icpCode: string | null;
  originId: string; originCode: string; originName: string;
  version: number; isCurrent: boolean;
  valueTxn: number; valueLocal: number; valueReporting: number;
  postedBy: string; postedByLabel: string; postedAt: string;
  loadBatchId: string | null;
  calcRunId: string | null;
  processRunId: string | null;
};

export function FactDetailDrawer({
  open, onClose, label, scenarioId, timeId, entityId, accountId, currencySymbol = "₹",
}: {
  open: boolean; onClose: () => void; label: string;
  scenarioId: string | null; timeId: string | null;
  entityId: string; accountId: string;
  currencySymbol?: string;
}) {
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !scenarioId || !timeId) return;
    setLoading(true); setError(null); setFacts(null);
    fetch("/api/v2/facts/by-intersection", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId, timeId, entityId, accountId }),
    })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`); setFacts(j?.data?.facts ?? []); })
      .catch(e => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [open, scenarioId, timeId, entityId, accountId]);

  if (!open) return null;
  const fmt = (n: number) => {
    if (!Number.isFinite(n) || n === 0) return "—";
    return currencySymbol + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };
  const total = (facts ?? []).reduce((a, f) => a + f.valueReporting, 0);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.42)", zIndex: 60 }} />
      <aside role="dialog" aria-label={`Facts: ${label}`}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(640px, 100vw)", background: "var(--paper, #f5efe2)", borderLeft: "1px solid var(--ink, #1a1612)", boxShadow: "-12px 0 32px -16px rgba(26,22,18,0.4)", zIndex: 61, overflowY: "auto" }}>
        <header className="px-7 pt-7 pb-4 border-b" style={{ borderColor: "var(--ink)" }}>
          <div className="atelier-eyebrow" style={{ color: "var(--accent)", fontSize: 10.5 }}>Drill-through · source facts</div>
          <h2 className="atelier-serif" style={{ fontSize: 22, fontWeight: 600, marginTop: 4, letterSpacing: "-0.01em" }}>{label}</h2>
          <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3)" }}>
            {loading && "Loading fact rows…"}
            {error && <span style={{ color: "var(--accent)" }}>⚠ {error}</span>}
            {facts && `${facts.length} fact${facts.length === 1 ? "" : "s"} · total ${fmt(total)}`}
          </p>
          <button onClick={onClose} style={{ position: "absolute", top: 18, right: 22, fontSize: 18, background: "transparent", border: "none", cursor: "pointer" }}>✕</button>
        </header>
        <div className="px-7 py-5">
          {facts && facts.length === 0 && <p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>No fact rows at this intersection.</p>}
          {facts && facts.length > 0 && (
            <div>
              <div className="grid atelier-eyebrow border-b pb-1.5 mb-1" style={{ gridTemplateColumns: "75px 95px 90px 1fr auto", columnGap: 12, fontSize: 10, borderColor: "var(--ink)" }}>
                <span>Period</span><span>Origin</span><span>By</span><span>When</span><span style={{ textAlign: "right" }}>Value</span>
              </div>
              {facts.map(f => (
                <div key={f.id} className="grid items-baseline py-1.5 border-b" style={{ gridTemplateColumns: "75px 95px 90px 1fr auto", columnGap: 12, fontSize: 12, borderColor: "var(--rule)" }}>
                  <span className="atelier-serif tnum">{f.timeCode}</span>
                  <span className="atelier-eyebrow" style={{ fontSize: 9.5 }}>{f.originCode}</span>
                  <span className="atelier-serif" style={{ color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis" }}>{f.postedByLabel.split("@")[0]}</span>
                  <span className="atelier-serif italic" style={{ color: "var(--ink-3)", fontSize: 11 }}>{new Date(f.postedAt).toLocaleDateString()}</span>
                  <span className="atelier-serif tnum" style={{ textAlign: "right", fontWeight: 500, color: f.valueReporting < 0 ? "var(--accent)" : "var(--ink)" }}>{fmt(f.valueReporting)}</span>
                </div>
              ))}
              <p className="atelier-serif italic mt-4" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                Only current versions shown. The full version chain is in the Lineage Drawer on the matching fact intersection.
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
