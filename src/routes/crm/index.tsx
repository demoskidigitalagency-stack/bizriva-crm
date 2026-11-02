import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, Coins, Target, TrendingUp, UserCheck, Users } from "lucide-react";
import { KpiCard, PersonAvatar, Section, StatusBadge, EmptyState } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { fullName, getCrmOverview, getMember } from "@/domain/repositories";
import { LEAD_STAGES, LIFECYCLE_META, SOURCE_LABELS } from "@/domain/types";
import { formatCurrency, formatPercent, relativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/crm/")({
  head: () => ({ meta: [{ title: "CRM · Bizriva CRM" }] }),
  component: CrmOverview,
});

function CrmOverview() {
  const db = useDb();
  const ws = useWorkspace();
  const { completeTask } = useActions();
  const o = getCrmOverview(db);
  const maxStage = Math.max(1, ...o.stageCounts.map((s) => s.count));
  const totalContacts = db.contacts.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">CRM</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pipeline health, where leads come from, and who needs a follow-up.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Open leads" value={String(o.kpis.openLeads)} icon={<Target className="size-4" />} />
        <KpiCard label="Pipeline value" value={formatCurrency(o.kpis.pipelineValue, ws.currency, { compact: true })} icon={<Coins className="size-4" />} tone="info" />
        <KpiCard label="Win rate" value={formatPercent(o.kpis.winRate)} hint={`${o.kpis.wonThisMonth} won`} icon={<TrendingUp className="size-4" />} tone="success" />
        <KpiCard label="Overdue follow-ups" value={String(o.kpis.overdueFollowUps)} icon={<Clock className="size-4" />} tone={o.kpis.overdueFollowUps ? "danger" : "success"} />
        <KpiCard label="Average deal" value={formatCurrency(o.kpis.avgDealSize, ws.currency, { compact: true })} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="Active customers" value={String(o.kpis.activeCustomers)} icon={<UserCheck className="size-4" />} tone="success" />
        <KpiCard label="At risk or dormant" value={String(o.kpis.atRisk)} icon={<AlertTriangle className="size-4" />} tone="warning" />
        <KpiCard label="All contacts" value={String(totalContacts)} icon={<Users className="size-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Pipeline by stage" action={<Button asChild size="sm" variant="outline"><Link to="/crm/pipeline">Open pipeline</Link></Button>}>
          <ul className="space-y-2 p-4">
            {o.stageCounts.map((s) => (
              <li key={s.stage} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-muted-foreground">{LEAD_STAGES.find((x) => x.id === s.stage)?.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(s.count / maxStage) * 100}%` }} /></span>
                <span className="num w-8 text-right font-semibold">{s.count}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Lifecycle split" action={<Button asChild size="sm" variant="outline"><Link to="/crm/contacts">All contacts</Link></Button>}>
          <ul className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
            {o.lifecycleSplit.map((l) => (
              <li key={l.lifecycle} className="rounded-md border p-2.5">
                <StatusBadge tone={LIFECYCLE_META[l.lifecycle].tone}>{LIFECYCLE_META[l.lifecycle].label}</StatusBadge>
                <p className="num mt-1.5 text-lg font-bold">{l.count}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Lead sources" description="Leads, wins and pipeline value by where people came from">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-4 py-2">Source</th><th className="px-4 py-2 text-right">Leads</th><th className="px-4 py-2 text-right">Won</th><th className="px-4 py-2 text-right">Value</th></tr>
              </thead>
              <tbody className="divide-y">
                {o.sources.map((s) => (
                  <tr key={s.source}>
                    <td className="px-4 py-2">{SOURCE_LABELS[s.source]}</td>
                    <td className="num px-4 py-2 text-right">{s.leads}</td>
                    <td className="num px-4 py-2 text-right">{s.won}</td>
                    <td className="num px-4 py-2 text-right">{formatCurrency(s.value, ws.currency, { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Upcoming follow-ups" action={<Button asChild size="sm" variant="outline"><Link to="/crm/tasks">All tasks</Link></Button>}>
          {o.upcomingFollowUps.length === 0 ? (
            <EmptyState title="Nothing due" description="New follow-ups appear here as soon as they're scheduled." />
          ) : (
            <ul className="divide-y">
              {o.upcomingFollowUps.map((t) => {
                const c = db.contacts.find((x) => x.id === t.contactId);
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c ? <Link to="/crm/contacts/$contactId" params={{ contactId: c.id }} className="hover:underline">{fullName(c)}</Link> : "No contact"} · {getMember(db, t.assigneeId)?.name} · due {relativeTime(t.dueAt)}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => completeTask(t.id)}>Done</Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Newest leads" action={<Button asChild size="sm" variant="outline"><Link to="/crm/leads">All leads</Link></Button>}>
        <ul className="divide-y">
          {o.recentLeads.map((l) => (
            <li key={l.id}>
              <Link to="/crm/contacts/$contactId" params={{ contactId: l.contactId }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40">
                <PersonAvatar name={fullName(l.contact)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{fullName(l.contact)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{l.productInterest ?? "No product yet"} · {SOURCE_LABELS[l.source]} · {l.ownerName}</span>
                </span>
                <StatusBadge tone="brand">{LEAD_STAGES.find((s) => s.id === l.stage)?.label}</StatusBadge>
                <span className="hidden text-xs text-muted-foreground sm:inline">{relativeTime(l.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
