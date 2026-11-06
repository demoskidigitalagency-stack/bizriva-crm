/**
 * AI workflow planner: describe a goal, get a step-by-step plan built on this
 * business's real numbers (counts only), with message drafts to copy. Plans
 * are saved so the team can come back to them. Needs real data (signed in).
 */
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { useLive } from "@/domain/store";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";

interface Step { title: string; description: string; timing: string; channel: string; ownerRole: string; target: string; messageDraft: string | null }
interface Plan { title: string; summary: string; trigger: string; steps: Step[]; successMetrics: string[]; risks: string[] }
interface Saved { id: string; goal: string; plan: Plan | null; created_at: string }
const ROLE: Record<string, string> = { owner: "Owner", manager: "Manager", sales_rep: "Sales", support: "Support", fulfilment: "Dispatch", finance: "Finance" };
const EXAMPLES = ["Win back customers who bought before but haven't ordered in 60 days", "Cut failed deliveries on cash-on-delivery orders", "Follow up people who asked the price but didn't order"];

export function AiPlanner() {
  const live = useLive();
  const { current } = useAuth();
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [copied, setCopied] = useState(-1);

  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !current) return;
    const { data } = await sb.from("ai_plans").select("id, goal, plan, created_at").eq("workspace_id", current.workspaceId).not("plan", "is", null).order("created_at", { ascending: false }).limit(5);
    setSaved((data ?? []) as Saved[]);
  }, [current]);
  useEffect(() => { if (live.on) void load(); }, [live.on, load]);

  const run = async () => {
    const sb = supabase(); if (!sb || !current) return;
    if (goal.trim().length < 10) return setError("Describe the goal in at least a sentence.");
    setBusy(true); setError(""); setPlan(null);
    const { data, error: e } = await sb.functions.invoke("ai-planner", { body: { workspace_id: current.workspaceId, goal: goal.trim() } });
    setBusy(false);
    let msg = (data as { error?: string } | null)?.error;
    if (e && !msg) { try { msg = (await (e as { context?: Response }).context?.json())?.error; } catch { /* not json */ } msg ??= "The planner couldn't finish — try again."; }
    if (msg) return setError(msg);
    setPlan((data as { plan: Plan }).plan);
    void load();
  };

  return (
    <Section title="Plan a workflow with AI" action={<Sparkles className="size-4 text-primary" aria-hidden="true" />}>
      <div className="space-y-3 p-4 text-sm">
        {!live.on ? <p className="text-muted-foreground">Sign in and use your real data to plan with AI — it plans from your own numbers.</p> : (
          <>
            <form aria-label="AI planner" className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run(); }}>
              <Textarea rows={2} aria-label="What do you want to achieve?" placeholder="What do you want to achieve? e.g. Win back customers who haven't ordered in 60 days" value={goal} maxLength={2000} onChange={(e) => { setGoal(e.target.value); setError(""); }} />
              <div className="flex flex-wrap items-center gap-1.5">
                <Button type="submit" size="sm" disabled={busy}>{busy ? "Planning… (up to a minute)" : "Make a plan"}</Button>
                {EXAMPLES.map((x) => <button key={x} type="button" className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/50" onClick={() => setGoal(x)}>{x}</button>)}
              </div>
              <p className="text-xs text-muted-foreground">The AI sees counts only (how many customers, orders, chats…) — never names, phone numbers or messages. 20 plans a day.</p>
            </form>
            {error && <p className="text-destructive" role="alert">{error}</p>}
            {plan && (
              <article aria-label="Plan" className="space-y-3 rounded-lg border p-3">
                <div><h3 className="font-semibold">{plan.title}</h3><p className="text-muted-foreground">{plan.summary}</p><p className="mt-1 text-xs"><span className="font-medium">Starts:</span> {plan.trigger}</p></div>
                <ol className="space-y-2">
                  {plan.steps.map((s, i) => (
                    <li key={i} className="rounded-md bg-muted/40 p-2">
                      <div className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{i + 1}. {s.title}</span><StatusBadge>{s.channel}</StatusBadge><StatusBadge tone="info">{ROLE[s.ownerRole] ?? s.ownerRole}</StatusBadge><span className="text-xs text-muted-foreground">{s.timing}</span></div>
                      <p className="mt-1">{s.description}</p>
                      <p className="text-xs text-muted-foreground">Who: {s.target}</p>
                      {s.messageDraft && <div className="mt-1 flex items-start gap-2 rounded border bg-background p-2 text-xs"><p className="flex-1 whitespace-pre-wrap">{s.messageDraft}</p><Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={async () => { try { await navigator.clipboard.writeText(s.messageDraft ?? ""); } catch { /* blocked */ } setCopied(i); }}>{copied === i ? "Copied" : "Copy"}</Button></div>}
                    </li>
                  ))}
                </ol>
                {plan.successMetrics.length > 0 && <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">How you'll know it worked</p><ul className="list-disc pl-5">{plan.successMetrics.map((m) => <li key={m}>{m}</li>)}</ul></div>}
                {plan.risks.length > 0 && <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Watch out for</p><ul className="list-disc pl-5">{plan.risks.map((m) => <li key={m}>{m}</li>)}</ul></div>}
              </article>
            )}
            {saved.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent plans</p>
                <ul className="mt-1 divide-y rounded border" aria-label="Recent plans">
                  {saved.map((x) => <li key={x.id}><button type="button" className="flex w-full justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/40" onClick={() => { setPlan(x.plan); setGoal(x.goal); }}><span className="truncate">{x.plan?.title ?? x.goal}</span><span className="shrink-0 text-muted-foreground">{relativeTime(x.created_at)}</span></button></li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  );
}
