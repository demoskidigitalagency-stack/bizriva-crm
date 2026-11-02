import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Section, StatusBadge } from "@/components/app/primitives";
import { TaskDialog } from "@/components/app/dialogs";
import { useActions, useDb } from "@/domain/store";
import { NOW } from "@/domain/database";
import { fullName, getMember } from "@/domain/repositories";
import type { Task } from "@/domain/types";
import { formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/crm/tasks")({
  head: () => ({ meta: [{ title: "Tasks · Bizriva CRM" }] }),
  component: Tasks,
});

const PRIORITY_TONE = { low: "neutral", normal: "info", high: "warning", urgent: "danger" } as const;
const TYPE_LABEL: Record<Task["type"], string> = { follow_up: "Follow-up", call: "Call", delivery_check: "Delivery check", payment_chase: "Payment chase", general: "General" };

type View = "overdue" | "today" | "upcoming" | "done";

function bucket(t: Task): View {
  if (t.status === "done" || t.status === "cancelled") return "done";
  const due = new Date(t.dueAt);
  if (due < NOW) return "overdue";
  return due.toDateString() === NOW.toDateString() ? "today" : "upcoming";
}

function Tasks() {
  const db = useDb();
  const { completeTask, snoozeTask } = useActions();
  const [view, setView] = useState<View>("overdue");
  const [assignee, setAssignee] = useState("all");
  const [creating, setCreating] = useState(false);

  const scoped = db.tasks.filter((t) => assignee === "all" || t.assigneeId === assignee);
  const counts = { overdue: 0, today: 0, upcoming: 0, done: 0 } as Record<View, number>;
  scoped.forEach((t) => counts[bucket(t)]++);
  const rows = scoped.filter((t) => bucket(t) === view).sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks and follow-ups</h1>
          <p className="mt-1 text-sm text-muted-foreground">Calls, follow-ups, delivery checks and payment chases for the team.</p>
        </div>
        <div className="flex gap-2">
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="h-9 w-40" aria-label="Assignee"><SelectValue>{assignee === "all" ? "Everyone" : getMember(db, assignee)?.name}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {db.team.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /> New task</Button>
        </div>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList>
          <TabsTrigger value="overdue">Overdue ({counts.overdue})</TabsTrigger>
          <TabsTrigger value="today">Today ({counts.today})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({counts.upcoming})</TabsTrigger>
          <TabsTrigger value="done">Done ({counts.done})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Section>
        {rows.length === 0 ? <EmptyState title={view === "overdue" ? "Nothing overdue" : "No tasks here"} /> : (
          <ul className="divide-y">
            {rows.map((t) => {
              const c = t.contactId ? db.contacts.find((x) => x.id === t.contactId) : undefined;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1 basis-60">
                    <p className={cn("font-medium", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c ? <Link to="/crm/contacts/$contactId" params={{ contactId: c.id }} className="hover:underline">{fullName(c)}</Link> : "No contact"} · {getMember(db, t.assigneeId)?.name} · {formatDateTime(t.dueAt)} ({relativeTime(t.dueAt)})
                    </p>
                  </div>
                  <StatusBadge>{TYPE_LABEL[t.type]}</StatusBadge>
                  <StatusBadge tone={PRIORITY_TONE[t.priority]}>{t.priority}</StatusBadge>
                  {t.status === "open" || t.status === "snoozed" ? (
                    <span className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => snoozeTask(t.id, 1)}>Snooze 1 day</Button>
                      <Button size="sm" onClick={() => completeTask(t.id)}>Done</Button>
                    </span>
                  ) : <StatusBadge tone="success">Done</StatusBadge>}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <TaskDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
