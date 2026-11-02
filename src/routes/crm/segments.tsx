import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useDb } from "@/domain/store";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/crm/segments")({
  head: () => ({ meta: [{ title: "Segments · Bizriva CRM" }] }),
  component: Segments,
});

function Segments() {
  const db = useDb();
  const [selected, setSelected] = useState(db.segments[0]?.id);
  const seg = db.segments.find((s) => s.id === selected);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Segments</h1>
        <p className="mt-1 text-sm text-muted-foreground">Saved groups of contacts for follow-ups and broadcasts. Smart segments update on their own; static ones are hand-picked.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-3 sm:grid-cols-2">
          {db.segments.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelected(s.id)}
              aria-pressed={selected === s.id}
              className={cn("rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50", selected === s.id && "border-primary ring-2 ring-primary/30")}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{s.name}</p>
                <StatusBadge tone={s.type === "smart" ? "purple" : "neutral"}>{s.type === "smart" ? "Smart" : "Static"}</StatusBadge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
              <p className="num mt-3 text-2xl font-bold">{s.memberCount}</p>
              <p className="text-xs text-muted-foreground">members · updated {formatDate(s.updatedAt)}</p>
            </button>
          ))}
        </div>
        {seg && (
          <Section title={seg.name} description="Segment rules" className="h-fit">
            <div className="space-y-3 p-4 text-sm">
              <p className="rounded-md bg-muted p-3 font-mono text-xs">{seg.rulesSummary}</p>
              <p className="text-muted-foreground">Use this segment from Broadcasts or Follow-ups once those modules are built. Editing rules arrives with the backend, because rules have to run against live data.</p>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
