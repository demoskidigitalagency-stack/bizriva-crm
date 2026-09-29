import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAppData } from "@/state/AppData";
import { getTodayQueues } from "@/domain/repositories";
import { PageHeader, Pill } from "@/components/Common";

export function TodayPage() {
  const { db } = useAppData();
  const navigate = useNavigate();
  const queues = useMemo(() => getTodayQueues(db), [db]);

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Today"
        description="Everything that requires action across sales, orders, delivery, cash and campaigns."
      />
      <div className="grid gap-4 p-4 md:grid-cols-2 md:p-6 xl:grid-cols-3">
        {queues.map((q) => (
          <button key={q.key} onClick={() => navigate(q.route)} className="group overflow-hidden rounded-xl border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start justify-between border-b p-4">
              <div>
                <div className="text-sm font-semibold">{q.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{q.description}</div>
              </div>
              <div className="text-3xl font-bold num">{q.count}</div>
            </div>
            <div className="min-h-28 p-3">
              {q.items.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">All clear</div>
              ) : (
                <div className="space-y-1">
                  {q.items.slice(0, 4).map((i) => (
                    <div key={i.id} className="flex items-center gap-2 rounded-lg px-2 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{i.primary}</div>
                        <div className="truncate text-xs text-muted-foreground">{i.secondary}</div>
                      </div>
                      {i.meta && <Pill>{i.meta}</Pill>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3 text-xs font-medium text-primary">
              <span>Open queue</span>
              <ArrowRight className="h-4 w-4" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
