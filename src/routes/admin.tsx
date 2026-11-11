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
import { Copy, WHATSAPP_WEBHOOK } from "@/components/app/WhatsAppConnect";

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
      <MetaApp />
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

interface MetaSettings { appId: string | null; configId: string | null; hasSecret: boolean; verifyToken: string; updatedAt: string; numbers: number; onApp: number;
  lastWebhook?: { at: string | null; fields: string | null; number: string | null; ok: boolean | null; total: number } | null }

/** Bizriva's own Meta app: lets every business connect WhatsApp in a few clicks (Meta Tech Provider). */
function MetaApp() {
  const [m, setM] = useState<MetaSettings | null>(null);
  const [f, setF] = useState({ appId: "", configId: "", secret: "" });
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const sb = supabase(); if (!sb) return;
    const { data } = await sb.rpc("admin_meta_settings");
    const d = data as MetaSettings | null;
    setM(d); if (d) setF((x) => ({ ...x, appId: d.appId ?? "", configId: d.configId ?? "" }));
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!m) return null;
  const ready = !!(m.appId && m.configId && m.hasSecret);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = supabase(); if (!sb) return;
    setBusy(true);
    const { error } = await sb.rpc("admin_set_meta", { p_app_id: f.appId.trim(), p_config_id: f.configId.trim(), p_app_secret: f.secret.trim() });
    setBusy(false);
    setMsg(error ? { error: error.message } : { ok: "Saved. Businesses can now connect WhatsApp with Meta's sign-up." });
    if (!error) { setF((x) => ({ ...x, secret: "" })); await load(); }
  };
  return (
    <Section title="WhatsApp for every business (Bizriva's Meta app)" description="Fill this once Meta approves Bizriva as a Tech Provider. Then owners connect WhatsApp in a few clicks — including numbers that stay on the WhatsApp Business app."
      action={<StatusBadge tone={ready ? "success" : "warning"}>{ready ? `On · ${m.numbers} connected (${m.onApp} also on the phone)` : "Not switched on"}</StatusBadge>}>
      <div className="grid gap-4 p-4 text-sm lg:grid-cols-2">
        <form className="space-y-2" onSubmit={save} aria-label="Bizriva Meta app">
          <Input value={f.appId} onChange={(e) => setF({ ...f, appId: e.target.value.replace(/\D/g, "") })} placeholder="App ID" aria-label="Meta App ID" inputMode="numeric" />
          <Input value={f.configId} onChange={(e) => setF({ ...f, configId: e.target.value.replace(/\D/g, "") })} placeholder="Embedded Signup configuration ID" aria-label="Configuration ID" inputMode="numeric" />
          <Input type="password" autoComplete="off" value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} placeholder={m.hasSecret ? "App secret saved (leave blank to keep)" : "App secret"} aria-label="Meta app secret" />
          <p className="text-xs text-muted-foreground">App ID and app secret: your Meta app → App settings → Basic. Configuration ID: Facebook Login for Business → Configurations (WhatsApp Embedded Signup). The secret is stored encrypted and never shown again.</p>
          <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          {msg.ok && <p className="text-xs text-success" role="status">{msg.ok}</p>}
          {msg.error && <p className="text-xs text-destructive" role="alert">{msg.error}</p>}
        </form>
        <div className="space-y-2 rounded-md border p-3">
          <p className="font-medium">In your Meta app → WhatsApp → Configuration → Webhook</p>
          <Copy label="Callback URL" value={WHATSAPP_WEBHOOK} />
          <Copy label="Verify token" value={m.verifyToken} />
          <p className="text-xs text-muted-foreground">Then subscribe to: messages, history, smb_app_state_sync, smb_message_echoes, account_update.</p>
          <p className="text-xs" role="status">{m.lastWebhook?.at
            ? <>Last message from Meta: <strong>{relativeTime(m.lastWebhook.at)}</strong> ({m.lastWebhook.fields}{m.lastWebhook.number ? `, ${m.lastWebhook.number}` : ""}){m.lastWebhook.ok ? "" : " — not linked to a business on Bizriva yet"}</>
            : "Meta hasn't sent anything yet."}</p>
        </div>
      </div>
    </Section>
  );
}
