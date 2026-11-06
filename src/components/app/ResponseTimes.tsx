/**
 * Real data: how fast customers get an answer (AI and each teammate) and how
 * fast each agent confirms new orders. Clock minutes, nights included —
 * that's what the customer feels.
 */
import { useCallback, useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";

interface Person { userId: string; name: string; role: string; replies: number; median: number | null; average: number | null; within5: number; confirmed: number; confirmMedian: number | null; confirmOnTime: number }
interface Rt { callWithin: number; customerTurns: number; unanswered: number; overall: { median: number | null; within5: number; answered: number }; ai: { replies: number; median: number | null }; automatic: number; people: Person[] }
const RANGES = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days" } as const;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** 0.5 → "30 sec", 12 → "12 min", 95 → "1 h 35 min", 1500 → "1 day 1 h" */
export function duration(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return `${Math.max(1, Math.round(min * 60))} sec`;
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 1440) { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h} h ${m} min` : `${h} h`; }
  const d = Math.floor(min / 1440), h = Math.round((min % 1440) / 60);
  return h ? `${d} day${d > 1 ? "s" : ""} ${h} h` : `${d} day${d > 1 ? "s" : ""}`;
}
const tone = (min: number | null) => (min === null ? "neutral" : min <= 5 ? "success" : min <= 30 ? "warning" : "danger");

export function ResponseTimes() {
  const { current } = useAuth();
  const [range, setRange] = useState<keyof typeof RANGES>("7");
  const [r, setR] = useState<Rt | null>(null);
  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !current) return;
    const from = new Date(Date.now() - (Number(range) - 1) * 86_400_000);
    const { data } = await sb.rpc("response_times", { p_workspace: current.workspaceId, p_from: day(from), p_to: day(new Date()) });
    setR((data as Rt | null) ?? null);
  }, [current, range]);
  useEffect(() => { void load(); }, [load]);

  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <Section title="Response times" description="From a customer's message to our first reply, and from a new order to its confirmation" action={
      <Select value={range} onValueChange={(v) => setRange(v as keyof typeof RANGES)}><SelectTrigger className="h-8 w-36" aria-label="Response times period"><SelectValue>{RANGES[range]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(RANGES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>}>
      {!r ? <p className="p-4 text-sm text-muted-foreground" role="status">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
            <KpiCard label="Typical first reply" value={duration(r.overall.median)} hint={`${pct(r.overall.within5, r.overall.answered)} within 5 minutes`} tone="brand" />
            <KpiCard label="AI assistant" value={duration(r.ai.median)} hint={`${r.ai.replies} of ${r.overall.answered} replies`} tone="info" />
            <KpiCard label="Still waiting" value={String(r.unanswered)} hint={`of ${r.customerTurns} customer messages`} tone={r.unanswered ? "warning" : "success"} />
            <KpiCard label="Orders confirmed on time" value={pct(r.people.reduce((s, p) => s + p.confirmOnTime, 0), r.people.reduce((s, p) => s + p.confirmed, 0))} hint={`within ${duration(r.callWithin)}`} tone="success" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm" aria-label="Response times by person">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Person</th><th className="px-4 py-2 text-right">Replies</th><th className="px-4 py-2 text-right">Typical reply</th><th className="px-4 py-2 text-right">Within 5 min</th><th className="px-4 py-2 text-right">Orders confirmed</th><th className="px-4 py-2 text-right">Typical time to confirm</th></tr></thead>
              <tbody className="divide-y">
                {r.people.map((p) => (
                  <tr key={p.userId}>
                    <td className="px-4 py-2">{p.name}</td><td className="num px-4 py-2 text-right">{p.replies}</td>
                    <td className="px-4 py-2 text-right">{p.replies ? <StatusBadge tone={tone(p.median)}>{duration(p.median)}</StatusBadge> : "—"}</td>
                    <td className="num px-4 py-2 text-right">{pct(p.within5, p.replies)}</td><td className="num px-4 py-2 text-right">{p.confirmed}</td>
                    <td className="px-4 py-2 text-right">{p.confirmed ? `${duration(p.confirmMedian)} · ${pct(p.confirmOnTime, p.confirmed)} on time` : "—"}</td>
                  </tr>
                ))}
                {r.people.length === 0 && <tr><td colSpan={6} className="px-4 py-3 text-muted-foreground">No replies or confirmations by the team yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">Clock time, nights and weekends included. Order updates and receipts don't count as replies.</p>
        </>
      )}
    </Section>
  );
}
