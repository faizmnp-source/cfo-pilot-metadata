"use client";
import { useState } from "react";

export function SaveForecastButton({
  scenarioCode, accountCode, entityCode, periodCodes, values, methodHint, label = "Save to Scenario",
}: {
  scenarioCode: string;
  accountCode:  string;
  entityCode:   string;
  periodCodes:  string[];
  values:       number[];
  methodHint?:  string;
  label?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const save = async () => {
    if (!periodCodes.length || periodCodes.length !== values.length) {
      setResult("Forecast values don't line up with periods"); return;
    }
    if (!confirm(`Write ${values.length} forecast values to scenario "${scenarioCode}" for ${entityCode} · ${accountCode}?`)) return;
    setSaving(true); setResult(null);
    try {
      const r = await fetch("/api/v2/forecast/save", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioCode, accountCode, entityCode, periodCodes, values, methodHint }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setResult(`Saved ${j?.data?.rowsWritten ?? values.length} rows`);
    } catch (e: any) { setResult(`⚠ ${e?.message ?? e}`); }
    finally { setSaving(false); }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={save} disabled={saving} className="atelier-pill atelier-pill-dark" style={{ fontSize: 11.5, letterSpacing: "0.14em", textTransform: "uppercase" }}>
        {saving ? "Saving…" : label}
      </button>
      {result && <span className="atelier-serif italic" style={{ fontSize: 12, color: result.startsWith("⚠") ? "var(--accent)" : "var(--ink-3)" }}>{result}</span>}
    </span>
  );
}
