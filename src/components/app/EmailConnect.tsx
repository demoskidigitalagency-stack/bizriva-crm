/**
 * Connect the business's own email service (real data): Brevo, Resend or Mailgun.
 * The key goes straight to the encrypted vault and is never shown again.
 * Shows a test-email button and the latest emails with what happened to each.
 */
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { useActions, useDb, useLive } from "@/domain/store";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";

const SERVICES = [
  { id: "brevo", name: "Brevo", hint: "Free for 300 emails a day", where: "brevo.com → SMTP & API → API keys" },
  { id: "resend", name: "Resend", hint: "Free for 3,000 emails a month", where: "resend.com → API Keys" },
  { id: "mailgun", name: "Mailgun", hint: "Pay as you go", where: "mailgun.com → API keys (US region)" },
] as const;
interface Sent { id: string; kind: string; to_email: string; subject: string; status: string; error: string | null; created_at: string }

export function EmailConnect() {
  const { current } = useAuth();
  const db = useDb();
  const live = useLive();
  const { updateSettings } = useActions();
  const ws = current?.workspaceId;
  const isOwner = current?.role === "owner";
  const e = db.settings.email;
  const connected = e.provider !== "none";
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ provider: (connected ? e.provider : "brevo") as string, from: e.fromEmail, name: e.fromName, key: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [sent, setSent] = useState<Sent[]>([]);

  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const { data } = await sb.from("email_outbox").select("id, kind, to_email, subject, status, error, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(10);
    setSent((data as Sent[] | null) ?? []);
  }, [ws]);
  useEffect(() => { void load(); }, [load, db]);
  if (!current || (current.role !== "owner" && current.role !== "manager")) return null;

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const sb = supabase(); if (!sb || !ws) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.from.trim())) return setMsg({ error: "Enter the address to send from — one on a domain you've set up with the service." });
    if (!connected && f.key.trim().length < 16) return setMsg({ error: "Paste the API key from your email service." });
    setBusy(true); setMsg({});
    const { error } = await sb.rpc("save_email_key", { p_workspace: ws, p_provider: f.provider, p_from: f.from.trim(), p_secret: f.key.trim() });
    if (!error && f.name.trim() && f.name.trim() !== e.fromName) updateSettings({ email: { ...e, fromName: f.name.trim() } });
    setBusy(false);
    if (error) return setMsg({ error: error.message });
    setF({ ...f, key: "" }); setEditing(false); setMsg({ ok: "Email service connected" }); await live.reload();
  };
  const test = async () => {
    const sb = supabase(); if (!sb || !ws) return;
    setBusy(true); setMsg({});
    const { data, error } = await sb.rpc("send_test_email", { p_workspace: ws });
    setBusy(false);
    if (error) setMsg({ error: error.message }); else { setMsg({ ok: `Test email queued to ${data} — it goes out within a minute.` }); await load(); }
  };
  const disconnect = async () => {
    const sb = supabase(); if (!sb || !ws) return;
    setBusy(true);
    const { error } = await sb.rpc("disconnect_email", { p_workspace: ws });
    setBusy(false);
    if (error) setMsg({ error: error.message }); else await live.reload();
  };

  const svc = SERVICES.find((s) => s.id === f.provider) ?? SERVICES[0];
  const form = (
    <form className="space-y-3" onSubmit={save} aria-label="Connect email">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Email service">
        {SERVICES.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={f.provider === s.id} onClick={() => setF({ ...f, provider: s.id })}
            className={`rounded-lg border p-3 text-left ${f.provider === s.id ? "border-primary bg-primary/5" : ""}`}>
            <span className="block font-medium">{s.name}</span><span className="block text-xs text-muted-foreground">{s.hint}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="em-from">Send from</Label><Input id="em-from" type="email" value={f.from} onChange={(x) => setF({ ...f, from: x.target.value })} placeholder="hello@yourshop.ng" /></div>
        <div className="space-y-1.5"><Label htmlFor="em-name">Sender name</Label><Input id="em-name" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} /></div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="em-key">API key</Label>
        <Input id="em-key" type="password" autoComplete="off" value={f.key} onChange={(x) => setF({ ...f, key: x.target.value })} placeholder={connected ? "New key (leave blank to keep)" : "Paste the key"} />
        <p className="text-xs text-muted-foreground">Find it at {svc.where}. Verify your sending domain there first so emails don't land in spam. Stored encrypted, never shown again.</p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : connected ? "Save" : "Connect email"}</Button>
        {connected && <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
      </div>
    </form>
  );

  return (
    <Section title="Email service" description="Order emails and email campaigns go out through your own service, so replies come to you and the sending reputation is yours.">
      <div className="space-y-3 p-4 text-sm">
        {msg.error && <p className="text-xs text-destructive" role="alert">{msg.error}</p>}
        {msg.ok && <p className="text-xs text-success" role="status">{msg.ok}</p>}
        {!connected ? (isOwner ? form : <p className="text-muted-foreground">Not connected yet — the owner connects the email service here.</p>) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="success">Connected</StatusBadge>
              <span className="font-medium">{SERVICES.find((s) => s.id === e.provider)?.name}</span>
              <span className="text-xs text-muted-foreground">from {e.fromName} &lt;{e.fromEmail}&gt;</span>
            </div>
            <p className="text-xs text-muted-foreground">Order emails follow Settings → Notifications (choose "email" for a step). Campaigns go to customers with an email who agreed to marketing; each has an unsubscribe link that works.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void test()}>Send me a test email</Button>
              {isOwner && !editing && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Change</Button>}
              {isOwner && !editing && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>Disconnect</Button>}
            </div>
            {isOwner && editing && form}
          </>
        )}
        {sent.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Latest emails</p>
            <ul className="divide-y rounded-md border" aria-label="Latest emails">
              {sent.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                  <StatusBadge tone={m.status === "sent" ? "success" : m.status === "failed" ? "danger" : "info"}>{m.status === "queued" ? "Sending" : m.status === "sent" ? "Sent" : "Failed"}</StatusBadge>
                  <span className="min-w-0 flex-1 truncate">{m.subject} → {m.to_email}</span>
                  <span className="text-muted-foreground">{relativeTime(m.created_at)}</span>
                  {m.error && <span className="w-full text-destructive">{m.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}
