import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
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
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" /> Add spend</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Ad spend" value={money(spend)} />
        <KpiCard label="Return on ad spend" value={spend ? `${(revenue / spend).toFixed(2)}×` : "—"} tone={revenue >= spend ? "success" : "warning"} />
        <KpiCard label="Cost per lead" value={leads ? money(spend / leads) : "—"} tone="info" />
        <KpiCard label="Cost per delivered order" value={deliveredOrders ? money(spend / deliveredOrders) : "—"} hint="all campaigns" tone="brand" />
      </div>
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
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">Pausing here records it in Bizriva only. Pausing the real ad happens in Meta until Meta Ads is connected.</p>
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
