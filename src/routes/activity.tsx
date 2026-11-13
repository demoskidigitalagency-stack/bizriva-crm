/**
 * Live status — everything happening in the business right now: connections, work in
 * progress (old chats coming in, messages sending, campaigns, follow-ups), problems in the
 * last 24 hours, today's numbers and what just happened. Refreshes every 5 seconds.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, CircleDashed, CircleOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, StatusBadge } from "@/components/app/primitives";
import { eventText, useActivityStatus, type StatusChannel, type StatusJob } from "@/lib/activity";
import { relativeTime } from "@/lib/format";
import { useLive } from "@/domain/store";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [{ title: "Live status · Bizriva CRM" }] }),
  component: ActivityPage,
});

const CHANNEL_TONE = { ok: "success", working: "info", problem: "danger", off: "neutral" } as const;
const CHANNEL_WORD = { ok: "Working", working: "In progress", problem: "Needs attention", off: "Off" } as const;
const CHANNEL_ICON = { ok: CheckCircle2, working: Loader2, problem: AlertTriangle, off: CircleOff } as const;

function ActivityPage() {
  const live = useLive();
  const { data, error, allowed, reload } = useActivityStatus(5000);
  if (!live.on) return (
    <div className="space-y-4">
      <PageHeader eyebrow="Overview" title="Live status" description="Everything happening in your business right now." />
      <Section><p className="p-4 text-sm text-muted-foreground">You're in practice mode with sample data. Live status shows your real business: sign in to your workspace.</p></Section>
    </div>
  );
  if (!allowed) return <p className="p-4 text-sm text-muted-foreground">Owners and managers see the live status.</p>;
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Overview" title="Live status" description="What's running, what's waiting, what needs you — refreshed every few seconds."
        actions={<span className="text-xs text-muted-foreground" aria-live="polite">{data ? `Updated ${relativeTime(data.checkedAt)}` : "Loading…"}</span>} />
      {error && <p className="text-sm text-destructive" role="alert">{error} <Button size="sm" variant="outline" onClick={() => void reload()}>Try again</Button></p>}
      {data && <>
        {data.problems.length > 0 && (
          <Section title="Needs attention" description="Problems in the last 24 hours.">
            <ul className="divide-y" aria-label="Problems">
              {data.problems.map((p) => (
                <li key={p.key} className="flex items-start gap-3 p-4 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.title}</p>
                    {p.detail && <p className="text-xs text-muted-foreground">{p.detail}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {p.at && relativeTime(p.at)}
                    {p.link && <Link to={p.link} className="text-primary underline">Open</Link>}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="In progress" description="Work Bizriva is doing for you right now, and what's queued.">
          {data.running.length === 0
            ? <p className="p-4 text-sm text-muted-foreground">Nothing running right now.</p>
            : <ul className="divide-y" aria-label="In progress">{data.running.map((j) => <JobRow key={j.key} j={j} />)}</ul>}
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Connections">
            <ul className="divide-y" aria-label="Connections">{data.channels.map((c) => <ChannelRow key={c.key} c={c} />)}</ul>
          </Section>
          <Section title="Today">
            <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3" aria-label="Today">
              {([["Messages in", data.today.messagesIn], ["Messages sent", data.today.messagesOut], ["New contacts", data.today.newContacts], ["Orders", data.today.orders], ["Follow-ups sent", data.today.followupsSent]] as const).map(([k, v]) => (
                <div key={k} className="bg-card p-4">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="text-xl font-bold">{v.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>

        <Section title="Recent activity" description="The latest things that happened, newest first.">
          {data.recent.length === 0
            ? <p className="p-4 text-sm text-muted-foreground">Nothing yet.</p>
            : <ul className="divide-y text-sm" aria-label="Recent activity">{data.recent.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex items-start gap-3 px-4 py-2.5">
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{eventText(e)}{e.by && <span className="text-muted-foreground"> · {e.by}</span>}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(e.at)}</span>
                </li>
              ))}</ul>}
        </Section>
      </>}
    </div>
  );
}

function JobRow({ j }: { j: StatusJob }) {
  const pct = j.total && j.done != null ? Math.min(100, Math.round((j.done / j.total) * 100)) : null;
  const count = j.done != null && j.total != null ? `${j.done.toLocaleString()} of ${j.total.toLocaleString()} ${j.unit}`
    : j.done != null ? `${j.done.toLocaleString()} ${j.unit}` : j.total != null ? `${j.total.toLocaleString()} ${j.unit}` : "";
  return (
    <li className="space-y-2 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {j.state === "running" ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" /> : <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />}
        <span className="font-medium">{j.title}</span>
        <StatusBadge tone={j.state === "running" ? "info" : "neutral"}>{j.state === "running" ? "Running" : "Waiting"}</StatusBadge>
        <span className="ml-auto text-xs font-semibold tabular-nums">{count}</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-muted" role="progressbar" aria-label={j.title} {...(pct != null ? { "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100 } : {})}>
        {pct != null ? <div className="h-2 rounded bg-primary transition-all" style={{ width: `${pct}%` }} />
          : j.state === "running" ? <div className="h-2 w-1/3 animate-pulse rounded bg-primary" /> : null}
      </div>
      <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
        <span>{j.detail}</span>
        {j.at && <span>· {j.state === "waiting" && new Date(j.at) > new Date() ? "next" : "updated"} {relativeTime(j.at)}</span>}
        {j.link && <Link to={j.link} className="text-primary underline">Open</Link>}
      </p>
    </li>
  );
}

function ChannelRow({ c }: { c: StatusChannel }) {
  const Icon = CHANNEL_ICON[c.state];
  return (
    <li className="flex items-start gap-3 p-4 text-sm">
      <Icon className={`mt-0.5 size-4 shrink-0 ${c.state === "ok" ? "text-success" : c.state === "problem" ? "text-destructive" : c.state === "working" ? "animate-spin text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{c.name} <StatusBadge tone={CHANNEL_TONE[c.state]}>{CHANNEL_WORD[c.state]}</StatusBadge></p>
        <p className="text-xs text-muted-foreground">{c.detail}</p>
      </div>
      {c.at && <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(c.at)}</span>}
    </li>
  );
}
