import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import type { BadgeTone } from "@/domain/types";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  brand: "bg-accent text-accent-foreground border-primary/20",
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/15 text-warning-foreground border-warning/30 dark:text-warning",
  danger: "bg-destructive/10 text-destructive border-destructive/25",
  info: "bg-info/10 text-info border-info/25",
  purple: "bg-chart-5/12 text-chart-5 border-chart-5/25",
};

export function StatusBadge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none", TONE_CLASSES[tone], className)}>
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, description, action, children, className, bodyClassName }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card text-card-foreground", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function KpiCard({ label, value, hint, delta, icon, tone = "brand" }: { label: string; value: string; hint?: string; delta?: number; icon?: ReactNode; tone?: "brand" | "success" | "warning" | "danger" | "info" }) {
  const toneBg = { brand: "bg-accent text-accent-foreground", success: "bg-success/12 text-success", warning: "bg-warning/15 text-warning-foreground dark:text-warning", danger: "bg-destructive/10 text-destructive", info: "bg-info/10 text-info" }[tone];
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon && <span className={cn("grid size-7 place-items-center rounded-md", toneBg)}>{icon}</span>}
      </div>
      <p className="num mt-2 text-xl font-bold text-foreground sm:text-2xl">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {delta !== undefined && (
          <span className={cn("inline-flex items-center font-semibold", delta >= 0 ? "text-success" : "text-destructive")}>
            {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="truncate text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="size-5" />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

const AVATAR_TONES: Record<string, string> = {
  brand: "bg-primary text-primary-foreground",
  info: "bg-info text-info-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  purple: "bg-chart-5 text-primary-foreground",
};

export function PersonAvatar({ name, tone, size = "sm" }: { name: string; tone?: string; size?: "sm" | "md" | "lg" }) {
  const hash = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  const key = tone ?? Object.keys(AVATAR_TONES)[hash % 5]!;
  return (
    <span className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold", AVATAR_TONES[key], size === "sm" && "size-7 text-[11px]", size === "md" && "size-9 text-xs", size === "lg" && "size-14 text-lg")}>
      {initials(name)}
    </span>
  );
}
