"use client";
import { ResponsiveContainer, Treemap, Tooltip } from "recharts";

export type TreemapDatum = { name: string; size: number; fill?: string };

const PALETTE = ["#5B5BD6","#2E8F6B","#C44545","#2BB1C4","#b08d3a","#7a2030","#1a1612","#a89d87"];

export function TreemapChart({ data, height = 280 }: { data: TreemapDatum[]; height?: number }) {
  const colored = data.map((d, i) => ({ ...d, fill: d.fill ?? PALETTE[i % PALETTE.length] }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap data={colored} dataKey="size" stroke="var(--paper,#f5efe2)" content={<CustomContent />}>
        <Tooltip
          contentStyle={{ background: "var(--paper,#f5efe2)", border: "1px solid var(--ink,#1a1612)", fontSize: 12 }}
          formatter={(v: number) => v.toLocaleString()}
        />
      </Treemap>
    </ResponsiveContainer>
  );
}

function CustomContent(props: any) {
  const { x, y, width, height, name, size, fill } = props;
  if (width < 40 || height < 22) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} />
      <text x={x + 8} y={y + 16} fill="white" fontSize={11} fontFamily="Newsreader, serif" fontWeight={500}>{name}</text>
      {height > 38 && <text x={x + 8} y={y + 32} fill="rgba(255,255,255,0.7)" fontSize={10} fontFamily="JetBrains Mono, monospace">{Math.round(size).toLocaleString()}</text>}
    </g>
  );
}
