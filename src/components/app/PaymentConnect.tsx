/**
 * Real data: connect the business's own Paystack, Flutterwave or Monnify account.
 * Keys go straight to the encrypted vault and are never shown again. Shows the
 * notification address to paste into the provider's dashboard.
 */
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";

const PROVIDERS = [
  { id: "paystack", name: "Paystack", what: "Payment links (card, transfer, USSD)", key: "Secret key (sk_live_…)", where: "Paystack → Settings → API Keys & Webhooks" },
  { id: "flutterwave", name: "Flutterwave", what: "Payment links (card, transfer, USSD)", key: "Secret key (FLWSECK-…)", where: "Flutterwave → Settings → API keys, and Webhooks for the secret hash" },
  { id: "monnify", name: "Monnify", what: "Confirms bank transfers into your accounts", key: "Client secret key", where: "Monnify → Developer → API keys & Webhooks" },
] as const;
type Pid = (typeof PROVIDERS)[number]["id"];
interface Conn { provider: Pid; connected_at: string; has_key: boolean; has_hash: boolean }

export function PaymentConnect() {
  const { current } = useAuth();
  const ws = current?.workspaceId;
  const canEdit = current?.role === "owner" || current?.role === "finance";
  const [conn, setConn] = useState<Conn | null | undefined>(undefined);
  const [f, setF] = useState<{ provider: Pid; key: string; hash: string }>({ provider: "paystack", key: "", hash: "" });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const { data } = await sb.rpc("payment_connection", { p_workspace: ws });
    const c = (data as Conn | null) ?? null;
    setConn(c && c.has_key ? c : null);
    if (c) setF((x) => ({ ...x, provider: c.provider }));
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  if (!current || !ws) return null;

  const hook = `https://xjhzkciowmklxrtwsikm.supabase.co/functions/v1/payments-webhook/${conn?.provider ?? f.provider}/${ws}`;
  const p = PROVIDERS.find((x) => x.id === f.provider)!;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = supabase(); if (!sb) return;
    if (f.key.trim().length < 16 && !(conn && f.provider === conn.provider && !f.key)) return setMsg({ error: "Paste the secret key from your provider's dashboard." });
    setBusy(true); setMsg({});
    let err: string | undefined;
    if (f.key.trim()) err = (await sb.rpc("save_payment_key", { p_workspace: ws, p_provider: f.provider, p_secret: f.key.trim() })).error?.message;
    if (!err && f.provider === "flutterwave" && f.hash.trim()) err = (await sb.rpc("save_payment_hash", { p_workspace: ws, p_hash: f.hash.trim() })).error?.message;
    setBusy(false);
    if (err) return setMsg({ error: err });
    setF({ ...f, key: "", hash: "" }); setEditing(false); setMsg({ ok: `${p.name} connected` }); await load();
  };
  const disconnect = async () => {
    const sb = supabase(); if (!sb) return;
    setBusy(true);
    const { error } = await sb.rpc("disconnect_payments", { p_workspace: ws });
    setBusy(false);
    if (error) setMsg({ error: error.message }); else { setMsg({}); await load(); }
  };

  const form = (
    <form className="space-y-3" onSubmit={save} aria-label="Connect payments">
      <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Payment provider">
        {PROVIDERS.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={f.provider === x.id} onClick={() => setF({ ...f, provider: x.id })}
            className={`rounded-lg border p-3 text-left ${f.provider === x.id ? "border-primary bg-primary/5" : ""}`}>
            <span className="block font-semibold">{x.name}</span><span className="block text-xs text-muted-foreground">{x.what}</span>
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pay-key">{p.key}</Label>
        <Input id="pay-key" type="password" autoComplete="off" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder={conn ? "New key (leave blank to keep)" : ""} />
      </div>
      {f.provider === "flutterwave" && (
        <div className="space-y-1.5">
          <Label htmlFor="pay-hash">Secret hash (the one you typed in Flutterwave's Webhooks settings)</Label>
          <Input id="pay-hash" type="password" autoComplete="off" value={f.hash} onChange={(e) => setF({ ...f, hash: e.target.value })} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">Find it at {p.where}. Stored encrypted, never shown again. Use test keys first if you want to try it safely.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : conn ? "Save" : `Connect ${p.name}`}</Button>
        {conn && <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
      </div>
    </form>
  );

  return (
    <Section title="Get paid inside WhatsApp" description="Send a payment link from any chat. When the customer pays, the order is marked paid and they get a confirmation in the chat." action={<StatusBadge tone={conn ? "success" : "neutral"}>{conn ? "Connected" : "Not connected"}</StatusBadge>}>
      <div className="space-y-3 p-4 text-sm">
        {msg.error && <p className="text-xs text-destructive" role="alert">{msg.error}</p>}
        {msg.ok && <p className="text-xs text-success" role="status">{msg.ok}</p>}
        {conn === undefined ? <p className="text-muted-foreground" role="status">Checking…</p> : !conn ? (
          canEdit ? form : <p className="text-muted-foreground">Not connected yet — the owner or finance connects payments here.</p>
        ) : (
          <>
            <p><span className="font-semibold">{PROVIDERS.find((x) => x.id === conn.provider)?.name}</span> <span className="text-xs text-muted-foreground">connected {relativeTime(conn.connected_at)}</span></p>
            {conn.provider === "flutterwave" && !conn.has_hash && <p className="text-xs text-warning">Add Flutterwave's secret hash so payments are confirmed automatically.</p>}
            {conn.provider === "monnify" && <p className="text-xs text-muted-foreground">Monnify confirms bank transfers. For payment links in the chat, connect Paystack or Flutterwave instead.</p>}
            {canEdit && (editing ? form : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Change</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>Disconnect</Button>
              </div>
            ))}
          </>
        )}
        <div className="rounded-md border p-3">
          <p className="mb-1 font-medium">Paste this notification address into your provider's dashboard (Webhooks)</p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs" aria-label="Notification address">{hook}</code>
            <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(hook); } catch { /* blocked */ } setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Every notification is checked with your key before it counts, and each payment is applied once.</p>
        </div>
      </div>
    </Section>
  );
}
