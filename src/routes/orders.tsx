import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PersonAvatar, Section, StatusBadge } from "@/components/app/primitives";
import { OrderDialog, PickCustomer } from "@/components/app/dialogs";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { fullName } from "@/domain/repositories";
import { CHANNEL_LABELS, DELIVERY_STATUS_META, ORDER_STATUS_META, PAYMENT_STATUS_META, type OrderStatus, type OrderSummary, type PaymentMethod } from "@/domain/types";
import { formatCurrency, formatDateTime, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders · Bizriva CRM" }] }),
  // ?o=<orderId> opens that order.
  validateSearch: (s: Record<string, unknown>): { o?: string } => (typeof s["o"] === "string" ? { o: s["o"] } : {}),
  component: Orders,
});

const FILTERS: { id: "all" | OrderStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending_confirmation", label: "To confirm" },
  { id: "confirmed", label: "Confirmed" },
  { id: "awaiting_dispatch", label: "Awaiting dispatch" },
  { id: "in_transit", label: "In transit" },
  { id: "delivered", label: "Delivered" },
  { id: "returned", label: "Returned" },
  { id: "cancelled", label: "Cancelled" },
];

/** The next step(s) an operator can take from each status. */
const NEXT: Record<OrderStatus, { to: OrderStatus; label: string; variant?: "outline" | "destructive" }[]> = {
  pending_confirmation: [{ to: "confirmed", label: "Mark confirmed" }, { to: "cancelled", label: "Cancel", variant: "outline" }],
  confirmed: [{ to: "awaiting_dispatch", label: "Ready for dispatch" }, { to: "cancelled", label: "Cancel", variant: "outline" }],
  awaiting_dispatch: [{ to: "in_transit", label: "Dispatched" }, { to: "cancelled", label: "Cancel", variant: "outline" }],
  in_transit: [{ to: "delivered", label: "Delivered" }, { to: "returned", label: "Returned or refused", variant: "outline" }],
  delivered: [{ to: "returned", label: "Customer returned it", variant: "outline" }],
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

          {order.status === "pending_confirmation" && order.paymentMethod === "cash_on_delivery" && (
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

function Orders() {
  const db = useDb();
  const ws = useWorkspace();
  const navigate = useNavigate({ from: "/orders" });
  const { o: openId } = Route.useSearch();
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState(false);
  const [orderFor, setOrderFor] = useState<string | null>(null);

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
        {rows.length === 0 ? <EmptyState title="No orders here" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Items</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Placed</th></tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((o) => {
                  const c = db.contacts.find((x) => x.id === o.contactId);
                  return (
                    <tr key={o.id} onClick={() => setOpen(o.id)} className="cursor-pointer hover:bg-muted/40">
                      <td className="px-3 py-2"><button type="button" className="num font-semibold hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(o.id); }}>{o.reference}</button></td>
                      <td className="px-3 py-2">{c ? fullName(c) : "Unknown"}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground">{o.productNames.join(", ")}</td>
                      <td className="px-3 py-2"><StatusBadge tone={ORDER_STATUS_META[o.status].tone}>{ORDER_STATUS_META[o.status].label}</StatusBadge></td>
                      <td className="px-3 py-2"><StatusBadge tone={PAYMENT_STATUS_META[o.paymentStatus].tone}>{PAYMENT_STATUS_META[o.paymentStatus].label}</StatusBadge></td>
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
      <PickCustomer open={picking} onOpenChange={setPicking} onPick={(id) => { setPicking(false); setOrderFor(id); }} />
      {orderFor && <OrderDialog open onOpenChange={(o) => !o && setOrderFor(null)} contactId={orderFor} />}
    </div>
  );
}
