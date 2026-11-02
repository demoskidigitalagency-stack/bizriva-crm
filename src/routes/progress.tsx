import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, CircleDashed, CircleDot } from "lucide-react";
import { PageHeader, Section, StatusBadge } from "@/components/app/primitives";
import { ACCEPTANCE_TESTS, FRONTEND_CHECKLIST, PHASES, backendProgress, frontendProgress, phaseProgress, type StatusItem } from "@/app/status";
import { GROUPS, MODULES, STATE_LABEL, STATE_TONE, type BuildState } from "@/app/modules";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/progress")({
  head: () => ({ meta: [{ title: "Build progress · Bizriva CRM" }] }),
  component: Progress,
});

function Bar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}

const STATE_ICON: Record<BuildState, typeof Circle> = { live: CheckCircle2, practice: CheckCircle2, partial: CircleDot, planned: CircleDashed };

function Checklist({ items }: { items: StatusItem[] }) {
  return (
    <ul className="divide-y">
      {items.map((i) => (
        <li key={i.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
          {i.done
            ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" />
            : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not done" />}
          <span className="min-w-0 flex-1">
            <span className={cn(i.done && "text-muted-foreground")}>{i.label}</span>
            {i.note && <span className="block text-xs text-muted-foreground">{i.note}</span>}
          </span>
          {i.doneOn && <span className="num shrink-0 text-xs text-muted-foreground">{i.doneOn}</span>}
        </li>
      ))}
    </ul>
  );
}

function Progress() {
  const fe = frontendProgress();
  const be = backendProgress();
  const passed = ACCEPTANCE_TESTS.filter((t) => t.passed).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Build progress"
        description="Two tracks. Frontend: every page and button works on practice data. Backend: the same thing working for real. Same numbers as STATUS.md in the repo."
      />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Frontend · Practice Mode</p>
          <p className="num mt-1 text-4xl font-bold">{Math.round(fe.overall)}%</p>
          <Bar value={fe.overall} className="mt-3" />
          <p className="mt-2 text-xs text-muted-foreground">
            {fe.practiceCount} of {MODULES.length} modules practice ready · {fe.partialCount} partly working · {fe.plannedCount} planned
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Backend · Live</p>
          <p className="num mt-1 text-4xl font-bold">{Math.round(be)}%</p>
          <Bar value={be} className="mt-3" />
          <p className="mt-2 text-xs text-muted-foreground">Acceptance tests passed: {passed} of {ACCEPTANCE_TESTS.length}</p>
        </div>
      </div>

      <h2 className="pt-2 text-lg font-semibold">Frontend track</h2>

      <Section title="Modules" description="Practice ready = every page opens and every control works on sample data. Worth 85% of the frontend." action={<span className="num text-sm font-semibold">{Math.round(fe.modules)}%</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2">Module</th><th className="px-4 py-2">Group</th><th className="px-4 py-2">Phase</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">From</th></tr>
            </thead>
            <tbody className="divide-y">
              {GROUPS.flatMap((g) => MODULES.filter((m) => m.group === g)).map((m) => {
                const Icon = STATE_ICON[m.state];
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-2 font-medium">
                      <Link to={m.path} className="inline-flex items-center gap-2 hover:underline">
                        <Icon className={cn("size-4", m.state === "planned" ? "text-muted-foreground" : m.state === "partial" ? "text-warning" : "text-success")} aria-hidden="true" />
                        {m.label}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{m.group}</td>
                    <td className="px-4 py-2">{m.phase}</td>
                    <td className="px-4 py-2"><StatusBadge tone={STATE_TONE[m.state]}>{STATE_LABEL[m.state]}</StatusBadge></td>
                    <td className="px-4 py-2 text-muted-foreground">{m.sources.join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Cross-cutting" description="Work that spans every module. Worth 15% of the frontend." action={<span className="num text-sm font-semibold">{Math.round(fe.checklist)}%</span>}>
        <Checklist items={FRONTEND_CHECKLIST} />
      </Section>

      <h2 className="pt-2 text-lg font-semibold">Backend track</h2>

      {PHASES.map((p) => {
        const pr = phaseProgress(p);
        return (
          <Section
            key={p.id}
            title={p.name}
            description={`${p.goal} Worth ${p.share}% of the backend.`}
            action={<span className="num text-sm font-semibold">{pr.doneCount}/{pr.count} · {Math.round(pr.pctOfPhase * 100)}%</span>}
          >
            <div className="px-4 pt-3"><Bar value={pr.pctOfPhase * 100} /></div>
            <Checklist items={p.items} />
          </Section>
        );
      })}

      <Section title="Acceptance tests" description="From the master prompt. All 15 must pass end to end before calling it production-ready.">
        <ol className="divide-y">
          {ACCEPTANCE_TESTS.map((t) => (
            <li key={t.n} className="flex items-start gap-3 px-4 py-2 text-sm">
              <span className="num w-6 shrink-0 text-muted-foreground">{t.n}</span>
              <span className="flex-1">{t.label}</span>
              <StatusBadge tone={t.passed ? "success" : "neutral"}>{t.passed ? "Passed" : "Not yet"}</StatusBadge>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
