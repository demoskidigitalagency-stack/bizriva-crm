/**
 * Link the WhatsApp the business already uses, the way WhatsApp Web does:
 * a pairing code (or QR) under WhatsApp → Linked devices. No Meta approval, the
 * phone keeps working, and the chats WhatsApp shares with a new device come in.
 * Unofficial connection: the owner confirms the risk before linking.
 * Bizriva's WhatsApp server (worker/) holds the link; this screen shows its state.
 */
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";
import { buildVcf, downloadText, type VcfContact } from "@/lib/vcard";

export interface LinkRow {
  phone: string; method: "code" | "qr"; status: "pending" | "waiting" | "connected" | "reconnecting" | "logged_out" | "failed" | "unlinking";
  pairing_code: string | null; qr: string | null; code_at: string | null; wa_name: string | null; history_status: "syncing" | "done" | null;
  history_messages: number; history_chats: number; tagged: number; last_seen_at: string | null; last_error: string | null; connected_at: string | null;
}
export interface Overview { workerOnline: boolean; cloudNumber: boolean; whatsappContacts: number; withoutOrder: number }
const COLS = "phone, method, status, pairing_code, qr, code_at, wa_name, history_status, history_messages, history_chats, tagged, last_seen_at, last_error, connected_at";

/** 0803… → 234803…; otherwise digits only (same rule as the database). */
export function waPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  return /^0\d{10}$/.test(d) ? `234${d.slice(1)}` : d;
}
/** "ABCD1234" → "ABCD-1234" like WhatsApp shows it. */
export const showCode = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

export function useWhatsAppLink() {
  const { current } = useAuth();
  const ws = current?.workspaceId;
  const [row, setRow] = useState<LinkRow | null | undefined>(undefined);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const [{ data, error: e }, { data: o }] = await Promise.all([
      sb.from("wa_links").select(COLS).eq("workspace_id", ws).maybeSingle(),
      sb.rpc("wa_link_overview", { p_workspace: ws }),
    ]);
    // Before the database part is switched on, say so plainly instead of showing a database error.
    if (e) setError(/wa_links|PGRST205|42P01|schema cache/i.test(`${e.code ?? ""} ${e.message}`) ? "Linking is being switched on for your account — check back shortly." : e.message);
    setRow((data as LinkRow | null) ?? null);
    setOverview((o as Overview | null) ?? null);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  // Poll while something is happening (code waiting, chats coming in).
  const busy = !!row && (["pending", "waiting", "reconnecting", "unlinking"].includes(row.status) || row.history_status === "syncing");
  useEffect(() => { if (!busy) return; const t = setInterval(() => void load(), 2500); return () => clearInterval(t); }, [busy, load]);
  return { ws, role: current?.role, row, overview, error, setError, load };
}

export function WhatsAppLink() {
  const { ws, role, row, overview, error, setError, load } = useWhatsAppLink();
  const isOwner = role === "owner";
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"code" | "qr">("code");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [again, setAgain] = useState(false);

  if (role !== "owner" && role !== "manager") return <p className="p-4 text-sm text-muted-foreground">The owner links WhatsApp for the business.</p>;
  if (row === undefined) return <p className="p-4 text-sm text-muted-foreground" role="status">Checking your WhatsApp link…</p>;

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = supabase(); if (!sb || !ws) return;
    const p = waPhone(phone || row?.phone || "");
    if (!/^\d{10,15}$/.test(p)) return setError("Enter your WhatsApp number, e.g. 0803 123 4567 or +234 803 123 4567.");
    if (!ack) return setError("Tick the box to confirm you understand the risk.");
    setBusy(true); setError(""); setNote("");
    const { error: e2 } = await sb.rpc("link_whatsapp_device", { p_workspace: ws, p_phone: p, p_method: method, p_risk_ack: ack });
    setBusy(false);
    if (e2) return setError(e2.message);
    setAgain(false);
    await load();
  };
  const unlink = async () => {
    const sb = supabase(); if (!sb || !ws) return;
    setBusy(true); setError("");
    const { data, error: e2 } = await sb.rpc("unlink_whatsapp_device", { p_workspace: ws });
    setBusy(false);
    if (e2) return setError(e2.message);
    setNote(data === "removed_check_phone" ? "Unlinked from Bizriva. On your phone, open WhatsApp → Linked devices and log out the Windows device to finish." : data === "unlinking" ? "Unlinking…" : "Unlinked.");
    await load();
  };

  const serverOff = overview && !overview.workerOnline;
  const showForm = isOwner && (!row || again || ["logged_out", "failed"].includes(row.status));

  return (
    <div className="space-y-3 p-4 text-sm">
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {note && <p className="rounded-md bg-success/10 p-2 text-xs text-success" role="status">{note}</p>}
      {serverOff && <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs" role="status">
        <span className="font-semibold">Bizriva's WhatsApp server isn't switched on yet.</span> You can start linking now — your code appears as soon as the server is on.
      </p>}
      {overview?.cloudNumber && <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">You also have a number connected through Meta. Replies go out through Meta; the linked number still brings in chats and contacts.</p>}

      {row && !again && <LinkState row={row} isOwner={isOwner} busy={busy} onUnlink={() => void unlink()} onAgain={() => { setAgain(true); setPhone(row.phone); setMethod(row.method); }} />}

      {showForm && (
        <form onSubmit={link} className="space-y-3 rounded-lg border p-3" aria-label="Link my WhatsApp">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={row?.phone ? `+${row.phone}` : "Your WhatsApp number, e.g. 0803 123 4567"} aria-label="Your WhatsApp number" inputMode="tel" />
            <div className="flex overflow-hidden rounded-md border text-xs" role="radiogroup" aria-label="How to link">
              {(["code", "qr"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
                  className={`px-3 py-2 ${method === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{m === "code" ? "Pairing code" : "QR code"}</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{method === "code" ? "Best when Bizriva is open on the same phone: you'll type an 8-character code into WhatsApp." : "Use when Bizriva is open on a computer: scan the code with your phone."}</p>
          <label className="flex items-start gap-2 rounded-md bg-warning/10 p-2 text-xs">
            <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} aria-label="I understand the risk" className="mt-0.5" />
            <span><span className="font-semibold">This is an unofficial connection</span> (it works like WhatsApp Web, not through Meta). WhatsApp can restrict numbers that send spam. Bizriva paces messages and only messages people who wrote to you first — use it with customers who know your business.</span>
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>{busy ? "Starting…" : "Link my WhatsApp"}</Button>
            {again && <Button type="button" size="sm" variant="ghost" onClick={() => setAgain(false)}>Cancel</Button>}
          </div>
        </form>
      )}
      {!row && !isOwner && <p className="text-muted-foreground">Not linked yet — the owner links WhatsApp here.</p>}
    </div>
  );
}

function LinkState({ row, isOwner, busy, onUnlink, onAgain }: { row: LinkRow; isOwner: boolean; busy: boolean; onUnlink: () => void; onAgain: () => void }) {
  const num = `+${row.phone}`;
  if (row.status === "pending") return <p className="rounded-lg border p-3" role="status">Getting your {row.method === "code" ? "pairing code" : "QR code"} for {num}… this takes a few seconds.</p>;
  if (row.status === "waiting") return (
    <div className="space-y-3 rounded-lg border-2 border-primary/40 p-3" aria-label="Enter this in WhatsApp">
      {row.method === "code" && row.pairing_code ? <>
        <p className="font-semibold">Your pairing code</p>
        <p className="font-mono text-3xl font-bold tracking-[0.2em]" aria-label="Pairing code">{showCode(row.pairing_code)}</p>
        <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
          <li>Open WhatsApp on the phone with {num}.</li>
          <li>Tap <b>⋮</b> (Android) or <b>Settings</b> (iPhone) → <b>Linked devices</b> → <b>Link a device</b>.</li>
          <li>Tap <b>Link with phone number instead</b> and type the code above.</li>
        </ol>
      </> : row.qr ? <>
        <p className="font-semibold">Scan with WhatsApp on {num}</p>
        <img src={row.qr} alt="WhatsApp QR code" className="size-56 rounded border bg-white p-1" />
        <p className="text-xs text-muted-foreground">WhatsApp → <b>Linked devices</b> → <b>Link a device</b>, then point the phone at this code. It refreshes every 20 seconds.</p>
      </> : <p role="status">Waiting for WhatsApp…</p>}
      <p className="text-xs text-muted-foreground">Code made {row.code_at ? relativeTime(row.code_at) : "just now"}. It expires after a few minutes — if it does, start again.</p>
      {isOwner && <Button size="sm" variant="ghost" disabled={busy} onClick={onUnlink}>Cancel</Button>}
    </div>
  );
  if (row.status === "unlinking") return <p className="rounded-lg border p-3" role="status">Unlinking {num}…</p>;

  const tone = row.status === "connected" ? "success" : row.status === "reconnecting" ? "warning" : "danger";
  const label = { connected: "Linked", reconnecting: "Reconnecting", logged_out: "Logged out", failed: "Didn't link" }[row.status as "connected"] ?? row.status;
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={tone}>{label}</StatusBadge>
        <span className="font-medium">{num}</span>
        {row.wa_name && <span className="text-xs text-muted-foreground">{row.wa_name}</span>}
        {row.connected_at && <span className="text-xs text-muted-foreground">linked {relativeTime(row.connected_at)}</span>}
        {row.status === "connected" && <StatusBadge tone="info">Your phone keeps working</StatusBadge>}
      </div>
      {row.last_error && <p className="text-xs text-destructive">{row.last_error}</p>}
      {row.history_status === "syncing" && <div aria-label="Old chats">
        <p className="font-medium">Bringing in your old chats… {row.history_chats.toLocaleString()} chats, {row.history_messages.toLocaleString()} messages so far</p>
        <div className="mt-1 h-2 overflow-hidden rounded bg-muted" role="progressbar" aria-label="Old chats coming in"><div className="h-2 w-1/3 animate-pulse rounded bg-primary" /></div>
        <p className="mt-1 text-xs text-muted-foreground">Keep WhatsApp open on your phone with internet until this finishes. WhatsApp decides how far back it shares.</p>
      </div>}
      {row.history_status === "done" && <p className="text-xs"><span className="font-medium">Old chats are in:</span> {row.history_chats.toLocaleString()} chats, {row.history_messages.toLocaleString()} messages. They're history only — the assistant won't answer them.</p>}
      {row.status === "connected" && <p className="text-xs text-muted-foreground">New messages arrive in the Inbox as they come. Replies from Bizriva go out from your number, paced like a person typing.{row.last_seen_at ? ` Last activity ${relativeTime(row.last_seen_at)}.` : ""}</p>}
      {isOwner && <div className="flex flex-wrap gap-2 pt-1">
        {["logged_out", "failed", "reconnecting"].includes(row.status) && <Button size="sm" onClick={onAgain}>Link again</Button>}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onUnlink}>Unlink</Button>
      </div>}
    </div>
  );
}

/** Every WhatsApp customer: counts, product tags and the contacts download. */
export function SavedContacts() {
  const { ws, row, overview, load } = useWhatsAppLink();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [template, setTemplate] = useState(() => { try { return localStorage.getItem("bizriva.vcfTemplate") ?? "{name} - {product}"; } catch { return "{name} - {product}"; } });
  const [who, setWho] = useState<"all" | "asked" | "no_order">("all");

  const tag = async () => {
    const sb = supabase(); if (!sb || !ws) return;
    setBusy("tag"); setMsg("");
    const { data, error } = await sb.rpc("tag_chats_by_product", { p_workspace: ws });
    setBusy("");
    if (error) return setMsg(error.message);
    const d = data as { tagged: number; products: number };
    setMsg(d.products === 0 ? "Add your products first (Products page) — chats are tagged by the product names they mention." : `${d.tagged.toLocaleString()} customers tagged with the products they asked about.`);
    await load();
  };
  const download = async () => {
    const sb = supabase(); if (!sb || !ws) return;
    setBusy("vcf"); setMsg("");
    try { localStorage.setItem("bizriva.vcfTemplate", template); } catch { /* private mode */ }
    const list: VcfContact[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("contact_identities").select("external_id, contacts(name, tags)").eq("workspace_id", ws).eq("channel", "whatsapp").order("external_id").range(from, from + 999);
      if (error) { setBusy(""); return setMsg(error.message); }
      for (const r of (data ?? []) as unknown as { external_id: string; contacts: { name: string | null; tags: string[] } | null }[]) {
        const tags = r.contacts?.tags ?? [];
        if (who === "asked" && !tags.some((t) => t.startsWith("Asked about: "))) continue;
        if (who === "no_order" && !tags.includes("No order yet")) continue;
        list.push({ phone: r.external_id, name: r.contacts?.name ?? null, tags });
      }
      if (!data || data.length < 1000) break;
    }
    setBusy("");
    if (!list.length) return setMsg("No WhatsApp customers to download yet.");
    downloadText(`bizriva-whatsapp-contacts-${new Date().toISOString().slice(0, 10)}.vcf`, buildVcf(list, template));
    setMsg(`${list.length.toLocaleString()} contacts downloaded. Open the file on your phone, or import it at contacts.google.com → Import, so they can see your Status.`);
  };

  return (
    <div className="space-y-3 p-4 text-sm">
      <div className="grid gap-2 sm:grid-cols-3">
        <Stat label="WhatsApp customers saved" value={overview?.whatsappContacts} />
        <Stat label="Tagged by product" value={row?.tagged} />
        <Stat label="No order yet" value={overview?.withoutOrder} />
      </div>
      <p className="text-xs text-muted-foreground">Everyone who has chatted with your WhatsApp is saved as a contact and a lead, with their chat. Tagging reads each chat for your product names and adds “Asked about: …” and “No order yet”, so you can follow them up from Contacts, Segments and Broadcasts.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void tag()}>{busy === "tag" ? "Tagging…" : "Tag chats by product"}</Button>
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        <p className="font-medium">Save them to your phone</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Contact name format" placeholder="{name} - {product}" />
          <div className="flex overflow-hidden rounded-md border text-xs" role="radiogroup" aria-label="Which customers">
            {([["all", "Everyone"], ["asked", "Asked about a product"], ["no_order", "No order yet"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={who === k} onClick={() => setWho(k)} className={`flex-1 px-2 py-2 ${who === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Name format: {"{name}"}, {"{product}"} and {"{last4}"}. Customers without a name are saved as “Customer 1234”.</p>
        <Button size="sm" disabled={!!busy} onClick={() => void download()}>{busy === "vcf" ? "Preparing…" : "Download contacts (.vcf)"}</Button>
      </div>
      {msg && <p className="text-xs" role="status">{msg}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value === undefined ? "—" : value.toLocaleString()}</p>
    </div>
  );
}
