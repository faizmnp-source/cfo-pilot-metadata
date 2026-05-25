"use client";
import { useEffect, useState } from "react";

type Action = { id: string; actionKind: string; summary: string; proposedBy: string; createdAt: string };

export function RecommendedActionsTile() {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/v2/dashboard/insights", { credentials: "include" })
      .then(r => r.json()).then(j => setActions(j?.data?.recommendedActions ?? []))
      .finally(() => setLoading(false));
  }, []);

  const approve = async (id: string) => {
    if (!confirm("Approve this Copilot action?")) return;
    await fetch("/api/v2/copilot-actions/approve", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionId: id })});
    setActions(a => a.filter(x => x.id !== id));
  };
  const reject = async (id: string) => {
    const reason = prompt("Reject reason (optional):");
    await fetch("/api/v2/copilot-actions/reject", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionId: id, reason })});
    setActions(a => a.filter(x => x.id !== id));
  };

  return (
    <div className="atelier-card" style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 18 }}>
      <div className="atelier-eyebrow" style={{ fontSize: 10.5, color: "var(--accent)" }}>Awaiting your approval</div>
      <h3 className="atelier-serif" style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>Copilot actions queued</h3>
      {loading && <p className="atelier-serif italic mt-3" style={{ fontSize: 12, color: "var(--ink-3)" }}>Loading…</p>}
      {!loading && actions.length === 0 && <p className="atelier-serif italic mt-3" style={{ fontSize: 12, color: "var(--ink-3)" }}>Nothing pending — Copilot has no write actions awaiting approval.</p>}
      <ul className="mt-3 space-y-3">
        {actions.map(a => (
          <li key={a.id} className="border-t pt-2" style={{ borderColor: "var(--rule)" }}>
            <p className="atelier-eyebrow" style={{ fontSize: 9.5 }}>{a.actionKind}</p>
            <p className="atelier-serif" style={{ fontSize: 13 }}>{a.summary}</p>
            <div className="flex gap-2 mt-1.5">
              <button onClick={() => approve(a.id)} className="atelier-pill atelier-pill-dark" style={{ fontSize: 11 }}>Approve</button>
              <button onClick={() => reject(a.id)} className="atelier-pill" style={{ fontSize: 11 }}>Reject</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
