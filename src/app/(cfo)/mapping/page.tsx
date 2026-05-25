"use client";
import { useEffect, useState } from "react";

type Rule = {
  id: string; kind: string; sourceSystem: string | null; sourceKey: string;
  targetMemberId: string | null; targetField: string | null;
  confidence: number; hitCount: number; approvedAt: string | null;
  authoredBy: string; createdAt: string;
};

export default function MappingPage() {
  const [rows, setRows] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState("");
  const [sourceSystem, setSourceSystem] = useState("");
  const [total, setTotal] = useState(0);
  const [reloadFlag, setReloadFlag] = useState(0);

  useEffect(() => { document.body.classList.add("atelier-theme"); return () => { document.body.classList.remove("atelier-theme"); }; }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (kind) qs.set("kind", kind);
    if (sourceSystem) qs.set("sourceSystem", sourceSystem);
    fetch(`/api/v2/mappings?${qs}`, { credentials: "include" })
      .then(r => r.json())
      .then(j => { setRows(j?.data?.data ?? []); setTotal(j?.data?.total ?? 0); })
      .finally(() => setLoading(false));
  }, [kind, sourceSystem, reloadFlag]);

  const seedDemo = async () => {
    const r = await fetch("/api/v2/mappings/seed-demo", { method: "POST", credentials: "include" });
    const j = await r.json();
    if (j?.data?.skipped) {
      alert(`Demo skipped — ${j.data.existingCount} rules already exist.`);
    } else {
      alert(`Seeded ${j?.data?.created ?? 0} sample mapping rules.`);
      setReloadFlag(f => f + 1);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <header className="px-14 pt-7 pb-5 border-b flex items-end justify-between" style={{ borderColor: "var(--ink)" }}>
        <div>
          <div className="atelier-eyebrow" style={{ fontSize: 11 }}>Phase 2 · Smart Mapping</div>
          <h1 className="atelier-serif" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>Mapping Library</h1>
          <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3)" }}>
            One universal mapper for accounts, bank txns, members, columns. {total.toLocaleString()} rule{total === 1 ? "" : "s"} on record.
          </p>
        </div>
        <button className="atelier-pill" onClick={seedDemo}>+ Seed demo data</button>
      </header>

      {/* TRY A SUGGESTION — live demo of the engine */}
      <SuggestTester />

      <div className="px-14 py-4 border-b flex gap-3 items-center flex-wrap" style={{ borderColor: "var(--rule)" }}>
        <Pill label="Kind" value={kind} onChange={setKind} options={[
          { value: "", label: "All" },
          { value: "ACCOUNT", label: "Account" },
          { value: "BANK_TXN", label: "Bank Txn" },
          { value: "MEMBER", label: "Member" },
          { value: "COLUMN", label: "Column" },
        ]} />
        <Pill label="Source" value={sourceSystem} onChange={setSourceSystem} options={[
          { value: "", label: "All" },
          { value: "excel", label: "Excel" },
          { value: "tally", label: "Tally" },
          { value: "pdf-bank", label: "PDF Bank" },
        ]} />
      </div>

      <div className="px-14 py-6">
        {loading && <p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>
            No mapping rules yet. Click <b>+ Seed demo data</b> above to populate sample rules,
            or try the suggester to see candidates ranked by confidence.
          </p>
        )}
        {rows.length > 0 && (
          <div>
            <div className="grid atelier-eyebrow border-b pb-2 mb-1" style={{ gridTemplateColumns: "100px 100px 1fr 1fr 60px 60px 60px", columnGap: 14, fontSize: 10.5, borderColor: "var(--ink)" }}>
              <span>Kind</span><span>Source</span><span>From</span><span>To</span><span>Conf</span><span>Hits</span><span>Status</span>
            </div>
            {rows.map(r => (
              <div key={r.id} className="grid items-baseline py-2.5 border-b" style={{ gridTemplateColumns: "100px 100px 1fr 1fr 60px 60px 60px", columnGap: 14, fontSize: 13, borderColor: "var(--rule)" }}>
                <span className="atelier-eyebrow" style={{ fontSize: 10.5 }}>{r.kind}</span>
                <span className="atelier-serif" style={{ fontSize: 12 }}>{r.sourceSystem ?? "—"}</span>
                <span className="atelier-serif" style={{ fontSize: 13 }}>{r.sourceKey}</span>
                <span className="atelier-serif" style={{ fontSize: 13, color: "var(--ink-2)" }}>{r.targetField ? r.targetField : r.targetMemberId ? r.targetMemberId.slice(0, 8) + "…" : "—"}</span>
                <span className="tnum" style={{ fontSize: 12 }}>{r.confidence}%</span>
                <span className="tnum" style={{ fontSize: 12 }}>{r.hitCount}</span>
                <span className="atelier-eyebrow" style={{ fontSize: 10, color: r.approvedAt ? "var(--ink)" : "var(--ink-3)" }}>{r.approvedAt ? "✓ approved" : "pending"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

/* ─── Inline live tester for the /mappings/suggest engine ─────────── */
function SuggestTester() {
  const [kind, setKind] = useState<"ACCOUNT"|"BANK_TXN"|"MEMBER"|"COLUMN">("ACCOUNT");
  const [sourceKey, setSourceKey] = useState("Salaries Expense");
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    setLoading(true); setResults(null);
    const r = await fetch("/api/v2/mappings/suggest", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, sourceKey, top: 5 }),
    });
    const j = await r.json();
    setResults(j?.data?.candidates ?? []);
    setLoading(false);
  };

  return (
    <section className="px-14 py-5 border-b" style={{ borderColor: "var(--rule)", background: "linear-gradient(180deg, rgba(176,141,58,0.05), transparent 60%)" }}>
      <div className="atelier-eyebrow" style={{ fontSize: 10.5, color: "var(--accent)" }}>Try the engine · live</div>
      <h3 className="atelier-serif mt-1" style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>
        Given a source string, rank candidates by confidence
      </h3>
      <div className="flex gap-3 items-center mt-3 flex-wrap">
        <div className="inline-flex items-center h-9 px-3 rounded-full border" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <span className="atelier-eyebrow" style={{ fontSize: 10, color: "var(--ink-3)", marginRight: 10 }}>Kind</span>
          <select value={kind} onChange={e => setKind(e.target.value as any)} className="bg-transparent outline-none cursor-pointer atelier-serif" style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>
            <option value="ACCOUNT">ACCOUNT</option>
            <option value="BANK_TXN">BANK_TXN</option>
            <option value="MEMBER">MEMBER</option>
            <option value="COLUMN">COLUMN</option>
          </select>
        </div>
        <input value={sourceKey} onChange={e => setSourceKey(e.target.value)} placeholder="e.g. Salaries Expense"
          className="h-9 px-3 rounded-full border atelier-serif"
          style={{ borderColor: "var(--ink)", background: "var(--paper)", fontSize: 13, width: 280, color: "var(--ink)", outline: "none" }}
        />
        <button className="atelier-pill atelier-pill-dark" onClick={ask} disabled={loading || !sourceKey.trim()}>
          {loading ? "Asking…" : "→ Suggest"}
        </button>
      </div>
      {results !== null && results.length === 0 && (
        <p className="atelier-serif italic mt-3" style={{ fontSize: 13, color: "var(--ink-3)" }}>
          No candidates above the confidence threshold for that source key.
        </p>
      )}
      {results && results.length > 0 && (
        <div className="mt-4 grid" style={{ gridTemplateColumns: "1fr", gap: 8 }}>
          {results.map((c: any, i: number) => (
            <div key={i} className="grid items-baseline py-2 border-t" style={{ gridTemplateColumns: "30px 1fr 80px 1fr 60px", columnGap: 14, fontSize: 13, borderColor: "var(--rule)" }}>
              <span className="atelier-eyebrow" style={{ fontSize: 10 }}>#{i+1}</span>
              <span className="atelier-serif" style={{ fontSize: 14, fontWeight: 500 }}>{c.targetName ?? c.targetField ?? c.targetMemberId?.slice(0, 8) ?? "—"}</span>
              <span className="atelier-eyebrow" style={{ fontSize: 10 }}>{c.targetCode ?? ""}</span>
              <span className="atelier-serif italic" style={{ fontSize: 12, color: "var(--ink-3)" }}>{c.reason}</span>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: c.confidence >= 70 ? "var(--ink)" : c.confidence >= 50 ? "var(--ink-3)" : "var(--accent)" }}>{c.confidence}%</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Pill({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="inline-flex items-center h-9 px-3 rounded-full border" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
      <span className="atelier-eyebrow" style={{ fontSize: 10, color: "var(--ink-3)", marginRight: 10 }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="bg-transparent outline-none cursor-pointer atelier-serif" style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>
        {options.map(o => <option key={o.value || "_empty"} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
