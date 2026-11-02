import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, StatusBadge, EmptyState } from "@/components/app/primitives";
import { useDb, useWorkspace } from "@/domain/store";
import { getTodayQueues, type Queue } from "@/domain/repositories";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/today")({
  head: () => ({
    meta: [
      { title: "Today · Bizriva CRM" },
      { name: "description", content: "The operational queues that need action today: leads, replies, follow-ups, fulfilment and cash." },
      { property: "og:title", content: "Today · Bizriva CRM" },
      { property: "og:description", content: "The operational queues that need action today: leads, replies, follow-ups, fulfilment and cash." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Today,
});

const TONE_BADGE = { brand: "info", warning: "warning", danger: "danger", info: "neutral", success: "success" } as const;

function QueueCard({ queue }: { queue: Queue }) {
  const navigate = useNavigate();
  return (
    <Section
      title={queue.label}
      description={queue.description}
      bodyClassName="p-3"
      action={<StatusBadge tone={TONE_BADGE[queue.tone]}>{queue.count}</StatusBadge>}
      className={cn(queue.count === 0 && "opacity-70")}
    >
      {queue.amount !== undefined && queue.amount > 0 && (
        <p className="num mb-2 text-sm font-bold text-foreground">{formatCurrency(queue.amount)}</p>
      )}
      {queue.items.length === 0 ? (
        <EmptyState title="Queue is clear" description="Nothing needs attention here right now." />
      ) : (
        <ul className="space-y-1">
          {queue.items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() =>
                  item.contactId
                    ? navigate({ to: "/crm/contacts/$contactId", params: { contactId: item.contactId } })
                    : navigate({ to: queue.route as never })
                }
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent/40"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.primary}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.secondary}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {item.amount !== undefined && <span className="num font-semibold text-foreground">{formatCurrency(item.amount)}</span>}
                  {item.meta && <span className="capitalize">{item.meta.replace(/_/g, " ")}</span>}
                  {item.tone && <StatusBadge tone={item.tone === "warning" ? "warning" : item.tone === "danger" ? "danger" : "neutral"}>{item.tone === "warning" ? "due" : item.tone === "danger" ? "urgent" : "info"}</StatusBadge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button asChild variant="ghost" size="sm" className="mt-1 w-full justify-between text-xs">
        <Link to={queue.route}>Open module <ArrowRight className="size-3.5" /></Link>
      </Button>
    </Section>
  );
}

function Today() {
  const db = useDb();
  const ws = useWorkspace();
  const [expanded, setExpanded] = useState<string | null>(null);
  const queues = getTodayQueues(db);
  const total = queues.reduce((s, q) => s + q.count, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Today"
        description={`${total} items across ${queues.filter((q) => q.count > 0).length} queues for ${ws.name}. Click any row to jump straight to the customer or module.`}
        actions={<Button asChild size="sm" variant="outline"><Link to="/automation">Open automations</Link></Button>}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {queues.map((q) => (
          <QueueCard key={q.key} queue={q} />
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Queues recompute as your team works them — confirming orders, replying to conversations and completing follow-ups clears rows instantly. {expanded ? "" : ""}
      </p>
    </div>
  );
}
