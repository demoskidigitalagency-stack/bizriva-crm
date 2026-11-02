import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { fullName, getMember, leadsByStage } from "@/domain/repositories";
import { LEAD_STAGES, SLA_META, type LeadStage } from "@/domain/types";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/crm/pipeline")({
  head: () => ({ meta: [{ title: "Pipeline · Bizriva CRM" }] }),
  component: Pipeline,
});

function Pipeline() {
  const db = useDb();
  const ws = useWorkspace();
  const { setLeadStage } = useActions();
  const [owner, setOwner] = useState("all");
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);
  const grouped = leadsByStage(db, owner === "all" ? [] : [owner]);
  const stageIds = LEAD_STAGES.map((s) => s.id);

  const move = (leadId: string, from: LeadStage, dir: -1 | 1) => {
    const next = stageIds[stageIds.indexOf(from) + dir];
    if (next) setLeadStage(leadId, next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">Drag a card to another stage, or use the arrows. Stage names are still proposed — see the crosswalk.</p>
        </div>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="h-9 w-40" aria-label="Owner"><SelectValue>{owner === "all" ? "All owners" : getMember(db, owner)?.name}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {db.team.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="scroll-thin -mx-3 flex gap-3 overflow-x-auto px-3 pb-3 sm:mx-0 sm:px-0">
        {LEAD_STAGES.map((stage, i) => {
          const rows = grouped[stage.id];
          const total = rows.reduce((s, l) => s + l.value, 0);
          return (
            <section
              key={stage.id}
              aria-label={stage.label}
              onDragOver={(e) => { e.preventDefault(); setDragOver(stage.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/lead");
                if (id) setLeadStage(id, stage.id);
              }}
              className={cn("flex w-64 shrink-0 flex-col rounded-lg border bg-surface", dragOver === stage.id && "border-primary ring-2 ring-primary/30")}
            >
              <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <span className="text-sm font-semibold">{stage.label}</span>
                <span className="num text-xs text-muted-foreground">{rows.length} · {formatCurrency(total, ws.currency, { compact: true })}</span>
              </header>
              <ul className="flex max-h-[65vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
                {rows.map((l) => (
                  <li
                    key={l.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/lead", l.id)}
                    className="cursor-grab rounded-md border bg-card p-2.5 text-sm active:cursor-grabbing"
                  >
                    <Link to="/crm/contacts/$contactId" params={{ contactId: l.contactId }} className="font-medium hover:underline">{fullName(l.contact)}</Link>
                    <p className="truncate text-xs text-muted-foreground">{l.productInterest ?? "No product yet"}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="num text-xs font-semibold">{formatCurrency(l.value, ws.currency, { compact: true })}</span>
                      <StatusBadge tone={SLA_META[l.slaStatus].tone}>{SLA_META[l.slaStatus].label}</StatusBadge>
                      <span className="ml-auto flex">
                        <button type="button" disabled={i === 0} onClick={() => move(l.id, l.stage, -1)} className="rounded p-0.5 hover:bg-muted disabled:opacity-30" aria-label={`Move ${fullName(l.contact)} back a stage`}><ChevronLeft className="size-4" /></button>
                        <button type="button" disabled={i === LEAD_STAGES.length - 1} onClick={() => move(l.id, l.stage, 1)} className="rounded p-0.5 hover:bg-muted disabled:opacity-30" aria-label={`Move ${fullName(l.contact)} forward a stage`}><ChevronRight className="size-4" /></button>
                      </span>
                    </div>
                  </li>
                ))}
                {rows.length === 0 && <li className="py-6 text-center text-xs text-muted-foreground">Drop a lead here</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
