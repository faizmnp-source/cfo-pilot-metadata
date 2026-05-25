"use client";
/*
 * <DslEditor /> — textarea + live preview of resolved members.
 * Used by the form builder (NewFormDialog) and any future Ad Hoc /
 * report builder that needs a "type a member set" input.
 *
 * Props:
 *   dimensionCode  — which dimension to resolve against ("account","entity",etc.)
 *   value          — current expression text
 *   onChange       — callback when text changes
 *   compact        — render the preview pane inline (default) or below
 *
 * Calls POST /api/v2/forms/preview-dsl with debounce.
 */
import { useEffect, useRef, useState } from "react";

type PreviewResult = {
  memberIds: string[];
  labels: Record<string, { code: string; name: string }>;
  count: number;
  truncated: boolean;
};

const HELP_EXAMPLES = [
  "Children(Apollo_Group)",
  "Descendants(IN_OPS)",
  "Ancestors(DEL1)",
  "Self(US_HQ)",
  "Relative(IN_OPS, -1)",
  "Level0()",
  "Level1()",
  "IN_OPS, Children(US_HQ)",
];

export function DslEditor({
  dimensionCode, value, onChange, label = "Member selection (DSL)",
}: {
  dimensionCode: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setPreview(null); setError(null); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const r = await fetch("/api/v2/forms/preview-dsl", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dimensionCode, expression: value, limit: 50 }),
        });
        const j = await r.json();
        if (!r.ok) { setError(j?.error ?? `HTTP ${r.status}`); setPreview(null); return; }
        setPreview(j?.data as PreviewResult);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally { setLoading(false); }
    }, 400);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [value, dimensionCode]);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-stone-700">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Children(Apollo_Group), IN_OPS"
        rows={3}
        className="w-full text-sm font-mono px-3 py-2 rounded-md border border-stone-300 focus:border-indigo-500 outline-none resize-y"
        style={{ background: "var(--paper, white)", color: "var(--ink, #1a1612)" }}
      />

      <div className="flex flex-wrap gap-1.5 mt-1">
        {HELP_EXAMPLES.map(ex => (
          <button key={ex} type="button" onClick={() => onChange(ex)}
            className="px-2 py-0.5 text-[10px] font-mono rounded border border-stone-200 text-stone-600 hover:bg-stone-50">
            {ex}
          </button>
        ))}
      </div>

      <div className="mt-2 text-xs min-h-[20px]">
        {loading && <span className="italic text-stone-500">Resolving…</span>}
        {error && <span className="text-rose-700">⚠ {error}</span>}
        {preview && !error && (
          <span className="text-stone-700">
            Resolves to <b>{preview.count}</b> member{preview.count === 1 ? "" : "s"}
            {preview.truncated && <span className="ml-1 text-stone-500">(showing first 50)</span>}
          </span>
        )}
      </div>

      {preview && preview.memberIds.length > 0 && (
        <div className="mt-1 max-h-32 overflow-y-auto rounded border border-stone-200 bg-stone-50/50 p-2">
          <ul className="text-[11px] space-y-0.5">
            {preview.memberIds.map(id => {
              const m = preview.labels[id];
              if (!m) return null;
              return (
                <li key={id} className="font-mono">
                  <span className="text-stone-500">{m.code}</span> <span className="text-stone-800">{m.name}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
