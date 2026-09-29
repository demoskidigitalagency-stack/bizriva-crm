import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAppData } from "@/state/AppData";
import { getDashboard } from "@/domain/repositories";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { KpiCard, PageHeader, SectionCard, Pill } from "@/components/Common";

export function DashboardPage() {
  const { db } = useAppData();
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const data = useMemo(() => getDashboard(db, { rangeDays: range }), [db, range]);
  const k = data.kpis;

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Your business performance and the work that needs attention."
        actions={
          <div className="flex rounded-lg border bg-card p-1">
            {([7, 30, 90] as const).map((d) => (
              <button key={d} onClick={() => setRange(d)} className={"rounded-md px-3 py-1.5 text-sm " + (range === d ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {d}d
              </button>
            ))}
          </div>
        }
      />
      <div className="space-y-5 p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Revenue" value={formatCurrency(k.revenue, "NGN", { compact: true })} note={String(k.orders) + " orders"} />
          <KpiCard label="Delivered revenue" value={formatCurrency(k.deliveredRevenue, "NGN", { compact: true })} note={String(k.deliveredOrders) + " delivered"} tone="success" />
          <KpiCard label="Contribution profit" value={formatCurrency(k.contributionProfit, "NGN", { compact: true })} note="After variable costs" tone="success" />
          <KpiCard label="New leads" value={formatNumber(k.newLeads)} note={formatPercent(k.conversionRate) + " conversion"} />
          <KpiCard label="COD outstanding" value={formatCurrency(k.codOutstanding, "NGN", { compact: true })} note="Needs reconciliation" tone={k.codOutstanding > 0 ? "warning" : "default"} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <SectionCard title="Revenue performance" subtitle={"Last " + range + " days"}>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => String(Math.round(v / 1000000)) + "M"} width={42} />
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value), "NGN", { compact: true })} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" fill="var(--color-accent)" strokeWidth={2} />
                  <Area type="monotone" dataKey="deliveredRevenue" stroke="var(--color-success)" fill="transparent" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard title="Acquisition funnel" subtitle="Contact-to-delivered conversion">
            <div className="space-y-3">
              {data.funnel.map((f: any) => {
                const max = data.funnel[0]?.value || 1;
                return (
                  <div key={f.stage}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{f.stage}</span>
                      <span className="font-semibold num">{formatNumber(f.value)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary" style={{ width: String(Math.max(5, (f.value / max) * 100)) + "%" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard title="Reactivation opportunities" subtitle="Customers with value at risk">
            <div className="space-y-2">
              {data.reactivation.slice(0, 6).map((c: any) => (
                <Link to={"/contacts/" + c.id} key={c.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted">
                  <div>
                    <div className="text-sm font-medium">{c.firstName} {c.lastName}</div>
                    <div className="text-xs text-muted-foreground">{c.city} · {c.totalOrders} orders</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{formatCurrency(c.lifetimeValue, "NGN", { compact: true })}</div>
                    <Pill tone={c.lifecycle === "dormant" ? "neutral" : "warning"}>{String(c.lifecycle).replace("_", " ")}</Pill>
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Commercial efficiency" subtitle="Marketing to delivered revenue">
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Ad spend" value={formatCurrency(k.adSpend, "NGN", { compact: true })} />
              <KpiCard label="Delivered ROAS" value={k.deliveredRoas.toFixed(1) + "×"} />
              <KpiCard label="Conversion" value={formatPercent(k.conversionRate)} />
              <KpiCard label="Delivered" value={formatNumber(k.deliveredOrders)} />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
