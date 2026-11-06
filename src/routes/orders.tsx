import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Download, Plus, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PersonAvatar, Section, StatusBadge } from "@/components/app/primitives";
import { OrderDialog, PickCustomer } from "@/components/app/dialogs";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { fullName } from "@/domain/repositories";
import { CHANNEL_LABELS, DELIVERY_STATUS_META, ORDER_STATUS_META, PAYMENT_STATUS_META, type OrderStatus, type OrderSummary, type PaymentMethod } from "@/domain/types";
import { formatCurrency, formatDateTime, relativeTime } from "@/lib/format";
import { productsIn, receiptNo, receiptText } from "@/domain/receipt";
import { isAgent, isOverdue, orderState, OUTCOME_LABEL } from "@/domain/ops";
import { csvCell } from "@/domain/rules";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders · Bizriva CRM" }] }),
  // ?o=<orderId> opens that order.
  validateSearch: (s: Record<string, unknown>): { o?: string } => (typeof s["o"] === "string" ? { o: s["o"] } : {}),
  component: Orders,
});

const FILTERS: { id: "all" | OrderStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending_verification", label: "To confirm" },
  { id: "confirmed", label: "Confirmed" },
  { id: "processing", label: "Processing" },
  { id: "ready_for_dispatch", label: "Ready for dispatch" },
  { id: "dispatched", label: "Dispatched" },
  { id: "in_transit", label: "In transit" },
  { id: "delivered", label: "Delivered" },
  { id: "refused", label: "Refused" },
  { id: "returned", label: "Returned" },
  { id: "cancelled", label: "Cancelled" },
];

/** The next step(s) an operator can take from each status (the agreed 10 statuses). */
const NEXT: Record<OrderStatus, { to: OrderStatus; label: string; variant?: "outline" | "destructive" }[]> = {
  pending_verification: [{ to: "confirmed", label: "Mark confirmed" }, { to: "cancelled", label: "Cancel", variant: "outline" }],
  confirmed: [{ to: "processing", label: "Start processing", variant: "outline" }, { to: "ready_for_dispatch", label: "Ready for dispatch" }, { to: "cancelled", label: "Cancel", variant: "outline" }],
  processing: [{ to: "ready_for_dispatch", label: "Ready for dispatch" }, { to: "cancelled", label: "Cancel", variant: "outline" }],
  ready_for_dispatch: [{ to: "dispatched", label: "Dispatched" }, { to: "cancelled", label: "Cancel", variant: "outline" }],
  dispatched: [{ to: "in_transit", label: "In transit", variant: "outline" }, { to: "delivered", label: "Delivered" }, { to: "refused", label: "Refused at the door", variant: "outline" }],
  in_transit: [{ to: "delivered", label: "Delivered" }, { to: "refused", label: "Refused at the door", variant: "outline" }, { to: "returned", label: "Returned", variant: "outline" }],
  delivered: [{ to: "returned", label: "Customer returned it", variant: "outline" }],
  refused: [{ to: "returned", label: "Back in our stock", variant: "outline" }],
  returned: [],
  cancelled: [],
};

function Invoice({ order, onClose }: { order: OrderSummary; onClose: () => void }) {
  const db = useDb();
  const ws = useWorkspace();
  const c = db.contacts.find((x) => x.id === order.contactId);
  const money = (n: number) => formatCurrency(n, ws.currency);
  const paid = order.amountPaid ?? (order.paymentStatus === "paid" ? order.total : 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg print:max-w-none print:border-0 print:shadow-none">
        <DialogHeader><DialogTitle>Invoice {order.invoiceNo}</DialogTitle><DialogDescription>Print it or save as PDF from the print window. Sending the PDF on WhatsApp comes with the backend.</DialogDescription></DialogHeader>
        <div id="invoice" className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <div><p className="font-bold">{db.settings.businessName}</p><p className="text-xs text-muted-foreground">{db.settings.whatsappNumber}</p></div>
            <div className="text-right text-xs"><p className="num font-semibold">{order.invoiceNo}</p><p>Order {order.reference}</p><p>{formatDateTime(order.placedAt)}</p></div>
          </div>
          {c && <div className="text-xs"><p className="font-semibold">Bill to</p><p>{fullName(c)} · {c.phone}</p>{c.address && <p>{c.address}{c.landmark ? ` (${c.landmark})` : ""}</p>}<p>{c.city}</p></div>}
          <table className="w-full text-sm"><tbody className="divide-y border-y">{order.productNames.map((p) => <tr key={p}><td className="py-1.5">{p}</td></tr>)}</tbody></table>
          <dl className="space-y-1">
            <div className="flex justify-between"><dt>Delivery</dt><dd className="num">{money(order.shippingFee)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Total</dt><dd className="num">{money(order.total)}</dd></div>
            <div className="flex justify-between"><dt>Paid</dt><dd className="num">{money(paid)}</dd></div>
            <div className="flex justify-between font-bold"><dt>Balance due</dt><dd className="num">{money(order.total - paid)}</dd></div>
          </dl>
          <p className="text-xs text-muted-foreground">{order.paymentMethod === "cash_on_delivery" ? "Balance payable to the rider on delivery." : "Pay by transfer or the payment link we sent."}</p>
        </div>
        <Button onClick={() => window.print()}>Print or save as PDF</Button>
      </DialogContent>
    </Dialog>
  );
}

function Payments({ order }: { order: OrderSummary }) {
  const ws = useWorkspace();
  const { recordDeposit, requestBalance, issueInvoice } = useActions();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [sent, setSent] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const money = (n: number) => formatCurrency(n, ws.currency);
  const paid = order.amountPaid ?? (order.paymentStatus === "paid" ? order.total : 0);
  const balance = order.total - paid;
  const open = order.status !== "cancelled" && order.status !== "returned";
  return (
    <div className="space-y-2 rounded-md border p-3" aria-label="Deposit and balance" role="group">
      <div className="flex justify-between"><span className="text-muted-foreground">Paid so far</span><span className="num font-medium">{money(paid)}</span></div>
      <div className="flex justify-between font-semibold"><span>Balance</span><span className="num" data-testid="balance">{money(balance)}</span></div>
      {open && balance > 0 && (
        <>
          <div className="flex gap-2">
            <Input aria-label="Deposit amount" type="number" min={1} placeholder="Amount received" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="w-36" aria-label="Deposit method"><SelectValue>{method.replace(/_/g, " ")}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="bank_transfer">Bank transfer</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="ussd">USSD</SelectItem><SelectItem value="wallet">Wallet</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!(Number(amount) > 0)} onClick={() => { recordDeposit(order.id, Number(amount), method); setAmount(""); }}>Record payment</Button>
            <Button size="sm" variant="outline" onClick={() => { requestBalance(order.id); setSent(true); }}>Request balance in chat</Button>
          </div>
          {sent && <p className="text-xs text-success" role="status">Payment link sent in the customer's chat (practice — nothing really sent).</p>}
        </>
      )}
      <Button size="sm" variant="ghost" className="px-0" onClick={() => { issueInvoice(order.id); setShowInvoice(true); }}>{order.invoiceNo ? `View invoice ${order.invoiceNo}` : "Create invoice"}</Button>
      {showInvoice && order.invoiceNo && <Invoice order={order} onClose={() => setShowInvoice(false)} />}
      <ReceiptActions order={order} />
    </div>
  );
}

function ReceiptActions({ order }: { order: OrderSummary }) {
  const db = useDb();
  const { sendOrderMessage } = useActions();
  const [show, setShow] = useState(false);
  const [note, setNote] = useState("");
  const paidUp = order.paymentStatus === "paid" || order.status === "delivered";
  const hasGuide = productsIn(db, order).some((p) => p.careGuide?.trim());
  if (!paidUp && !hasGuide) return null;
  return (
    <div className="space-y-1.5 border-t pt-2" role="group" aria-label="Receipt and care guide">
      <div className="flex flex-wrap gap-2">
        {paidUp && <Button size="sm" variant="outline" onClick={() => setShow(true)}>Receipt {receiptNo(order)}</Button>}
        {paidUp && <Button size="sm" variant="outline" onClick={() => setNote(sendOrderMessage(order.id, "receipt") ? "Receipt sent in the chat." : "")}>Send receipt in chat</Button>}
        {hasGuide && <Button size="sm" variant="outline" onClick={() => setNote(sendOrderMessage(order.id, "care") ? "How-to-use guide sent in the chat." : "")}>Send how-to-use guide</Button>}
      </div>
      {note && <p className="text-xs text-success" role="status">{note} (practice — nothing really sent)</p>}
      {show && (
        <Dialog open onOpenChange={(o) => !o && setShow(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Receipt {receiptNo(order)}</DialogTitle><DialogDescription>Print it or save as PDF. The same receipt goes into the customer's chat after delivery.</DialogDescription></DialogHeader>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 font-sans text-sm" data-testid="receipt-text">{receiptText(db, order).replace(/\*/g, "")}</pre>
            <Button onClick={() => window.print()}>Print or save as PDF</Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function OrderPanel({ order, onClose }: { order: OrderSummary; onClose: () => void }) {
  const db = useDb();
  const ws = useWorkspace();
  const { setOrderStatus } = useActions();
  const c = db.contacts.find((x) => x.id === order.contactId);
  const delivery = db.deliveries.find((d) => d.orderId === order.id);
  const history = db.activities.filter((a) => a.contactId === order.contactId && a.title.includes(order.reference));
  const money = (n: number) => formatCurrency(n, ws.currency);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="num">{order.reference}</SheetTitle>
          <SheetDescription>Placed {formatDateTime(order.placedAt)} via {CHANNEL_LABELS[order.channel]}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge tone={ORDER_STATUS_META[order.status].tone}>{ORDER_STATUS_META[order.status].label}</StatusBadge>
            <StatusBadge tone={PAYMENT_STATUS_META[order.paymentStatus].tone}>{PAYMENT_STATUS_META[order.paymentStatus].label}</StatusBadge>
            <StatusBadge>{order.paymentMethod.replace(/_/g, " ")}</StatusBadge>
          </div>
          <AgentLine order={order} />

          {c && (
            <Link to="/crm/contacts/$contactId" params={{ contactId: c.id }} className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/40">
              <PersonAvatar name={fullName(c)} size="md" />
              <span className="min-w-0">
                <span className="block font-medium">{fullName(c)}</span>
                <span className="block text-xs text-muted-foreground">{c.phone} · {c.city}</span>
              </span>
            </Link>
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
            <ul className="space-y-1">{order.productNames.map((p) => <li key={p}>{p}</li>)}</ul>
            <dl className="mt-3 space-y-1 border-t pt-2">
              <div className="flex justify-between"><dt className="text-muted-foreground">Delivery fee</dt><dd className="num">{money(order.shippingFee)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Total</dt><dd className="num">{money(order.total)}</dd></div>
              <div className="flex justify-between text-xs text-muted-foreground"><dt>Margin after cost and delivery</dt><dd className="num">{money(order.total - order.cogs - order.shippingFee)}</dd></div>
            </dl>
          </div>

          <Payments order={order} />

          {delivery && (
            <div className="rounded-md border p-3">
              <p className="flex items-center justify-between gap-2">
                <span className="font-medium">Delivery {delivery.trackingRef}</span>
                <StatusBadge tone={DELIVERY_STATUS_META[delivery.status].tone}>{DELIVERY_STATUS_META[delivery.status].label}</StatusBadge>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{delivery.courier} · {delivery.city} · {delivery.attempts} attempt{delivery.attempts === 1 ? "" : "s"}</p>
              <Link to="/delivery" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Open delivery board</Link>
            </div>
          )}

          {order.status === "pending_verification" && order.paymentMethod === "cash_on_delivery" && (
            <p className="rounded-md bg-warning/15 p-3 text-xs">
              Cash on delivery: confirm with the customer first. <Link to="/cod" className="font-medium underline">Open COD Verification</Link>
            </p>
          )}

          {NEXT[order.status].length > 0 && (
            <div className="flex flex-wrap gap-2">
              {NEXT[order.status].map((n) => (
                <Button key={n.to} size="sm" variant={n.variant ?? "default"} onClick={() => setOrderStatus(order.id, n.to)}>{n.label}</Button>
              ))}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</p>
            {history.length === 0 ? <p className="text-muted-foreground">No changes yet.</p> : (
              <ol className="space-y-1.5">
                {history.map((a) => <li key={a.id}><span>{a.title}</span> <span className="text-xs text-muted-foreground">· {relativeTime(a.at)}</span></li>)}
              </ol>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AgentLine({ order }: { order: OrderSummary }) {
  const db = useDb();
  const { assignOrders } = useActions();
  const tries = order.contactAttempts ?? [];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
      <span>Agent:</span>
      <Select value={order.assignedTo ?? ""} onValueChange={(v) => assignOrders([order.id], v)}>
        <SelectTrigger className="h-7 w-40 text-xs" aria-label="Agent"><SelectValue placeholder="Not assigned" /></SelectTrigger>
        <SelectContent>{db.team.filter(isAgent).map((m) => <SelectItem key={m.id} value={m.id}>{m.name}{m.onDuty === false ? " (off duty)" : ""}</SelectItem>)}</SelectContent>
      </Select>
      <span className="text-muted-foreground">{tries.length ? `${tries.length} call${tries.length > 1 ? "s" : ""}/chat${tries.length > 1 ? "s" : ""} · last ${OUTCOME_LABEL[tries.at(-1)!.outcome].toLowerCase()} ${relativeTime(tries.at(-1)!.at)}` : "not contacted yet"}</span>
      {isOverdue(db, order) && <span className="font-semibold text-destructive">late</span>}
    </div>
  );
}

/** One printable slip per order: what the rider needs at the door. */
function DeliverySlips({ orderIds, onClose }: { orderIds: string[]; onClose: () => void }) {
  const db = useDb();
  const ws = useWorkspace();
  const orders = orderIds.map((id) => db.orders.find((o) => o.id === id)).filter((o): o is OrderSummary => !!o);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto print:max-h-none print:max-w-none print:overflow-visible print:border-0 print:shadow-none">
        <DialogHeader><DialogTitle>{orders.length} delivery slip{orders.length > 1 ? "s" : ""}</DialogTitle><DialogDescription>Print and attach one to each package. Each slip starts on a new page.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          {orders.map((o) => {
            const c = db.contacts.find((x) => x.id === o.contactId);
            const d = db.deliveries.find((x) => x.orderId === o.id);
            const r = db.riders.find((x) => x.id === d?.riderId);
            const due = Math.max(0, o.total - (o.amountPaid ?? 0));
            return (
              <article key={o.id} aria-label={`Slip ${o.reference}`} className="break-after-page rounded-lg border p-4 text-sm print:break-inside-avoid">
                <div className="flex items-start justify-between gap-2"><p className="text-xs uppercase tracking-wider text-muted-foreground">{ws.name}</p><p className="num text-lg font-bold">{o.reference}</p></div>
                <p className="mt-2 text-base font-semibold">{c ? fullName(c) : "Customer"} · {c?.phone}</p>
                <p>{c?.address ? `${c.address}, ` : ""}{c?.city}{c?.landmark ? ` — near ${c.landmark}` : ""}</p>
                <p className="mt-2 text-muted-foreground">{o.productNames.join(", ")}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                  <span>{r ? `Rider: ${r.name}` : d?.courier ? `Courier: ${d.courier}` : "Rider: ________"}</span>
                  <span className="text-base font-bold">{due > 0 ? `Collect ${formatCurrency(due, ws.currency)}` : "PAID — collect nothing"}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Customer signature: ______________________</p>
              </article>
            );
          })}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => window.print()}><Printer className="size-4" /> Print</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function exportOrders(db: ReturnType<typeof useDb>, orders: OrderSummary[]) {
  const head = ["Order", "Placed", "Customer", "Phone", "State", "Address", "Items", "Status", "Payment", "Total", "Paid", "Agent"];
  const lines = orders.map((o) => {
    const c = db.contacts.find((x) => x.id === o.contactId);
    return [o.reference, o.placedAt, c ? fullName(c) : "", c?.phone ?? "", orderState(db, o), c?.address ?? "", o.productNames.join("; "), ORDER_STATUS_META[o.status].label, PAYMENT_STATUS_META[o.paymentStatus].label, o.total, o.amountPaid ?? 0, db.team.find((m) => m.id === o.assignedTo)?.name ?? ""];
  });
  const csv = [head, ...lines].map((r) => r.map(csvCell).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function Orders() {
  const db = useDb();
  const ws = useWorkspace();
  const navigate = useNavigate({ from: "/orders" });
  const { o: openId } = Route.useSearch();
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState(false);
  const [orderFor, setOrderFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [slips, setSlips] = useState<string[] | null>(null);
  const { assignOrders } = useActions();

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    db.orders.forEach((o) => m.set(o.status, (m.get(o.status) ?? 0) + 1));
    return m;
  }, [db.orders]);

  const needle = search.trim().toLowerCase();
  const rows = db.orders
    .filter((o) => filter === "all" || o.status === filter)
    .filter((o) => {
      if (!needle) return true;
      const c = db.contacts.find((x) => x.id === o.contactId);
      return `${o.reference} ${o.productNames.join(" ")} ${c ? `${fullName(c)} ${c.phone}` : ""}`.toLowerCase().includes(needle);
    })
    .sort((a, b) => +new Date(b.placedAt) - +new Date(a.placedAt));

  const open = openId ? db.orders.find((o) => o.id === openId) : undefined;
  const setOpen = (id?: string) => navigate({ search: id ? { o: id } : {}, replace: true });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Sales</p>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every order, from confirmation to delivery. Cash-on-delivery orders count as revenue only once delivered.</p>
        </div>
        <Button size="sm" onClick={() => setPicking(true)}><Plus className="size-4" /> New order</Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | OrderStatus)}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.id} value={f.id}>{f.label} ({f.id === "all" ? db.orders.length : counts.get(f.id) ?? 0})</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Section>
        <div className="border-b p-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order ref, customer, phone, product" className="pl-8" aria-label="Search orders" />
          </div>
        </div>
        {selected.size > 0 && (
          <div role="toolbar" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b bg-accent/40 px-3 py-2 text-sm">
            <span className="font-medium">{selected.size} selected</span>
            <Select value="" onValueChange={(v) => { assignOrders([...selected], v === "auto" ? undefined : v); setSelected(new Set()); }}>
              <SelectTrigger className="h-8 w-48" aria-label="Reassign selected"><SelectValue placeholder="Reassign to…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Share by the rule</SelectItem>
                {db.team.filter(isAgent).map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setSlips([...selected])}><Printer className="size-4" /> Print delivery slips</Button>
            <Button size="sm" variant="outline" onClick={() => exportOrders(db, rows.filter((o) => selected.has(o.id)))}><Download className="size-4" /> Export</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
        {rows.length === 0 ? <EmptyState title="No orders here" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Select all shown" checked={rows.length > 0 && rows.every((o) => selected.has(o.id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((o) => o.id)) : new Set())} /></th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Items</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2">Agent</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Placed</th></tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((o) => {
                  const c = db.contacts.find((x) => x.id === o.contactId);
                  return (
                    <tr key={o.id} onClick={() => setOpen(o.id)} className="cursor-pointer hover:bg-muted/40">
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${o.reference}`} checked={selected.has(o.id)} onChange={(e) => { const n = new Set(selected); if (e.target.checked) n.add(o.id); else n.delete(o.id); setSelected(n); }} /></td>
                      <td className="px-3 py-2"><button type="button" className="num font-semibold hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(o.id); }}>{o.reference}</button></td>
                      <td className="px-3 py-2">{c ? fullName(c) : "Unknown"}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground">{o.productNames.join(", ")}</td>
                      <td className="px-3 py-2"><StatusBadge tone={ORDER_STATUS_META[o.status].tone}>{ORDER_STATUS_META[o.status].label}</StatusBadge></td>
                      <td className="px-3 py-2"><StatusBadge tone={PAYMENT_STATUS_META[o.paymentStatus].tone}>{PAYMENT_STATUS_META[o.paymentStatus].label}</StatusBadge></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{db.team.find((m) => m.id === o.assignedTo)?.name.split(" ")[0] ?? "—"}{isOverdue(db, o) ? <span className="ml-1 font-semibold text-destructive">late</span> : null}</td>
                      <td className="num px-3 py-2 text-right">{formatCurrency(o.total, ws.currency)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{relativeTime(o.placedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {open && <OrderPanel order={open} onClose={() => setOpen()} />}
      {slips && <DeliverySlips orderIds={slips} onClose={() => setSlips(null)} />}
      <PickCustomer open={picking} onOpenChange={setPicking} onPick={(id) => { setPicking(false); setOrderFor(id); }} />
      {orderFor && <OrderDialog open onOpenChange={(o) => !o && setOrderFor(null)} contactId={orderFor} />}
    </div>
  );
}
