/**
 * Connect the business's own WhatsApp number (Meta WhatsApp Cloud API).
 * The owner pastes four things from their Meta app once; the token and app
 * secret go straight to the encrypted vault and are never shown again.
 * Then they paste our callback address and verify token into Meta.
 */
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";

export const WHATSAPP_WEBHOOK = "https://xjhzkciowmklxrtwsikm.supabase.co/functions/v1/whatsapp-webhook";

interface NumberRow { phone_number_id: string; waba_id: string | null; display_phone: string | null; verify_token: string; active: boolean; connected_at: string; last_inbound_at: string | null; last_sent_at: string | null; last_error: string | null }

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

  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const { data, error: e } = await sb.from("whatsapp_numbers").select("phone_number_id, waba_id, display_phone, verify_token, active, connected_at, last_inbound_at, last_sent_at, last_error").eq("workspace_id", ws).maybeSingle();
    if (e) { setError(e.message); setRow(null); return; }
    setRow((data as NumberRow | null) ?? null);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);

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
      {!row ? (
        isOwner ? form : <p className="text-muted-foreground">Not connected yet — the owner connects WhatsApp here.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={row.last_error ? "warning" : row.last_inbound_at ? "success" : "info"}>{row.last_error ? "Needs attention" : row.last_inbound_at ? "Receiving messages" : "Waiting for Meta"}</StatusBadge>
            <span className="font-medium">{row.display_phone ?? `Number ${row.phone_number_id}`}</span>
            <span className="text-xs text-muted-foreground">connected {relativeTime(row.connected_at)}</span>
          </div>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            <li>Last customer message: {row.last_inbound_at ? relativeTime(row.last_inbound_at) : "none yet"}</li>
            <li>Last message sent: {row.last_sent_at ? relativeTime(row.last_sent_at) : "none yet"}</li>
            {row.last_error && <li className="text-destructive">Last problem: {row.last_error}</li>}
          </ul>
          <div className="rounded-md border p-3">
            <p className="mb-2 font-medium">Paste these into Meta → WhatsApp → Configuration → Webhook, then subscribe to “messages”.</p>
            <div className="space-y-2">
              <Copy label="Callback URL" value={WHATSAPP_WEBHOOK} />
              <Copy label="Verify token" value={row.verify_token} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Replies go out within a minute. Outside 24 hours since the customer's last message, WhatsApp only allows approved templates — those messages show as failed with the reason.</p>
          {isOwner && (editing ? form : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Update keys</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>Disconnect</Button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
