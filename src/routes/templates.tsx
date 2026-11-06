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
import { useActions, useDb, useLive } from "@/domain/store";
import type { MessageTemplate, TemplatePurpose } from "@/domain/types";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/templates")({
  head: () => ({ meta: [{ title: "Templates · Bizriva CRM" }] }),
  component: Templates,
});

const STATUS_TONE = { draft: "neutral", submitted: "info", approved: "success", rejected: "danger" } as const;
const PURPOSE_LABEL: Record<TemplatePurpose, string> = {
  enquiry: "Enquiries", order: "Orders", payment: "Payments", delivery: "Delivery", complaint: "Complaints", objection: "Objections",
  follow_up: "Follow-up", reactivation: "Win back", referral: "Referrals and reviews", policy: "Policies", birthday: "Birthdays",
};
const LANG_LABEL: Record<string, string> = { en: "English", pcm: "Pidgin" };
const vars = (body: string) => [...new Set(body.match(/\{\{\d+\}\}/g) ?? [])];

function TemplateDialog({ t, onClose }: { t: MessageTemplate | "new"; onClose: () => void }) {
  const { saveRecord } = useActions();
  const live = useLive().on;
  const [d, setD] = useState<Omit<MessageTemplate, "id" | "updatedAt"> & { id?: string }>(t === "new" ? { name: "", category: "utility", language: "en", purpose: "enquiry", body: "", status: "draft" } : t);
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
            {live ? (
              <div className="space-y-1.5"><Label>Approval</Label><p className="flex h-9 items-center text-sm"><StatusBadge tone={STATUS_TONE[d.status]}>{d.status}</StatusBadge></p></div>
            ) : <div className="space-y-1.5"><Label>Approval</Label>
              <Select value={d.status} onValueChange={(v) => setD({ ...d, status: v as MessageTemplate["status"] })}>
                <SelectTrigger aria-label="Approval"><SelectValue>{d.status}</SelectValue></SelectTrigger>
                <SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="submitted">Submitted to Meta</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent>
              </Select>
            </div>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Used for</Label>
              <Select value={d.purpose ?? "enquiry"} onValueChange={(v) => setD({ ...d, purpose: v as TemplatePurpose })}>
                <SelectTrigger aria-label="Used for"><SelectValue>{PURPOSE_LABEL[d.purpose ?? "enquiry"]}</SelectValue></SelectTrigger>
                <SelectContent>{(Object.keys(PURPOSE_LABEL) as TemplatePurpose[]).map((k) => <SelectItem key={k} value={k}>{PURPOSE_LABEL[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Language</Label>
              <Select value={d.language} onValueChange={(v) => setD({ ...d, language: v })}>
                <SelectTrigger aria-label="Language"><SelectValue>{LANG_LABEL[d.language] ?? d.language}</SelectValue></SelectTrigger>
                <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="pcm">Pidgin</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="tb">Message</Label><Textarea id="tb" rows={5} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">{live
            ? <>Press <strong>Submit to Meta</strong> on the list when it's ready. Meta decides and the status updates on its own. When sending, {"{{1}}"} is the customer's first name, {"{{2}}"} their latest order number, {"{{3}}"} the product. Changing an approved template sends it back to draft.</>
            : "In Practice Mode you set the approval yourself. With the backend, Meta decides and this updates on its own."}</p>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Templates() {
  const db = useDb();
  const { removeRecord, saveRecord } = useActions();
  const live = useLive().on;
  const [editing, setEditing] = useState<MessageTemplate | "new" | null>(null);
  const [purpose, setPurpose] = useState<TemplatePurpose | "all">("all");
  const [lang, setLang] = useState<"all" | "en" | "pcm">("all");
  const list = db.templates.filter((t) => (purpose === "all" || t.purpose === purpose) && (lang === "all" || t.language === lang));
  const count = (p: TemplatePurpose) => db.templates.filter((t) => t.purpose === p).length;
  const inUse = (id: string) => db.followUpRules.some((r) => r.templateId === id) || db.broadcasts.some((b) => b.templateId === id && b.status !== "sent");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Automation</p>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your reply library, in English and Pidgin. Use any reply inside the 24-hour window from the Inbox. Outside it, WhatsApp only allows approved templates.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" /> New template</Button>
      </div>
      <div className="space-y-2" role="group" aria-label="Reply library filters">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setPurpose("all")} className={cn("rounded-full border px-3 py-1 text-xs", purpose === "all" && "border-primary bg-primary/10 text-primary")}>All ({db.templates.length})</button>
          {(Object.keys(PURPOSE_LABEL) as TemplatePurpose[]).map((p) => (
            <button key={p} type="button" onClick={() => setPurpose(p)} className={cn("rounded-full border px-3 py-1 text-xs", purpose === p && "border-primary bg-primary/10 text-primary")}>{PURPOSE_LABEL[p]} ({count(p)})</button>
          ))}
        </div>
        <div className="flex gap-1.5 text-xs">
          {([["all", "Any language"], ["en", "English"], ["pcm", "Pidgin"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setLang(v)} className={cn("rounded border px-2 py-0.5", lang === v && "border-primary bg-primary/10 text-primary")}>{l}</button>
          ))}
        </div>
      </div>
      <Section>
        {list.length === 0 ? <EmptyState title="No templates" /> : (
          <ul className="divide-y">
            {list.map((t) => (
              <li key={t.id} className="flex gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs font-semibold">{t.name}</p>
                    <StatusBadge tone={STATUS_TONE[t.status]}>{t.status}</StatusBadge>
                    <StatusBadge tone={t.category === "marketing" ? "purple" : "brand"}>{t.category}</StatusBadge>
                    {t.purpose && <StatusBadge>{PURPOSE_LABEL[t.purpose]}</StatusBadge>}
                    {t.language === "pcm" && <StatusBadge tone="warning">Pidgin</StatusBadge>}
                    {inUse(t.id) && <StatusBadge>In use</StatusBadge>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{t.body}</p>
                  {t.status === "rejected" && t.rejectedReason && <p className="mt-1 text-xs text-destructive" role="note">{t.rejectedReason}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{vars(t.body).length} variable{vars(t.body).length === 1 ? "" : "s"} · updated {relativeTime(t.updatedAt)}</p>
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  {live && (t.status === "draft" || t.status === "rejected") && <Button size="sm" variant="outline" onClick={() => saveRecord("templates", { ...t, status: "submitted" })}>Submit to Meta</Button>}
                  {live && t.status === "submitted" && <span className="px-2 py-1.5 text-xs text-muted-foreground">Waiting for Meta</span>}
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
