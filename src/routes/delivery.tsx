import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KpiCard, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { fullName } from "@/domain/repositories";
import { DELIVERY_STATUS_META, type DeliveryStatus, type DeliverySummary } from "@/domain/types";
import { formatCurrency, formatDate, relativeTime } from "@/lib/format";
import { APP_ORIGIN, minutesNotAccepted, partnerFor, stateOf } from "@/domain/ops";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/delivery")({
  head: () => ({ meta: [{ title: "Delivery · Bizriva CRM" }] }),
  component: Delivery,
});

const COLUMNS: { id: DeliveryStatus[]; label: string }[] = [
  { id: ["not_scheduled", "scheduled"], label: "To dispatch" },
  { id: ["picked_up", "in_transit"], label: "On the road" },
  { id: ["failed"], label: "Failed attempt" },
  { id: ["delivered"], label: "Delivered" },
  { id: ["returned"], label: "Returned" },
];

const FAIL_REASONS = ["Customer unreachable", "Customer refused", "Wrong address", "Customer not home", "Customer out of town", "No cash on delivery"];

function FailDialog({ delivery, onClose }: { delivery: DeliverySummary; onClose: () => void }) {
  const { setDeliveryStatus } = useActions();
  const [reason, setReason] = useState(FAIL_REASONS[0]!);
  const [other, setOther] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record failed attempt</DialogTitle>
          <DialogDescription>{delivery.trackingRef} · attempt {delivery.attempts + 1}. Repeated failures raise this customer's COD risk next time.</DialogDescription>
        </DialogHeader>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger aria-label="Reason"><SelectValue>{reason}</SelectValue></SelectTrigger>
          <SelectContent>{[...FAIL_REASONS, "Other"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
        </Select>
        {reason === "Other" && <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="What happened?" aria-label="Other reason" />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setDeliveryStatus(delivery.id, "failed", reason === "Other" ? other || "Other" : reason); onClose(); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Card({ d, onFail }: { d: DeliverySummary; onFail: () => void }) {
  const db = useDb();
  const ws = useWorkspace();
  const { setDeliveryStatus, assignRider, sendToPartner } = useActions();
  const [sent, setSent] = useState<{ text: string; waUrl: string; link: string } | { error: string } | null>(null);
  const suggested = partnerFor(db, stateOf(d.city));
  const waiting = minutesNotAccepted(d);
  const c = db.contacts.find((x) => x.id === d.contactId);
  const order = db.orders.find((o) => o.id === d.orderId);
  const rider = db.riders.find((r) => r.id === d.riderId);
  const activeRiders = db.riders.filter((r) => r.active);

  return (
    <li className="relative space-y-2 rounded-md border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {c ? <Link to="/crm/contacts/$contactId" params={{ contactId: c.id }} className="font-medium hover:underline">{fullName(c)}</Link> : <span>Unknown</span>}
          <p className="truncate text-xs text-muted-foreground">{d.city} · {order ? <Link to="/orders" search={{ o: order.id }} className="hover:underline">{order.reference}</Link> : d.trackingRef}</p>
        </div>
        <StatusBadge tone={DELIVERY_STATUS_META[d.status].tone}>{DELIVERY_STATUS_META[d.status].label}</StatusBadge>
      </div>
      {order && <p className="num text-xs">{formatCurrency(order.total, ws.currency)}{order.paymentMethod === "cash_on_delivery" ? " to collect" : " · prepaid"}</p>}
      <p className="text-xs text-muted-foreground">{d.courier}{rider ? ` · ${rider.name}` : ""} · {formatDate(d.deliveredAt ?? d.scheduledFor)}{d.attempts ? ` · ${d.attempts} attempt${d.attempts > 1 ? "s" : ""}` : ""}</p>
      {d.failureReason && <p className="text-xs text-destructive">{d.failureReason}</p>}
      {d.sentAt && (d.acceptedAt
        ? <p className="text-xs text-success">Accepted by {rider?.name ?? "partner"} {relativeTime(d.acceptedAt)}</p>
        : waiting !== null && <p className={`text-xs ${waiting >= db.settings.partnerAcceptMinutes ? "font-semibold text-destructive" : "text-muted-foreground"}`}>Sent on WhatsApp {relativeTime(d.sentAt)} · not accepted yet</p>)}
      {(d.status === "not_scheduled" || d.status === "scheduled" || d.status === "failed") && (
        <Select value={d.riderId ?? "none"} onValueChange={(v) => assignRider(d.id, v === "none" ? undefined : v)}>
          <SelectTrigger className="h-8 text-xs" aria-label="Rider"><SelectValue>{rider ? rider.name : "Assign rider"}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No rider (courier)</SelectItem>
            {activeRiders.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}{r.id === suggested?.id ? " (best for this state)" : ""} · {r.fees?.[stateOf(d.city)] ? formatCurrency(r.fees[stateOf(d.city)]!, ws.currency) : r.zone}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <div className="flex flex-wrap gap-1.5">
        {(d.status === "not_scheduled" || d.status === "scheduled") && <Button size="sm" className="h-7 text-xs" onClick={() => setDeliveryStatus(d.id, "in_transit")}>Dispatch</Button>}
        {d.status === "failed" && <Button size="sm" className="h-7 text-xs" onClick={() => setDeliveryStatus(d.id, "scheduled")}>Reschedule</Button>}
        {["not_scheduled", "scheduled", "failed"].includes(d.status) && order && ["confirmed", "processing", "ready_for_dispatch", "dispatched", "in_transit"].includes(order.status) && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSent(sendToPartner(d.id))}>
            <Send className="size-3" /> {d.sentAt ? "Send again" : `Send to ${rider?.name.split(" ")[0] ?? suggested?.name.split(" ")[0] ?? "rider"}`}
          </Button>
        )}
        {(d.status === "picked_up" || d.status === "in_transit") && (
          <>
            <Button size="sm" className="h-7 text-xs" onClick={() => setDeliveryStatus(d.id, "delivered")}>Delivered</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onFail}>Failed</Button>
          </>
        )}
        {d.status === "failed" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDeliveryStatus(d.id, "returned", d.failureReason)}>Return to store</Button>}
      </div>
      {sent && (
        <Dialog open onOpenChange={(o) => !o && setSent(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{"error" in sent ? "Can't send yet" : "Send on WhatsApp"}</DialogTitle><DialogDescription>{"error" in sent ? sent.error : "Opens WhatsApp with the full order. The rider or partner accepts and updates it from the private link — no app or login."}</DialogDescription></DialogHeader>
            {!("error" in sent) && (
              <>
                <pre aria-label="Message to the rider" className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{sent.text}</pre>
                <DialogFooter className="gap-2 sm:justify-start">
                  <Button asChild><a href={sent.waUrl} target="_blank" rel="noreferrer"><Send className="size-4" /> Open WhatsApp</a></Button>
                  <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(sent.text).catch(() => {}); }}>Copy message</Button>
                  <Button asChild variant="ghost"><a href={sent.link.replace(APP_ORIGIN, "")} target="_blank" rel="noreferrer">Preview their link</a></Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </li>
  );
}

function Delivery() {
  const db = useDb();
  const [city, setCity] = useState("all");
  const [failing, setFailing] = useState<DeliverySummary | null>(null);
  const cities = [...new Set(db.deliveries.map((d) => d.city))].sort();
  const rows = db.deliveries.filter((d) => city === "all" || d.city === city);
  const done = rows.filter((d) => d.status === "delivered").length;
  const finished = rows.filter((d) => ["delivered", "returned", "failed"].includes(d.status)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Delivery</p>
          <h1 className="text-2xl font-bold">Dispatch board</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every delivery from dispatch to doorstep. Delivered COD orders become paid revenue automatically.</p>
        </div>
        <Select value={city} onValueChange={setCity}>
          <SelectTrigger className="h-9 w-40" aria-label="City"><SelectValue>{city === "all" ? "All cities" : city}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cities</SelectItem>
            {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="To dispatch" value={String(rows.filter((d) => d.status === "scheduled" || d.status === "not_scheduled").length)} />
        <KpiCard label="On the road" value={String(rows.filter((d) => d.status === "in_transit" || d.status === "picked_up").length)} tone="info" />
        <KpiCard label="Failed attempts" value={String(rows.filter((d) => d.status === "failed").length)} tone="danger" />
        <KpiCard label="Delivery success" value={finished ? `${Math.round((done / finished) * 100)}%` : "—"} tone="success" />
      </div>

      {(() => {
        const late = db.deliveries.filter((d) => (minutesNotAccepted(d) ?? -1) >= db.settings.partnerAcceptMinutes);
        if (!late.length) return null;
        return (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            <p className="font-semibold">{late.length} sent but not accepted in {db.settings.partnerAcceptMinutes} minutes</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {late.map((d) => {
                const r = db.riders.find((x) => x.id === d.riderId);
                const o = db.orders.find((x) => x.id === d.orderId);
                return <li key={d.id}>{o?.reference ?? d.trackingRef} · {r?.name ?? d.courier} · sent {relativeTime(d.sentAt!)} — call them or send it to someone else.</li>;
              })}
            </ul>
          </div>
        );
      })()}

      <div className="scroll-thin relative -mx-3 flex gap-3 overflow-x-auto px-3 pb-3 sm:mx-0 sm:px-0">
        {COLUMNS.map((col) => {
          const items = rows.filter((d) => col.id.includes(d.status));
          return (
            <section key={col.label} aria-label={col.label} className={cn("flex w-72 shrink-0 flex-col rounded-lg border bg-surface")}>
              <header className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-semibold">{col.label}</span>
                <span className="num text-xs text-muted-foreground">{items.length}</span>
              </header>
              <ul className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto p-2">
                {items.slice(0, 40).map((d) => <Card key={d.id} d={d} onFail={() => setFailing(d)} />)}
                {items.length === 0 && <li className="py-6 text-center text-xs text-muted-foreground">Nothing here</li>}
                {items.length > 40 && <li className="py-2 text-center text-xs text-muted-foreground">+{items.length - 40} more — filter by city</li>}
              </ul>
            </section>
          );
        })}
      </div>
      {failing && <FailDialog delivery={failing} onClose={() => setFailing(null)} />}
    </div>
  );
}
