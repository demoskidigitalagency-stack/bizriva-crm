import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { ChatPayments } from "@/components/app/ChatPayments";
import { fullName } from "@/domain/repositories";
import { PAYMENT_STATUS_META, type PaymentMethod } from "@/domain/types";
import { formatCurrency, formatDate, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/payments")({
  head: () => ({ meta: [{ title: "Payments · Bizriva CRM" }] }),
  component: Payments,
});

const METHOD_LABEL: Record<PaymentMethod, string> = { cash_on_delivery: "Cash on delivery", bank_transfer: "Bank transfer", card: "Card", wallet: "Wallet", ussd: "USSD" };

function Payments() {
  const db = useDb();
  const ws = useWorkspace();
  const { markRemitted, recordPayment } = useActions();
  const [view, setView] = useState<"ledger" | "unpaid" | "all">("ledger");
  const [copied, setCopied] = useState<string | null>(null);
  const [method, setMethod] = useState<Record<string, PaymentMethod>>({});
  const money = (n: number) => formatCurrency(n, ws.currency);

  const codCollected = db.payments.filter((p) => p.method === "cash_on_delivery" && p.status === "paid");
  const notRemitted = codCollected.filter((p) => !p.remitted);
  const overdue = notRemitted.filter((p) => p.remittanceDueAt && new Date(p.remittanceDueAt) < new Date());
  const unpaid = db.orders.filter((o) => (o.paymentStatus === "unpaid" || o.paymentStatus === "part_paid") && o.status !== "cancelled");
  const riderFor = (orderId: string) => db.riders.find((r) => r.id === db.deliveries.find((d) => d.orderId === orderId)?.riderId);

  const copyLink = async (ref: string) => {
    const link = db.settings.paymentLinkTemplate.replace("{{order}}", ref);
    try { await navigator.clipboard.writeText(link); } catch { /* clipboard blocked; link still shown */ }
    setCopied(ref);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Money</p>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">Get paid inside the chat with instant confirmation, and keep track of cash collected on delivery.</p>
      </div>

      <ChatPayments />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="COD collected" value={formatCurrency(codCollected.reduce((s, p) => s + p.amount, 0), ws.currency, { compact: true })} tone="success" />
        <KpiCard label="Held, not handed in" value={formatCurrency(notRemitted.reduce((s, p) => s + p.amount, 0), ws.currency, { compact: true })} tone="warning" />
        <KpiCard label="Overdue hand-ins" value={String(overdue.length)} tone={overdue.length ? "danger" : "success"} />
        <KpiCard label="Unpaid orders" value={formatCurrency(unpaid.reduce((s, o) => s + o.total, 0), ws.currency, { compact: true })} hint={`${unpaid.length} orders`} tone="info" />
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList>
          <TabsTrigger value="ledger">COD ledger ({notRemitted.length})</TabsTrigger>
          <TabsTrigger value="unpaid">Unpaid orders ({unpaid.length})</TabsTrigger>
          <TabsTrigger value="all">All payments</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "ledger" && (
        <Section title="Cash to hand in" description="Mark each one once the rider or courier has paid the cash in.">
          {notRemitted.length === 0 ? <EmptyState title="All cash handed in" /> : (
            <ul className="divide-y">
              {notRemitted.map((p) => {
                const c = db.contacts.find((x) => x.id === p.contactId);
                const o = db.orders.find((x) => x.id === p.orderId);
                const r = riderFor(p.orderId);
                const late = p.remittanceDueAt && new Date(p.remittanceDueAt) < new Date();
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="num w-28 font-semibold">{money(p.amount)}</span>
                    <span className="min-w-0 flex-1 basis-48">
                      {o ? <Link to="/orders" search={{ o: o.id }} className="font-medium hover:underline">{o.reference}</Link> : "Order"} · {c ? fullName(c) : ""}
                      <span className="block text-xs text-muted-foreground">Collected {relativeTime(p.at)} by {r?.name ?? db.deliveries.find((d) => d.orderId === p.orderId)?.courier ?? "courier"}</span>
                    </span>
                    {p.remittanceDueAt && <StatusBadge tone={late ? "danger" : "warning"}>{late ? "Overdue" : `Due ${formatDate(p.remittanceDueAt)}`}</StatusBadge>}
                    <Button size="sm" onClick={() => markRemitted(p.id)}>Cash received</Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {view === "unpaid" && (
        <Section title="Waiting for payment" description="Send a payment link, or record a transfer when it arrives.">
          {unpaid.length === 0 ? <EmptyState title="Nothing unpaid" /> : (
            <ul className="divide-y">
              {unpaid.map((o) => {
                const c = db.contacts.find((x) => x.id === o.contactId);
                const m = method[o.id] ?? "bank_transfer";
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                    <span className="num w-28 font-semibold">{money(o.total)}</span>
                    <span className="min-w-0 flex-1 basis-40"><Link to="/orders" search={{ o: o.id }} className="font-medium hover:underline">{o.reference}</Link> · {c ? fullName(c) : ""}</span>
                    <Button size="sm" variant="outline" onClick={() => copyLink(o.reference)}>
                      {copied === o.reference ? <Copy className="size-3.5" /> : <Link2 className="size-3.5" />} {copied === o.reference ? "Link copied" : "Payment link"}
                    </Button>
                    <Select value={m} onValueChange={(v) => setMethod((x) => ({ ...x, [o.id]: v as PaymentMethod }))}>
                      <SelectTrigger className="h-8 w-36" aria-label="Payment method"><SelectValue>{METHOD_LABEL[m]}</SelectValue></SelectTrigger>
                      <SelectContent>{(Object.keys(METHOD_LABEL) as PaymentMethod[]).filter((k) => k !== "cash_on_delivery").map((k) => <SelectItem key={k} value={k}>{METHOD_LABEL[k]}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" onClick={() => recordPayment(o.id, m)}>Mark paid</Button>
                  </li>
                );
              })}
            </ul>
          )}
          {copied && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Practice link: {db.settings.paymentLinkTemplate.replace("{{order}}", copied)} — real payment links arrive when a payment provider is connected.</p>}
        </Section>
      )}

      {view === "all" && (
        <Section>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Order</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Method</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Amount</th></tr>
              </thead>
              <tbody className="divide-y">
                {[...db.payments].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 60).map((p) => {
                  const c = db.contacts.find((x) => x.id === p.contactId);
                  const o = db.orders.find((x) => x.id === p.orderId);
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-2 text-muted-foreground">{formatDate(p.at)}</td>
                      <td className="num px-4 py-2">{o?.reference}</td>
                      <td className="px-4 py-2">{c ? fullName(c) : ""}</td>
                      <td className="px-4 py-2">{METHOD_LABEL[p.method]}</td>
                      <td className="px-4 py-2"><StatusBadge tone={PAYMENT_STATUS_META[p.status].tone}>{PAYMENT_STATUS_META[p.status].label}</StatusBadge></td>
                      <td className="num px-4 py-2 text-right">{money(p.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
