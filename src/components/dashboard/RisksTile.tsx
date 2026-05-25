"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Risk = { kind: string; title: string; detail?: string; severity: "HIGH"|"MEDIUM"|"LOW"; linkTo?: string };

export function RisksTile() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/v2/dashboard/insights", { credentials: "include" })
      .then(r => r.json()).then(j => setRisks(j?.data?.risks ?? []))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="atelier-card" style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 18 }}>
      <div className="atelier-eyebrow" style={{ fontSize: 10.5, color: "var(--accent)" }}>Risks</div>
      <h3 className="atelier-serif" style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>What needs attention</h3>
      {loading && <p className="atelier-serif italic mt-3" style={{ fontSize: 12, color: "var(--ink-3)" }}>Scanning…</p>}
      {!loading && risks.length === 0 && <p className="atelier-serif italic mt-3" style={{ fontSize: 12, color: "var(--ink-3)" }}>All clear — no overdue close tasks.</p>}
      <ul className="mt-3 space-y-2">
        {risks.map((r, i) => (
          <li key={i} className="border-l-2 pl-3 py-1" style={{ borderColor: r.severity === "HIGH" ? "var(--accent)" : "var(--ink-3)" }}>
            <p className="atelier-serif" style={{ fontSize: 13, fontWeight: 500 }}>{r.title}</p>
            {r.detail && <p className="atelier-serif italic" style={{ fontSize: 12, color: "var(--ink-3)" }}>{r.detail}</p>}
            {r.linkTo && <Link href={r.linkTo} className="atelier-eyebrow underline" style={{ fontSize: 9.5, color: "var(--accent)" }}>open →</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
}
