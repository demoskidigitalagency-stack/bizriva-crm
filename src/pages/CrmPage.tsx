import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Search, UsersRound } from "lucide-react";
import { useAppData } from "@/state/AppData";
import { fullName, getCrmOverview, leadsByStage, queryContacts, queryLeads } from "@/domain/repositories";
import { LEAD_STAGES, LIFECYCLE_META, SLA_META, SOURCE_LABELS, type LeadStage } from "@/domain/types";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { KpiCard, PageHeader, Pill, SectionCard } from "@/components/Common";

const CRM_NAV = [
  ["overview","Overview"],["contacts","Contacts"],["leads","Leads"],["customers","Customers"],["pipeline","Pipeline"],
  ["deals","Deals"],["activities","Activities"],["follow-ups","Follow-ups"],["product-interests","Product Interests"],
  ["segments","Segments"],["smart-lists","Smart Lists"],["duplicates","Duplicates"],["imports","Imports"]
] as const;

export function CrmPage() {
  const { view } = useParams();
  const active = view || "overview";

  return (
    <div>
      <PageHeader eyebrow="Customers" title="CRM" description="One customer identity across every channel, interaction and order." />
      <div className="border-b bg-card px-4 md:px-6">
        <div className="scroll-thin flex gap-1 overflow-x-auto py-2">
          {CRM_NAV.map(([id,label]) => (
            <Link key={id} to={id === "overview" ? "/crm" : "/crm/" + id} className={"whitespace-nowrap rounded-lg px-3 py-2 text-sm " + (active === id ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted")}>{label}</Link>
          ))}
        </div>
      </div>
      {active === "overview" && <CrmOverview />}
      {active === "contacts" && <Contacts />}
      {active === "customers" && <Contacts customersOnly />}
      {active === "leads" && <Leads />}
      {active === "pipeline" && <Pipeline />}
      {!["overview","contacts","customers","leads","pipeline"].includes(active) && <Reserved name={CRM_NAV.find(([id]) => id === active)?.[1] || active} />}
    </div>
  );
}

function CrmOverview() {
  const { db } = useAppData();
  const data = useMemo(() => getCrmOverview(db), [db]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open leads" value={String(data.kpis.openLeads)} note={formatCurrency(data.kpis.pipelineValue, "NGN", { compact: true }) + " pipeline"} />
        <KpiCard label="Won" value={String(data.kpis.wonThisMonth)} note={data.kpis.winRate.toFixed(1) + "% win rate"} tone="success" />
        <KpiCard label="Active customers" value={String(data.kpis.activeCustomers)} note={String(data.kpis.atRisk) + " at risk"} />
        <KpiCard label="Overdue follow-ups" value={String(data.kpis.overdueFollowUps)} note="Need attention" tone={data.kpis.overdueFollowUps ? "warning" : "default"} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <SectionCard title="Pipeline health" subtitle="Lead distribution by stage">
          <div className="grid gap-2 sm:grid-cols-2">
            {data.stageCounts.map((s) => <div key={s.stage} className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm capitalize">{String(s.stage).replaceAll("_"," ")}</span><span className="text-lg font-bold num">{s.count}</span></div>)}
          </div>
        </SectionCard>
        <SectionCard title="Lead sources" subtitle="Value entering the pipeline">
          <div className="space-y-2">
            {data.sources.slice(0,7).map((s) => <div key={s.source} className="flex items-center justify-between rounded-lg border p-3"><div><div className="text-sm font-medium">{SOURCE_LABELS[s.source]}</div><div className="text-xs text-muted-foreground">{s.leads} leads · {s.won} won</div></div><div className="font-semibold">{formatCurrency(s.value,"NGN",{compact:true})}</div></div>)}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Contacts({ customersOnly = false }: { customersOnly?: boolean }) {
  const { db, addContact } = useAppData();
  const [search,setSearch] = useState("");
  const [page,setPage] = useState(1);
  const [modal,setModal] = useState(false);
  const [form,setForm] = useState({firstName:"",lastName:"",phone:"",email:"",city:"Lagos",countryCode:"NG"});
  const result = useMemo(() => queryContacts(db,{
    search,
    page,
    pageSize:15,
    lifecycle: customersOnly ? ["customer","repeat_customer","vip","at_risk","dormant","reactivated"] : []
  }), [db,search,page,customersOnly]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    addContact(form);
    setModal(false);
    setForm({firstName:"",lastName:"",phone:"",email:"",city:"Lagos",countryCode:"NG"});
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1 md:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, phone, email, city..." className="w-full rounded-lg border bg-card py-2 pl-9 pr-3 text-sm" />
        </div>
        <div className="text-sm text-muted-foreground">{result.total} records</div>
        <button onClick={() => setModal(true)} className="ml-auto flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />New contact</button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Contact</th><th>Location</th><th>Lifecycle</th><th>Source</th><th>Score</th><th>Orders</th><th>Lifetime value</th><th>Last activity</th></tr></thead>
            <tbody>
              {result.rows.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-3"><Link to={"/contacts/" + c.id} className="font-semibold hover:text-primary">{fullName(c)}</Link><div className="text-xs text-muted-foreground">{c.phone}{c.email ? " · " + c.email : ""}</div></td>
                  <td>{c.city}<div className="text-xs text-muted-foreground">{c.countryCode}</div></td>
                  <td><Pill tone={LIFECYCLE_META[c.lifecycle].tone}>{LIFECYCLE_META[c.lifecycle].label}</Pill></td>
                  <td>{SOURCE_LABELS[c.source]}</td>
                  <td className="font-semibold num">{c.leadScore}</td>
                  <td>{c.totalOrders}</td>
                  <td className="font-semibold">{formatCurrency(c.lifetimeValue,"NGN",{compact:true})}</td>
                  <td className="text-muted-foreground">{formatDateTime(c.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
          <span className="text-muted-foreground">Page {result.page} of {result.pageCount}</span>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1,p-1))} className="rounded border p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <button disabled={page >= result.pageCount} onClick={() => setPage((p) => p+1)} className="rounded border p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(false)}>
        <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-2xl">
          <h2 className="text-xl font-bold">Create contact</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create one identity that can later become a lead or customer.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {Object.entries(form).map(([key,val]) => <label key={key}><span className="mb-1 block text-xs font-medium capitalize">{key === "countryCode" ? "Country" : key}</span><input required={["firstName","lastName","phone"].includes(key)} value={val} onChange={(e) => setForm((f) => Object.assign({},f,{[key]:e.target.value}))} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" /></label>)}
          </div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setModal(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Create contact</button></div>
        </form>
      </div>}
    </div>
  );
}

function Leads() {
  const { db, updateLeadStage } = useAppData();
  const [search,setSearch] = useState("");
  const rows = useMemo(() => queryLeads(db,{search,pageSize:100}).rows, [db,search]);

  return <div className="p-4 md:p-6">
    <div className="mb-4 relative max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads..." className="w-full rounded-lg border bg-card py-2 pl-9 pr-3 text-sm" /></div>
    <div className="overflow-hidden rounded-xl border bg-card"><div className="scroll-thin overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Lead</th><th>Stage</th><th>Interest</th><th>Source</th><th>Owner</th><th>Score</th><th>SLA</th><th>Value</th></tr></thead><tbody>
      {rows.map((l) => <tr key={l.id} className="border-t"><td className="px-4 py-3"><Link to={"/contacts/" + l.contact.id} className="font-semibold hover:text-primary">{fullName(l.contact)}</Link><div className="text-xs text-muted-foreground">{l.contact.phone}</div></td><td><select value={l.stage} onChange={(e) => updateLeadStage(l.id,e.target.value as LeadStage)} className="rounded-md border bg-background px-2 py-1.5 text-xs">{LEAD_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></td><td>{l.productInterest || "—"}</td><td>{SOURCE_LABELS[l.source]}</td><td>{l.ownerName}</td><td className="font-semibold">{l.score}</td><td><Pill tone={SLA_META[l.slaStatus].tone}>{SLA_META[l.slaStatus].label}</Pill></td><td className="font-semibold">{formatCurrency(l.value,"NGN",{compact:true})}</td></tr>)}
    </tbody></table></div></div>
  </div>;
}

function Pipeline() {
  const { db, updateLeadStage } = useAppData();
  const groups = useMemo(() => leadsByStage(db), [db]);

  return <div className="scroll-thin overflow-x-auto p-4 md:p-6"><div className="flex min-w-max gap-3">
    {LEAD_STAGES.map((stage) => <div key={stage.id} className="w-72 shrink-0 rounded-xl bg-muted/50 p-2">
      <div className="flex items-center justify-between px-2 py-2"><span className="text-sm font-semibold">{stage.label}</span><span className="rounded-full bg-card px-2 py-0.5 text-xs">{groups[stage.id]?.length || 0}</span></div>
      <div className="space-y-2">{(groups[stage.id] || []).slice(0,12).map((l) => <div key={l.id} className="rounded-lg border bg-card p-3 shadow-sm"><Link to={"/contacts/" + l.contact.id} className="font-semibold hover:text-primary">{fullName(l.contact)}</Link><div className="mt-1 text-xs text-muted-foreground">{l.productInterest || SOURCE_LABELS[l.source]}</div><div className="mt-3 flex items-center justify-between"><span className="text-sm font-semibold">{formatCurrency(l.value,"NGN",{compact:true})}</span><select value={l.stage} onChange={(e) => updateLeadStage(l.id,e.target.value as LeadStage)} className="max-w-28 rounded border bg-background p-1 text-[11px]">{LEAD_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div></div>)}</div>
    </div>)}
  </div></div>;
}

function Reserved({ name }: { name: string }) {
  return <div className="p-6"><div className="rounded-xl border bg-card p-8 text-center"><UsersRound className="mx-auto h-9 w-9 text-primary" /><h2 className="mt-3 text-xl font-bold">{name}</h2><p className="mt-2 text-sm text-muted-foreground">Reserved in the approved Bizriva CRM architecture. It will be completed in its dedicated phase rather than filled with fake functionality.</p></div></div>;
}
