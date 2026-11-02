import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Phone, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, KpiCard, PersonAvatar, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { codRisk, fullName } from "@/domain/repositories";
import { ORDER_STATUS_META, type OrderSummary } from "@/domain/types";
import { formatCurrency, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cod")({
  head: () => ({ meta: [{ title: "COD Verification · Bizriva CRM" }] }),
  component: CodVerification,
});

const CHECKS = [
  { id: "name", label: "Customer name confirmed" },
  { id: "phone", label: "Phone number confirmed" },
  { id: "address", label: "Delivery address and landmark confirmed" },
  { id: "items", label: "Product and quantity confirmed" },
  { id: "amount", label: "Total amount confirmed, including delivery" },
  { id: "terms", label: "Customer understands they pay cash on delivery" },
] as const;

const RISK_TONE = { low: "success", medium: "warning", high: "danger" } as const;

function VerifyCard({ order }: { order: OrderSummary }) {
  const db = useDb();
  const ws = useWorkspace();
  const { recordCodCheck } = useActions();
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const c = db.contacts.find((x) => x.id === order.contactId);
  const risk = codRisk(db, order);
  const all = CHECKS.every((k) => ticked[k.id]);
  const attempts = db.activities.filter((a) => a.title === `COD check: customer unreachable for ${order.reference}`).length;

  return (
    <Section
      title={`${order.reference} · ${formatCurrency(order.total, ws.currency)}`}
      description={`${order.productNames.join(", ")} · placed ${relativeTime(order.placedAt)}`}
      action={<StatusBadge tone={RISK_TONE[risk.level]}>{risk.level === "low" ? "Low risk" : risk.level === "medium" ? "Check carefully" : "High risk — human review"}</StatusBadge>}
    >
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div className="space-y-3 text-sm">
          {c && (
            <div className="flex items-center gap-3 rounded-md border p-3">
              <Link to="/crm/contacts/$contactId" params={{ contactId: c.id }} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
                <PersonAvatar name={fullName(c)} size="md" />
                <span className="min-w-0">
                  <span className="block font-medium">{fullName(c)}</span>
                  <span className="block text-xs text-muted-foreground">{c.phone} · {c.city} · {c.totalOrders} previous order{c.totalOrders === 1 ? "" : "s"}</span>
                </span>
              </Link>
              <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="rounded-md border p-2 hover:bg-muted" aria-label={`Call ${fullName(c)}`}><Phone className="size-4" /></a>
            </div>
          )}
          {risk.reasons.length > 0 ? (
            <ul className="space-y-1 rounded-md bg-muted p-3 text-xs">
              {risk.reasons.map((r) => <li key={r} className="flex gap-1.5"><ShieldAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />{r}</li>)}
            </ul>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-success" aria-hidden="true" />No risk signals. Still confirm every detail.</p>
          )}
          {attempts > 0 && <p className="text-xs text-muted-foreground">Tried {attempts} time{attempts === 1 ? "" : "s"} without reaching the customer.</p>}
        </div>

        <div className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confirm with the customer</legend>
            {CHECKS.map((k) => (
              <label key={k.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={!!ticked[k.id]} onCheckedChange={(v) => setTicked((t) => ({ ...t, [k.id]: v === true }))} />
                {k.label}
              </label>
            ))}
          </fieldset>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, for example: deliver after 4pm, landmark is the blue gate" rows={2} aria-label="Verification note" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!all} onClick={() => recordCodCheck(order.id, "confirmed", note || undefined)}>Customer confirmed</Button>
            <Button size="sm" variant="outline" onClick={() => { recordCodCheck(order.id, "unreachable", note || undefined); setNote(""); }}>Couldn't reach them</Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => recordCodCheck(order.id, "cancelled", note || undefined)}>Customer cancelled</Button>
          </div>
          {!all && <p className="text-xs text-muted-foreground">Tick all six to confirm. The order never confirms on details the customer didn't give.</p>}
        </div>
      </div>
    </Section>
  );
}

function CodVerification() {
  const db = useDb();
  const ws = useWorkspace();
  const [view, setView] = useState<"pending" | "high" | "done">("pending");

  const cod = db.orders.filter((o) => o.paymentMethod === "cash_on_delivery");
  const pending = cod.filter((o) => o.status === "pending_confirmation").sort((a, b) => +new Date(a.placedAt) - +new Date(b.placedAt));
  const high = pending.filter((o) => codRisk(db, o).level === "high");
  const done = cod.filter((o) => o.status !== "pending_confirmation").sort((a, b) => +new Date(b.placedAt) - +new Date(a.placedAt)).slice(0, 25);
  const atRisk = pending.reduce((s, o) => s + o.total, 0);
  const shown = view === "pending" ? pending : view === "high" ? high : [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Sales</p>
        <h1 className="text-2xl font-bold">COD Verification</h1>
        <p className="mt-1 text-sm text-muted-foreground">Confirm every cash-on-delivery order with the customer before a rider goes out. Risk flags ask for extra care; they never block a new customer on their own.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Waiting to confirm" value={String(pending.length)} tone="warning" />
        <KpiCard label="High risk" value={String(high.length)} tone={high.length ? "danger" : "success"} />
        <KpiCard label="Cash waiting on confirmation" value={formatCurrency(atRisk, ws.currency, { compact: true })} tone="info" />
        <KpiCard label="COD orders" value={String(cod.length)} />
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList>
          <TabsTrigger value="pending">To confirm ({pending.length})</TabsTrigger>
          <TabsTrigger value="high">High risk ({high.length})</TabsTrigger>
          <TabsTrigger value="done">Recently checked</TabsTrigger>
        </TabsList>
      </Tabs>

      {view !== "done" ? (
        shown.length === 0 ? <Section><EmptyState title="All caught up" description="New cash-on-delivery orders land here automatically." /></Section> : shown.map((o) => <VerifyCard key={o.id} order={o} />)
      ) : (
        <Section>
          <ul className="divide-y">
            {done.map((o) => {
              const c = db.contacts.find((x) => x.id === o.contactId);
              return (
                <li key={o.id}>
                  <Link to="/orders" search={{ o: o.id }} className={cn("flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/40")}>
                    <span className="num font-semibold">{o.reference}</span>
                    <span className="flex-1">{c ? fullName(c) : ""}</span>
                    <StatusBadge tone={ORDER_STATUS_META[o.status].tone}>{ORDER_STATUS_META[o.status].label}</StatusBadge>
                    <span className="num">{formatCurrency(o.total, ws.currency)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
