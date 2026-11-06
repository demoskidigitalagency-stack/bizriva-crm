import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bike, Car, Pencil, Phone, Plus, Smartphone, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { fullName } from "@/domain/repositories";
import { partnerStatement, stateOf } from "@/domain/ops";
import type { Rider } from "@/domain/types";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/riders")({
  head: () => ({ meta: [{ title: "Riders · Bizriva CRM" }] }),
  component: Riders,
});

const VEHICLE = { bike: Bike, car: Car, van: Truck } as const;

function useRiderLedger(riderId: string) {
  const db = useDb();
  const dels = db.deliveries.filter((d) => d.riderId === riderId);
  const orderIds = new Set(dels.map((d) => d.orderId));
  const held = db.payments.filter((p) => orderIds.has(p.orderId) && p.method === "cash_on_delivery" && p.status === "paid" && !p.remitted);
  return {
    open: dels.filter((d) => ["scheduled", "picked_up", "in_transit", "not_scheduled"].includes(d.status)),
    delivered: dels.filter((d) => d.status === "delivered").length,
    failed: dels.filter((d) => d.status === "failed" || d.status === "returned").length,
    cashHeld: held.reduce((s, p) => s + p.amount, 0),
  };
}

function RiderDialog({ rider, onClose }: { rider: Rider | "new"; onClose: () => void }) {
  const { saveRecord } = useActions();
  const init: Omit<Rider, "id"> & { id?: string } = rider === "new" ? { name: "", phone: "", zone: "", vehicle: "bike", active: true, kind: "rider", states: [], fees: {}, failedFee: 0 } : rider;
  const [r, setR] = useState(init);
  const [fees, setFees] = useState(Object.entries(init.fees ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"));
  const [error, setError] = useState("");
  const save = () => {
    if (!r.name.trim() || r.phone.replace(/\D/g, "").length < 10) return setError("Enter a name and a full phone number.");
    const parsed: Record<string, number> = {};
    for (const line of fees.split(/\n|,(?=\s*[A-Za-z])/).map((x) => x.trim()).filter(Boolean)) {
      const m = /^(.+?)\s*[:=-]\s*₦?\s*([\d,]+)$/.exec(line);
      if (!m) return setError(`Write each fee as "State: amount" — couldn't read "${line}".`);
      parsed[stateOf(m[1]!)] = Number(m[2]!.replace(/,/g, ""));
    }
    if (r.whatsappGroup && !/^https:\/\/chat\.whatsapp\.com\//.test(r.whatsappGroup)) return setError("A WhatsApp group link starts with https://chat.whatsapp.com/");
    const states = Object.keys(parsed).length ? Object.keys(parsed) : (r.states ?? []);
    saveRecord("riders", { ...r, name: r.name.trim(), zone: r.zone.trim() || states.join(", ") || "Unassigned", fees: parsed, states });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{rider === "new" ? "Add rider" : "Edit rider"}</DialogTitle><DialogDescription>Riders see their drops on the phone view and hand in cash they collect.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="rn">Name</Label><Input id="rn" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="rp">Phone</Label><Input id="rp" value={r.phone} onChange={(e) => setR({ ...r, phone: e.target.value })} placeholder="+234 803 000 0000" /></div>
          <div className="space-y-1.5"><Label>Type</Label>
            <Select value={r.kind ?? "rider"} onValueChange={(v) => setR({ ...r, kind: v as "rider" | "partner" })}>
              <SelectTrigger aria-label="Type"><SelectValue>{r.kind === "partner" ? "Logistics partner (company)" : "Own rider"}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="rider">Own rider</SelectItem><SelectItem value="partner">Logistics partner (company)</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="rz">Zone</Label><Input id="rz" value={r.zone} onChange={(e) => setR({ ...r, zone: e.target.value })} placeholder="Lekki & VI" /></div>
          <div className="space-y-1.5"><Label htmlFor="rf">States covered and fee per delivery</Label>
            <Textarea id="rf" rows={3} value={fees} onChange={(e) => setFees(e.target.value)} placeholder={"Lagos: 2500\nOgun: 3500"} />
            <p className="text-xs text-muted-foreground">One state per line. Confirmed orders for these states go to the cheapest active rider or partner who covers them.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="rff">Failed-delivery charge</Label><Input id="rff" inputMode="numeric" value={String(r.failedFee ?? 0)} onChange={(e) => setR({ ...r, failedFee: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></div>
            <div className="space-y-1.5"><Label htmlFor="rg">WhatsApp group link (optional)</Label><Input id="rg" value={r.whatsappGroup ?? ""} onChange={(e) => { const v = e.target.value.trim(); const { whatsappGroup: _g, ...rest } = r; setR(v ? { ...rest, whatsappGroup: v } : rest); }} placeholder="https://chat.whatsapp.com/…" /></div>
          </div>
          <div className="space-y-1.5"><Label>Vehicle</Label>
            <Select value={r.vehicle} onValueChange={(v) => setR({ ...r, vehicle: v as Rider["vehicle"] })}>
              <SelectTrigger aria-label="Vehicle"><SelectValue>{r.vehicle}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="bike">Bike</SelectItem><SelectItem value="car">Car</SelectItem><SelectItem value="van">Van</SelectItem></SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={r.active} onCheckedChange={(v) => setR({ ...r, active: v })} /> Active</label>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RiderRow({ r, selected, onSelect, onEdit }: { r: Rider; selected: boolean; onSelect: () => void; onEdit: () => void }) {
  const ws = useWorkspace();
  const l = useRiderLedger(r.id);
  const Icon = VEHICLE[r.vehicle];
  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-4 py-3 text-sm", selected && "bg-accent/40")}>
      <span className="grid size-9 place-items-center rounded-full bg-muted"><Icon className="size-4" aria-hidden="true" /></span>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 basis-40 text-left">
        <span className="block font-medium hover:underline">{r.name}</span>
        <span className="block text-xs text-muted-foreground">{r.zone} · {r.phone}</span>
        {r.fees && Object.keys(r.fees).length > 0 && <span className="block text-xs text-muted-foreground">{Object.entries(r.fees).slice(0, 4).map(([k, v]) => `${k} ${formatCurrency(v, ws.currency)}`).join(" · ")}{Object.keys(r.fees).length > 4 ? ` · +${Object.keys(r.fees).length - 4} states` : ""}</span>}
      </button>
      {r.kind === "partner" && <StatusBadge tone="info">Partner</StatusBadge>}
      {!r.active && <StatusBadge>Inactive</StatusBadge>}
      <span className="text-xs text-muted-foreground"><span className="num font-semibold text-foreground">{l.open.length}</span> open · {l.delivered} delivered · {l.failed} failed</span>
      <StatusBadge tone={l.cashHeld ? "warning" : "success"}>{l.cashHeld ? `${formatCurrency(l.cashHeld, ws.currency)} to hand in` : "No cash held"}</StatusBadge>
      <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${r.name}`}><Pencil className="size-3.5" /></Button>
    </li>
  );
}

/** What the rider sees on their phone: today's drops, call, and one-tap collected. */
function PhoneView({ rider }: { rider: Rider }) {
  const db = useDb();
  const ws = useWorkspace();
  const { setDeliveryStatus } = useActions();
  const l = useRiderLedger(rider.id);
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2rem] border-8 border-foreground/80 bg-background p-3 shadow-sm">
      <p className="text-center text-xs text-muted-foreground">Rider view · {rider.name}</p>
      <p className="mt-1 text-center text-sm font-semibold">{l.open.length} drops · {formatCurrency(l.cashHeld, ws.currency)} in hand</p>
      <ul className="mt-3 max-h-[460px] space-y-2 overflow-y-auto">
        {l.open.length === 0 && <li className="py-8 text-center text-sm text-muted-foreground">No drops left. Hand in your cash.</li>}
        {l.open.map((d) => {
          const c = db.contacts.find((x) => x.id === d.contactId);
          const o = db.orders.find((x) => x.id === d.orderId);
          const cod = o?.paymentMethod === "cash_on_delivery";
          return (
            <li key={d.id} className="rounded-xl border p-3 text-sm">
              <p className="font-semibold">{c ? fullName(c) : "Customer"}</p>
              <p className="text-xs text-muted-foreground">{d.city} · {o?.reference}</p>
              <div className="mt-2 flex gap-2">
                {c && <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="grid size-10 place-items-center rounded-lg border" aria-label={`Call ${fullName(c)}`}><Phone className="size-4" /></a>}
                <Button className="h-10 flex-1" onClick={() => setDeliveryStatus(d.id, "delivered")}>
                  {cod && o ? `Collected ${formatCurrency(o.total, ws.currency)}` : "Delivered"}
                </Button>
              </div>
              <button type="button" className="mt-1.5 w-full text-xs text-muted-foreground underline" onClick={() => setDeliveryStatus(d.id, "failed", "Customer unreachable")}>Couldn't deliver</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Running account per rider/partner: cash collected, their fees, failed charges, what's been handed in. */
function Statements() {
  const db = useDb();
  const ws = useWorkspace();
  const money = (n: number) => formatCurrency(n, ws.currency);
  const rows = db.riders.map((r) => partnerStatement(db, r)).filter((s) => s.delivered || s.failed || s.rider.active);
  return (
    <Section title="Who owes you what" description="Cash collected on delivery, minus each partner's delivery fees and failed-delivery charges, minus what they've already handed in.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2">Rider or partner</th><th>Delivered</th><th>Cash collected</th><th>Their fees</th><th>Failed charges</th><th>Handed in</th><th className="pr-4 text-right">Owes you</th></tr></thead>
          <tbody className="divide-y">
            {rows.map((s) => (
              <tr key={s.rider.id} aria-label={`Statement ${s.rider.name}`}>
                <td className="px-4 py-2 font-medium">{s.rider.name}{s.rider.kind === "partner" ? <span className="ml-1 text-xs text-muted-foreground">partner</span> : null}</td>
                <td className="num">{s.delivered}{s.failed ? <span className="text-xs text-muted-foreground"> · {s.failed} failed</span> : null}</td>
                <td className="num">{money(s.cashCollected)}</td>
                <td className="num">−{money(s.fees)}</td>
                <td className="num">−{money(s.failedCharges)}</td>
                <td className="num">−{money(s.remitted)}</td>
                <td className={cn("num pr-4 text-right font-semibold", s.owes > 0 ? "text-warning-foreground dark:text-warning" : s.owes < 0 ? "text-success" : "")}>{s.owes < 0 ? `You owe ${money(-s.owes)}` : money(s.owes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">Mark handed-in cash on the <a href="/payments" className="underline">Payments</a> page (COD ledger). Partners record cash from their private delivery link.</p>
    </Section>
  );
}

function Riders() {
  const db = useDb();
  const [editing, setEditing] = useState<Rider | "new" | null>(null);
  const [viewing, setViewing] = useState<string | undefined>(db.riders.find((r) => r.active)?.id);
  const rider = db.riders.find((r) => r.id === viewing);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Delivery</p>
          <h1 className="text-2xl font-bold">Riders and logistics partners</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your own riders and delivery companies: the states they cover, their fee per state, their open drops and the cash they're holding. Send deliveries from the dispatch board.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" /> Add rider</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Section title="Roster">
          {db.riders.length === 0 ? <EmptyState title="No riders yet" /> : (
            <ul className="divide-y">{db.riders.map((r) => <RiderRow key={r.id} r={r} selected={viewing === r.id} onSelect={() => setViewing(r.id)} onEdit={() => setEditing(r)} />)}</ul>
          )}
        </Section>
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Smartphone className="size-4" aria-hidden="true" /> Phone view</p>
          {rider ? <PhoneView rider={rider} /> : <EmptyState title="Pick a rider" />}
        </div>
      </div>
      <Statements />
      {editing && <RiderDialog rider={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
