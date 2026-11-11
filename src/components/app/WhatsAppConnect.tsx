/**
 * Connect the business's WhatsApp number (Meta WhatsApp Cloud API).
 * Normal way: "Connect WhatsApp" opens Meta's sign-up through Bizriva's Meta app.
 *   - "I use WhatsApp Business on my phone" keeps the phone app on the same number
 *     (Coexistence): scan Meta's QR code and up to 6 months of chats come in.
 *   - "Use a new number" registers a number that isn't on WhatsApp yet.
 * Advanced way: paste the keys of the business's own Meta app (token and app
 * secret go to the encrypted vault, never shown again) and our webhook into Meta.
 */
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";
import { metaSignup } from "@/lib/meta-signup";

export const WHATSAPP_WEBHOOK = "https://xjhzkciowmklxrtwsikm.supabase.co/functions/v1/whatsapp-webhook";

interface NumberRow { phone_number_id: string; waba_id: string | null; display_phone: string | null; verify_token: string; active: boolean; connected_at: string; last_inbound_at: string | null; last_sent_at: string | null; last_error: string | null;
  via: "manual" | "partner"; on_app: boolean; history_status: "syncing" | "done" | "declined" | "failed" | null; history_progress: number | null; history_messages: number; history_chats: number; contacts_synced: number; history_error: string | null }
interface Platform { appId: string | null; configId: string | null; ready: boolean }
const COLS = "phone_number_id, waba_id, display_phone, verify_token, active, connected_at, last_inbound_at, last_sent_at, last_error, via, on_app, history_status, history_progress, history_messages, history_chats, contacts_synced, history_error";

/** Read an Edge Function's error message. */
async function fnError(data: unknown, e: unknown, fallback: string): Promise<string | null> {
  let msg = (data as { error?: string } | null)?.error ?? null;
  if (e && !msg) { try { msg = (await (e as { context?: Response }).context?.json())?.error ?? null; } catch { /* not json */ } msg ??= fallback; }
  return msg;
}

export function Copy({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 flex gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{value}</code>
        <Button size="sm" variant="outline" aria-label={`Copy ${label}`} onClick={async () => { try { await navigator.clipboard.writeText(value); } catch { /* blocked */ } setDone(true); setTimeout(() => setDone(false), 1500); }}>{done ? "Copied" : "Copy"}</Button>
      </div>
    </div>
  );
}

export function WhatsAppConnect() {
  const { current } = useAuth();
  const ws = current?.workspaceId;
  const isOwner = current?.role === "owner";
  const [row, setRow] = useState<NumberRow | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ phoneNumberId: "", wabaId: "", displayPhone: "", token: "", appSecret: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const [{ data, error: e }, { data: p }] = await Promise.all([
      sb.from("whatsapp_numbers").select(COLS).eq("workspace_id", ws).maybeSingle(),
      sb.rpc("platform_meta"),
    ]);
    setPlatform((p as Platform | null) ?? { appId: null, configId: null, ready: false });
    if (e) { setError(e.message); setRow(null); return; }
    setRow((data as NumberRow | null) ?? null);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  // While chats are coming in from the phone, check progress every few seconds.
  const syncing = row?.history_status === "syncing";
  useEffect(() => { if (!syncing) return; const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [syncing, load]);

  if (!current) return null;
  if (current.role !== "owner" && current.role !== "manager") {
    return <p className="border-t p-4 text-sm text-muted-foreground">The owner connects WhatsApp for the business.</p>;
  }
  if (row === undefined) return <p className="border-t p-4 text-sm text-muted-foreground" role="status">Checking your WhatsApp connection…</p>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = supabase(); if (!sb || !ws) return;
    if (!/^\d{6,25}$/.test(f.phoneNumberId.trim())) return setError("The Phone number ID is the long number in Meta → WhatsApp → API setup, not your phone number.");
    if (!row && (f.token.trim().length < 20 || f.appSecret.trim().length < 16)) return setError("Paste the access token and the app secret from your Meta app.");
    setBusy(true); setError("");
    const { error: e2 } = await sb.rpc("save_whatsapp", { p_workspace: ws, p_phone_number_id: f.phoneNumberId.trim(), p_waba_id: f.wabaId.trim(), p_display_phone: f.displayPhone.trim(), p_token: f.token.trim(), p_app_secret: f.appSecret.trim() });
    setBusy(false);
    if (e2) return setError(e2.message);
    setF({ phoneNumberId: "", wabaId: "", displayPhone: "", token: "", appSecret: "" });
    setEditing(false);
    await load();
  };
  const disconnect = async () => {
    const sb = supabase(); if (!sb || !ws) return;
    setBusy(true);
    const { error: e2 } = await sb.rpc("disconnect_whatsapp", { p_workspace: ws });
    setBusy(false);
    if (e2) return setError(e2.message);
    await load();
  };

  const connectWithMeta = async (keepPhoneApp: boolean) => {
    const sb = supabase(); if (!sb || !ws || !platform?.ready || !platform.appId || !platform.configId) return;
    setBusy(true); setError(""); setDone("");
    try {
      const r = await metaSignup(platform.appId, platform.configId, keepPhoneApp);
      if (!r.ok) { setBusy(false); return setError(r.cancelled ? "" : r.error); }
      const { data, error: e } = await sb.functions.invoke("whatsapp-onboard", { body: { workspace: ws, code: r.code, redirect_uri: r.redirect_uri, waba_id: r.waba_id, phone_number_id: r.phone_number_id } });
      const msg = await fnError(data, e, "Couldn't finish connecting WhatsApp — try again.");
      if (msg) { setBusy(false); return setError(msg); }
      const d = data as { display_phone?: string; on_app?: boolean; sync_error?: string | null };
      setDone(d.on_app ? `${d.display_phone ?? "Your number"} is connected and still works on your phone. ${d.sync_error ? "Your old chats didn't start coming in — use “Bring in my chats” below." : "Your contacts and chats are coming in now — keep the WhatsApp Business app open on your phone until it finishes."}` : `${d.display_phone ?? "Your number"} is connected.`);
    } catch (x) { setError(x instanceof Error ? x.message : String(x)); }
    setBusy(false);
    await load();
  };
  const retrySync = async () => {
    const sb = supabase(); if (!sb || !ws) return;
    setBusy(true); setError("");
    const { data, error: e } = await sb.functions.invoke("whatsapp-onboard", { body: { workspace: ws, action: "sync" } });
    const msg = await fnError(data, e, "Couldn't ask for your chats — try again.");
    setBusy(false);
    if (msg) return setError(msg);
    await load();
  };

  const metaButtons = platform?.ready ? (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={busy} onClick={() => void connectWithMeta(true)} className="rounded-lg border-2 border-primary/40 p-3 text-left hover:border-primary disabled:opacity-60" aria-label="Connect the WhatsApp Business app I already use">
          <p className="font-semibold">I already use WhatsApp Business on my phone</p>
          <p className="mt-1 text-xs text-muted-foreground">Keep your number and your phone app. You'll scan a QR code, and your contacts and up to 6 months of chats come into Bizriva.</p>
        </button>
        <button type="button" disabled={busy} onClick={() => void connectWithMeta(false)} className="rounded-lg border p-3 text-left hover:border-primary/50 disabled:opacity-60" aria-label="Connect a new number">
          <p className="font-semibold">Use a new number</p>
          <p className="mt-1 text-xs text-muted-foreground">A number that isn't on WhatsApp yet. It will work in Bizriva only, not in a phone app.</p>
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{busy ? "Finish the steps in Meta's window…" : "A Meta window opens: log in with Facebook, confirm your business, then pick or scan your number. About 5 minutes. On your phone you need WhatsApp Business 2.24.17 or newer. If Meta says you've linked Bizriva before, choose “Edit settings” — not “Continue” — so you can pick your WhatsApp number."}</p>
    </div>
  ) : null;

  const form = (
    <form className="grid gap-2 sm:grid-cols-2" onSubmit={save} aria-label="Connect WhatsApp">
      <p className="text-xs text-muted-foreground sm:col-span-2">From your Meta app at developers.facebook.com → WhatsApp → API setup, and App settings → Basic for the app secret. Use a permanent (System User) token.</p>
      <Input value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value })} placeholder="Phone number ID" aria-label="Phone number ID" inputMode="numeric" />
      <Input value={f.wabaId} onChange={(e) => setF({ ...f, wabaId: e.target.value })} placeholder="WhatsApp Business Account ID (optional)" aria-label="WhatsApp Business Account ID" inputMode="numeric" />
      <Input value={f.displayPhone} onChange={(e) => setF({ ...f, displayPhone: e.target.value })} placeholder="Your WhatsApp number, e.g. +234 803 000 0000" aria-label="WhatsApp number" className="sm:col-span-2" />
      <Input type="password" autoComplete="off" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} placeholder={row ? "New access token (leave blank to keep)" : "Access token"} aria-label="Access token" />
      <Input type="password" autoComplete="off" value={f.appSecret} onChange={(e) => setF({ ...f, appSecret: e.target.value })} placeholder={row ? "New app secret (leave blank to keep)" : "App secret"} aria-label="App secret" />
      <p className="text-xs text-muted-foreground sm:col-span-2">The token and app secret are stored encrypted and never shown again.</p>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : row ? "Save changes" : "Connect WhatsApp"}</Button>
        {row && <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
      </div>
    </form>
  );

  return (
    <div className="space-y-3 border-t p-4 text-sm">
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {done && <p className="rounded-md bg-success/10 p-2 text-xs text-success" role="status">{done}</p>}
      {!row ? (
        !isOwner ? <p className="text-muted-foreground">Not connected yet — the owner connects WhatsApp here.</p> : (
          <div className="space-y-3">
            {metaButtons ?? <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">One-click WhatsApp connection is being switched on for Bizriva. Until then, you can connect with your own Meta app below.</p>}
            {metaButtons && !advanced ? <Button size="sm" variant="ghost" onClick={() => setAdvanced(true)}>Advanced: use my own Meta app</Button> : form}
          </div>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={row.last_error ? "warning" : row.last_inbound_at ? "success" : "info"}>{row.last_error ? "Needs attention" : row.last_inbound_at ? "Receiving messages" : "Waiting for Meta"}</StatusBadge>
            <span className="font-medium">{row.display_phone ?? `Number ${row.phone_number_id}`}</span>
            <span className="text-xs text-muted-foreground">connected {relativeTime(row.connected_at)}</span>
            {row.on_app && <StatusBadge tone="info">Also on your phone</StatusBadge>}
            {!row.active && <StatusBadge tone="danger">Disconnected</StatusBadge>}
          </div>
          {row.on_app && <HistoryStatus row={row} busy={busy} isOwner={isOwner} onRetry={() => void retrySync()} />}
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            <li>Last customer message: {row.last_inbound_at ? relativeTime(row.last_inbound_at) : "none yet"}</li>
            <li>Last message sent: {row.last_sent_at ? relativeTime(row.last_sent_at) : "none yet"}</li>
            {row.last_error && <li className="text-destructive">Last problem: {row.last_error}</li>}
          </ul>
          {row.via !== "partner" && <div className="rounded-md border p-3">
            <p className="mb-2 font-medium">Paste these into Meta → WhatsApp → Configuration → Webhook, then subscribe to “messages”.</p>
            <div className="space-y-2">
              <Copy label="Callback URL" value={WHATSAPP_WEBHOOK} />
              <Copy label="Verify token" value={row.verify_token} />
            </div>
          </div>}
          <p className="text-xs text-muted-foreground">Replies go out within a minute. Outside 24 hours since the customer's last message, WhatsApp only allows approved templates — those messages show as failed with the reason.</p>
          {isOwner && (editing ? form : (
            <div className="flex flex-wrap gap-2">
              {!row.active && metaButtons && <div className="w-full"><p className="mb-2 font-medium">Connect again</p>{metaButtons}</div>}
              {row.via !== "partner" && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Update keys</Button>}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>Disconnect</Button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function HistoryStatus({ row, busy, isOwner, onRetry }: { row: NumberRow; busy: boolean; isOwner: boolean; onRetry: () => void }) {
  const counts = `${row.history_messages.toLocaleString()} messages from ${row.history_chats.toLocaleString()} chats · ${row.contacts_synced.toLocaleString()} contacts`;
  const within24h = Date.now() - new Date(row.connected_at).getTime() < 24 * 3600_000;
  return (
    <div className="rounded-md border p-3 text-xs" aria-label="Chats from your phone">
      {row.history_status === "syncing" && <>
        <p className="font-medium text-foreground">Bringing in your chats from the phone… {row.history_progress ?? 0}%</p>
        <div className="mt-2 h-2 rounded bg-muted" role="progressbar" aria-valuenow={row.history_progress ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Chat history progress"><div className="h-2 rounded bg-primary" style={{ width: `${row.history_progress ?? 0}%` }} /></div>
        <p className="mt-1 text-muted-foreground">{counts} so far. Keep the WhatsApp Business app open on your phone until this finishes.</p>
      </>}
      {row.history_status === "done" && <p><span className="font-medium text-foreground">Your chats are in.</span> <span className="text-muted-foreground">{counts}. Old messages are history only — the assistant won't answer them and no reminders go out.</span></p>}
      {row.history_status === "declined" && <p className="text-muted-foreground"><span className="font-medium text-foreground">Old chats weren't shared.</span> Sharing chat history was turned off on the phone. New messages still come in. To bring in old chats, disconnect in the WhatsApp Business app (Settings → Account → Business Platform), connect again here and choose to share history.</p>}
      {row.history_status === "failed" && <div className="space-y-2">
        <p className="text-muted-foreground"><span className="font-medium text-foreground">Your old chats didn't come in.</span> {row.history_error}</p>
        {isOwner && within24h && <Button size="sm" variant="outline" disabled={busy} onClick={onRetry}>Bring in my chats</Button>}
      </div>}
      {!row.history_status && <p className="text-muted-foreground">New messages from your phone number come in here, and replies you send from the phone show in each chat.</p>}
    </div>
  );
}
