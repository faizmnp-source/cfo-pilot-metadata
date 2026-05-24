"use client";

// Sprint P — Forecast Variance Waterfall chart.
//
// Pure SVG (no recharts) so we can draw connector lines between adjacent
// bar tops/bottoms — recharts' waterfall isn't first-class and adding the
// connectors there is fiddly. The math is in src/lib/forecast/waterfall.ts;
// this file just lays the bars out.

import { useMemo } from "react";
import type { ReactElement } from "react";
import {
  buildWaterfall,
  computeValueBounds,
  projectBarsToPixels,
  unbridgedDelta,
  type WaterfallSourceRow,
} from "@/lib/forecast/waterfall";
import type { Favorability } from "@/lib/forecast/variance";

type Props = {
  forecastTotal: number;
  actualTotal:   number;
  rows:          WaterfallSourceRow[];
  topN?:         number;
  height?:       number;
  forecastLabel?: string;
  actualLabel?:   string;
};

// Favorability → fill class. Anchor bars use stone (neutral chrome).
function fillFor(fav: Favorability | undefined, kind: "anchor-start" | "contributor" | "anchor-end" | "other"): string {
  if (kind === "anchor-start") return "#475569";  // slate-600
  if (kind === "anchor-end")   return "#1e293b";  // slate-800
  if (kind === "other")        return "#a8a29e";  // stone-400
  if (fav === "favorable")     return "#059669";  // emerald-600
  if (fav === "unfavorable")   return "#e11d48";  // rose-600
  if (fav === "flat")          return "#a8a29e";  // stone-400
  return "#78716c";                                // stone-500 (neutral)
}

function fmt(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

export function ForecastWaterfall(props: Props): ReactElement {
  const {
    forecastTotal,
    actualTotal,
    rows,
    topN = 8,
    height = 320,
    forecastLabel = "Forecast",
    actualLabel = "Actual",
  } = props;

  const series = useMemo(
    () => buildWaterfall(forecastTotal, actualTotal, rows, { topN, forecastLabel, actualLabel }),
    [forecastTotal, actualTotal, rows, topN, forecastLabel, actualLabel],
  );

  // Geometry — viewBox is sized to the bar count. We render the SVG with a
  // viewBox so it scales responsively without React re-layout.
  const barCount     = series.bars.length;
  const chartH       = height;
  const xAxisH       = 52;   // space for bottom labels
  const yAxisW       = 56;   // space for left tick labels
  const plotH        = chartH - xAxisH;
  const barSlot      = 88;   // px per bar
  const plotW        = barCount * barSlot;
  const totalW       = plotW + yAxisW + 16;
  const barW         = 44;
  const slotPad      = (barSlot - barW) / 2;

  const { min, max } = computeValueBounds(series.bars);
  const projected = projectBarsToPixels(series.bars, plotH, min, max);

  // Tick lines (5 horizontal grid ticks).
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const t = i / 4;
    const v = min + (max - min) * (1 - t);
    return { y: t * plotH, v };
  });

  const residual = unbridgedDelta(series);
  const totalVariance = actualTotal - forecastTotal;

  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-stone-400 text-xs italic">
        No variance rows yet — run the scorecard to populate the waterfall.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <svg
          width={totalW}
          height={chartH}
          viewBox={`0 0 ${totalW} ${chartH}`}
          className="block"
          role="img"
          aria-label="Forecast to Actual variance waterfall"
        >
          {/* gridlines + y-axis ticks */}
          <g transform={`translate(${yAxisW}, 0)`}>
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={0} x2={plotW} y1={t.y} y2={t.y} stroke="#f5f5f4" strokeDasharray={i === ticks.length - 1 ? "0" : "3 3"} />
                <text x={-8} y={t.y + 3} fontSize={9} textAnchor="end" fill="#a8a29e" fontFamily="monospace">{fmt(t.v)}</text>
              </g>
            ))}

            {/* zero baseline highlight */}
            {min < 0 && max > 0 && (() => {
              const range = max - min || 1;
              const zeroY = plotH - ((0 - min) / range) * plotH;
              return <line x1={0} x2={plotW} y1={zeroY} y2={zeroY} stroke="#d6d3d1" strokeWidth={1} />;
            })()}

            {/* bars + value labels + connector dashes */}
            {projected.map((b, idx) => {
              const x = idx * barSlot + slotPad;
              const cx = x + barW / 2;
              const fill = fillFor(b.favorability, b.kind);
              const isAnchor = b.kind === "anchor-start" || b.kind === "anchor-end";
              const isContributor = b.kind === "contributor" || b.kind === "other";
              const variancePrefix = b.variance > 0 ? "+" : "";

              // Connector dash from the *end* of this bar to the *start* of the next
              // (only between adjacent walking pieces — not from anchors).
              const nextBar = projected[idx + 1];
              let connector: ReactElement | null = null;
              if (nextBar && (b.kind === "anchor-start" || isContributor) && (nextBar.kind === "contributor" || nextBar.kind === "other" || nextBar.kind === "anchor-end")) {
                // Connector y = end value of current bar (= start value of next, in walked land).
                const endVal = b.runningEnd;
                const range = max - min || 1;
                const yEnd = plotH - ((endVal - min) / range) * plotH;
                // For anchor-end we don't connect (it's drawn from 0, not from the walk).
                const drawTo = nextBar.kind === "anchor-end" ? null : nextBar;
                if (drawTo) {
                  const xFrom = x + barW;
                  const xTo   = (idx + 1) * barSlot + slotPad;
                  connector = (
                    <line x1={xFrom} y1={yEnd} x2={xTo} y2={yEnd} stroke="#d6d3d1" strokeDasharray="2 3" strokeWidth={1} />
                  );
                }
              }

              return (
                <g key={idx}>
                  {connector}
                  <rect x={x} y={b.pxTop} width={barW} height={b.pxHeight} rx={2} ry={2} fill={fill} />
                  {/* Value label on the bar */}
                  <text
                    x={cx}
                    y={b.pxTop - 6}
                    fontSize={10}
                    textAnchor="middle"
                    fill="#44403c"
                    fontFamily="monospace"
                  >
                    {isAnchor ? fmt(b.variance) : `${variancePrefix}${fmt(b.variance)}`}
                  </text>
                  {/* Bottom-axis label */}
                  <g transform={`translate(${cx}, ${plotH + 12})`}>
                    <text fontSize={10} textAnchor="middle" fill={isAnchor ? "#1c1917" : "#44403c"} fontWeight={isAnchor ? 600 : 400}>
                      {truncate(b.label, 10)}
                    </text>
                    {b.sublabel && (
                      <text y={12} fontSize={8} textAnchor="middle" fill="#a8a29e">
                        {truncate(b.sublabel, 14)}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Stat footer — total variance + residual + Other count. */}
      <div className="flex items-center gap-4 flex-wrap text-[11px] text-stone-500 mt-3 px-1">
        <div>
          Total variance: <span className={`font-mono font-semibold ${totalVariance > 0 ? "text-emerald-700" : totalVariance < 0 ? "text-rose-700" : "text-stone-700"}`}>
            {totalVariance > 0 ? "+" : ""}{fmt(totalVariance)}
          </span>
        </div>
        <div>
          Bridged: <span className="font-mono">{series.bars.filter(b => b.kind === "contributor").length}</span> contributors
          {series.otherCount > 0 && (
            <> &nbsp;·&nbsp; Other: <span className="font-mono">{series.otherCount}</span> rolled up ({fmt(series.otherVariance)})</>
          )}
        </div>
        {Math.abs(residual) > 0.5 && (
          <div className="text-amber-700">
            Δ unbridged: <span className="font-mono">{fmt(residual)}</span>
            <span className="text-stone-400 italic ml-1">(rows scoped narrower than totals)</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          <LegendDot color="#059669" label="Favorable" />
          <LegendDot color="#e11d48" label="Unfavorable" />
          <LegendDot color="#78716c" label="Neutral" />
          <LegendDot color="#1e293b" label="Anchor" />
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span style={{ background: color }} className="inline-block w-2.5 h-2.5 rounded-sm" />
      <span className="text-[10px] text-stone-500">{label}</span>
    </span>
  );
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
