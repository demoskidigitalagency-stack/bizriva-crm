import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="flex flex-col gap-3 border-b bg-card px-4 py-5 md:flex-row md:items-end md:justify-between md:px-6">
    <div>{eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[.14em] text-primary">{eyebrow}</div>}<h1 className="text-2xl font-bold md:text-3xl">{title}</h1>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>;
}

export function KpiCard({ label, value, note, tone = "default" }: { label: string; value: string; note?: string; tone?: "default"|"success"|"warning"|"danger" }) {
  const toneClass = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-destructive" : "text-foreground";
  return <div className="rounded-xl border bg-card p-4 shadow-sm"><div className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</div><div className={`mt-2 text-2xl font-bold num ${toneClass}`}>{value}</div>{note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}</div>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral"|"brand"|"success"|"warning"|"danger"|"info" }) {
  const cls = {
    neutral:"bg-muted text-muted-foreground", brand:"bg-accent text-accent-foreground", success:"bg-success/15 text-success",
    warning:"bg-warning/20 text-warning-foreground", danger:"bg-destructive/10 text-destructive", info:"bg-info/10 text-info"
  }[tone];
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${cls}`}>{children}</span>;
}

export function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="overflow-hidden rounded-xl border bg-card shadow-sm"><div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="font-semibold">{title}</h2>{subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}</div>{action}</div><div className="p-4">{children}</div></section>;
}
