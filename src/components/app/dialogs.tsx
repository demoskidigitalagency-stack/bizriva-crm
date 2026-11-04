/**
 * Reusable record dialogs. Every modal here is wired to real store actions —
 * no display-only forms.
 */

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useActions, useDb, type CreateContactInput, type CreateOrderInput } from "@/domain/store";
import {
  LIFECYCLE_META, LEAD_STAGES, SOURCE_LABELS,
  type AcquisitionSource, type Channel, type Lifecycle, type PaymentMethod, type TaskPriority, type Task,
} from "@/domain/types";
import { formatCurrency } from "@/lib/format";
import { fullName } from "@/domain/repositories";
import { PersonAvatar } from "./primitives";

const FIELD = "space-y-1.5";

function useTeam() {
  const db = useDb();
  return db.team.filter((t) => t.active);
}

/* --------------------------------------------------------- create contact */

export function ContactDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { addContact } = useActions();
  const team = useTeam();
  const blank: CreateContactInput = { firstName: "", lastName: "", phone: "", countryCode: "NG", city: "Lagos", lifecycle: "lead", source: "instagram_organic", ownerId: team[0]?.id ?? "" };
  const [form, setForm] = useState<CreateContactInput & { email: string }>({ ...blank, email: "" });

  useEffect(() => {
    if (open) setForm({ ...blank, email: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()) return;
    const { email, ...rest } = form;
    addContact({ ...rest, ...(email.trim() ? { email: email.trim() } : {}) });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New contact</DialogTitle>
          <DialogDescription>Capture a customer once — they keep one identity across every channel.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={FIELD}>
            <Label>First name</Label>
            <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Amaka" />
          </div>
          <div className={FIELD}>
            <Label>Last name</Label>
            <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Okafor" />
          </div>
          <div className={FIELD}>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+234 803 000 0000" />
          </div>
          <div className={FIELD}>
            <Label>Email (optional)</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="amaka@example.com" />
          </div>
          <div className={FIELD}>
            <Label>Country</Label>
            <Select value={form.countryCode} onValueChange={(v) => setForm({ ...form, countryCode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["NG", "GH", "KE", "ZA", "GB", "US"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className={FIELD}>
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className={FIELD}>
            <Label>Lifecycle</Label>
            <Select value={form.lifecycle} onValueChange={(v) => setForm({ ...form, lifecycle: v as Lifecycle })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(LIFECYCLE_META).map(([id, m]) => <SelectItem key={id} value={id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className={FIELD}>
            <Label>Source</Label>
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v as AcquisitionSource })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SOURCE_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className={`${FIELD} sm:col-span-2`}>
            <Label>Assigned rep</Label>
            <Select value={form.ownerId} onValueChange={(v) => setForm({ ...form, ownerId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {team.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()}>Create contact</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------- task */

export function TaskDialog({ open, onOpenChange, contactId, defaultTitle = "" }: { open: boolean; onOpenChange: (o: boolean) => void; contactId?: string; defaultTitle?: string }) {
  const { addTask } = useActions();
  const team = useTeam();
  const [form, setForm] = useState({ title: defaultTitle, due: "", priority: "normal" as TaskPriority, type: "follow_up" as Task["type"], assigneeId: "" });

  useEffect(() => {
    if (open) setForm({ title: defaultTitle, due: "", priority: "normal", type: "follow_up", assigneeId: team[0]?.id ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTitle]);

  const submit = () => {
    if (!form.title.trim()) return;
    addTask({
      title: form.title.trim(),
      dueAt: form.due ? new Date(`${form.due}T09:00:00`).toISOString() : new Date().toISOString(),
      priority: form.priority,
      type: form.type,
      assigneeId: form.assigneeId || team[0]?.id || "",
      ...(contactId ? { contactId } : {}),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Follow-ups land in the owner's Today queue immediately.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className={FIELD}>
            <Label>What needs doing</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Call back about delivery window" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={FIELD}>
              <Label>Due date</Label>
              <Input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
            </div>
            <div className={FIELD}>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(["low", "normal", "high", "urgent"] as const).map((p) => <SelectItem key={p} value={p}>{p[0]!.toUpperCase() + p.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className={FIELD}>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as Task["type"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(["follow_up", "call", "delivery_check", "payment_chase", "general"] as const).map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className={FIELD}>
              <Label>Assign to</Label>
              <Select value={form.assigneeId} onValueChange={(v) => setForm({ ...form, assigneeId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{team.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.title.trim()}>Create task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------- note */

export function NoteDialog({ open, onOpenChange, contactId, title = "Add note", submitLabel = "Save note" }: { open: boolean; onOpenChange: (o: boolean) => void; contactId: string; title?: string; submitLabel?: string }) {
  const { addNote } = useActions();
  const [text, setText] = useState("");
  useEffect(() => { if (open) setText(""); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="What did you discuss?" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!text.trim()} onClick={() => { addNote(contactId, text.trim()); onOpenChange(false); }}>{submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------- call */

export function CallDialog({ open, onOpenChange, contactId }: { open: boolean; onOpenChange: (o: boolean) => void; contactId: string }) {
  const { logCall } = useActions();
  const [summary, setSummary] = useState("");
  useEffect(() => { if (open) setSummary(""); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log a call</DialogTitle>
          <DialogDescription>The summary is stored on the customer timeline.</DialogDescription>
        </DialogHeader>
        <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Outcome of the call, next step…" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!summary.trim()} onClick={() => { logCall(contactId, summary.trim()); onOpenChange(false); }}>Save call</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------- assign */

export function AssignDialog({ open, onOpenChange, contactId, currentOwnerId }: { open: boolean; onOpenChange: (o: boolean) => void; contactId: string; currentOwnerId?: string }) {
  const { assignOwner } = useActions();
  const team = useTeam();
  const [ownerId, setOwnerId] = useState(currentOwnerId ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign owner</DialogTitle>
          <DialogDescription>Leads and tasks follow the assigned rep.</DialogDescription>
        </DialogHeader>
        <Select value={ownerId} onValueChange={setOwnerId}>
          <SelectTrigger><SelectValue placeholder="Choose a teammate" /></SelectTrigger>
          <SelectContent>{team.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!ownerId || ownerId === currentOwnerId} onClick={() => { assignOwner(contactId, ownerId); onOpenChange(false); }}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------- order */

export function OrderDialog({ open, onOpenChange, contactId }: { open: boolean; onOpenChange: (o: boolean) => void; contactId: string }) {
  const { createOrder } = useActions();
  const db = useDb();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [method, setMethod] = useState<PaymentMethod>("cash_on_delivery");
  useEffect(() => { if (open) { setQty({}); setChannel("whatsapp"); setMethod("cash_on_delivery"); } }, [open]);

  const selected = db.products.map((p) => ({ product: p, n: qty[p.id] ?? 0 })).filter((x) => x.n > 0);
  const subtotal = selected.reduce((s, x) => s + x.product.price * x.n, 0);
  const hasItems = selected.length > 0;

  const submit = () => {
    const input: CreateOrderInput = { contactId, items: selected.map((x) => ({ productId: x.product.id, qty: x.n })), channel, method };
    createOrder(input);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create order</DialogTitle>
          <DialogDescription>The order starts as pending confirmation in the fulfilment queue.</DialogDescription>
        </DialogHeader>
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
          {db.products.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-accent/40">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(p.price)} · stock {p.stock}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm" className="h-7 w-7 p-0"
                  onClick={() => setQty({ ...qty, [p.id]: Math.max(0, (qty[p.id] ?? 0) - 1) })}
                  aria-label={`Remove one ${p.name}`}
                >−</Button>
                <span className="num w-6 text-center text-sm font-semibold">{qty[p.id] ?? 0}</span>
                <Button
                  variant="outline" size="sm" className="h-7 w-7 p-0"
                  onClick={() => setQty({ ...qty, [p.id]: Math.min(p.stock, (qty[p.id] ?? 0) + 1) })}
                  aria-label={`Add one ${p.name}`}
                >+</Button>
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={FIELD}>
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(["whatsapp", "instagram", "tiktok", "phone", "email", "webchat"] as const).map((c) => <SelectItem key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className={FIELD}>
            <Label>Payment</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(["cash_on_delivery", "bank_transfer", "card", "wallet", "ussd"] as const).map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Subtotal + ₦3,500 shipping</span>
          <span className="num text-base font-bold">{formatCurrency(subtotal + (hasItems ? 3500 : 0))}</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!hasItems} onClick={submit}>Place order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------ lead outcome */

export function LeadStageSelect({ value, onChange, className }: { value: string; onChange: (stage: string) => void; className?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ? `h-8 ${className}` : "h-8"} aria-label="Lead stage"><SelectValue>{LEAD_STAGES.find((s) => s.id === value)?.label ?? value}</SelectValue></SelectTrigger>
      <SelectContent>
        {LEAD_STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/* ---------------------------------------------------------- pick customer */

export function PickCustomer({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (id: string) => void }) {
  const db = useDb();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const matches = db.contacts.filter((c) => !needle || `${fullName(c)} ${c.phone}`.toLowerCase().includes(needle)).slice(0, 8);
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQ(""); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Who is the order for?</DialogTitle>
          <DialogDescription>Search by name or phone.</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" aria-label="Find customer" />
        <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
          {matches.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted/50">
                <PersonAvatar name={fullName(c)} />
                <span className="min-w-0 flex-1 truncate">{fullName(c)}</span>
                <span className="text-xs text-muted-foreground">{c.phone}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">No match. Add them in Contacts first.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

