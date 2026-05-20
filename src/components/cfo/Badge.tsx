import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral" | "ai";

const variants: Record<BadgeVariant, string> = {
  success: "bg-[var(--color-success-50)] text-[var(--color-success-600)] border-green-100",
  warning: "bg-[var(--color-warning-50)] text-[var(--color-warning-600)] border-amber-100",
  danger:  "bg-[var(--color-danger-50)] text-[var(--color-danger-600)] border-red-100",
  info:    "bg-[var(--color-brand-50)] text-[var(--color-brand-600)] border-blue-100",
  neutral: "bg-gray-50 text-gray-600 border-gray-200",
  ai:      "bg-[var(--color-ai-50)] text-[var(--color-ai-600)] border-violet-100",
};

export function CFOBadge({ variant = "neutral", children, className }: {
  variant?: BadgeVariant; children: React.ReactNode; className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border", variants[variant], className)}>
      {children}
    </span>
  );
}
