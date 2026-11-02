import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EmptyState, PersonAvatar, Section, StatusBadge } from "@/components/app/primitives";
import { LeadStageSelect } from "@/components/app/dialogs";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { fullName, getMember, queryLeads } from "@/domain/repositories";
import { LEAD_OUTCOMES, LEAD_STAGES, SLA_META, SOURCE_LABELS, type LeadStage } from "@/domain/types";
import { formatCurrency, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/crm/leads")({
  head: () => ({ meta: [{ title: "Leads · Bizriva CRM" }] }),
  component: Leads,
});

function Leads() {
  const db = useDb();
  const ws = useWorkspace();
  const { setLeadStage } = useActions();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<LeadStage | "all">("all");
  const [owner, setOwner] = useState("all");
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);

  const r = queryLeads(db, {
    search,
    stages: stage === "all" ? [] : [stage],
    owners: owner === "all" ? [] : [owner],
    onlyOverdue: overdue,
    page,
    pageSize: 15,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">People you're actively pursuing, highest score first. A lead is a stage on a contact, never a second record.</p>
      </div>
      <Section>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name, phone, product, campaign" className="pl-8" aria-label="Search leads" />
          </div>
          <Select value={stage} onValueChange={(v) => { setStage(v as LeadStage | "all"); setPage(1); }}>
            <SelectTrigger className="h-9 w-40" aria-label="Stage"><SelectValue>{stage === "all" ? "All stages" : LEAD_STAGES.find((s) => s.id === stage)?.label}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {LEAD_STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={owner} onValueChange={(v) => { setOwner(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-36" aria-label="Owner"><SelectValue>{owner === "all" ? "All owners" : getMember(db, owner)?.name}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {db.team.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 px-1">
            <Switch id="overdue" checked={overdue} onCheckedChange={(v) => { setOverdue(v); setPage(1); }} />
            <Label htmlFor="overdue" className="text-sm">Overdue follow-up</Label>
          </div>
        </div>
        {r.rows.length === 0 ? <EmptyState title="No leads match" description="Clear a filter to see more." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-3 py-2">Lead</th><th className="px-3 py-2">Interest</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Response</th><th className="px-3 py-2 text-right">Score</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2">Follow-up</th></tr>
              </thead>
              <tbody className="divide-y">
                {r.rows.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <Link to="/crm/contacts/$contactId" params={{ contactId: l.contactId }} className="flex items-center gap-2.5 font-medium hover:underline">
                        <PersonAvatar name={fullName(l.contact)} />
                        <span className="min-w-0">
                          <span className="block truncate">{fullName(l.contact)}</span>
                          <span className="block truncate text-xs font-normal text-muted-foreground">{SOURCE_LABELS[l.source]}{l.campaign ? ` · ${l.campaign}` : ""} · {l.ownerName}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{l.productInterest ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <LeadStageSelect value={l.stage} onChange={(v) => setLeadStage(l.id, v as LeadStage)} className="w-36" />
                        {l.outcome && <StatusBadge tone={LEAD_OUTCOMES.find((o) => o.id === l.outcome)?.tone ?? "neutral"}>{LEAD_OUTCOMES.find((o) => o.id === l.outcome)?.label}</StatusBadge>}
                      </div>
                    </td>
                    <td className="px-3 py-2"><StatusBadge tone={SLA_META[l.slaStatus].tone}>{SLA_META[l.slaStatus].label}</StatusBadge></td>
                    <td className="num px-3 py-2 text-right">{l.score}</td>
                    <td className="num px-3 py-2 text-right">{formatCurrency(l.value, ws.currency)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.nextFollowUpAt ? relativeTime(l.nextFollowUpAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="num">{r.total} leads · page {r.page} of {r.pageCount}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={r.page <= 1} onClick={() => setPage(r.page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={r.page >= r.pageCount} onClick={() => setPage(r.page + 1)}>Next</Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
