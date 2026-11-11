// WhatsApp Cloud API webhook — /functions/v1/whatsapp-webhook
//
// GET  Meta's one-time check: hub.verify_token must be a business's verify token
//      (shown in the app under Integrations → WhatsApp); we answer hub.challenge.
// POST Messages and delivery receipts. Each change names the business's
//      phone_number_id; the X-Hub-Signature-256 header must equal
//      HMAC-SHA256(raw body, that business's Meta app secret) or nothing is saved.
//      The same Meta message id is saved once, so Meta's retries can't duplicate.
// Numbers connected through Bizriva's Meta app use Bizriva's app secret. Those
// that stay on the WhatsApp Business app (Coexistence) also send: `history`
// (up to 6 months of chats, saved as imported history), `smb_app_state_sync`
// (the phone's contacts), `smb_message_echoes` (replies sent from the phone),
// and `account_update` PARTNER_REMOVED when the business disconnects us.
// Always answers 200 quickly for a verified request (Meta retries otherwise).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { inboundPath, MAX_BYTES, mediaOf } from "./media.ts";
import { parseContacts, parseEchoes, parseHistory, textOf } from "./coexist.ts";
export { textOf };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const enc = new TextEncoder();

export async function hmac256(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body))), (b) => b.toString(16).padStart(2, "0")).join("");
}
function same(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Download a customer's file from Meta into the business's private folder. */
async function saveFile(ws: string, token: string, messageId: string, f: NonNullable<ReturnType<typeof mediaOf>>): Promise<void> {
  await db.rpc("svc_whatsapp_media", { p_message: messageId, p_media_id: f.id, p_kind: f.kind, p_name: f.name, p_path: null, p_error: null });
  let err: string | null = null, path: string | null = null;
  try {
    const meta = await fetch(`https://graph.facebook.com/v21.0/${f.id}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    const info = await meta.json().catch(() => ({}));
    if (!meta.ok || !info.url) throw new Error(`${info.error?.code ?? meta.status} ${info.error?.message ?? "Meta didn't give the file"}`);
    if (Number(info.file_size) > MAX_BYTES) throw new Error("File is larger than 16 MB");
    const file = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    if (!file.ok) throw new Error(`${file.status} Couldn't download the file`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new Error("File is larger than 16 MB");
    const mime = (info.mime_type ?? f.mime ?? "application/octet-stream").split(";")[0].trim();
    path = inboundPath(ws, messageId, mime);
    const up = await db.storage.from("chat-media").upload(path, bytes, { contentType: mime, upsert: true });
    if (up.error) throw new Error(up.error.message);
  } catch (e) { err = (e instanceof Error ? e.message : String(e)).slice(0, 300); path = null; }
  await db.rpc("svc_whatsapp_media", { p_message: messageId, p_media_id: null, p_kind: null, p_name: null, p_path: path, p_error: err });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode"), token = url.searchParams.get("hub.verify_token") ?? "", challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode !== "subscribe" || !token || !/^[\w-]{1,200}$/.test(challenge)) return json(400, { error: "Not a Meta check" });
    const { data } = await db.rpc("svc_whatsapp_verify", { p_token: token });
    return data === true ? new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } }) : json(403, { error: "Unknown verify token" });
  }
  if (req.method !== "POST") return json(405, { error: "GET or POST only" });

  const body = await req.text();
  if (body.length > 5_000_000) return json(413, { error: "Too large" });
  // deno-lint-ignore no-explicit-any
  let evt: any;
  try { evt = JSON.parse(body); } catch { return json(400, { error: "Not JSON" }); }
  if (evt?.object !== "whatsapp_business_account") return json(200, { ignored: true });

  const sig = (req.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
  const FIELDS = new Set(["messages", "history", "smb_message_echoes", "smb_app_state_sync", "account_update"]);
  // deno-lint-ignore no-explicit-any
  const changes: { waba: string; field: string; value: any }[] = (evt.entry ?? []).flatMap((e: any) => (e?.changes ?? []).map((c: any) => ({ waba: String(e?.id ?? ""), field: String(c?.field ?? ""), value: c?.value ?? {} })))
    .filter((c: { field: string }) => FIELDS.has(c.field));
  // Note that Meta reached us (Super Admin shows it), before any number lookup.
  const seen = db.rpc("svc_webhook_seen", { p_fields: [...new Set(changes.map((c) => c.field))].join(", ") || "other",
    p_number: String(changes[0]?.value?.metadata?.display_phone_number ?? changes[0]?.waba ?? ""), p_ok: false });
  const keys = new Map<string, { workspace_id: string; app_secret: string; token: string } | null>();
  const downloads: Promise<void>[] = [];
  const out = { saved: 0, duplicates: 0, statuses: 0, rejected: 0, history: 0, contacts: 0, echoes: 0 };

  for (const ch of changes) {
    const v = ch.value;
    const pnid = String(v.metadata?.phone_number_id ?? "");
    const key = pnid ? `p:${pnid}` : `w:${ch.waba}`;
    if (!keys.has(key)) {
      const { data } = pnid ? await db.rpc("svc_whatsapp_keys", { p_phone_number_id: pnid }) : await db.rpc("svc_whatsapp_keys_by_waba", { p_waba: ch.waba });
      const k = (data as { workspace_id: string; app_secret: string; token: string }[] | null)?.[0] ?? null;
      keys.set(key, k && k.app_secret && same(await hmac256(k.app_secret, body), sig) ? k : null);
    }
    const k = keys.get(key);
    if (!k) { out.rejected++; continue; }

    if (ch.field === "account_update") {
      if (v.event === "PARTNER_REMOVED") await db.rpc("svc_whatsapp_partner_removed", { p_waba: ch.waba, p_reason: "Disconnected in the WhatsApp Business app — connect again from Bizriva" });
      out.statuses++; continue;
    }
    if (ch.field === "history") {
      for (const chunk of parseHistory(v)) {
        if (chunk.error) await db.rpc("svc_whatsapp_history_error", { p_workspace: k.workspace_id, p_code: chunk.error.code, p_message: chunk.error.message });
        else { await db.rpc("svc_whatsapp_history", { p_workspace: k.workspace_id, p_progress: chunk.progress, p_threads: chunk.threads }); out.history += chunk.threads.reduce((n, t) => n + t.messages.length, 0); }
      }
      continue;
    }
    if (ch.field === "smb_app_state_sync") {
      const list = parseContacts(v);
      if (list.length) await db.rpc("svc_whatsapp_contacts", { p_workspace: k.workspace_id, p_contacts: list });
      out.contacts += list.length; continue;
    }
    if (ch.field === "smb_message_echoes") {
      for (const e of parseEchoes(v)) { await db.rpc("svc_whatsapp_echo", { p_workspace: k.workspace_id, p_wa_id: e.wa, p_msg_id: e.id, p_body: e.body, p_at: e.at }); out.echoes++; }
      continue;
    }

    // deno-lint-ignore no-explicit-any
    const names = new Map<string, string>((v.contacts ?? []).map((c: any) => [String(c.wa_id), c.profile?.name ?? ""]));
    for (const m of v.messages ?? []) {
      const { data } = await db.rpc("svc_whatsapp_inbound", {
        p_workspace: k.workspace_id, p_wa_id: String(m.from ?? ""), p_name: names.get(String(m.from)) ?? null, p_msg_id: String(m.id ?? ""),
        p_body: textOf(m), p_type: String(m.type ?? "message"), p_at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
      });
      const saved = data as { status?: string; message?: string; contact?: string } | null;
      if (saved?.status === "saved") {
        out.saved++;
        // Click-to-WhatsApp ad: credit this customer to the ad (first touch only).
        if (m.referral?.source_type === "ad" && saved.contact) {
          await db.rpc("svc_attribute_ad", { p_workspace: k.workspace_id, p_contact: saved.contact, p_ad_id: String(m.referral.source_id ?? ""), p_headline: m.referral.headline ?? null, p_url: m.referral.source_url ?? null, p_channel: "whatsapp" });
        }
        const f = mediaOf(m);
        if (f && saved.message) downloads.push(saveFile(k.workspace_id, k.token, saved.message, f));
      } else out.duplicates++;
    }
    for (const s of v.statuses ?? []) {
      const err = s.errors?.[0];
      await db.rpc("svc_whatsapp_status", {
        p_workspace: k.workspace_id, p_msg_id: String(s.id ?? ""), p_status: String(s.status ?? ""),
        p_error: err ? `${err.code ?? ""} ${err.title ?? err.message ?? ""}`.trim() : null,
      });
      out.statuses++;
    }
  }
  await seen;
  if (out.saved || out.statuses || out.duplicates || out.history || out.contacts || out.echoes) await db.rpc("svc_webhook_seen", { p_fields: "matched a connected number", p_number: String(changes[0]?.value?.metadata?.display_phone_number ?? ""), p_ok: true });
  // Customers' files are fetched from Meta after we answer (Meta wants a quick reply).
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (downloads.length) { const all = Promise.allSettled(downloads).then(() => {}); if (runtime?.waitUntil) runtime.waitUntil(all); else await all; }
  // A customer wrote: wake the AI now instead of waiting for the next minute.
  if (out.saved) {
    const wake = (async () => {
      const { data: secret } = await db.rpc("svc_cron_secret");
      if (secret) await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-reply`, { method: "POST", headers: { "Content-Type": "application/json", "x-bizriva-cron": String(secret) }, body: "{}" }).catch(() => {});
    })();
    if (runtime?.waitUntil) runtime.waitUntil(wake); else await wake;
  }
  // Unsigned or unknown numbers get 401 so a forged call learns nothing and saves nothing.
  return out.rejected && !out.saved && !out.statuses && !out.duplicates && !out.history && !out.contacts && !out.echoes ? json(401, { error: "Bad signature" }) : json(200, out);
});
