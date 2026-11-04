import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard, Section } from "@/components/app/primitives";
import { useDb, useWorkspace } from "@/domain/store";
import { NOW } from "@/domain/database";
import { CHANNEL_LABELS, type Channel } from "@/domain/types";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics · Bizriva CRM" }] }),
  component: Analytics,
});

function Bars({ rows, format }: { rows: { label: string; value: number; sub?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2 p-4">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex items-baseline justify-between gap-2"><span className="truncate">{r.label}</span><span className="num shrink-0 font-semibold">{format(r.value)}{r.sub ? <span className="ml-1 text-xs font-normal text-muted-foreground">{r.sub}</span> : null}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Analytics() {
  const db = useDb();
  const ws = useWorkspace();
  const [days, setDays] = useState<"7" | "30" | "90" | "all">("30");
  const since = days === "all" ? 0 : NOW.getTime() - Number(days) * 86_400_000;
  const orders = db.orders.filter((o) => new Date(o.placedAt).getTime() >= since);
  const money = (n: number) => formatCurrency(n, ws.currency, { compact: true });

  const created = orders.length;
  const confirmed = orders.filter((o) => !["pending_verification", "cancelled"].includes(o.status)).length;
  const dispatched = orders.filter((o) => ["dispatched", "in_transit", "delivered", "refused", "returned"].includes(o.status)).length;
  const delivered = orders.filter((o) => o.status === "delivered");
  const returned = orders.filter((o) => o.status === "returned" || o.status === "refused").length;
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const realised = delivered.reduce((s, o) => s + o.total, 0);
  const booked = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);

  const productTotals = new Map<string, number>();
  delivered.forEach((o) => o.productNames.forEach((p) => {
    const [, qty, name] = p.match(/^(\d+)× (.+)$/) ?? [, "1", p];
    productTotals.set(name!, (productTotals.get(name!) ?? 0) + Number(qty));
  }));

  const cityStats = new Map<string, { done: number; total: number }>();
  db.deliveries.filter((d) => ["delivered", "failed", "returned"].includes(d.status)).forEach((d) => {
    const e = cityStats.get(d.city) ?? { done: 0, total: 0 };
    e.total++; if (d.status === "delivered") e.done++;
    cityStats.set(d.city, e);
  });

  const channels = new Map<Channel, number>();
  orders.forEach((o) => channels.set(o.channel, (channels.get(o.channel) ?? 0) + o.total));

  const ids = new Set(orders.map((o) => o.contactId));
  const agents = db.team.filter((t) => ["sales_rep", "manager", "owner"].includes(t.role)).map((t) => {
    const mine = db.contacts.filter((c) => c.ownerId === t.id);
    const leads = db.leads.filter((l) => l.ownerId === t.id);
    const won = leads.filter((l) => l.stage === "converted").length;
    const rev = orders.filter((o) => o.status === "delivered" && mine.some((c) => c.id === o.contactId)).reduce((s, o) => s + o.total, 0);
    return { t, leads: leads.length, won, rev, buyers: mine.filter((c) => ids.has(c.id)).length };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Insights</p>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Created, confirmed and delivered are counted separately. Cash on delivery isn't revenue until it's delivered.</p>
        </div>
        <Tabs value={days} onValueChange={(v) => setDays(v as typeof days)}>
          <TabsList><TabsTrigger value="7">7 days</TabsTrigger><TabsTrigger value="30">30 days</TabsTrigger><TabsTrigger value="90">90 days</TabsTrigger><TabsTrigger value="all">All</TabsTrigger></TabsList>
        </Tabs>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Average order value" value={delivered.length ? money(realised / delivered.length) : "—"} hint="delivered orders" />
        <KpiCard label="Repeat customers" value={(() => { const buyers = db.contacts.filter((c) => c.totalOrders > 0); return buyers.length ? `${Math.round((buyers.filter((c) => c.totalOrders >= 2).length / buyers.length) * 100)}%` : "—"; })()} hint="of buyers, all time" tone="success" />
        <KpiCard label="Delivered revenue" value={money(realised)} hint={`${money(booked)} booked`} tone="success" />
        <KpiCard label="Orders created" value={String(created)} />
        <KpiCard label="Delivery success" value={dispatched ? `${Math.round((delivered.length / dispatched) * 100)}%` : "—"} hint={`${returned} returned`} tone="info" />
        <KpiCard label="Cancelled" value={String(cancelled)} tone={cancelled ? "warning" : "success"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Order funnel" description="How many orders reach each step">
          <Bars format={(n) => String(n)} rows={[
            { label: "Created", value: created },
            { label: "Confirmed", value: confirmed, sub: created ? `${Math.round((confirmed / created) * 100)}%` : "" },
            { label: "Dispatched", value: dispatched, sub: created ? `${Math.round((dispatched / created) * 100)}%` : "" },
            { label: "Delivered", value: delivered.length, sub: created ? `${Math.round((delivered.length / created) * 100)}%` : "" },
          ]} />
        </Section>
        <Section title="Top products" description="Units delivered">
          <Bars format={(n) => `${n} units`} rows={[...productTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }))} />
        </Section>
        <Section title="Delivery success by city" description="All time">
          <Bars format={(n) => `${n}%`} rows={[...cityStats.entries()].filter(([, v]) => v.total >= 2).map(([city, v]) => ({ label: city, value: Math.round((v.done / v.total) * 100), sub: `of ${v.total}` })).sort((a, b) => b.value - a.value).slice(0, 8)} />
        </Section>
        <Section title="Sales by channel" description="Order value, all statuses except cancelled">
          <Bars format={money} rows={[...channels.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ label: CHANNEL_LABELS[c], value: v }))} />
        </Section>
      </div>
      <Section title="Sales team" description="Leads owned, wins and delivered revenue from their customers">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Person</th><th className="px-4 py-2 text-right">Leads</th><th className="px-4 py-2 text-right">Converted</th><th className="px-4 py-2 text-right">Conversion</th><th className="px-4 py-2 text-right">Delivered revenue</th></tr></thead>
            <tbody className="divide-y">
              {agents.map((a) => (
                <tr key={a.t.id}><td className="px-4 py-2">{a.t.name}</td><td className="num px-4 py-2 text-right">{a.leads}</td><td className="num px-4 py-2 text-right">{a.won}</td><td className="num px-4 py-2 text-right">{a.leads ? `${Math.round((a.won / a.leads) * 100)}%` : "—"}</td><td className="num px-4 py-2 text-right">{money(a.rev)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">Response times and AI-versus-human handling appear once real conversations flow through the backend.</p>
      </Section>
    </div>
  );
}
