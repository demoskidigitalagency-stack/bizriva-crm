import { Link } from "@tanstack/react-router";
import { Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge } from "./primitives";
import { STATE_LABEL, type ModuleDef } from "@/app/modules";

/**
 * Honest page for a module that is in the agreed menu but not built yet.
 * It says what the module will do and where it comes from — no fake data,
 * no buttons that pretend to work.
 */
export function PlannedModule({ module: m }: { module: ModuleDef }) {
  return (
    <div>
      <PageHeader
        eyebrow={`${m.group} · ${m.phase === "Later" ? "Later phase" : m.phase}`}
        title={m.label}
        description={m.summary}
        actions={<StatusBadge tone={m.state === "live" ? "success" : m.state === "screen" ? "warning" : "neutral"}>{STATE_LABEL[m.state]}</StatusBadge>}
      />
      <div className="rounded-lg border border-dashed bg-card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Hammer className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Not built yet. This is what it will include:</p>
            <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
              {m.submenus.map((s) => (
                <li key={s} className="flex gap-2"><span aria-hidden="true">·</span>{s}</li>
              ))}
            </ul>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comes from</dt>
                <dd className="mt-1 flex flex-wrap gap-1">{m.sources.map((s) => <StatusBadge key={s} tone="brand">{s}</StatusBadge>)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phase</dt>
                <dd className="mt-1">{m.phase}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Decision</dt>
                <dd className="mt-1">{m.decision}</dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild size="sm"><Link to="/progress">See build progress</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/today">Back to Today</Link></Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
