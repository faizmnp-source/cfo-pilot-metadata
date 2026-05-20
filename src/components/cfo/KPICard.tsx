import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

interface KPICardProps {
  label: string; value: number; delta?: number; deltaLabel?: string;
  trend?: "up" | "down" | "neutral"; sparkline?: number[];
  formatAs?: "currency" | "number" | "percent"; size?: "hero" | "default" | "compact";
  positive?: "up" | "down";
}

function Sparkline({ data, trend }: { data: number[]; trend?: "up" | "down" | "neutral" }) {
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1, h = 36, w = 80;
  const pts = data.map((v, i) => ({ x: (i / (data.length - 1)) * w, y: h - ((v - min) / range) * h }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const color = trend === "up" ? "#22C55E" : trend === "down" ? "#EF4444" : "#94A3B8";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function KPICard({ label, value, delta, deltaLabel = "vs. prior month", trend, sparkline, formatAs = "currency", size = "default", positive = "up" }: KPICardProps) {
  const displayValue = formatAs === "currency" ? formatCurrency(value) : formatAs === "percent" ? `${value}%` : value.toLocaleString();
  const isPositive = positive === "up" ? (delta ?? 0) > 0 : (delta ?? 0) < 0;
  const isNeutral = (delta ?? 0) === 0;
  const deltaColor = isNeutral ? "text-[var(--text-tertiary)]" : isPositive ? "text-[var(--color-success-600)]" : "text-[var(--color-danger-600)]";
  const TrendIcon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;

  return (
    <div className="bg-white rounded-xl border border-[var(--border-default)] p-5 hover:shadow-md transition-all duration-200 cursor-pointer">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">{label}</p>
        {sparkline && <Sparkline data={sparkline} trend={trend} />}
      </div>
      <p className={cn("font-bold tabular text-[var(--text-primary)] leading-none mb-2", size === "hero" ? "text-4xl" : size === "compact" ? "text-2xl" : "text-3xl")}>
        {displayValue}
      </p>
      {delta !== undefined && (
        <div className="flex items-center gap-1.5">
          <TrendIcon className={cn("w-3.5 h-3.5 shrink-0", deltaColor)} />
          <span className={cn("text-xs font-medium tabular", deltaColor)}>{formatPercent(delta)}</span>
          <span className="text-[11px] text-[var(--text-tertiary)]">{deltaLabel}</span>
        </div>
      )}
    </div>
  );
}
