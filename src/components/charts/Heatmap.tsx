"use client";

/** Pure-SVG heatmap — no recharts (recharts has no native heatmap). */
export function Heatmap({
  rowLabels, colLabels, cells, height = 280, minColor = "#f5efe2", maxColor = "#1a1612",
}: {
  rowLabels: string[]; colLabels: string[];
  cells: number[][];           // [rowIdx][colIdx]
  height?: number;
  minColor?: string; maxColor?: string;
}) {
  const flat = cells.flat();
  const min = Math.min(0, ...flat);
  const max = Math.max(1, ...flat);
  const negMin = Math.min(0, min);    // for diverging if values cross zero
  const padL = 90, padT = 22, padR = 4, padB = 22;

  const cellW = 56;
  const cellH = Math.max(18, Math.floor((height - padT - padB) / Math.max(1, rowLabels.length)));
  const innerW = padL + cellW * colLabels.length + padR;
  const innerH = padT + cellH * rowLabels.length + padB;

  function hexLerp(a: string, b: string, t: number): string {
    const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const [ar, ag, ab] = p(a); const [br, bg, bb] = p(b);
    const m = (x: number, y: number) => Math.round(x + (y - x) * t);
    const h = (n: number) => n.toString(16).padStart(2, "0");
    return `#${h(m(ar, br))}${h(m(ag, bg))}${h(m(ab, bb))}`;
  }
  const colorFor = (v: number) => {
    if (v === 0) return "var(--paper-2,#ede5d2)";
    if (v < 0)   return hexLerp("#f5efe2", "#7a2030", Math.min(1, Math.abs(v) / Math.abs(negMin || 1)));
    return hexLerp(minColor, maxColor, Math.min(1, v / (max || 1)));
  };

  return (
    <svg width={innerW} height={innerH} style={{ display: "block" }}>
      {colLabels.map((c, ci) => (
        <text key={ci} x={padL + cellW * ci + cellW / 2} y={padT - 8} fontSize="10" textAnchor="middle" fill="var(--ink-3,#7a6e5c)" fontFamily="JetBrains Mono, monospace">{c}</text>
      ))}
      {rowLabels.map((r, ri) => (
        <g key={ri}>
          <text x={padL - 8} y={padT + cellH * ri + cellH / 2 + 3} fontSize="11" textAnchor="end" fill="var(--ink-2,#3d362c)" fontFamily="Newsreader, serif">{r}</text>
          {colLabels.map((_, ci) => {
            const v = cells[ri]?.[ci] ?? 0;
            return (
              <g key={ci}>
                <rect x={padL + cellW * ci} y={padT + cellH * ri} width={cellW - 1} height={cellH - 1} fill={colorFor(v)} />
                <title>{`${r} · ${colLabels[ci]}: ${v.toLocaleString()}`}</title>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
