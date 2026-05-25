"use client";
/*
 * Global Cmd-K palette. Mounts once at the app layout layer (Wk3
 * follow-up). Today: render it in /explore as a proof. Listens for
 * Cmd-K / Ctrl-K. Debounces /api/v2/search/global. Arrow keys to
 * navigate, Enter to open.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Result = { kind: string; title: string; subtitle?: string; href: string; score: number };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<any>(null);

  // Global hotkey
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(o => !o); }
      if (open && e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus on open
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const r = await fetch(`/api/v2/search/global?q=${encodeURIComponent(q)}`, { credentials: "include" });
      const j = await r.json();
      setResults(j?.data?.results ?? []);
      setActive(0);
    }, 180);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [q]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    if (e.key === "Enter")     { const r = results[active]; if (r) { setOpen(false); router.push(r.href); } }
  };

  if (!open) return null;

  return (
    <>
      <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.42)", zIndex: 80 }} />
      <div role="dialog" aria-label="Command palette"
        style={{ position: "fixed", top: "12vh", left: "50%", transform: "translateX(-50%)", width: "min(640px, 92vw)", background: "var(--paper, #f5efe2)", border: "1px solid var(--ink, #1a1612)", boxShadow: "0 20px 60px -20px rgba(26,22,18,0.4)", zIndex: 81 }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ink)" }}>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onListKey}
            placeholder="Search pages, reports, dimensions, forms, rules…"
            className="w-full bg-transparent outline-none atelier-serif"
            style={{ fontSize: 17, color: "var(--ink)" }}
          />
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!q.trim() && (
            <p className="atelier-serif italic px-4 py-6" style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Type to search. ↑/↓ to navigate, ↵ to open. Press Cmd/Ctrl-K to toggle.
            </p>
          )}
          {q.trim() && results.length === 0 && (
            <p className="atelier-serif italic px-4 py-6" style={{ fontSize: 13, color: "var(--ink-3)" }}>No results.</p>
          )}
          {results.map((r, i) => (
            <button key={i} onClick={() => { setOpen(false); router.push(r.href); }}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 border-b"
              style={{ borderColor: "var(--rule)", background: i === active ? "var(--paper-2, #ede5d2)" : "transparent" }}>
              <span className="atelier-eyebrow" style={{ fontSize: 9.5, width: 56, color: "var(--ink-3)" }}>{r.kind}</span>
              <span className="atelier-serif" style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{r.title}</span>
              {r.subtitle && <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, color: "var(--ink-3)" }}>{r.subtitle}</span>}
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: "var(--rule)" }}>
          <span className="atelier-eyebrow" style={{ fontSize: 9 }}>↑ ↓ navigate · ↵ open · esc close</span>
          <span className="atelier-eyebrow" style={{ fontSize: 9, color: "var(--ink-4)" }}>Cmd-K toggles</span>
        </div>
      </div>
    </>
  );
}
