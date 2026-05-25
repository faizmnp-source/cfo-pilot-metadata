"use client";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, ZAxis } from "recharts";

export type XYPoint = { x: number; y: number; label?: string };

export function ScatterChartXY({ points, xLabel = "X", yLabel = "Y", height = 280, showParity = true }: {
  points: XYPoint[]; xLabel?: string; yLabel?: string; height?: number; showParity?: boolean;
}) {
  const allVals = points.flatMap(p => [p.x, p.y]);
  const lo = Math.min(0, ...allVals);
  const hi = Math.max(1, ...allVals);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 12, right: 12, left: 6, bottom: 28 }}>
        <CartesianGrid stroke="var(--rule,#d9cfb8)" />
        <XAxis type="number" dataKey="x" name={xLabel} tick={{ fontSize: 10, fill: "var(--ink-3,#7a6e5c)" }} axisLine={{ stroke: "var(--rule,#d9cfb8)" }} tickLine={false}>
          <text x="50%" y="100%" dy={22} textAnchor="middle" fill="var(--ink-3,#7a6e5c)" fontSize={10}>{xLabel}</text>
        </XAxis>
        <YAxis type="number" dataKey="y" name={yLabel} tick={{ fontSize: 10, fill: "var(--ink-3,#7a6e5c)" }} axisLine={false} tickLine={false} />
        <ZAxis type="category" dataKey="label" />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          contentStyle={{ background: "var(--paper,#f5efe2)", border: "1px solid var(--ink,#1a1612)", fontSize: 12 }}
        />
        {showParity && <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke="var(--accent,#7a2030)" strokeDasharray="4 4" />}
        <Scatter data={points} fill="var(--ink,#1a1612)" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
