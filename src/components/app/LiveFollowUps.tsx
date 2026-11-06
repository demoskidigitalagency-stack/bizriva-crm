/**
 * Real data: what the server's follow-up engine has scheduled, sent and held
 * back — and why. The engine runs every 5 minutes; nothing here needs a click.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Section, StatusBadge, EmptyState } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { useDb } from "@/domain/store";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";

interface Job { id: string; state: "scheduled" | "sent" | "cancelled" | "failed"; cancel_reason: string | null; run_at: string; sent_at: string | null; attempt: number; rule_id: string; conversation_id: string }
const WHY: Record<string, string> = {
  replied: "Customer replied", opted_out: "Customer opted out", human_takeover: "A teammate is handling the chat", no_longer_applies: "No longer needed",
  needs_template: "Over 24 hours and the rule has no approved template", no_message: "The rule has no message",
};

export function LiveFollowUps() {
  const db = useDb();
  const { current } = useAuth();
  const ws = current?.workspaceId;
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [tab, setTab] = useState<"scheduled" | "sent" | "held">("scheduled");
  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const { data } = await sb.from("followup_jobs").select("id, state, cancel_reason, run_at, sent_at, attempt, rule_id, conversation_id").eq("workspace_id", ws).order("run_at", { ascending: false }).limit(200);
    setJobs((data as Job[] | null) ?? []);
  }, [ws]);
  useEffect(() => { void load(); }, [load, db]);
  if (!jobs) return <Section><p className="p-4 text-sm text-muted-foreground" role="status">Loading follow-ups…</p></Section>;
  const groups = { scheduled: jobs.filter((j) => j.state === "scheduled"), sent: jobs.filter((j) => j.state === "sent"), held: jobs.filter((j) => j.state === "cancelled" || j.state === "failed") };
  const shown = groups[tab];
  const rule = (id: string) => db.followUpRules.find((r) => r.id === id);
  const who = (convId: string) => {
    const conv = db.conversations.find((c) => c.id === convId);
    const c = db.contacts.find((x) => x.id === conv?.contactId);
    return { conv, name: c ? `${c.firstName} ${c.lastName}`.trim() : "Customer" };
  };
  return (
    <Section>
      <div className="flex flex-wrap gap-1 border-b p-2" role="tablist" aria-label="Follow-ups from the server">
        {([["scheduled", "Scheduled"], ["sent", "Sent"], ["held", "Held back"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded px-3 py-1.5 text-sm ${tab === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label} ({groups[k].length})</button>
        ))}
      </div>
      {shown.length === 0 ? <EmptyState title={tab === "scheduled" ? "Nothing scheduled right now" : tab === "sent" ? "No follow-ups sent yet" : "Nothing held back"} /> : (
        <ul className="divide-y" aria-label={`Follow-ups ${tab}`}>
          {shown.slice(0, 60).map((j) => {
            const w = who(j.conversation_id);
            return (
              <li key={j.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <span className="font-medium">{w.name}</span>
                <span className="text-xs text-muted-foreground">{rule(j.rule_id)?.name ?? "Rule"} · attempt {j.attempt}</span>
                {j.state === "scheduled" && <StatusBadge tone="info">{new Date(j.run_at) <= new Date() ? "Due — goes out at the next run" : `Due ${relativeTime(j.run_at)}`}</StatusBadge>}
                {j.state === "sent" && <StatusBadge tone="success">Sent {relativeTime(j.sent_at ?? j.run_at)}</StatusBadge>}
                {(j.state === "cancelled" || j.state === "failed") && <StatusBadge tone={j.state === "failed" ? "warning" : "neutral"}>{WHY[j.cancel_reason ?? ""] ?? j.cancel_reason ?? "Held back"}</StatusBadge>}
                {w.conv && <Link to="/inbox" search={{ c: j.conversation_id }} className="ml-auto text-xs text-primary hover:underline">Open chat</Link>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">The server checks every 5 minutes: it waits through quiet hours, sends at most one follow-up per customer a day, uses your approved template after 24 hours, and stops the moment the customer replies or opts out.</p>
    </Section>
  );
}
