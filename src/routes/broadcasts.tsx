import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useLive, useWorkspace } from "@/domain/store";
import { EmailConnect } from "@/components/app/EmailConnect";
import type { Broadcast, BusinessSettings } from "@/domain/types";
import { formatCurrency, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/broadcasts")({
  head: () => ({ meta: [{ title: "Broadcasts · Bizriva CRM" }] }),
  component: Broadcasts,
});

const STATUS_TONE = { draft: "neutral", scheduled: "info", sent: "success" } as const;
const PROVIDERS: { id: BusinessSettings["email"]["provider"]; name: string; hint: string }[] = [
  { id: "brevo", name: "Brevo", hint: "Free for 300 emails a day" },
  { id: "resend", name: "Resend", hint: "Free for 3,000 emails a month" },
  { id: "mailgun", name: "Mailgun", hint: "Pay as you go" },
];
const pct = (n = 0, of = 0) => (of ? `${Math.round((n / of) * 100)}%` : "—");

function NewBroadcast({ channel, onClose }: { channel: "whatsapp" | "email"; onClose: () => void }) {
  const db = useDb();
  const { saveRecord } = useActions();
  const usable = db.templates.filter((t) => t.status === "approved");
  const [name, setName] = useState("");
  const [segmentId, setSegment] = useState(db.segments[0]?.id ?? "");
  const [templateId, setTemplate] = useState(usable[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Hi {{name}},\n\n\n\nShop now: {{link}}\n\n" + db.settings.businessName);
  const [when, setWhen] = useState("");
  const [error, setError] = useState("");
  const seg = db.segments.find((s) => s.id === segmentId);
  const email = channel === "email";
  const save = (status: Broadcast["status"]) => {
    if (!name.trim()) return setError("Name the campaign.");
    if (!email && !templateId) return setError("Pick an approved template — WhatsApp broadcasts can only use approved templates.");
    if (email && (!subject.trim() || body.trim().length < 20)) return setError("Write a subject and a message.");
    if (status === "scheduled" && (!when || new Date(when) <= new Date())) return setError("Pick a time in the future.");
    saveRecord("broadcasts", {
      name: name.trim(), segmentId, templateId: email ? "" : templateId, status, channel,
      ...(email ? { subject: subject.trim(), body } : {}),
      ...(status === "scheduled" ? { scheduledFor: new Date(when).toISOString() } : {}), recipients: 0, skippedNoConsent: 0,
    });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{email ? "New email campaign" : "New WhatsApp broadcast"}</DialogTitle>
          <DialogDescription>Goes only to people in the group who've agreed to marketing messages{email ? " and have an email address. Every email has an unsubscribe link." : "."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="bn">Name</Label><Input id="bn" value={name} onChange={(e) => setName(e.target.value)} placeholder="November restock" /></div>
          <div className="space-y-1.5"><Label>Send to</Label>
            <Select value={segmentId} onValueChange={setSegment}>
              <SelectTrigger aria-label="Segment"><SelectValue>{seg ? `${seg.name} (${seg.memberCount})` : "Pick a segment"}</SelectValue></SelectTrigger>
              <SelectContent>{db.segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.memberCount})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {email ? (
            <>
              <div className="space-y-1.5"><Label htmlFor="bs">Subject</Label><Input id="bs" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your favourite wig is back in stock" /></div>
              <div className="space-y-1.5"><Label htmlFor="bb">Message</Label><Textarea id="bb" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
                <p className="text-xs text-muted-foreground">{"{{name}}"} becomes their first name; {"{{link}}"} becomes a tracked link to your store, so orders are counted for this campaign.</p></div>
            </>
          ) : (
            <div className="space-y-1.5"><Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplate}>
                <SelectTrigger aria-label="Template"><SelectValue>{db.templates.find((t) => t.id === templateId)?.name ?? "No approved templates"}</SelectValue></SelectTrigger>
                <SelectContent>{usable.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
              {usable.length === 0 && <p className="text-xs text-muted-foreground">Approve a template in <Link to="/templates" className="underline">Templates</Link> first.</p>}
            </div>
          )}
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

function EmailService() {
  const db = useDb();
  const { updateSettings } = useActions();
  const e = db.settings.email;
  const [from, setFrom] = useState(e.fromEmail);
  return (
    <Section title="Email service" description="Campaigns send through your own email service, so replies come to you and your sending reputation is yours.">
      <div className="space-y-3 p-4 text-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PROVIDERS.map((p) => (
            <button key={p.id} type="button" aria-pressed={e.provider === p.id} onClick={() => updateSettings({ email: { ...e, provider: p.id } })}
              className={`rounded-lg border p-3 text-left ${e.provider === p.id ? "border-primary bg-primary/5" : ""}`}>
              <span className="block font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{p.hint}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor="ef">Send from</Label><Input id="ef" type="email" value={from} onChange={(x) => setFrom(x.target.value)} /></div>
          <Button size="sm" variant="outline" onClick={() => updateSettings({ email: { ...e, fromEmail: from.trim() } })}>Save</Button>
        </div>
        <p className="text-xs text-muted-foreground">{e.provider === "none" ? "Pick a service to send email campaigns." : `${PROVIDERS.find((p) => p.id === e.provider)?.name} selected. Practice Mode simulates sending and tracking; live, the owner adds the service's key once (stored encrypted) and opens and clicks are tracked from the service's notifications.`}</p>
      </div>
    </Section>
  );
}

function Broadcasts() {
  const db = useDb();
  const live = useLive();
  const ws = useWorkspace();
  const { sendBroadcast, removeRecord } = useActions();
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [creating, setCreating] = useState(false);
  const list = db.broadcasts.filter((b) => (b.channel ?? "whatsapp") === channel);
  const sent = list.filter((b) => b.status === "sent");
  const tot = sent.reduce((a, b) => ({ delivered: a.delivered + (b.stats?.delivered ?? b.recipients), opened: a.opened + (b.stats?.opened ?? 0), clicked: a.clicked + (b.stats?.clicked ?? 0), orders: a.orders + (b.stats?.orders ?? 0), revenue: a.revenue + (b.stats?.revenue ?? 0) }), { delivered: 0, opened: 0, clicked: 0, orders: 0, revenue: 0 });
  const noService = channel === "email" && db.settings.email.provider === "none";
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Automation</p>
          <h1 className="text-2xl font-bold">Broadcasts and campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">WhatsApp and email campaigns to any customer group, with the orders and money each one brought in. People without marketing consent are skipped automatically.</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /> {channel === "email" ? "New email campaign" : "New broadcast"}</Button>
      </div>
      <Tabs value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
        <TabsList>
          <TabsTrigger value="whatsapp"><MessageCircle className="mr-1 size-3.5" /> WhatsApp</TabsTrigger>
          <TabsTrigger value="email"><Mail className="mr-1 size-3.5" /> Email</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Delivered" value={tot.delivered.toLocaleString()} />
        {channel === "email" ? <KpiCard label="Opened" value={pct(tot.opened, tot.delivered)} hint={`${tot.opened} people`} tone="info" /> : <KpiCard label="Campaigns sent" value={String(sent.length)} />}
        {channel === "email" ? <KpiCard label="Clicked" value={pct(tot.clicked, tot.delivered)} hint={`${tot.clicked} people`} tone="info" /> : <KpiCard label="Orders" value={String(tot.orders)} tone="success" />}
        <KpiCard label="Revenue from campaigns" value={formatCurrency(tot.revenue, ws.currency, { compact: true })} {...(channel === "email" ? { hint: `${tot.orders} orders` } : {})} tone="success" />
      </div>
      {channel === "email" && (live.on ? <EmailConnect /> : <EmailService />)}
      <Section>
        {list.length === 0 ? <EmptyState title={channel === "email" ? "No email campaigns yet" : "No broadcasts yet"} /> : (
          <ul className="divide-y">
            {list.map((b) => {
              const seg = db.segments.find((s) => s.id === b.segmentId);
              const tpl = db.templates.find((t) => t.id === b.templateId);
              const isEmail = b.channel === "email";
              const canSend = isEmail ? !noService : tpl?.status === "approved";
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">{seg?.name ?? "Deleted segment"} · {isEmail ? `“${b.subject}”` : `template ${tpl?.name ?? "deleted"}`}{b.scheduledFor && b.status === "scheduled" ? ` · ${formatDateTime(b.scheduledFor)}` : ""}{b.sentAt ? ` · sent ${formatDateTime(b.sentAt)}` : ""}</p>
                    {b.status === "sent" && (
                      <p className="text-xs text-muted-foreground" aria-label={`Results for ${b.name}`}>
                        Delivered <span className="num font-semibold text-foreground">{b.stats?.delivered ?? b.recipients}</span>
                        {isEmail && <> · opened <span className="num font-semibold text-foreground">{pct(b.stats?.opened, b.stats?.delivered)}</span> · clicked <span className="num font-semibold text-foreground">{pct(b.stats?.clicked, b.stats?.delivered)}</span></>}
                        {b.stats && <> · <span className="num font-semibold text-foreground">{b.stats.orders}</span> orders · <span className="num font-semibold text-foreground">{formatCurrency(b.stats.revenue, ws.currency, { compact: true })}</span></>}
                        {` · skipped ${b.skippedNoConsent} without ${isEmail ? "consent or email" : "consent"}`}
                      </p>
                    )}
                  </div>
                  <StatusBadge tone={STATUS_TONE[b.status]}>{b.status}</StatusBadge>
                  {b.status !== "sent" && (
                    <>
                      <Button size="sm" disabled={!canSend} title={!canSend ? (isEmail ? "Pick an email service first" : "Template isn't approved") : undefined} onClick={() => sendBroadcast(b.id)}>Send now</Button>
                      <Button size="sm" variant="ghost" onClick={() => removeRecord("broadcasts", b.id)}>Delete</Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">Practice Mode counts who would receive it and estimates results; nothing is actually sent.</p>
      </Section>
      {creating && <NewBroadcast channel={channel} onClose={() => setCreating(false)} />}
    </div>
  );
}
