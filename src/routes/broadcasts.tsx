import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import type { Broadcast } from "@/domain/types";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/broadcasts")({
  head: () => ({ meta: [{ title: "Broadcasts · Bizriva CRM" }] }),
  component: Broadcasts,
});

const STATUS_TONE = { draft: "neutral", scheduled: "info", sent: "success" } as const;

function NewBroadcast({ onClose }: { onClose: () => void }) {
  const db = useDb();
  const { saveRecord } = useActions();
  const usable = db.templates.filter((t) => t.status === "approved");
  const [name, setName] = useState("");
  const [segmentId, setSegment] = useState(db.segments[0]?.id ?? "");
  const [templateId, setTemplate] = useState(usable[0]?.id ?? "");
  const [when, setWhen] = useState("");
  const [error, setError] = useState("");
  const seg = db.segments.find((s) => s.id === segmentId);
  const save = (status: Broadcast["status"]) => {
    if (!name.trim()) return setError("Name the broadcast.");
    if (!templateId) return setError("Pick an approved template — broadcasts can only use approved templates.");
    if (status === "scheduled" && (!when || new Date(when) <= new Date())) return setError("Pick a time in the future.");
    saveRecord("broadcasts", { name: name.trim(), segmentId, templateId, status, ...(status === "scheduled" ? { scheduledFor: new Date(when).toISOString() } : {}), recipients: 0, skippedNoConsent: 0 });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New broadcast</DialogTitle><DialogDescription>Goes only to people in the segment who've agreed to marketing messages.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="bn">Name</Label><Input id="bn" value={name} onChange={(e) => setName(e.target.value)} placeholder="November restock" /></div>
          <div className="space-y-1.5"><Label>Send to</Label>
            <Select value={segmentId} onValueChange={setSegment}>
              <SelectTrigger aria-label="Segment"><SelectValue>{seg ? `${seg.name} (${seg.memberCount})` : "Pick a segment"}</SelectValue></SelectTrigger>
              <SelectContent>{db.segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.memberCount})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplate}>
              <SelectTrigger aria-label="Template"><SelectValue>{db.templates.find((t) => t.id === templateId)?.name ?? "No approved templates"}</SelectValue></SelectTrigger>
              <SelectContent>{usable.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
            {usable.length === 0 && <p className="text-xs text-muted-foreground">Approve a template in <Link to="/templates" className="underline">Templates</Link> first.</p>}
          </div>
          <div className="space-y-1.5"><Label htmlFor="bw">Schedule for (optional)</Label><Input id="bw" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => save("draft")}>Save draft</Button>
          <Button onClick={() => save(when ? "scheduled" : "draft")}>{when ? "Schedule" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Broadcasts() {
  const db = useDb();
  const { sendBroadcast, removeRecord } = useActions();
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Automation</p>
          <h1 className="text-2xl font-bold">Broadcasts</h1>
          <p className="mt-1 text-sm text-muted-foreground">One approved template to a whole segment. People without marketing consent are skipped automatically.</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /> New broadcast</Button>
      </div>
      <Section>
        {db.broadcasts.length === 0 ? <EmptyState title="No broadcasts yet" /> : (
          <ul className="divide-y">
            {db.broadcasts.map((b) => {
              const seg = db.segments.find((s) => s.id === b.segmentId);
              const tpl = db.templates.find((t) => t.id === b.templateId);
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">{seg?.name ?? "Deleted segment"} · template {tpl?.name ?? "deleted"}{b.scheduledFor && b.status === "scheduled" ? ` · ${formatDateTime(b.scheduledFor)}` : ""}{b.sentAt ? ` · sent ${formatDateTime(b.sentAt)}` : ""}</p>
                    {b.status === "sent" && <p className="text-xs text-muted-foreground">Delivered to <span className="num font-semibold text-foreground">{b.recipients}</span> · skipped {b.skippedNoConsent} without consent</p>}
                  </div>
                  <StatusBadge tone={STATUS_TONE[b.status]}>{b.status}</StatusBadge>
                  {b.status !== "sent" && (
                    <>
                      <Button size="sm" disabled={tpl?.status !== "approved"} title={tpl?.status !== "approved" ? "Template isn't approved" : undefined} onClick={() => sendBroadcast(b.id)}>Send now</Button>
                      <Button size="sm" variant="ghost" onClick={() => removeRecord("broadcasts", b.id)}>Delete</Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">Practice Mode counts who would receive it; nothing is actually sent.</p>
      </Section>
      {creating && <NewBroadcast onClose={() => setCreating(false)} />}
    </div>
  );
}
