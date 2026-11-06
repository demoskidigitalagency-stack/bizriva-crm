/**
 * SMS through Termii (real data). The owner adds the Termii API key (kept in
 * the encrypted vault, never shown again) and their approved sender ID.
 * "SMS backup" sends order and delivery updates by SMS when WhatsApp can't.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { useDb, useLive } from "@/domain/store";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";

interface Sent { id: string; body: string | null; status: string; error: string | null; created_at: string }

export function SmsConnect() {
  const { current } = useAuth();
  const db = useDb();
  const live = useLive();
  const sms = db.settings.sms ?? { provider: "none" as const };
  const connected = sms.provider === "termii";
  const isOwner = current?.role === "owner";
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ key: "", sender: sms.sender ?? "", fallback: sms.fallback !== false, address: sms.baseUrl ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [sent, setSent] = useState<Sent[]>([]);

  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !current) return;
    const { data } = await sb.from("messages").select("id, body, status, error, created_at, conversations!inner(channel)").eq("workspace_id", current.workspaceId).eq("conversations.channel", "sms").eq("direction", "out").order("created_at", { ascending: false }).limit(8);
    setSent((data ?? []) as Sent[]);
  }, [current]);
  useEffect(() => { if (connected) void load(); }, [connected, load]);

  const save = async () => {
    const sb = supabase(); if (!sb || !current) return;
    setBusy(true); setMsg({});
    const r = await sb.rpc("save_sms_key", { p_workspace: current.workspaceId, p_sender: f.sender.trim(), p_secret: f.key.trim(), p_fallback: f.fallback });
    const r2 = r.error ? r : await sb.rpc("set_sms_address", { p_workspace: current.workspaceId, p_url: f.address.trim() });
    setBusy(false);
    if (r2.error) { setMsg({ error: r2.error.message }); return; }
    setF((x) => ({ ...x, key: "" })); setEditing(false); setMsg({ ok: "SMS connected" });
    await live.reload();
  };
  const disconnect = async () => {
    const sb = supabase(); if (!sb || !current) return;
    setBusy(true);
    const { error } = await sb.rpc("disconnect_sms", { p_workspace: current.workspaceId });
    setBusy(false);
    if (error) setMsg({ error: error.message }); else { setMsg({ ok: "SMS disconnected — the key was wiped" }); await live.reload(); }
  };

  return (
    <Section title="SMS (Termii)" action={connected ? <StatusBadge tone="success">Connected</StatusBadge> : <StatusBadge>Not connected</StatusBadge>}>
      <div className="space-y-3 p-4 text-sm">
        <p className="text-muted-foreground">Order and delivery updates by SMS, and messages to customers in an SMS chat. Uses your own Termii account and sender ID. SMS here is send-only.</p>
        {connected && !editing ? (
          <>
            <dl className="grid gap-1 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Sender ID</dt><dd className="font-medium">{sms.sender}</dd></div>
              <div><dt className="text-xs text-muted-foreground">SMS backup for order updates</dt><dd className="font-medium">{sms.fallback !== false ? "On — when WhatsApp can't deliver" : "Off"}</dd></div>
              {sms.lastSentAt && <div><dt className="text-xs text-muted-foreground">Last SMS sent</dt><dd>{relativeTime(sms.lastSentAt)}</dd></div>}
            </dl>
            {sms.lastError && <p className="rounded bg-destructive/10 p-2 text-xs text-destructive" role="note">Last problem from Termii: {sms.lastError}</p>}
            {sent.length > 0 && (
              <ul className="divide-y rounded border text-xs" aria-label="Latest SMS">
                {sent.map((m) => <li key={m.id} className="flex items-start justify-between gap-2 p-2"><span className="min-w-0 truncate">{m.body}</span><span className={m.status === "failed" ? "shrink-0 text-destructive" : "shrink-0 text-muted-foreground"}>{m.status === "failed" ? m.error ?? "failed" : m.status} · {relativeTime(m.created_at)}</span></li>)}
              </ul>
            )}
            {isOwner && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(true)}>Change</Button><Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void disconnect()}>Disconnect</Button></div>}
          </>
        ) : isOwner ? (
          <form aria-label="Connect SMS" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="sms-key">Termii API key{connected ? " (leave empty to keep the saved one)" : ""}</Label><Input id="sms-key" type="password" autoComplete="off" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder="From Termii → Settings → API token" /></div>
            <div className="space-y-1.5"><Label htmlFor="sms-sender">Sender ID</Label><Input id="sms-sender" value={f.sender} maxLength={11} onChange={(e) => setF({ ...f, sender: e.target.value })} placeholder="GlowNG" /></div>
            <div className="space-y-1.5"><Label htmlFor="sms-addr">API address (optional)</Label><Input id="sms-addr" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="https://v3.api.termii.com" /></div>
            <label className="flex items-center gap-2 sm:col-span-2"><Switch checked={f.fallback} onCheckedChange={(v) => setF({ ...f, fallback: v })} aria-label="SMS backup" /> Send order updates by SMS when WhatsApp can't deliver them</label>
            <p className="text-xs text-muted-foreground sm:col-span-2">The sender ID must be approved in your Termii account first. Order updates use Termii's DND route so they reach numbers on Do-Not-Disturb (Termii charges more for it).</p>
            <div className="flex gap-2 sm:col-span-2"><Button type="submit" size="sm" disabled={busy}>{connected ? "Save" : "Connect SMS"}</Button>{editing && <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}</div>
          </form>
        ) : <p className="text-xs text-muted-foreground">Only the owner can connect SMS.</p>}
        {msg.ok && <p className="text-success" role="status">{msg.ok}</p>}
        {msg.error && <p className="text-destructive" role="alert">{msg.error}</p>}
      </div>
    </Section>
  );
}
