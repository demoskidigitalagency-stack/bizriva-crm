import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Activity as ActivityIcon, BadgeDollarSign, BellRing, Boxes, BrainCircuit, PackageCheck,
  ShoppingCart, TrendingUp, Users, Wallet, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard, PageHeader, Section, StatusBadge } from "@/components/app/primitives";
import { ContactDialog } from "@/components/app/dialogs";
import { useDb, useWorkspace } from "@/domain/store";
import { getDashboard } from "@/domain/repositories";
import { buildBrief, briefText } from "@/domain/brief";
import { NOW } from "@/domain/database";
import { BriefActions, ListenButton } from "./brief";
import { LIFECYCLE_META, SOURCE_LABELS, type ActivityKind } from "@/domain/types";
import { formatCurrency, formatNumber, formatPercent, relativeTime } from "@/lib/format";
import type { CurrencyCode } from "@/lib/format";
import { PersonAvatar } from "@/components/app/primitives";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Bizriva CRM" },
      { name: "description", content: "Revenue, fulfilment, ad performance and customer health across the workspace." },
      { property: "og:title", content: "Dashboard · Bizriva CRM" },
      { property: "og:description", content: "Revenue, fulfilment, ad performance and customer health across the workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const KIND_ICON: Record<ActivityKind, typeof Zap> = {
  acquisition: Users,
  conversation: Zap,
  lead: TrendingUp,
  order: ShoppingCart,
  delivery: PackageCheck,
  payment: Wallet,
  task: Zap,
  note: Zap,
  marketing: BadgeDollarSign,
  system: ActivityIcon,
};

function TrendChart({ trend, currency }: { trend: { date: string; revenue: number; deliveredRevenue: number; profit: number; adSpend: number }[]; currency: CurrencyCode }) {
  const max = Math.max(...trend.map((d) => d.revenue), 1);
  return (
    <div>
      <div className="flex h-44 items-end gap-1 sm:gap-1.5">
        {trend.map((d) => (
          <div key={d.date} className="flex h-full flex-1 items-end gap-[2px]" title={`${d.date} — Revenue ${formatCurrency(d.revenue, currency, { compact: true })}, delivered ${formatCurrency(d.deliveredRevenue, currency, { compact: true })}, profit ${formatCurrency(d.profit, currency, { compact: true })}`}>
            <div className="h-full flex-1 rounded-t-sm bg-muted" style={{ height: `${(d.revenue / max) * 100}%` }} />
            <div className="h-full flex-1 rounded-t-sm bg-primary" style={{ height: `${(d.deliveredRevenue / max) * 100}%` }} />
            <div className="h-full flex-1 rounded-t-sm bg-success/60" style={{ height: `${(d.profit / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-muted" /> Revenue</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary" /> Delivered revenue</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-success/60" /> Contribution profit</span>
      </div>
    </div>
  );
}

function BarRow({ label, value, max, right, tone = "primary" }: { label: string; value: number; max: number; right: string; tone?: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-24 shrink-0 truncate text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone === "primary" ? "bg-primary" : "bg-info"}`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="num w-20 shrink-0 text-right font-semibold">{right}</span>
    </div>
  );
}

function MorningBrief() {
  const db = useDb();
  const ws = useWorkspace();
  const b = useMemo(() => buildBrief(db, NOW), [db]);
  if (!db.settings.brief.channels.includes("app")) return null;
  return (
    <Section title="☀️ Morning Money Brief" description={b.headline} className="mb-4" action={<div className="flex gap-2"><ListenButton text={briefText(b, ws.name, (n) => formatCurrency(n, ws.currency))} /><Button asChild size="sm" variant="outline"><Link to="/brief">Open brief</Link></Button></div>}>
      <BriefActions actions={b.actions.slice(0, 3)} />
    </Section>
  );
}

function Dashboard() {
  const db = useDb();
  const ws = useWorkspace();
  const team = db.team.filter((t) => t.active);
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [owner, setOwner] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const data = useMemo(
    () => getDashboard(db, { rangeDays: Number(range) as 7 | 30 | 90, ownerId: owner }),
    [db, range, owner],
  );
  const k = data.kpis;
  const fmt = (v: number, compact = false) => formatCurrency(v, ws.currency, { compact });
  const funnelMax = Math.max(...data.funnel.map((f) => f.value), 1);
  const trend = range === "7" ? data.trend.slice(-7) : range === "90" ? data.trend : data.trend;

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description={`${ws.name} · last 30 days at a glance`}
        actions={
          <>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="h-8 w-40"><SelectValue>{owner === "all" ? "All reps" : team.find((t) => t.id === owner)?.name ?? "All reps"}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                {team.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={(v) => setRange(v as "7" | "30" | "90")}>
              <SelectTrigger className="h-8 w-32"><SelectValue>{`Last ${range} days`}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setCreateOpen(true)}>New contact</Button>
          </>
        }
      />

      <MorningBrief />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Revenue" value={fmt(k.revenue, true)} hint="all orders in range" icon={<Wallet className="size-4" />} />
        <KpiCard label="Delivered Revenue" value={fmt(k.deliveredRevenue, true)} hint={`${k.deliveredOrders} delivered orders`} icon={<PackageCheck className="size-4" />} tone="success" />
        <KpiCard label="Contribution Profit" value={fmt(k.contributionProfit, true)} hint="delivered, after COGS + shipping" icon={<TrendingUp className="size-4" />} tone="info" />
        <KpiCard label="Orders" value={formatNumber(k.orders)} hint="placed in range" icon={<ShoppingCart className="size-4" />} />
        <KpiCard label="Delivered Orders" value={formatNumber(k.deliveredOrders)} hint={`${k.orders ? Math.round((k.deliveredOrders / k.orders) * 100) : 0}% of orders`} icon={<Boxes className="size-4" />} tone="success" />
        <KpiCard label="New Leads" value={formatNumber(k.newLeads)} hint="captured in range" icon={<Users className="size-4" />} />
        <KpiCard label="Conversion Rate" value={formatPercent(k.conversionRate)} hint="leads won in range" icon={<Zap className="size-4" />} tone="info" />
        <KpiCard label="Ad Spend" value={fmt(k.adSpend, true)} hint="scaled to range" icon={<BadgeDollarSign className="size-4" />} tone="warning" />
        <KpiCard label="Delivered ROAS" value={`${k.deliveredRoas.toFixed(2)}×`} hint="delivered revenue ÷ ad spend" icon={<Zap className="size-4" />} tone="brand" />
        <KpiCard label="COD Outstanding" value={fmt(k.codOutstanding, true)} hint="cash pending on delivery" icon={<BellRing className="size-4" />} tone="danger" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Section title="Revenue & profit trend" description="Daily revenue, delivered revenue and contribution profit" className="lg:col-span-2">
          <TrendChart trend={trend} currency={ws.currency} />
        </Section>
        <Section title="Acquisition funnel" description="How the range's audience narrowed into delivered orders">
          <div className="space-y-3">
            {data.funnel.map((f) => (
              <BarRow key={f.stage} label={f.stage} value={f.value} max={funnelMax} right={formatNumber(f.value)} />
            ))}
          </div>
        </Section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="Sales performance" description="Leads owned, orders placed and conversion per rep">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Rep</th>
                  <th className="pb-2 text-right font-medium">Leads</th>
                  <th className="pb-2 text-right font-medium">Orders</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                  <th className="pb-2 text-right font-medium">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {data.salesPerformance.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2"><span className="flex items-center gap-2"><PersonAvatar name={r.name} /> {r.name}</span></td>
                    <td className="num py-2 text-right">{r.leads}</td>
                    <td className="num py-2 text-right">{r.orders}</td>
                    <td className="num py-2 text-right font-medium">{fmt(r.revenue, true)}</td>
                    <td className="num py-2 text-right">{formatPercent(r.conversion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Ad performance" description="Spend, revenue and return per campaign" action={<Button asChild size="sm" variant="outline"><Link to="/ads">All campaigns</Link></Button>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Campaign</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Spend</th>
                  <th className="pb-2 text-right font-medium">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {data.ads.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.platform} · {c.leads} leads</p>
                    </td>
                    <td className="py-2"><StatusBadge tone={c.status === "active" ? "success" : c.status === "review_needed" ? "warning" : "neutral"}>{c.status.replace("_", " ")}</StatusBadge></td>
                    <td className="num py-2 text-right">{fmt(c.spend, true)}</td>
                    <td className="num py-2 text-right font-semibold">{c.roas.toFixed(2)}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Section title="Order & fulfilment summary" description="Where every order currently sits" action={<Button asChild size="sm" variant="outline"><Link to="/today">Work the queues</Link></Button>}>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {[
              ["Pending confirmation", data.fulfilment.pendingConfirmation, "warning"],
              ["Awaiting dispatch", data.fulfilment.awaitingDispatch, "brand"],
              ["In transit", data.fulfilment.inTransit, "info"],
              ["Delivered", data.fulfilment.delivered, "success"],
              ["Failed deliveries", data.fulfilment.failed, "danger"],
              ["Returned", data.fulfilment.returned, "neutral"],
            ].map(([label, value, tone]) => (
              <div key={label as string} className="rounded-md border p-3">
                <p className="num text-lg font-bold">{value as number}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{label as string}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Reactivation opportunities" description="Highest-value customers gone quiet">
          <ul className="space-y-2">
            {data.reactivation.length === 0 && <li className="text-sm text-muted-foreground">No reactivation candidates right now.</li>}
            {data.reactivation.map((c) => (
              <li key={c.id}>
                <Link to="/crm/contacts/$contactId" params={{ contactId: c.id }} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm hover:bg-accent/40">
                  <span className="flex min-w-0 items-center gap-2">
                    <PersonAvatar name={`${c.firstName} ${c.lastName}`} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.firstName} {c.lastName}</span>
                      <span className="block text-xs text-muted-foreground">{LIFECYCLE_META[c.lifecycle].label} · {c.city}</span>
                    </span>
                  </span>
                  <span className="num shrink-0 text-right text-xs font-semibold">{fmt(c.lifetimeValue, true)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Recent activity" description="Across the whole workspace">
          <ul className="space-y-2.5">
            {data.recentActivity.map((a) => {
              const Icon = KIND_ICON[a.kind];
              return (
                <li key={a.id} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-muted"><Icon className="size-3" /></span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.description ?? SOURCE_LABELS[a.kind as keyof typeof SOURCE_LABELS] ?? a.kind} · {relativeTime(a.at)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>

      <ContactDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
