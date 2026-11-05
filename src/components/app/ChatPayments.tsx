import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Banknote, Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { fullName } from "@/domain/repositories";
import type { PaymentEvent, PaymentProviderId } from "@/domain/types";
import { formatCurrency, relativeTime } from "@/lib/format";

const PROVIDERS: { id: PaymentProviderId; name: string; what: string }[] = [
  { id: "paystack", name: "Paystack", what: "Customer accounts (Wema / Titan), links, card, USSD, split to subaccounts" },
  { id: "flutterwave", name: "Flutterwave", what: "Customer accounts, links, card, USSD, split payments" },
  { id: "monnify", name: "Monnify", what: "Reserved accounts for transfers, links, card, split to sub-accounts" },
];
const EV: Record<PaymentEvent["status"], { label: string; tone: "success" | "info" | "warning" | "danger" }> = {
  matched: { label: "Paid in full", tone: "success" }, part: { label: "Part payment", tone: "info" }, over: { label: "Overpaid — check", tone: "warning" }, unmatched: { label: "Not matched", tone: "danger" },
};
const balance = (o: { total: number; amountPaid?: number; paymentStatus: string }) => o.total - (o.amountPaid ?? (o.paymentStatus === "paid" ? o.total : 0));

export function ChatPayments() {
  const db = useDb();
  const ws = useWorkspace();
  const { connectPayments, disconnectPayments, updatePayments, simulatePayment, matchPayment } = useActions();
  const ps = db.settings.payments;
  const money = (n: number) => formatCurrency(n, ws.currency);
  const owing = db.orders.filter((o) => !["cancelled", "returned", "refused"].includes(o.status) && balance(o) > 0).slice(0, 40);
  const [sim, setSim] = useState({ orderId: owing[0]?.id ?? "", method: "transfer" as PaymentEvent["method"], amount: "" });
  const [stranger, setStranger] = useState({ name: "ADEBAYO JOHNSON", amount: "50000" });
  const [match, setMatch] = useState<Record<string, string>>({});
  const unmatched = db.paymentEvents.filter((e) => e.status === "unmatched");
  const [acc, setAcc] = useState({ label: "", bank: "", accountNumber: "", accountName: "" });
  const categories = [...new Set(db.products.map((p) => p.category))];
  const simOrder = db.orders.find((o) => o.id === sim.orderId);

  if (ps.status !== "connected") {
    return (
      <Section title="Get paid inside WhatsApp" description="Each customer gets their own account number. When they transfer, Bizriva confirms it in seconds, marks the order paid and sends a receipt into their chat." action={<StatusBadge>Not connected</StatusBadge>}>
        <div className="space-y-3 p-4 text-sm">
          <p className="font-medium">Choose your payment provider</p>
          <div className="grid gap-2 md:grid-cols-3">
            {PROVIDERS.map((p) => (
              <button key={p.id} type="button" onClick={() => connectPayments(p.id)} className="rounded-lg border bg-card p-3 text-left hover:border-primary/60" aria-label={`Connect ${p.name}`}>
                <span className="block font-semibold">{p.name}</span><span className="block text-xs text-muted-foreground">{p.what}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Practice Mode simulates the connection. Live, you paste your secret key into Vercel (for example PAYSTACK_SECRET_KEY) and Bizriva listens to the provider's payment notifications. Customer account numbers need a registered business that has gone live with the provider. WhatsApp's own in-chat payments aren't available in Nigeria yet — this is the fastest way that works today.</p>
        </div>
      </Section>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Get paid inside WhatsApp" description={`${PROVIDERS.find((p) => p.id === ps.provider)?.name} · connected ${ps.connectedAt ? relativeTime(ps.connectedAt) : ""}`} action={<StatusBadge tone="info">Connected (simulated)</StatusBadge>}>
        <div className="grid gap-4 p-4 text-sm md:grid-cols-2">
          <div className="space-y-2" role="group" aria-label="Ways to pay">
            <p className="font-medium">Ways to pay offered in the chat</p>
            {([["transfer", "Bank transfer to their own account number (instant)"], ["link", "Payment link: card, USSD or bank app"], ["cod", "Pay on delivery"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center justify-between gap-3">{l}<Switch checked={ps.methods[k]} onCheckedChange={(v) => updatePayments({ methods: { ...ps.methods, [k]: v } })} aria-label={l} /></label>
            ))}
          </div>
          <div className="space-y-2">
            <p className="font-medium">When money lands</p>
            <label className="flex items-center justify-between gap-3">Send a receipt into the chat<Switch checked={ps.autoReceipt} onCheckedChange={(v) => updatePayments({ autoReceipt: v })} aria-label="Send a receipt into the chat" /></label>
            <label className="flex items-center justify-between gap-3">Paid orders skip COD checks and move to Confirmed<Switch checked={ps.autoConfirm} onCheckedChange={(v) => updatePayments({ autoConfirm: v })} aria-label="Paid orders skip COD checks" /></label>
            <Button size="sm" variant="ghost" className="px-0" onClick={disconnectPayments}>Disconnect</Button>
          </div>
        </div>
      </Section>

      <Section title="Practice: a customer pays" description="What happens the moment the provider tells Bizriva money arrived" action={<Zap className="size-4 text-warning" aria-hidden="true" />}>
        <div className="grid gap-3 p-4 text-sm md:grid-cols-[1fr_auto_auto_auto] md:items-end">
          <div className="min-w-0 space-y-1"><span className="text-xs text-muted-foreground">Order</span>
            <Select value={sim.orderId} onValueChange={(v) => setSim({ ...sim, orderId: v, amount: "" })}>
              <SelectTrigger aria-label="Order being paid"><SelectValue>{simOrder ? `${simOrder.reference} · ${fullName(db.contacts.find((c) => c.id === simOrder.contactId)!)} · owes ${money(balance(simOrder))}` : "Pick an order"}</SelectValue></SelectTrigger>
              <SelectContent>{owing.map((o) => <SelectItem key={o.id} value={o.id}>{o.reference} · {fullName(db.contacts.find((c) => c.id === o.contactId)!)} · owes {money(balance(o))}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Select value={sim.method} onValueChange={(v) => setSim({ ...sim, method: v as PaymentEvent["method"] })}>
            <SelectTrigger className="w-36" aria-label="How they pay"><SelectValue>{sim.method === "transfer" ? "Bank transfer" : sim.method === "card" ? "Card" : "USSD"}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="transfer">Bank transfer</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="ussd">USSD</SelectItem></SelectContent>
          </Select>
          <Input className="w-36" type="number" aria-label="Amount paid" placeholder={simOrder ? String(balance(simOrder)) : "Amount"} value={sim.amount} onChange={(e) => setSim({ ...sim, amount: e.target.value })} />
          <Button disabled={!simOrder} onClick={() => { simulatePayment({ orderId: sim.orderId, method: sim.method, amount: Number(sim.amount) || balance(simOrder!) }); setSim({ ...sim, amount: "" }); }}>Customer pays</Button>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t px-4 py-3 text-sm">
          <span className="text-xs text-muted-foreground">Or someone transfers to your main account without a reference:</span>
          <Input className="h-8 w-48" aria-label="Sender name" value={stranger.name} onChange={(e) => setStranger({ ...stranger, name: e.target.value })} />
          <Input className="h-8 w-28" type="number" aria-label="Unmatched amount" value={stranger.amount} onChange={(e) => setStranger({ ...stranger, amount: e.target.value })} />
          <Button size="sm" variant="outline" onClick={() => simulatePayment({ amount: Number(stranger.amount), method: "transfer", payerName: stranger.name, toMain: true })}>Transfer arrives</Button>
        </div>
      </Section>

      {unmatched.length > 0 && (
        <Section title="Transfers to match" description="Money that arrived without a customer account or reference">
          <ul className="divide-y text-sm">
            {unmatched.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="min-w-0 flex-1"><span className="font-medium">{money(e.amount)}</span> from {e.payerName} <span className="text-xs text-muted-foreground">· {relativeTime(e.at)}</span></span>
                <Select value={match[e.id] ?? ""} onValueChange={(v) => setMatch({ ...match, [e.id]: v })}>
                  <SelectTrigger className="h-8 w-64" aria-label={`Order for ${e.payerName}`}><SelectValue>{db.orders.find((o) => o.id === match[e.id])?.reference ?? "Which order is it for?"}</SelectValue></SelectTrigger>
                  <SelectContent>{owing.map((o) => <SelectItem key={o.id} value={o.id}>{o.reference} · {fullName(db.contacts.find((c) => c.id === o.contactId)!)} · {money(balance(o))}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" disabled={!match[e.id]} onClick={() => matchPayment(e.id, match[e.id]!)}>Match</Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Live payments" description="Every payment the provider reports, newest first">
        {db.paymentEvents.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nothing yet. Request a payment from a chat, or use the practice panel above.</p> : (
          <ul className="divide-y text-sm" aria-label="Live payments">
            {db.paymentEvents.slice(0, 30).map((e) => {
              const o = db.orders.find((x) => x.id === e.orderId);
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <Banknote className="size-4 text-success" aria-hidden="true" />
                  <span className="num font-semibold">{money(e.amount)}</span>
                  <span className="min-w-0 flex-1 truncate">{e.payerName} · {e.method === "transfer" ? `transfer to ${e.paidInto}` : e.method}{o ? <> · <Link to="/orders" search={{ o: o.id }} className="text-primary hover:underline">{o.reference}</Link></> : ""}{e.receiptNo ? ` · ${e.receiptNo}` : ""}{e.settledTo.length ? ` · settles to ${e.settledTo.map((s) => `${s.label} ${money(s.amount)}`).join(", ")}` : ""}</span>
                  <StatusBadge tone={EV[e.status].tone}>{EV[e.status].label}</StatusBadge>
                  <span className="text-xs text-muted-foreground">{relativeTime(e.at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Where the money goes" description="Your settlement accounts, and optional splits by product category (for branches or partners)">
        <div className="space-y-4 p-4 text-sm">
          <ul className="space-y-1.5">
            {ps.settlement.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{a.label}</span><span className="text-muted-foreground">{a.bank} · {a.accountNumber} · {a.accountName}</span>
                {ps.defaultAccountId === a.id ? <StatusBadge tone="success">Default</StatusBadge> : <Button size="sm" variant="ghost" className="h-7" onClick={() => updatePayments({ defaultAccountId: a.id })}>Make default</Button>}
              </li>
            ))}
          </ul>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!acc.label || acc.accountNumber.replace(/\D/g, "").length !== 10) return; updatePayments({ settlement: [...ps.settlement, { id: `sa_${Date.now().toString(36)}`, ...acc }] }); setAcc({ label: "", bank: "", accountNumber: "", accountName: "" }); }}>
            <Input className="h-8 w-36" placeholder="Label (e.g. Abuja branch)" aria-label="Account label" value={acc.label} onChange={(e) => setAcc({ ...acc, label: e.target.value })} />
            <Input className="h-8 w-32" placeholder="Bank" aria-label="Bank" value={acc.bank} onChange={(e) => setAcc({ ...acc, bank: e.target.value })} />
            <Input className="h-8 w-32" placeholder="10-digit number" aria-label="Account number" value={acc.accountNumber} onChange={(e) => setAcc({ ...acc, accountNumber: e.target.value })} />
            <Input className="h-8 w-44" placeholder="Account name" aria-label="Account name" value={acc.accountName} onChange={(e) => setAcc({ ...acc, accountName: e.target.value })} />
            <Button type="submit" size="sm" variant="outline"><Plus className="size-4" /> Add account</Button>
          </form>
          <div className="space-y-2">
            <p className="font-medium">Split rules</p>
            {ps.splits.length === 0 && <p className="text-xs text-muted-foreground">No splits — everything settles to the default account.</p>}
            {ps.splits.map((r) => (
              <p key={r.id} className="flex items-center gap-2">{r.category === "all" ? "Every sale" : `${r.category} sales`} → {r.percent}% to {ps.settlement.find((a) => a.id === r.accountId)?.label}
                <Button size="icon" variant="ghost" className="size-7" aria-label="Remove split" onClick={() => updatePayments({ splits: ps.splits.filter((x) => x.id !== r.id) })}><Trash2 className="size-3.5" /></Button></p>
            ))}
            <SplitForm categories={categories} />
          </div>
        </div>
      </Section>
    </div>
  );
}

function SplitForm({ categories }: { categories: string[] }) {
  const db = useDb();
  const { updatePayments } = useActions();
  const ps = db.settings.payments;
  const [cat, setCat] = useState<string>("all");
  const [accountId, setAccountId] = useState(ps.settlement[1]?.id ?? ps.settlement[0]?.id ?? "");
  const [percent, setPercent] = useState("100");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={cat} onValueChange={setCat}><SelectTrigger className="h-8 w-40" aria-label="Split category"><SelectValue>{cat === "all" ? "Every sale" : cat}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">Every sale</SelectItem>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
      <Input className="h-8 w-20" type="number" min={1} max={100} aria-label="Split percent" value={percent} onChange={(e) => setPercent(e.target.value)} />
      <span>% to</span>
      <Select value={accountId} onValueChange={setAccountId}><SelectTrigger className="h-8 w-40" aria-label="Split account"><SelectValue>{ps.settlement.find((a) => a.id === accountId)?.label}</SelectValue></SelectTrigger><SelectContent>{ps.settlement.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent></Select>
      <Button size="sm" variant="outline" disabled={!(Number(percent) > 0 && Number(percent) <= 100)} onClick={() => updatePayments({ splits: [...ps.splits, { id: `sp_${Date.now().toString(36)}`, category: cat, accountId, percent: Number(percent) }] })}>Add split</Button>
    </div>
  );
}
