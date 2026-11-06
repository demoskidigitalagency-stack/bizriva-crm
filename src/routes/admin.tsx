/**
 * Super Admin (Bizriva staff only): every business on the platform, its plan,
 * usage and health; change a plan, extend a trial, suspend or restore a business.
 * The server refuses all of it for anyone who isn't a platform admin.
 */
import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Super Admin · Bizriva" }, { name: "robots", content: "noindex" }] }),
  component: Admin,
});

interface Biz { id: string; name: string; plan: string; createdAt: string; trialEndsAt: string | null; renewsAt: string | null; active: boolean; suspended: boolean; suspendedReason: string | null; owner: string | null; members: number; contacts: number; orders30d: number; lastActivity: string | null; whatsapp: boolean; ai: boolean }
interface Overview { totals: { businesses: number; paying: number; trialsActive: number; suspended: number; mrr: number; orders30d: number; messages24h: number }; businesses: Biz[] }

function Admin() {
  const [o, setO] = useState<Overview | null>(null);
  const [denied, setDenied] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const load = useCallback(async () => {
    const sb = supabase(); if (!sb) return setDenied("Sign in first.");
    const { data, error } = await sb.rpc("admin_overview");
    if (error) setDenied(error.message.includes("Super Admin") ? "This page is for Bizriva staff only." : error.message);
    else setO(data as Overview);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const sb = supabase(); if (!sb) return;
    const { error } = await sb.rpc(fn, args);
    setMsg(error ? { error: error.message } : { ok });
    if (!error) await load();
  };

  if (denied) return <p className="p-6 text-sm text-muted-foreground" role="alert">{denied}</p>;
  if (!o) return <p className="p-6 text-sm text-muted-foreground" role="status">Loading…</p>;
  const list = o.businesses.filter((b) => !q.trim() || `${b.name} ${b.owner ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Bizriva</p>
        <h1 className="text-2xl font-bold">Super Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every business on the platform. Changes here are recorded in that business's history.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Businesses" value={String(o.totals.businesses)} hint={`${o.totals.trialsActive} in trial`} />
        <KpiCard label="Paying" value={String(o.totals.paying)} tone="success" />
        <KpiCard label="Monthly revenue" value={formatCurrency(Number(o.totals.mrr), "NGN")} tone="brand" />
        <KpiCard label="Orders (30 days)" value={o.totals.orders30d.toLocaleString()} hint={`${o.totals.messages24h.toLocaleString()} messages today`} tone="info" />
      </div>
      {msg.ok && <p className="text-sm text-success" role="status">{msg.ok}</p>}
      {msg.error && <p className="text-sm text-destructive" role="alert">{msg.error}</p>}
      <Section title="Businesses" action={<Input className="h-8 w-56" placeholder="Find a business or owner" aria-label="Find a business" value={q} onChange={(e) => setQ(e.target.value)} />}>
        <ul className="divide-y" aria-label="Businesses">
          {list.map((b) => <BizRow key={b.id} b={b} act={act} />)}
          {list.length === 0 && <li className="p-4 text-sm text-muted-foreground">No businesses match.</li>}
        </ul>
      </Section>
    </div>
  );
}

function BizRow({ b, act }: { b: Biz; act: (fn: string, args: Record<string, unknown>, ok: string) => Promise<void> }) {
  const [plan, setPlan] = useState(b.plan);
  const [days, setDays] = useState(b.plan === "trial" ? "14" : "30");
  const [reason, setReason] = useState("");
  return (
    <li className="space-y-2 px-4 py-3 text-sm" aria-label={b.name}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{b.name}</p>
        <StatusBadge tone={b.plan === "trial" ? "info" : "success"}>{b.plan}</StatusBadge>
        {b.suspended ? <StatusBadge tone="danger">Suspended</StatusBadge> : !b.active && <StatusBadge tone="warning">Paused — {b.plan === "trial" ? "trial ended" : "payment overdue"}</StatusBadge>}
        {b.whatsapp && <StatusBadge>WhatsApp</StatusBadge>}{b.ai && <StatusBadge>AI</StatusBadge>}
      </div>
      <p className="text-xs text-muted-foreground">{b.owner ?? "No owner"} · joined {formatDate(b.createdAt)} · {b.members} team · {b.contacts.toLocaleString()} customers · {b.orders30d} orders in 30 days · {b.lastActivity ? `last message ${relativeTime(b.lastActivity)}` : "no messages yet"}
        {b.plan === "trial" && b.trialEndsAt ? ` · trial ends ${formatDate(b.trialEndsAt)}` : b.renewsAt ? ` · paid until ${formatDate(b.renewsAt)}` : ""}{b.suspendedReason ? ` · suspended: ${b.suspendedReason}` : ""}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger className="h-8 w-28" aria-label={`Plan for ${b.name}`}><SelectValue /></SelectTrigger>
          <SelectContent>{["trial", "starter", "growth", "scale"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
        <Input className="h-8 w-16" inputMode="numeric" aria-label={`Days for ${b.name}`} value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
        <span className="text-xs text-muted-foreground">days</span>
        <Button size="sm" variant="outline" onClick={() => void act("admin_set_plan", { p_workspace: b.id, p_plan: plan, p_days: Number(days) || null }, `${b.name}: ${plan} for ${days} days`)}>Set plan</Button>
        {b.suspended
          ? <Button size="sm" variant="outline" onClick={() => void act("admin_suspend", { p_workspace: b.id, p_suspend: false, p_reason: null }, `${b.name} restored`)}>Restore</Button>
          : <><Input className="h-8 w-48" placeholder="Reason to suspend" aria-label={`Reason to suspend ${b.name}`} value={reason} onChange={(e) => setReason(e.target.value)} /><Button size="sm" variant="ghost" className="text-destructive" disabled={!reason.trim()} onClick={() => void act("admin_suspend", { p_workspace: b.id, p_suspend: true, p_reason: reason }, `${b.name} suspended`)}>Suspend</Button></>}
      </div>
    </li>
  );
}
