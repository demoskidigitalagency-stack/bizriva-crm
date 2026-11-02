import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import type { MessageTemplate } from "@/domain/types";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/templates")({
  head: () => ({ meta: [{ title: "Templates · Bizriva CRM" }] }),
  component: Templates,
});

const STATUS_TONE = { draft: "neutral", submitted: "info", approved: "success", rejected: "danger" } as const;
const vars = (body: string) => [...new Set(body.match(/\{\{\d+\}\}/g) ?? [])];

function TemplateDialog({ t, onClose }: { t: MessageTemplate | "new"; onClose: () => void }) {
  const { saveRecord } = useActions();
  const [d, setD] = useState(t === "new" ? { name: "", category: "utility" as MessageTemplate["category"], language: "en", body: "", status: "draft" as MessageTemplate["status"] } : t);
  const [error, setError] = useState("");
  const save = () => {
    if (!/^[a-z0-9_]{3,60}$/.test(d.name)) return setError("Name: 3–60 lowercase letters, numbers or underscores — WhatsApp requires this.");
    if (d.body.trim().length < 10) return setError("Write the message body.");
    if (d.category === "marketing" && !/stop/i.test(d.body)) return setError("Marketing templates must tell people how to opt out, for example 'Reply STOP to opt out'.");
    saveRecord("templates", { ...d, body: d.body.trim(), updatedAt: new Date().toISOString() });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t === "new" ? "New template" : "Edit template"}</DialogTitle><DialogDescription>Needed to message someone more than 24 hours after their last message. Use {"{{1}}"}, {"{{2}}"} for the parts that change.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="tn">Name</Label><Input id="tn" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value.toLowerCase() })} placeholder="order_confirmation" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Type</Label>
              <Select value={d.category} onValueChange={(v) => setD({ ...d, category: v as MessageTemplate["category"] })}>
                <SelectTrigger aria-label="Type"><SelectValue>{d.category}</SelectValue></SelectTrigger>
                <SelectContent><SelectItem value="utility">Utility — order updates</SelectItem><SelectItem value="marketing">Marketing — needs consent</SelectItem><SelectItem value="authentication">Authentication — codes</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Approval</Label>
              <Select value={d.status} onValueChange={(v) => setD({ ...d, status: v as MessageTemplate["status"] })}>
                <SelectTrigger aria-label="Approval"><SelectValue>{d.status}</SelectValue></SelectTrigger>
                <SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="submitted">Submitted to Meta</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="tb">Message</Label><Textarea id="tb" rows={5} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">In Practice Mode you set the approval yourself. With the backend, Meta decides and this updates on its own.</p>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Templates() {
  const db = useDb();
  const { removeRecord } = useActions();
  const [editing, setEditing] = useState<MessageTemplate | "new" | null>(null);
  const inUse = (id: string) => db.followUpRules.some((r) => r.templateId === id) || db.broadcasts.some((b) => b.templateId === id && b.status !== "sent");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Automation</p>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">WhatsApp only lets you start a conversation, or reply after 24 hours, with an approved template. Free text is blocked outside that window.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" /> New template</Button>
      </div>
      <Section>
        {db.templates.length === 0 ? <EmptyState title="No templates" /> : (
          <ul className="divide-y">
            {db.templates.map((t) => (
              <li key={t.id} className="flex gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs font-semibold">{t.name}</p>
                    <StatusBadge tone={STATUS_TONE[t.status]}>{t.status}</StatusBadge>
                    <StatusBadge tone={t.category === "marketing" ? "purple" : "brand"}>{t.category}</StatusBadge>
                    {inUse(t.id) && <StatusBadge>In use</StatusBadge>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{t.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{vars(t.body).length} variable{vars(t.body).length === 1 ? "" : "s"} · updated {relativeTime(t.updatedAt)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" disabled={inUse(t.id)} title={inUse(t.id) ? "Used by a follow-up or broadcast" : undefined} onClick={() => removeRecord("templates", t.id)} aria-label={`Delete ${t.name}`}><Trash2 className="size-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {editing && <TemplateDialog t={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
