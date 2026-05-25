"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine, Legend } from "recharts";

export type WaterfallStep = { label: string; value: number; kind?: "TOTAL" | "DELTA" };

/**
 * Variance / bridge waterfall.
 * Inputs are deltas EXCEPT entries marked kind:'TOTAL' which are absolute bars.
 * Common pattern: start with kind:'TOTAL' value=lastYear, then deltas, end with kind:'TOTAL' value=thisYear.
 */
export function WaterfallChart({ steps, height = 280 }: { steps: WaterfallStep[]; height?: number }) {
  let running = 0;
  const data = steps.map(s => {
    if (s.kind === "TOTAL") {
      running = s.value;
      return { name: s.label, base: 0, up: s.value > 0 ? s.value : 0, dn: s.value < 0 ? s.value : 0, total: s.value, isTotal: true };
    }
    const base = s.value >= 0 ? running : running + s.value;
    const up   = s.value >= 0 ? s.value : 0;
    const dn   = s.value <  0 ? -s.value : 0;
    running += s.value;
    return { name: s.label, base, up, dn, total: running, isTotal: false };
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 6, bottom: 4 }}>
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--ink-3,#7a6e5c)" }} axisLine={{ stroke: "var(--rule,#d9cfb8)" }} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "var(--ink-3,#7a6e5c)" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "var(--paper,#f5efe2)", border: "1px solid var(--ink,#1a1612)", fontSize: 12 }}
          formatter={(v: number, name) => name === "base" ? null : Math.round(v).toLocaleString()}
        />
        <ReferenceLine y={0} stroke="var(--ink,#1a1612)" strokeWidth={1} />
        <Bar dataKey="base" stackId="a" fill="transparent" />
        <Bar dataKey="up"   stackId="a">
          {data.map((d, i) => <Cell key={i} fill={d.isTotal ? "var(--ink,#1a1612)" : "#2E8F6B"} />)}
        </Bar>
        <Bar dataKey="dn"   stackId="a">
          {data.map((d, i) => <Cell key={i} fill={d.isTotal ? "var(--ink,#1a1612)" : "var(--accent,#7a2030)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
