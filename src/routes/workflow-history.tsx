import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import { fullName } from "@/domain/repositories";
import { FOLLOWUP_WORKFLOW_ID } from "@/domain/followups";
import type { WorkflowRun } from "@/domain/types";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/workflow-history")({
  head: () => ({ meta: [{ title: "Workflow History · Bizriva CRM" }] }),
  component: History,
});

const TONE = { succeeded: "success", failed: "danger", skipped: "neutral", running: "info" } as const;

function History() {
  const db = useDb();
  const { retryRun } = useActions();
  const [status, setStatus] = useState<"all" | WorkflowRun["status"]>("all");
  const [wf, setWf] = useState("all");
  const name = (id: string) => (id === FOLLOWUP_WORKFLOW_ID ? "Follow-ups" : db.workflows.find((w) => w.id === id)?.name ?? "Deleted workflow");
  const ids = [...new Set(db.workflowRuns.map((r) => r.workflowId))];
  const rows = db.workflowRuns.filter((r) => (status === "all" || r.status === status) && (wf === "all" || r.workflowId === wf));
  const count = (s: WorkflowRun["status"]) => db.workflowRuns.filter((r) => r.status === s).length;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Automation</p>
        <h1 className="text-2xl font-bold">Workflow History</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every automated action, what happened and why. Failed runs that are safe to repeat can be retried.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Runs" value={String(db.workflowRuns.length)} />
        <KpiCard label="Succeeded" value={String(count("succeeded"))} tone="success" />
        <KpiCard label="Skipped by a rule" value={String(count("skipped"))} tone="info" />
        <KpiCard label="Failed" value={String(count("failed"))} tone={count("failed") ? "danger" : "success"} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="failed">Failed ({count("failed")})</TabsTrigger>
            <TabsTrigger value="succeeded">Succeeded</TabsTrigger>
            <TabsTrigger value="skipped">Skipped</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={wf} onValueChange={setWf}>
          <SelectTrigger className="h-9 w-56" aria-label="Workflow"><SelectValue>{wf === "all" ? "All workflows" : name(wf)}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value="all">All workflows</SelectItem>{ids.map((id) => <SelectItem key={id} value={id}>{name(id)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Section>
        {rows.length === 0 ? <EmptyState title="No runs match" /> : (
          <ul className="divide-y">
            {rows.map((r) => {
              const c = r.contactId ? db.contacts.find((x) => x.id === r.contactId) : undefined;
              const retryable = r.status === "failed" && /retry|timeout/i.test(r.detail);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <StatusBadge tone={TONE[r.status]}>{r.status}</StatusBadge>
                  <div className="min-w-0 flex-1 basis-60">
                    <p>{r.detail}</p>
                    <p className="text-xs text-muted-foreground">{name(r.workflowId)}{c ? <> · <Link to="/crm/contacts/$contactId" params={{ contactId: c.id }} className="hover:underline">{fullName(c)}</Link></> : null} · {formatDateTime(r.at)}</p>
                  </div>
                  {r.status === "failed" && (retryable ? <Button size="sm" variant="outline" onClick={() => retryRun(r.id)}>Retry</Button> : <span className="text-xs text-muted-foreground">Fix the cause, then it runs next time</span>)}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
