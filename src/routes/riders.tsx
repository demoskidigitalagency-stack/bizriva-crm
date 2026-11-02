import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bike, Car, Pencil, Phone, Plus, Smartphone, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { fullName } from "@/domain/repositories";
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
  const init: Omit<Rider, "id"> & { id?: string } = rider === "new" ? { name: "", phone: "", zone: "", vehicle: "bike", active: true } : rider;
  const [r, setR] = useState(init);
  const [error, setError] = useState("");
  const save = () => {
    if (!r.name.trim() || r.phone.replace(/\D/g, "").length < 10) return setError("Enter a name and a full phone number.");
    saveRecord("riders", { ...r, name: r.name.trim(), zone: r.zone.trim() || "Unassigned" });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{rider === "new" ? "Add rider" : "Edit rider"}</DialogTitle><DialogDescription>Riders see their drops on the phone view and hand in cash they collect.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="rn">Name</Label><Input id="rn" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="rp">Phone</Label><Input id="rp" value={r.phone} onChange={(e) => setR({ ...r, phone: e.target.value })} placeholder="+234 803 000 0000" /></div>
          <div className="space-y-1.5"><Label htmlFor="rz">Zone</Label><Input id="rz" value={r.zone} onChange={(e) => setR({ ...r, zone: e.target.value })} placeholder="Lekki & VI" /></div>
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
      </button>
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
          <h1 className="text-2xl font-bold">Riders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your own riders, their open drops and the cash they're holding. Assign deliveries from the dispatch board.</p>
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
      {editing && <RiderDialog rider={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
