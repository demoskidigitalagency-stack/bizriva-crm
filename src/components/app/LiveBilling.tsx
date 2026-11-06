/**
 * Billing on real data: the plan, real usage against its limits, when the
 * trial ends, paying for a plan (Paystack, Bizriva's own account) and past payments.
 */
import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PlanRow { id: string; name: string; price_ngn: number; contacts: number; seats: number; messages_month: number; storage_mb: number; sort: number }
interface Usage { plan: string; name: string; trialEndsAt: string | null; renewsAt: string | null; active: boolean; suspended: boolean; suspendedReason: string | null; limits: { contacts: number; seats: number; messages: number; storageMb: number }; used: { contacts: number; seats: number; messages: number; storageMb: number } }
interface Pay { id: string; plan: string; amount: number; reference: string; status: string; paid_at: string | null; created_at: string }

function Meter({ label, used, limit, unit = "", note }: { label: string; used: number; limit: number; unit?: string; note?: string }) {
  const pct = Math.min(100, (used / Math.max(limit, 1)) * 100);
  return (
    <div className="text-sm">
      <div className="flex justify-between"><span>{label}</span><span className="num text-muted-foreground">{used.toLocaleString()}{unit} of {limit.toLocaleString()}{unit}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label={label} aria-valuenow={used} aria-valuemax={limit}><div className={cn("h-full rounded-full", pct >= 100 ? "bg-destructive" : pct > 80 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export function LiveBilling() {
  const { current } = useAuth();
  const ws = current?.workspaceId;
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [u, setU] = useState<Usage | null>(null);
  const [pays, setPays] = useState<Pay[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const paidBack = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("paid") === "1";

  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const [p, us, pp] = await Promise.all([
      sb.from("plans").select("*").order("sort"),
      sb.rpc("plan_usage", { p_workspace: ws }),
      sb.from("plan_payments").select("id, plan, amount, reference, status, paid_at, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(12),
    ]);
    setPlans((p.data ?? []) as PlanRow[]); setU((us.data as Usage | null) ?? null); setPays((pp.data ?? []) as Pay[]);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);

  const pay = async (plan: string) => {
    const sb = supabase(); if (!sb || !ws) return;
    setBusy(plan); setError("");
    const { data, error: e } = await sb.functions.invoke("billing", { body: { workspace_id: ws, plan } });
    setBusy("");
    let msg = (data as { error?: string } | null)?.error;
    if (e && !msg) { try { msg = (await (e as { context?: Response }).context?.json())?.error; } catch { /* not json */ } msg ??= "Couldn't start the payment"; }
    if (msg) return setError(msg);
    const link = (data as { url?: string }).url;
    if (link) window.location.href = link;
  };

  if (!u) return <p className="text-sm text-muted-foreground" role="status">Loading your plan…</p>;
  const daysLeft = u.trialEndsAt ? Math.ceil((Date.parse(u.trialEndsAt) - Date.now()) / 86_400_000) : null;
  const isOwner = current?.role === "owner";
  return (
    <div className="space-y-4">
      {paidBack && <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm" role="status">Thank you — your payment is being confirmed. Your plan updates here within a minute.</p>}
      {u.suspended && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">This business is suspended: {u.suspendedReason}. Contact Bizriva support.</p>}
      {!u.active && !u.suspended && <p className="rounded-md bg-warning/15 p-3 text-sm" role="alert">{u.plan === "trial" ? "Your free trial has ended." : "Your plan's payment is overdue."} The AI assistant and broadcasts are paused until you pay for a plan. Everything else keeps working.</p>}
      <Section title={`Current plan: ${u.name}`} action={u.plan === "trial" ? <StatusBadge tone={u.active ? "info" : "warning"}>{u.active && daysLeft !== null ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : "Trial ended"}</StatusBadge> : <StatusBadge tone={u.active ? "success" : "warning"}>{u.renewsAt ? `Paid until ${formatDate(u.renewsAt)}` : "Active"}</StatusBadge>}>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Meter label="Customers" used={u.used.contacts} limit={u.limits.contacts} note="Customers who message you are always saved, even over the limit." />
          <Meter label="Team seats" used={u.used.seats} limit={u.limits.seats} note="Includes invites not yet accepted." />
          <Meter label="Broadcast and follow-up messages this month" used={u.used.messages} limit={u.limits.messages} note="Replies, order updates and the AI don't count." />
          <Meter label="Media storage" used={u.used.storageMb} limit={u.limits.storageMb} unit=" MB" />
        </div>
      </Section>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const mine = p.id === u.plan;
          return (
            <div key={p.id} className={cn("rounded-lg border bg-card p-4", mine && "border-primary ring-2 ring-primary/30")}>
              <p className="font-semibold">{p.name}</p>
              <p className="num mt-1 text-2xl font-bold">{Number(p.price_ngn) ? formatCurrency(Number(p.price_ngn), "NGN") : "Free"}<span className="text-xs font-normal text-muted-foreground">{Number(p.price_ngn) ? " / month" : " for 14 days"}</span></p>
              <ul className="mt-3 space-y-1 text-sm">
                {[`${p.contacts.toLocaleString()} customers`, `${p.seats} team seats`, `${p.messages_month.toLocaleString()} broadcast messages / month`, `${p.storage_mb >= 1000 ? `${p.storage_mb / 1000} GB` : `${p.storage_mb} MB`} media`].map((x) => <li key={x} className="flex gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />{x}</li>)}
              </ul>
              {p.id !== "trial" && (isOwner
                ? <Button size="sm" className="mt-4 w-full" variant={mine ? "outline" : "default"} disabled={!!busy} onClick={() => void pay(p.id)}>{busy === p.id ? "Opening Paystack…" : mine ? "Pay for next month" : `Choose ${p.name}`}</Button>
                : <p className="mt-4 text-xs text-muted-foreground">The owner pays for the plan.</p>)}
            </div>
          );
        })}
      </div>
      <Section title="Payments">
        {pays.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No payments yet.</p> : (
          <ul className="divide-y text-sm" aria-label="Plan payments">
            {pays.map((x) => <li key={x.id} className="flex justify-between gap-2 px-4 py-2"><span>{plans.find((p) => p.id === x.plan)?.name ?? x.plan} · <span className="num">{formatCurrency(Number(x.amount), "NGN")}</span> · <span className="font-mono text-xs">{x.reference}</span></span><span className={x.status === "paid" ? "text-success" : "text-muted-foreground"}>{x.status === "paid" && x.paid_at ? `Paid ${formatDate(x.paid_at)}` : x.status}</span></li>)}
          </ul>
        )}
      </Section>
    </div>
  );
}
