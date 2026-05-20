import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: { value: number; label: string; positive?: boolean };
  subtitle?: string;
  className?: string;
}

export function StatsCard({
  title,
  value,
  icon: Icon,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
  trend,
  subtitle,
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-white p-5 shadow-sm transition-shadow hover:shadow-md",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="mt-1.5 text-2xl font-bold text-foreground tabular-nums">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              <span
                className={cn(
                  "text-xs font-medium",
                  trend.positive === true
                    ? "text-green-600"
                    : trend.positive === false
                    ? "text-red-600"
                    : "text-muted-foreground"
                )}
              >
                {trend.value > 0 ? "+" : ""}
                {trend.value}%
              </span>
              <span className="text-xs text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg",
            iconBg
          )}
        >
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
    </div>
  );
}
