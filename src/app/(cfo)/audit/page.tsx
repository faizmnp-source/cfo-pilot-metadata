"use client";
import { useEffect, useState } from "react";

type AuditRow = { id: string; entityType: string; entityId: string | null; action: string; userId: string | null; before: any; after: any; metadata: any; createdAt: string };
type User = { id: string; email: string; name: string | null };

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  useEffect(() => { document.body.classList.add("atelier-theme"); return () => { document.body.classList.remove("atelier-theme"); }; }, []);
  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (entityType) qs.set("entityType", entityType);
    if (action) qs.set("action", action);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    fetch(`/api/v2/audit?${qs}`, { credentials: "include" })
      .then(r => r.json())
      .then(j => { const d = j?.data; setRows(d?.data ?? []); setUsers(d?.users ?? []); setTotal(d?.total ?? 0); })
      .finally(() => setLoading(false));
  }, [page, entityType, action, from, to]);

  const userById = new Map(users.map(u => [u.id, u]));

  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <header className="px-14 pt-7 pb-5 border-b" style={{ borderColor: "var(--ink)" }}>
        <div className="atelier-eyebrow" style={{ fontSize: 11 }}>Trust · Phase 1</div>
        <h1 className="atelier-serif" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>Audit Trail</h1>
        <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3)" }}>Every change ever made to this tenant. {total.toLocaleString()} record{total === 1 ? "" : "s"}.</p>
      </header>
      <div className="px-14 py-4 border-b flex gap-3 items-center flex-wrap" style={{ borderColor: "var(--rule)" }}>
        <PillSelect label="Entity" value={entityType} onChange={setEntityType} options={[{ value: "", label: "All" }, { value: "dimension_member", label: "Dimension Member" }, { value: "hierarchy_edge", label: "Hierarchy Edge" }, { value: "tenant_feature", label: "Tenant Feature" }, { value: "fact_row", label: "Fact" }, { value: "data_form", label: "Form" }, { value: "calc_rule", label: "Calc Rule" }, { value: "automation_job", label: "Automation Job" }]} />
        <PillSelect label="Action" value={action} onChange={setAction} options={[{ value: "", label: "All" }, { value: "CREATE", label: "Create" }, { value: "UPDATE", label: "Update" }, { value: "DELETE", label: "Delete" }, { value: "LOGIN", label: "Login" }]} />
        <PillDate label="From" value={from} onChange={setFrom} />
        <PillDate label="To" value={to} onChange={setTo} />
      </div>
      <div className="px-14 py-6">
        {loading && <p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>Reading the trail…</p>}
        {!loading && rows.length === 0 && <p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>No entries match these filters.</p>}
        {rows.length > 0 && (
          <div>
            <div className="grid atelier-eyebrow border-b pb-2 mb-1" style={{ gridTemplateColumns: "180px 130px 130px 1fr 160px", columnGap: 16, fontSize: 10.5, borderColor: "var(--ink)" }}>
              <span>When</span><span>Entity</span><span>Action</span><span>Who / What</span><span>Diff</span>
            </div>
            {rows.map(r => {
              const u = r.userId ? userById.get(r.userId) : null;
              return (
                <div key={r.id} className="grid items-baseline py-2.5 border-b" style={{ gridTemplateColumns: "180px 130px 130px 1fr 160px", columnGap: 16, fontSize: 13, borderColor: "var(--rule)", cursor: "pointer" }} onClick={() => setSelected(r)}>
                  <span className="atelier-serif tnum" style={{ fontSize: 12.5 }}>{new Date(r.createdAt).toLocaleString()}</span>
                  <span className="atelier-serif" style={{ fontSize: 12.5 }}>{r.entityType}</span>
                  <span className="atelier-eyebrow" style={{ fontSize: 10.5, color: r.action === "DELETE" ? "var(--accent)" : "var(--ink-2)" }}>{r.action}</span>
                  <span className="atelier-serif" style={{ fontSize: 13 }}>
                    {u ? (u.name || u.email) : "system"}
                    {r.entityId && <span className="ml-2" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10.5, color: "var(--ink-3)" }}>{r.entityId.slice(0, 8)}…</span>}
                  </span>
                  <span className="atelier-eyebrow" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{(r.before || r.after) ? "view →" : "—"}</span>
                </div>
              );
            })}
            <div className="mt-5 flex items-center gap-3" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
              <button className="atelier-pill" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</button>
              <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span>
              <button className="atelier-pill" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          </div>
        )}
      </div>
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.32)", zIndex: 40 }} />
          <aside style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(640px, 100vw)", background: "var(--paper)", borderLeft: "1px solid var(--ink)", boxShadow: "-12px 0 32px -16px rgba(26,22,18,0.32)", zIndex: 41, overflowY: "auto" }}>
            <header className="px-7 pt-7 pb-4 border-b" style={{ borderColor: "var(--ink)" }}>
              <div className="atelier-eyebrow" style={{ color: "var(--accent)" }}>Audit · Detail</div>
              <h2 className="atelier-serif" style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{selected.entityType} · {selected.action}</h2>
              <p className="atelier-serif italic mt-1" style={{ fontSize: 12, color: "var(--ink-3)" }}>{new Date(selected.createdAt).toLocaleString()}{selected.entityId ? ` · ${selected.entityId}` : ""}</p>
              <button onClick={() => setSelected(null)} style={{ position: "absolute", top: 18, right: 22, fontSize: 18, background: "transparent", border: "none", cursor: "pointer" }}>✕</button>
            </header>
            <div className="px-7 py-5 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr", fontSize: 12 }}>
              <div><h3 className="atelier-eyebrow mb-2">Before</h3><pre style={{ background: "var(--paper-2, #ede5d2)", padding: 10, borderRadius: 4, overflowX: "auto", fontSize: 11, lineHeight: 1.4 }}>{JSON.stringify(selected.before ?? null, null, 2)}</pre></div>
              <div><h3 className="atelier-eyebrow mb-2">After</h3><pre style={{ background: "var(--paper-2, #ede5d2)", padding: 10, borderRadius: 4, overflowX: "auto", fontSize: 11, lineHeight: 1.4 }}>{JSON.stringify(selected.after ?? null, null, 2)}</pre></div>
              {selected.metadata && <div style={{ gridColumn: "1 / -1" }}><h3 className="atelier-eyebrow mb-2">Metadata</h3><pre style={{ background: "var(--paper-2)", padding: 10, borderRadius: 4, overflowX: "auto", fontSize: 11, lineHeight: 1.4 }}>{JSON.stringify(selected.metadata, null, 2)}</pre></div>}
            </div>
          </aside>
        </>
      )}
    </main>
  );
}

function PillSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="inline-flex items-center h-9 px-3 rounded-full border" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
      <span className="atelier-eyebrow" style={{ fontSize: 10, color: "var(--ink-3)", marginRight: 10 }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="bg-transparent outline-none cursor-pointer atelier-serif" style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>
        {options.map(o => <option key={o.value || "_empty"} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
function PillDate({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center h-9 px-3 rounded-full border" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
      <span className="atelier-eyebrow" style={{ fontSize: 10, color: "var(--ink-3)", marginRight: 10 }}>{label}</span>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} className="bg-transparent outline-none atelier-serif" style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }} />
    </div>
  );
}
