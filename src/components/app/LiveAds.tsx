/**
 * Ads on real data: link the Meta ad account (spend comes in every 4 hours)
 * and see, per ad, the chats it started, orders, delivered orders and revenue,
 * spend, ROAS and cost per delivered order — counted on delivery.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { formatCurrency, relativeTime, type CurrencyCode } from "@/lib/format";

interface AdRow { adId: string; ad: string; campaign: string | null; people: number; orders: number; delivered: number; lost: number; revenue: number; spend: number; clicks: number; roas: number | null; costPerDelivered: number | null }
interface Perf { currency: string | null; lastSync: string | null; ads: AdRow[]; unattributed: { orders: number; delivered: number } }
const RANGES = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days" } as const;
const day = (d: Date) => d.toISOString().slice(0, 10);

export function LiveAds() {
  const { current } = useAuth();
  const ws = current?.workspaceId;
  const canLink = current?.role === "owner" || current?.role === "manager";
  const [range, setRange] = useState<keyof typeof RANGES>("30");
  const [p, setP] = useState<Perf | null>(null);
  const [link, setLink] = useState<{ ad_account_id: string; last_sync_at: string | null } | null | undefined>(undefined);
  const [f, setF] = useState({ account: "", token: "" });
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const to = new Date(), from = new Date(Date.now() - (Number(range) - 1) * 86_400_000);
    const [perf, l] = await Promise.all([sb.rpc("ad_performance", { p_workspace: ws, p_from: day(from), p_to: day(to) }), sb.from("meta_links").select("ad_account_id, last_sync_at").eq("workspace_id", ws).maybeSingle()]);
    setP((perf.data as Perf | null) ?? null);
    setLink((l.data as { ad_account_id: string; last_sync_at: string | null } | null) ?? null);
  }, [ws, range]);
  useEffect(() => { void load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = supabase(); if (!sb || !ws) return;
    const acct = f.account.trim().startsWith("act_") ? f.account.trim() : `act_${f.account.trim()}`;
    const { error } = await sb.rpc("save_meta_token", { p_workspace: ws, p_ad_account: acct, p_token: f.token.trim() });
    if (error) return setMsg({ error: error.message });
    setF({ account: "", token: "" }); setMsg({ ok: "Ad account linked — spend arrives within 4 hours." }); void load();
  };

  const cur = (p?.currency ?? "NGN") as CurrencyCode;
  const money = (n: number) => formatCurrency(n, cur);
  const tot = (p?.ads ?? []).reduce((a, x) => ({ spend: a.spend + Number(x.spend), revenue: a.revenue + Number(x.revenue), delivered: a.delivered + x.delivered, people: a.people + x.people }), { spend: 0, revenue: 0, delivered: 0, people: 0 });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Ad spend" value={money(tot.spend)} hint={RANGES[range]} />
        <KpiCard label="Delivered revenue from ads" value={money(tot.revenue)} tone="success" />
        <KpiCard label="Return on ad spend" value={tot.spend ? `${(tot.revenue / tot.spend).toFixed(2)}×` : "—"} hint="Delivered revenue ÷ spend" tone="brand" />
        <KpiCard label="Cost per delivered order" value={tot.delivered && tot.spend ? money(tot.spend / tot.delivered) : "—"} hint={`${tot.people} chats and leads from ads`} tone="info" />
      </div>
      <Section title="Results by ad" action={<Select value={range} onValueChange={(v) => setRange(v as keyof typeof RANGES)}><SelectTrigger className="h-8 w-36" aria-label="Period"><SelectValue>{RANGES[range]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(RANGES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>}>
        {!p || p.ads.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No ad results yet. Chats from click-to-WhatsApp, Messenger and Instagram ads, and instant-form leads, are credited to their ad automatically.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Results by ad">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2">Ad</th><th className="px-2 py-2 text-right">Chats/leads</th><th className="px-2 py-2 text-right">Orders</th><th className="px-2 py-2 text-right">Delivered</th><th className="px-2 py-2 text-right">Revenue</th><th className="px-2 py-2 text-right">Spend</th><th className="px-2 py-2 text-right">ROAS</th><th className="px-4 py-2 text-right">Per delivered order</th></tr></thead>
              <tbody className="divide-y">
                {p.ads.map((a) => (
                  <tr key={a.adId}>
                    <td className="px-4 py-2"><p className="font-medium">{a.ad}</p>{a.campaign && <p className="text-xs text-muted-foreground">{a.campaign}</p>}</td>
                    <td className="num px-2 py-2 text-right">{a.people}</td><td className="num px-2 py-2 text-right">{a.orders}{a.lost ? <span className="text-xs text-muted-foreground"> ({a.lost} lost)</span> : null}</td>
                    <td className="num px-2 py-2 text-right">{a.delivered}</td><td className="num px-2 py-2 text-right">{money(Number(a.revenue))}</td><td className="num px-2 py-2 text-right">{money(Number(a.spend))}</td>
                    <td className="num px-2 py-2 text-right">{a.roas !== null ? <StatusBadge tone={a.roas >= 2 ? "success" : a.roas >= 1 ? "warning" : "danger"}>{Number(a.roas).toFixed(2)}×</StatusBadge> : "—"}</td>
                    <td className="num px-4 py-2 text-right">{a.costPerDelivered !== null ? money(Number(a.costPerDelivered)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {p && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Not from an ad: {p.unattributed.orders} orders ({p.unattributed.delivered} delivered). Revenue counts only delivered orders — with pay on delivery, an order isn't money until it arrives.</p>}
      </Section>
      <Section title="Meta ad account" action={link ? <StatusBadge tone="success">Linked</StatusBadge> : <StatusBadge>Not linked</StatusBadge>}>
        <div className="space-y-2 p-4 text-sm">
          {link && <p>Ad account <span className="font-mono">{link.ad_account_id}</span> · {link.last_sync_at ? `spend updated ${relativeTime(link.last_sync_at)}` : "waiting for the first spend update (every 4 hours)"}</p>}
          {canLink ? (
            <form aria-label="Link Meta ad account" className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={(e) => void save(e)}>
              <div className="space-y-1"><Label htmlFor="ad-acct">Ad account ID</Label><Input id="ad-acct" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} placeholder="act_1234567890" /></div>
              <div className="space-y-1"><Label htmlFor="ad-token">Access token with ads_read</Label><Input id="ad-token" type="password" autoComplete="off" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} placeholder="System-user token from Business Settings" /></div>
              <Button type="submit" size="sm">{link ? "Update" : "Link"}</Button>
            </form>
          ) : <p className="text-xs text-muted-foreground">An owner or manager links the ad account.</p>}
          {msg.ok && <p className="text-success" role="status">{msg.ok}</p>}
          {msg.error && <p className="text-destructive" role="alert">{msg.error}</p>}
        </div>
      </Section>
    </div>
  );
}
