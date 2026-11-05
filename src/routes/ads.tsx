import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Megaphone, Plus, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { metaAdAccounts } from "@/domain/practice-seed";
import { CTA_LABEL } from "@/domain/adcopy";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { SOURCE_LABELS, type AcquisitionSource, type Campaign } from "@/domain/types";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/ads")({
  head: () => ({ meta: [{ title: "Ads and Attribution · Bizriva CRM" }] }),
  component: Ads,
});

const STATUS_TONE = { active: "success", paused: "neutral", review_needed: "warning" } as const;

function SpendDialog({ campaigns, onClose }: { campaigns: Campaign[]; onClose: () => void }) {
  const { addCampaignSpend, saveRecord } = useActions();
  const [id, setId] = useState(campaigns[0]?.id ?? "new");
  const [newName, setNewName] = useState("");
  const [spend, setSpend] = useState("");
  const [error, setError] = useState("");
  const save = () => {
    const amt = Number(spend.replace(/,/g, ""));
    if (!(amt > 0)) return setError("Enter the amount spent.");
    if (id === "new") {
      if (!newName.trim()) return setError("Name the new campaign.");
      saveRecord("campaigns", { name: newName.trim(), platform: "meta", status: "active", spend: amt, revenue: 0, leads: 0 });
    } else addCampaignSpend(id, amt);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add ad spend</DialogTitle><DialogDescription>Until Meta reporting is connected, enter spend by hand (or from a CSV export) so return on ad spend stays accurate.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label>Campaign</Label>
            <Select value={id} onValueChange={setId}>
              <SelectTrigger aria-label="Campaign"><SelectValue>{id === "new" ? "New campaign" : campaigns.find((c) => c.id === id)?.name}</SelectValue></SelectTrigger>
              <SelectContent>{campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}<SelectItem value="new">New campaign…</SelectItem></SelectContent>
            </Select>
          </div>
          {id === "new" && <div className="space-y-1.5"><Label htmlFor="cn">Campaign name</Label><Input id="cn" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>}
          <div className="space-y-1.5"><Label htmlFor="sp">Amount spent</Label><Input id="sp" inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} placeholder="50000" /></div>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetaConnect() {
  const db = useDb();
  const { connectMeta, disconnectMeta, syncMeta, setCapi } = useActions();
  const [picking, setPicking] = useState(false);
  const m = db.settings.meta;
  if (m.status !== "connected") {
    return (
      <Section title="Meta Ads" description="Connect to pull campaigns and daily spend automatically, create ads from Bizriva, and send delivered sales back to Meta." action={<StatusBadge>Not connected</StatusBadge>}>
        <div className="space-y-3 p-4 text-sm">
          {!picking ? <Button onClick={() => setPicking(true)}>Continue with Facebook</Button> : (
            <div className="space-y-2" role="group" aria-label="Choose an ad account">
              <p className="font-medium">Choose the ad account to connect</p>
              {metaAdAccounts.map((a) => <Button key={a.id} variant="outline" className="mr-2" onClick={() => { connectMeta(a.id); setPicking(false); }}>{a.name}</Button>)}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Practice Mode simulates the Facebook login. The real one opens once your Meta app keys are in Vercel (META_APP_ID, META_APP_SECRET). Your own ad accounts work straight away; customers' accounts need Meta's app review.</p>
        </div>
      </Section>
    );
  }
  return (
    <Section title="Meta Ads" description={`${m.adAccount?.name} · ${m.adAccount?.id}`} action={<StatusBadge tone="info">Connected (simulated)</StatusBadge>}>
      <div className="grid gap-4 p-4 text-sm md:grid-cols-2">
        <div className="space-y-2">
          <p>Campaigns and spend sync every few hours.{m.lastSyncAt ? ` Last sync ${relativeTime(m.lastSyncAt)}.` : ""}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={syncMeta}><RefreshCw className="size-4" /> Sync now</Button>
            <Button size="sm" variant="ghost" onClick={disconnectMeta}>Disconnect</Button>
          </div>
        </div>
        <div className="space-y-2 rounded-md border p-3" role="group" aria-label="Conversions API">
          <label className="flex items-center justify-between gap-3 font-medium">Send sales back to Meta <Switch checked={m.capi.enabled} onCheckedChange={(v) => setCapi({ enabled: v })} aria-label="Send sales back to Meta" /></label>
          <p className="text-xs text-muted-foreground">One Purchase event per order, with its value, to {m.pixel?.name}. Meta then finds more people who actually pay.</p>
          <div className="flex gap-2 text-xs">
            {(["delivered", "confirmed"] as const).map((w) => <button key={w} type="button" aria-pressed={m.capi.when === w} onClick={() => setCapi({ when: w })} className={`rounded-full border px-2.5 py-0.5 ${m.capi.when === w ? "border-primary bg-primary/10 text-primary" : ""}`}>{w === "delivered" ? "When delivered (recommended)" : "When confirmed"}</button>)}
          </div>
          <p className="text-xs text-muted-foreground">{db.capiEvents.length} sent{db.capiEvents[0] ? ` · last: ${db.capiEvents[0].reference} (${relativeTime(db.capiEvents[0].at)})` : ""}</p>
        </div>
      </div>
    </Section>
  );
}

function YourAds() {
  const db = useDb();
  const ws = useWorkspace();
  const { publishAd, setAdStatus } = useActions();
  const [note, setNote] = useState("");
  const money = (n: number) => formatCurrency(n, ws.currency, { compact: true });
  if (!db.adDrafts.length) return null;
  return (
    <Section title="Your ads" description="Created in Bizriva">
      <ul className="divide-y text-sm">
        {db.adDrafts.map((a) => {
          const camp = db.campaigns.find((c) => c.id === a.campaignId);
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="min-w-0 flex-1"><Link to="/ads/new" search={{ a: a.id }} className="font-medium hover:underline">{a.name}</Link><span className="block text-xs text-muted-foreground">{money(a.dailyBudget)}/day · {a.days} days · {a.audience.locations.join(", ")} · {CTA_LABEL[a.cta]}{camp ? ` · spent ${money(camp.spend)}` : ""}</span></span>
              <StatusBadge tone={a.status === "active" ? "success" : a.status === "paused" ? "neutral" : "info"}>{a.status === "draft" ? "Draft" : a.status === "paused" ? "Paused in Meta" : "Running"}</StatusBadge>
              {a.status === "draft" && <Button size="sm" onClick={() => setNote(publishAd(a.id) ? "" : "Connect Meta Ads above first.")}>Create in Meta</Button>}
              {a.status === "paused" && <Button size="sm" onClick={() => setAdStatus(a.id, "active")}>Start</Button>}
              {a.status === "active" && <Button size="sm" variant="outline" onClick={() => setAdStatus(a.id, "paused")}>Pause</Button>}
            </li>
          );
        })}
      </ul>
      {note && <p className="border-t px-4 py-2 text-sm text-destructive" role="alert">{note}</p>}
    </Section>
  );
}

function Advice() {
  const db = useDb();
  const ranked = db.campaigns.filter((c) => c.spend > 0 && c.status !== "paused").map((c) => ({ c, roas: c.revenue / c.spend })).sort((x, y) => y.roas - x.roas);
  if (ranked.length < 2) return null;
  const best = ranked[0]!; const weak = ranked.filter((r) => r.roas < 1.5);
  return (
    <Section title="What to do next" description="Judged on delivered sales, not chats">
      <ul className="divide-y text-sm">
        <li className="px-4 py-2.5"><StatusBadge tone="success">Scale</StatusBadge> <span className="font-medium">{best.c.name}</span> returns {best.roas.toFixed(1)}× on delivered sales. Try raising its budget by 20% for three days and watch delivered orders, not chats.</li>
        {weak.map((w) => <li key={w.c.id} className="px-4 py-2.5"><StatusBadge tone="warning">Fix or stop</StatusBadge> <span className="font-medium">{w.c.name}</span> returns {w.roas.toFixed(1)}×. Check its COD confirmation rate first — fake orders often hide here — then change the picture or the audience.</li>)}
      </ul>
    </Section>
  );
}

function Ads() {
  const db = useDb();
  const ws = useWorkspace();
  const { saveRecord } = useActions();
  const [adding, setAdding] = useState(false);
  const money = (n: number) => formatCurrency(n, ws.currency, { compact: true });
  const spend = db.campaigns.reduce((s, c) => s + c.spend, 0);
  const revenue = db.campaigns.reduce((s, c) => s + c.revenue, 0);
  const leads = db.campaigns.reduce((s, c) => s + c.leads, 0);
  const deliveredOrders = db.orders.filter((o) => o.status === "delivered").length;

  // Lead sources from real contacts: how many came from each source and how many bought.
  const sources = (Object.keys(SOURCE_LABELS) as AcquisitionSource[]).map((s) => {
    const cs = db.contacts.filter((c) => c.source === s);
    return { s, people: cs.length, buyers: cs.filter((c) => c.totalOrders > 0).length, revenue: cs.reduce((x, c) => x + c.deliveredRevenue, 0) };
  }).filter((x) => x.people).sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Growth</p>
          <h1 className="text-2xl font-bold">Ads and Attribution</h1>
          <p className="mt-1 text-sm text-muted-foreground">Which ads bring buyers, not just clicks. Attribution only uses ad data the platform actually sends — nothing is guessed.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="size-4" /> Add spend</Button>
          <Button asChild size="sm"><Link to="/ads/new"><Megaphone className="size-4" /> Create an ad</Link></Button>
        </div>
      </div>
      <MetaConnect />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Ad spend" value={money(spend)} />
        <KpiCard label="Return on ad spend" value={spend ? `${(revenue / spend).toFixed(2)}×` : "—"} tone={revenue >= spend ? "success" : "warning"} />
        <KpiCard label="Cost per lead" value={leads ? money(spend / leads) : "—"} tone="info" />
        <KpiCard label="Cost per delivered order" value={deliveredOrders ? money(spend / deliveredOrders) : "—"} hint="all campaigns" tone="brand" />
      </div>
      <YourAds />
      <Advice />
      <Section title="Campaigns">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Campaign</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Spend</th><th className="px-4 py-2 text-right">Leads</th><th className="px-4 py-2 text-right">Cost per lead</th><th className="px-4 py-2 text-right">Revenue</th><th className="px-4 py-2 text-right">ROAS</th><th className="px-4 py-2" /></tr></thead>
            <tbody className="divide-y">
              {db.campaigns.map((c) => {
                const roas = c.spend ? c.revenue / c.spend : 0;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2"><span className="block font-medium">{c.name}</span><span className="text-xs capitalize text-muted-foreground">{c.platform}{c.issue ? ` · ${c.issue}` : ""}</span></td>
                    <td className="px-4 py-2"><StatusBadge tone={STATUS_TONE[c.status]}>{c.status.replace("_", " ")}</StatusBadge></td>
                    <td className="num px-4 py-2 text-right">{money(c.spend)}</td>
                    <td className="num px-4 py-2 text-right">{c.leads}</td>
                    <td className="num px-4 py-2 text-right">{c.leads ? money(c.spend / c.leads) : "—"}</td>
                    <td className="num px-4 py-2 text-right">{money(c.revenue)}</td>
                    <td className={`num px-4 py-2 text-right font-semibold ${roas >= 1 ? "text-success" : "text-destructive"}`}>{roas.toFixed(2)}×</td>
                    <td className="px-4 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => saveRecord("campaigns", { ...c, status: c.status === "paused" ? "active" : "paused" })}>{c.status === "paused" ? "Mark active" : "Mark paused"}</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">{db.settings.meta.status === "connected" ? "With Meta connected, pausing here pauses the real ad (practice: simulated)." : "Pausing here records it in Bizriva only until Meta Ads is connected."}</p>
      </Section>
      <Section title="Lead sources" description="From every contact's recorded source">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Source</th><th className="px-4 py-2 text-right">People</th><th className="px-4 py-2 text-right">Bought</th><th className="px-4 py-2 text-right">Conversion</th><th className="px-4 py-2 text-right">Delivered revenue</th></tr></thead>
            <tbody className="divide-y">
              {sources.map((x) => (
                <tr key={x.s}><td className="px-4 py-2">{SOURCE_LABELS[x.s]}</td><td className="num px-4 py-2 text-right">{x.people}</td><td className="num px-4 py-2 text-right">{x.buyers}</td><td className="num px-4 py-2 text-right">{Math.round((x.buyers / x.people) * 100)}%</td><td className="num px-4 py-2 text-right">{money(x.revenue)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      {adding && <SpendDialog campaigns={db.campaigns} onClose={() => setAdding(false)} />}
    </div>
  );
}
