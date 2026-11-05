import { csvCell } from "@/domain/rules";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownUp, Download, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, KpiCard, PersonAvatar, Section, StatusBadge } from "./primitives";
import { ContactDialog } from "./dialogs";
import { useDb, useWorkspace } from "@/domain/store";
import { campaignNames, fullName, getMember, queryContacts, type ContactSortKey } from "@/domain/repositories";
import { LIFECYCLE_META, SOURCE_LABELS, type AcquisitionSource, type Lifecycle } from "@/domain/types";
import { formatCurrency, relativeTime } from "@/lib/format";

const SORTS: { id: ContactSortKey; label: string }[] = [
  { id: "lastActivityAt", label: "Last activity" },
  { id: "leadScore", label: "Lead score" },
  { id: "lifetimeValue", label: "Lifetime value" },
  { id: "totalOrders", label: "Orders" },
  { id: "name", label: "Name" },
  { id: "createdAt", label: "Date added" },
];

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/** Shared by Contacts (everyone) and Customers (people who have bought). */
export function ContactsTable({ lifecycles, title, description }: { lifecycles?: Lifecycle[]; title: string; description: string }) {
  const db = useDb();
  const ws = useWorkspace();
  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState<Lifecycle | "all">("all");
  const [source, setSource] = useState<AcquisitionSource | "all">("all");
  const [owner, setOwner] = useState<string>("all");
  const [campaign, setCampaign] = useState<string>("all");
  const [cod, setCod] = useState<"all" | "unverified" | "confirmed" | "none">("all");
  const [sortKey, setSortKey] = useState<ContactSortKey>("lastActivityAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const allowed = lifecycles ?? (Object.keys(LIFECYCLE_META) as Lifecycle[]);
  const query = useMemo(
    () => ({
      search,
      lifecycle: lifecycle === "all" ? allowed : [lifecycle],
      sources: source === "all" ? [] : [source],
      owners: owner === "all" ? [] : [owner],
      campaigns: campaign === "all" ? [] : [campaign],
      ...(cod === "all" ? {} : { cod }),
      sortKey,
      sortDir,
      page,
      pageSize: 15,
    }),
    [search, lifecycle, source, owner, campaign, cod, sortKey, sortDir, page, allowed],
  );
  const result = queryContacts(db, query);
  const everyMatch = queryContacts(db, { ...query, page: 1, pageSize: 100_000 }).rows;

  const exportCsv = () =>
    downloadCsv(`bizriva-${title.toLowerCase()}.csv`, [
      ["Name", "Phone", "Email", "City", "Lifecycle", "Source", "Owner", "Lead score", "Orders", "Lifetime value"],
      ...everyMatch.map((c) => [fullName(c), c.phone, c.email ?? "", c.city, LIFECYCLE_META[c.lifecycle].label, SOURCE_LABELS[c.source], getMember(db, c.ownerId)?.name ?? "", String(c.leadScore), String(c.totalOrders), String(c.lifetimeValue)]),
    ]);

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <>
      <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="size-4" /> Export CSV</Button>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /> New contact</Button>
        </div>
      </div>

      {lifecycles && (() => {
        const people = db.contacts.filter((c) => lifecycles.includes(c.lifecycle));
        const repeat = people.filter((c) => c.totalOrders >= 2).length;
        const ltv = people.reduce((s, c) => s + c.lifetimeValue, 0);
        const orders = people.reduce((s, c) => s + c.totalOrders, 0);
        return (
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Customers" value={String(people.length)} />
            <KpiCard label="Repeat buyers" value={String(repeat)} hint={people.length ? `${Math.round((repeat / people.length) * 100)}% of customers` : ""} tone="success" />
            <KpiCard label="Total lifetime value" value={formatCurrency(ltv, ws.currency, { compact: true })} tone="info" />
            <KpiCard label="Average order value" value={orders ? formatCurrency(ltv / orders, ws.currency, { compact: true }) : "—"} />
          </div>
        );
      })()}

      <Section>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(e) => reset(() => setSearch(e.target.value))} placeholder="Name, phone, email, city, tag" className="pl-8" aria-label="Search" />
          </div>
          {!lifecycles || lifecycles.length > 1 ? (
            <Select value={lifecycle} onValueChange={(v) => reset(() => setLifecycle(v as Lifecycle | "all"))}>
              <SelectTrigger className="h-9 w-40" aria-label="Lifecycle"><SelectValue>{lifecycle === "all" ? "All lifecycles" : LIFECYCLE_META[lifecycle].label}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lifecycles</SelectItem>
                {allowed.map((l) => <SelectItem key={l} value={l}>{LIFECYCLE_META[l].label}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : null}
          <Select value={source} onValueChange={(v) => reset(() => setSource(v as AcquisitionSource | "all"))}>
            <SelectTrigger className="h-9 w-40" aria-label="Source"><SelectValue>{source === "all" ? "All sources" : SOURCE_LABELS[source]}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {(Object.keys(SOURCE_LABELS) as AcquisitionSource[]).map((s) => <SelectItem key={s} value={s}>{SOURCE_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={owner} onValueChange={(v) => reset(() => setOwner(v))}>
            <SelectTrigger className="h-9 w-36" aria-label="Owner"><SelectValue>{owner === "all" ? "All owners" : getMember(db, owner)?.name}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {db.team.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={campaign} onValueChange={(v) => reset(() => setCampaign(v))}>
            <SelectTrigger className="h-9 w-48" aria-label="Ad campaign"><SelectValue>{campaign === "all" ? "All ad campaigns" : campaign}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ad campaigns</SelectItem>
              {campaignNames(db).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cod} onValueChange={(v) => reset(() => setCod(v as typeof cod))}>
            <SelectTrigger className="h-9 w-44" aria-label="COD verification"><SelectValue>{{ all: "Any verification", unverified: "Unverified COD order", confirmed: "COD confirmed", none: "No COD orders" }[cod]}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any verification</SelectItem>
              <SelectItem value="unverified">Unverified COD order</SelectItem>
              <SelectItem value="confirmed">COD confirmed</SelectItem>
              <SelectItem value="none">No COD orders</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortKey} onValueChange={(v) => reset(() => setSortKey(v as ContactSortKey))}>
            <SelectTrigger className="h-9 w-40" aria-label="Sort by"><SelectValue>{`Sort: ${SORTS.find((s) => s.id === sortKey)?.label}`}</SelectValue></SelectTrigger>
            <SelectContent>{SORTS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} aria-label={`Sort ${sortDir === "asc" ? "descending" : "ascending"}`}>
            <ArrowDownUp className="size-4" />
          </Button>
        </div>

        {result.rows.length === 0 ? (
          <EmptyState title="No matches" description="Try a different search or clear the filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Name</th><th className="px-3 py-2">Lifecycle</th><th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Owner</th><th className="px-3 py-2 text-right">Score</th><th className="px-3 py-2 text-right">Orders</th>
                  <th className="px-3 py-2 text-right">Lifetime value</th><th className="px-3 py-2">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.rows.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <Link to="/crm/contacts/$contactId" params={{ contactId: c.id }} className="flex items-center gap-2.5 font-medium hover:underline">
                        <PersonAvatar name={fullName(c)} />
                        <span className="min-w-0">
                          <span className="block truncate">{fullName(c)}</span>
                          <span className="block truncate text-xs font-normal text-muted-foreground">{c.phone} · {c.city}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2"><StatusBadge tone={LIFECYCLE_META[c.lifecycle].tone}>{LIFECYCLE_META[c.lifecycle].label}</StatusBadge></td>
                    <td className="px-3 py-2 text-muted-foreground">{SOURCE_LABELS[c.source]}</td>
                    <td className="px-3 py-2 text-muted-foreground">{getMember(db, c.ownerId)?.name ?? "Unassigned"}</td>
                    <td className="num px-3 py-2 text-right">{c.leadScore}</td>
                    <td className="num px-3 py-2 text-right">{c.totalOrders}</td>
                    <td className="num px-3 py-2 text-right">{formatCurrency(c.lifetimeValue, ws.currency)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{relativeTime(c.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="num">{result.total} {result.total === 1 ? "person" : "people"} · page {result.page} of {result.pageCount}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={result.page >= result.pageCount} onClick={() => setPage(result.page + 1)}>Next</Button>
          </div>
        </div>
      </Section>

      <ContactDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
