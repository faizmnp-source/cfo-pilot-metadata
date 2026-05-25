"use client";
/*
 * /automation/monitor — Section 22.  Recent JobRun board with status,
 * duration, retry count, error excerpt.  Click ⟳ to retry failed runs.
 */
import { useEffect, useState } from "react";

type Run = {
  id: string; jobId: string; status: string; startedAt: string; finishedAt: string | null;
  triggeredBy: string; errorMessage: string | null; retryCount?: number;
  output?: any;
  job: { code: string; name: string; kind: string };
};

const STATUS_COLOR: Record<string, string> = {
  RUNNING:   "var(--ink-3)",
  RETRYING:  "var(--accent-soft, #b54c5c)",
  SUCCEEDED: "#2E8F6B",
  FAILED:    "var(--accent)",
};

export default function MonitorPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");

  useEffect(() => { document.body.classList.add("atelier-theme"); return () => { document.body.classList.remove("atelier-theme"); }; }, []);
  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: "100" });
    if (status) qs.set("status", status);
    fetch(`/api/v2/jobs/runs?${qs}`, { credentials: "include" })
      .then(r => r.json()).then(j => setRuns(j?.data?.data ?? []))
      .finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  const retry = async (r: Run) => {
    if (!confirm(`Retry "${r.job.name}"?`)) return;
    await fetch(`/api/v2/jobs/${r.jobId}/retry`, { method: "POST", credentials: "include" });
    load();
  };

  const duration = (r: Run) => {
    if (!r.finishedAt) return "—";
    const ms = +new Date(r.finishedAt) - +new Date(r.startedAt);
    return ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms/1000).toFixed(1)}s` : `${Math.round(ms/60000)}m`;
  };

  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <header className="px-14 pt-7 pb-5 border-b" style={{ borderColor: "var(--ink)" }}>
        <div className="atelier-eyebrow" style={{ fontSize: 11, color: "var(--accent)" }}>Section 22 · Scheduler</div>
        <h1 className="atelier-serif" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>Automation Monitor</h1>
        <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3)" }}>
          Recent job runs across all schedules — status, duration, retry count.
        </p>
      </header>

      <div className="px-14 py-3 border-b flex gap-2" style={{ borderColor: "var(--rule)" }}>
        {["", "SUCCEEDED", "FAILED", "RUNNING", "RETRYING"].map(s => (
          <button key={s || "all"} onClick={() => setStatus(s)} className="atelier-pill"
            style={{ background: status === s ? "var(--ink)" : "var(--paper)", color: status === s ? "var(--paper)" : "var(--ink)" }}>
            {s || "All"}
          </button>
        ))}
      </div>

      <div className="px-14 py-6">
        {loading && <p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>Loading…</p>}
        {!loading && runs.length === 0 && <p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>No runs matching filter.</p>}
        {runs.length > 0 && (
          <div>
            <div className="grid atelier-eyebrow border-b pb-1.5" style={{ gridTemplateColumns: "160px 1fr 90px 90px 80px 60px 50px", columnGap: 12, fontSize: 10, borderColor: "var(--ink)" }}>
              <span>Started</span><span>Job</span><span>Status</span><span>Duration</span><span>Trigger</span><span>Retries</span><span></span>
            </div>
            {runs.map(r => (
              <div key={r.id} className="grid items-baseline py-2 border-b" style={{ gridTemplateColumns: "160px 1fr 90px 90px 80px 60px 50px", columnGap: 12, fontSize: 13, borderColor: "var(--rule)" }}>
                <span className="atelier-serif tnum" style={{ fontSize: 12 }}>{new Date(r.startedAt).toLocaleString()}</span>
                <span className="atelier-serif">{r.job.name} <span className="atelier-eyebrow ml-1" style={{ fontSize: 9 }}>{r.job.kind}</span></span>
                <span className="atelier-eyebrow" style={{ fontSize: 10, color: STATUS_COLOR[r.status] ?? "var(--ink-3)" }}>{r.status}</span>
                <span className="tnum" style={{ fontSize: 11 }}>{duration(r)}</span>
                <span className="atelier-eyebrow" style={{ fontSize: 9 }}>{r.triggeredBy.split(":")[0]}</span>
                <span className="tnum" style={{ fontSize: 11 }}>{r.retryCount ?? 0}</span>
                {r.status === "FAILED" && <button onClick={() => retry(r)} title="Retry" className="atelier-eyebrow" style={{ fontSize: 14 }}>⟳</button>}
                {r.errorMessage && <p style={{ gridColumn: "2 / -1", fontSize: 11, color: "var(--accent)", fontStyle: "italic", marginTop: 2 }}>⚠ {r.errorMessage.slice(0, 200)}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
