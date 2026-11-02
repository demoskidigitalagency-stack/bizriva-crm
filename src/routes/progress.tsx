import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Circle } from "lucide-react";
import { PageHeader, Section, StatusBadge } from "@/components/app/primitives";
import { ACCEPTANCE_TESTS, PHASES, overallProgress, phaseProgress } from "@/app/status";
import { GROUPS, MODULES, STATE_LABEL } from "@/app/modules";
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

function Progress() {
  const overall = overallProgress();
  const passed = ACCEPTANCE_TESTS.filter((t) => t.passed).length;
  const counts = { live: 0, screen: 0, planned: 0 };
  MODULES.forEach((m) => counts[m.state]++);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Workspace" title="Build progress" description="Ticked only when a thing works for real, not when its screen exists. Same checklist as STATUS.md in the repo." />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 sm:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overall</p>
          <p className="num mt-1 text-4xl font-bold">{Math.round(overall)}%</p>
          <Bar value={overall} className="mt-3" />
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modules</p>
          <p className="num mt-1 text-2xl font-bold">{MODULES.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{counts.live} live · {counts.screen} screen only · {counts.planned} planned</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acceptance tests</p>
          <p className="num mt-1 text-2xl font-bold">{passed} / {ACCEPTANCE_TESTS.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">From the master prompt</p>
        </div>
      </div>

      {PHASES.map((p) => {
        const pr = phaseProgress(p);
        return (
          <Section
            key={p.id}
            title={p.name}
            description={`${p.goal} Worth ${p.share}% of the build.`}
            action={<span className="num text-sm font-semibold">{pr.doneCount}/{pr.count} · {Math.round(pr.pctOfPhase * 100)}%</span>}
          >
            <div className="px-4 pt-3"><Bar value={pr.pctOfPhase * 100} /></div>
            <ul className="divide-y">
              {p.items.map((i) => (
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
          </Section>
        );
      })}

      <Section title="Acceptance tests" description="All 15 must pass end to end before calling it production-ready.">
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

      <Section title="Modules by status" description="Every menu in the unified navigation.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2">Module</th><th className="px-4 py-2">Group</th><th className="px-4 py-2">Phase</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">From</th></tr>
            </thead>
            <tbody className="divide-y">
              {GROUPS.flatMap((g) => MODULES.filter((m) => m.group === g)).map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 font-medium">{m.label}</td>
                  <td className="px-4 py-2 text-muted-foreground">{m.group}</td>
                  <td className="px-4 py-2">{m.phase}</td>
                  <td className="px-4 py-2"><StatusBadge tone={m.state === "live" ? "success" : m.state === "screen" ? "warning" : "neutral"}>{STATE_LABEL[m.state]}</StatusBadge></td>
                  <td className="px-4 py-2 text-muted-foreground">{m.sources.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
