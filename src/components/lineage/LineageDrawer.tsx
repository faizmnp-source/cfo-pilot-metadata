"use client";
import { useEffect, useMemo, useState } from "react";

type Intersection = {
  scenarioId: string; timeId: string; entityId: string; accountId: string;
  icpId?: string | null; ud1Id?: string | null; ud2Id?: string | null; ud3Id?: string | null; ud4Id?: string | null;
  ud5Id?: string | null; ud6Id?: string | null; ud7Id?: string | null; ud8Id?: string | null;
};

type LineageResponse = {
  intersection: Intersection;
  timeline: Array<{ id: string; version: number; isCurrent: boolean; valueTxn: number; valueLocal: number; valueReporting: number; currencyId: string; originId: string; loadBatchId: string | null; calcRunId: string | null; processRunId: string | null; prevVersionId: string | null; postedBy: string; postedAt: string; updatedAt: string }>;
  origins:      Array<{ id: string; memberCode: string; memberName: string }>;
  authors:      Array<{ id: string; email: string; name: string | null }>;
  loadBatches:  Array<any>;
  calcRuleRuns: Array<any>;
  processRuns:  Array<any>;
  notes:        Array<{ id: string; note: string; category: string; authorId: string; createdAt: string }>;
  summary:      { versionCount: number; currentVersion: number | null; firstPostedAt: string | null; lastPostedAt: string | null };
};

export function LineageDrawer({ open, onClose, intersection, label, currencySymbol = "" }: {
  open: boolean; onClose: () => void; intersection: Intersection | null; label?: string; currencySymbol?: string;
}) {
  const [data, setData] = useState<LineageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !intersection) return;
    setLoading(true); setError(null); setData(null);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(intersection)) {
      if (v === undefined || v === null) continue;
      qs.set(k, String(v));
    }
    fetch(`/api/v2/lineage/fact?${qs}`, { credentials: "include" })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`); setData(j.data as LineageResponse); })
      .catch(e => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [open, intersection]);

  const originById = useMemo(() => new Map((data?.origins ?? []).map(o => [o.id, o])), [data]);
  const authorById = useMemo(() => new Map((data?.authors ?? []).map(u => [u.id, u])), [data]);
  const calcById   = useMemo(() => new Map((data?.calcRuleRuns ?? []).map(c => [c.id, c])), [data]);
  const procById   = useMemo(() => new Map((data?.processRuns ?? []).map(p => [p.id, p])), [data]);
  const lbById     = useMemo(() => new Map((data?.loadBatches ?? []).map(l => [l.id, l])), [data]);

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.32)", zIndex: 50 }} />
      <aside role="dialog" aria-label="Lineage drawer"
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(520px, 100vw)", background: "var(--paper, #f5efe2)", color: "var(--ink, #1a1612)", borderLeft: "1px solid var(--ink, #1a1612)", boxShadow: "-12px 0 32px -16px rgba(26,22,18,0.32)", zIndex: 51, overflowY: "auto" }}>
        <header className="px-7 pt-7 pb-4 border-b" style={{ borderColor: "var(--ink)" }}>
          <div className="atelier-eyebrow" style={{ color: "var(--accent, #7a2030)", fontSize: 10.5 }}>Lineage · Where this number came from</div>
          <h2 className="atelier-serif" style={{ fontSize: 24, fontWeight: 600, marginTop: 4, letterSpacing: "-0.01em" }}>{label ?? "Selected cell"}</h2>
          <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3, #7a6e5c)" }}>
            {loading && "Reading the audit chain…"}
            {error && `⚠ ${error}`}
            {data && `${data.summary.versionCount} version${data.summary.versionCount === 1 ? "" : "s"} on record · current = v${data.summary.currentVersion ?? "—"}`}
          </p>
          <button onClick={onClose} style={{ position: "absolute", top: 18, right: 22, fontSize: 18, background: "transparent", border: "none", cursor: "pointer", color: "var(--ink)" }} aria-label="Close">✕</button>
        </header>
        <div className="px-7 py-5">
          {data && data.timeline.length === 0 && (<p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>No fact recorded at this intersection yet.</p>)}
          {data?.timeline.map((t, i) => {
            const origin = originById.get(t.originId);
            const author = authorById.get(t.postedBy);
            const calc   = t.calcRunId ? calcById.get(t.calcRunId) : null;
            const proc   = t.processRunId ? procById.get(t.processRunId) : null;
            const lb     = t.loadBatchId ? lbById.get(t.loadBatchId) : null;
            return (
              <div key={t.id} className="mb-5 pb-5 border-b" style={{ borderColor: "var(--rule, #d9cfb8)" }}>
                <div className="flex items-baseline gap-3">
                  <span className="atelier-serif" style={{ fontSize: 13, fontWeight: 600, color: t.isCurrent ? "var(--ink)" : "var(--ink-3)" }}>
                    v{t.version} {t.isCurrent && <span className="atelier-eyebrow ml-1" style={{ color: "var(--accent)" }}>current</span>}
                  </span>
                  <span className="atelier-eyebrow" style={{ fontSize: 10 }}>{new Date(t.postedAt).toLocaleString()}</span>
                </div>
                <div className="atelier-serif tnum mt-1" style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em" }}>
                  {currencySymbol}{Number(t.valueReporting).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="grid mt-2 gap-y-1" style={{ gridTemplateColumns: "auto 1fr", columnGap: 12, fontSize: 12.5 }}>
                  <span className="atelier-eyebrow" style={{ fontSize: 10 }}>Origin</span>
                  <span>{origin ? `${origin.memberName} (${origin.memberCode})` : t.originId.slice(0, 8) + "…"}</span>
                  <span className="atelier-eyebrow" style={{ fontSize: 10 }}>By</span>
                  <span>{author ? (author.name || author.email) : t.postedBy.slice(0, 8) + "…"}</span>
                  {lb && (<><span className="atelier-eyebrow" style={{ fontSize: 10 }}>From file</span><span className="italic">{lb.filename || lb.id}</span></>)}
                  {calc && (<><span className="atelier-eyebrow" style={{ fontSize: 10 }}>From calc</span><span className="italic">{calc.rule?.name ?? "—"} · run {calc.id.slice(0, 8)}</span></>)}
                  {proc && (<><span className="atelier-eyebrow" style={{ fontSize: 10 }}>From process</span><span className="italic">{proc.kind ?? "process"} · run {proc.id.slice(0, 8)}</span></>)}
                </div>
              </div>
            );
          })}
          {data && data.notes.length > 0 && (
            <section className="mt-2">
              <h3 className="atelier-eyebrow" style={{ fontSize: 11 }}>Notes · {data.notes.length}</h3>
              <ul className="mt-2 space-y-2">
                {data.notes.map(n => (
                  <li key={n.id} className="atelier-serif" style={{ fontSize: 14, lineHeight: 1.4 }}>
                    <span className="atelier-eyebrow mr-2" style={{ fontSize: 10 }}>{n.category}</span>{n.note}
                    <span className="ml-2 atelier-eyebrow" style={{ fontSize: 9.5 }}>{new Date(n.createdAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

export function LineageTrigger({ onClick, title = "View lineage" }: { onClick: () => void; title?: string }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={title}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: 999, marginLeft: 6, border: "1px solid var(--ink-4, #a89d87)", color: "var(--ink-3, #7a6e5c)", background: "transparent", cursor: "pointer", fontSize: 10, lineHeight: 1 }}>
      ⓘ
    </button>
  );
}
