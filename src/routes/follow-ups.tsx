import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import { fullName } from "@/domain/repositories";
import { FOLLOWUP_WORKFLOW_ID, followUpQueue, inQuietHours } from "@/domain/followups";
import type { FollowUpRule } from "@/domain/types";

export const Route = createFileRoute("/follow-ups")({
  head: () => ({ meta: [{ title: "Follow-ups · Bizriva CRM" }] }),
  component: FollowUps,
});

const TRIGGERS: Record<FollowUpRule["trigger"], string> = {
  no_reply_after_details: "Said they're interested, then went quiet",
  no_reply_after_price: "Asked the price, then went quiet",
  checkout_abandoned: "Started an order but didn't confirm",
  delivery_concern: "Worried about delivery",
};

function RuleDialog({ rule, onClose }: { rule: FollowUpRule | "new"; onClose: () => void }) {
  const db = useDb();
  const { saveRecord } = useActions();
  const [r, setR] = useState<Omit<FollowUpRule, "id"> & { id?: string }>(rule === "new" ? { name: "", trigger: "no_reply_after_details", delayHours: 6, maxAttempts: 2, message: "Hi {{name}}, ", quietStart: db.settings.quietStart, quietEnd: db.settings.quietEnd, enabled: true } : rule);
  const [error, setError] = useState("");
  const save = () => {
    if (!r.name.trim()) return setError("Give the rule a name.");
    if (r.delayHours < 1 || r.maxAttempts < 1 || r.maxAttempts > 5) return setError("Wait at least 1 hour, and send 1 to 5 follow-ups.");
    saveRecord("followUpRules", { ...r, name: r.name.trim() });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{rule === "new" ? "New follow-up rule" : "Edit follow-up rule"}</DialogTitle><DialogDescription>Stops by itself when the customer replies, opts out, buys or a teammate takes over.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="fn">Name</Label><Input id="fn" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>When</Label>
            <Select value={r.trigger} onValueChange={(v) => setR({ ...r, trigger: v as FollowUpRule["trigger"] })}>
              <SelectTrigger aria-label="Trigger"><SelectValue>{TRIGGERS[r.trigger]}</SelectValue></SelectTrigger>
              <SelectContent>{(Object.keys(TRIGGERS) as FollowUpRule["trigger"][]).map((t) => <SelectItem key={t} value={t}>{TRIGGERS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="fd">Wait (hours)</Label><Input id="fd" inputMode="numeric" value={r.delayHours} onChange={(e) => setR({ ...r, delayHours: Number(e.target.value) || 0 })} /></div>
            <div className="space-y-1.5"><Label htmlFor="fa">Most follow-ups</Label><Input id="fa" inputMode="numeric" value={r.maxAttempts} onChange={(e) => setR({ ...r, maxAttempts: Number(e.target.value) || 0 })} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="fm">Message inside 24 hours ({"{{name}}"}, {"{{product}}"})</Label><Textarea id="fm" rows={3} value={r.message} onChange={(e) => setR({ ...r, message: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Template after 24 hours</Label>
            <Select value={r.templateId ?? "none"} onValueChange={(v) => { const { templateId: _t, ...rest } = r; setR(v === "none" ? rest : { ...rest, templateId: v }); }}>
              <SelectTrigger aria-label="Template"><SelectValue>{db.templates.find((t) => t.id === r.templateId)?.name ?? "None — stop after 24 hours"}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="none">None — stop after 24 hours</SelectItem>{db.templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.status})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={r.enabled} onCheckedChange={(v) => setR({ ...r, enabled: v })} /> Rule is on</label>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowUps() {
  const db = useDb();
  const { sendReply, logRun, saveRecord } = useActions();
  const [view, setView] = useState<"due" | "later" | "rules">("due");
  const [editing, setEditing] = useState<FollowUpRule | "new" | null>(null);
  const queue = followUpQueue(db);
  const due = queue.filter((q) => q.due);
  const later = queue.filter((q) => !q.due && q.attempts < q.rule.maxAttempts);
  const quiet = inQuietHours(new Date(), db.settings.quietStart, db.settings.quietEnd, db.settings.timezone);
  const shown = view === "due" ? due : later;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Automation</p>
          <h1 className="text-2xl font-bold">Follow-ups</h1>
          <p className="mt-1 text-sm text-muted-foreground">People who stopped replying, and the right next message — within WhatsApp's rules, consent and your limits.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" /> New rule</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Due now" value={String(due.length)} tone={due.length ? "warning" : "success"} />
        <KpiCard label="Can send now" value={String(due.filter((d) => d.send.ok).length)} tone="info" />
        <KpiCard label="Blocked by a rule" value={String(due.filter((d) => !d.send.ok).length)} />
        <KpiCard label="Quiet hours" value={quiet ? "On now" : "Off"} hint={`${db.settings.quietStart}–${db.settings.quietEnd}`} tone={quiet ? "warning" : "success"} />
      </div>
      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList>
          <TabsTrigger value="due">Due now ({due.length})</TabsTrigger>
          <TabsTrigger value="later">Scheduled ({later.length})</TabsTrigger>
          <TabsTrigger value="rules">Rules ({db.followUpRules.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {view !== "rules" ? (
        <Section>
          {shown.length === 0 ? <EmptyState title={view === "due" ? "Nobody to follow up right now" : "Nothing scheduled"} /> : (
            <ul className="divide-y">
              {shown.slice(0, 40).map((q) => (
                <li key={q.conversation.id} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to="/crm/contacts/$contactId" params={{ contactId: q.contact.id }} className="font-medium hover:underline">{fullName(q.contact)}</Link>
                    <span className="text-xs text-muted-foreground">quiet for {q.hoursWaiting >= 48 ? `${Math.round(q.hoursWaiting / 24)} days` : `${Math.round(q.hoursWaiting)} hours`} · {q.rule.name} · attempt {q.attempts + 1} of {q.rule.maxAttempts}</span>
                    <StatusBadge tone={q.windowOpen ? "success" : "warning"}>{q.windowOpen ? "Inside 24 hours" : "Over 24 hours"}</StatusBadge>
                    {view === "later" && <StatusBadge tone="info">Due in {Math.ceil(q.dueInHours)}h</StatusBadge>}
                  </div>
                  <p className="rounded-md bg-muted p-2 text-muted-foreground">{q.text}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {q.send.ok ? (
                      <Button size="sm" disabled={view === "later"} onClick={() => {
                        sendReply(q.conversation.id, q.text);
                        logRun({ workflowId: FOLLOWUP_WORKFLOW_ID, contactId: q.contact.id, status: "succeeded", detail: `${q.rule.name}: sent ${q.send.ok && q.send.via === "template" ? `template ${q.send.template?.name}` : "free text"}` });
                      }}>Send {q.send.via === "template" ? "template" : "message"}</Button>
                    ) : <span className="text-xs font-medium text-destructive">{q.send.reason}</span>}
                    <Button size="sm" variant="outline" onClick={() => logRun({ workflowId: FOLLOWUP_WORKFLOW_ID, contactId: q.contact.id, status: "skipped", detail: `${q.rule.name}: skipped by a teammate` })}>Skip</Button>
                    <Link to="/inbox" search={{ c: q.conversation.id }} className="text-xs text-primary hover:underline">Open chat</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">In Practice Mode you press Send. With the backend, due follow-ups go out on their own, under the same rules.</p>
        </Section>
      ) : (
        <Section>
          <ul className="divide-y">
            {db.followUpRules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Switch checked={r.enabled} onCheckedChange={(v) => saveRecord("followUpRules", { ...r, enabled: v })} aria-label={`${r.name} on or off`} />
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{TRIGGERS[r.trigger]} · after {r.delayHours}h · up to {r.maxAttempts} · template {db.templates.find((t) => t.id === r.templateId)?.name ?? "none"}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="size-3.5" /> Edit</Button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {editing && <RuleDialog rule={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
