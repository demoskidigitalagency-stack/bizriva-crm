// Facebook Page webhook — /functions/v1/meta-webhook (Messenger, Instagram DMs, lead forms).
//
// GET  Meta's one-time check: hub.verify_token must be a business's verify token (Integrations → Facebook Page).
// POST X-Hub-Signature-256 must equal HMAC-SHA256(raw body, that Page's Meta app secret) or nothing is saved.
//      Customer messages land in the Inbox (files are copied into the business's private storage);
//      a lead-form submission is fetched from Meta and becomes a customer, a lead and a call task.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { leadFields, parse, type Dm } from "./parse.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const GRAPH = "https://graph.facebook.com/v21.0";
const MAX = 16 * 1024 * 1024;
const enc = new TextEncoder();
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/mp4": "m4a", "application/pdf": "pdf" };

async function hmac256(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body))), (b) => b.toString(16).padStart(2, "0")).join("");
}
function same(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
interface Keys { workspace_id: string; page_id: string; ig_account_id: string | null; token: string; app_secret: string }

async function saveFile(ws: string, messageId: string, f: Dm["files"][number]) {
  await db.rpc("svc_whatsapp_media", { p_message: messageId, p_media_id: null, p_kind: f.kind, p_name: null, p_path: null, p_error: null });
  let path: string | null = null, err: string | null = null;
  try {
    const r = await fetch(f.url, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`${r.status} Couldn't download the file`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength > MAX) throw new Error("File is larger than 16 MB");
    const mime = (r.headers.get("content-type") ?? "application/octet-stream").split(";")[0]!.trim();
    path = `${ws}/in/${messageId}.${EXT[mime] ?? "bin"}`;
    const up = await db.storage.from("chat-media").upload(path, bytes, { contentType: mime, upsert: true });
    if (up.error) throw new Error(up.error.message);
  } catch (e) { err = (e instanceof Error ? e.message : String(e)).slice(0, 300); path = null; }
  await db.rpc("svc_whatsapp_media", { p_message: messageId, p_media_id: null, p_kind: null, p_name: null, p_path: path, p_error: err });
}

/** A new customer gets their real name from Meta (once). */
async function nameFor(k: Keys, d: Dm): Promise<string | null> {
  const fields = d.channel === "instagram" ? "name,username" : "first_name,last_name";
  try {
    const r = await fetch(`${GRAPH}/${d.sender}?fields=${fields}&access_token=${encodeURIComponent(k.token)}`, { signal: AbortSignal.timeout(8_000) });
    const p = await r.json().catch(() => ({}));
    return (d.channel === "instagram" ? p.name || (p.username ? `@${p.username}` : null) : [p.first_name, p.last_name].filter(Boolean).join(" ")) || null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && (await db.rpc("svc_meta_verify", { p_token: url.searchParams.get("hub.verify_token") ?? "" })).data === true;
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const raw = await req.text();
  const sig = (req.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  const { dms, leads } = parse(payload);
  const keys = new Map<string, Keys | null>();
  const keysFor = async (id: string) => {
    if (!keys.has(id)) {
      const k = ((await db.rpc("svc_meta_keys", { p_id: id })).data as Keys[] | null)?.[0] ?? null;
      keys.set(id, k && same(await hmac256(k.app_secret, raw), sig) ? k : null);
    }
    return keys.get(id)!;
  };
  let saved = 0, refused = 0;
  for (const d of dms) {
    const k = await keysFor(d.owner);
    if (!k) { refused++; continue; }
    const { data: r } = await db.rpc("svc_meta_inbound", { p_workspace: k.workspace_id, p_channel: d.channel, p_sender: d.sender, p_name: null, p_mid: d.mid, p_body: d.text, p_at: d.at });
    if (r?.status !== "saved") continue;
    saved++;
    if (d.ad) await db.rpc("svc_attribute_ad", { p_workspace: k.workspace_id, p_contact: r.contact, p_ad_id: d.ad.id, p_headline: d.ad.headline, p_url: null, p_channel: d.channel });
    const { data: c } = await db.from("contacts").select("name").eq("id", r.contact).single();
    if (c && / customer$/.test(String(c.name))) { const n = await nameFor(k, d); if (n) await db.from("contacts").update({ name: n.slice(0, 120) }).eq("id", r.contact); }
    for (const f of d.files.slice(0, 1)) await saveFile(k.workspace_id, r.message, f);
    // Wake the AI straight away (it also runs every minute).
    const { data: secret } = await db.rpc("svc_cron_secret");
    if (secret) fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-reply`, { method: "POST", headers: { "Content-Type": "application/json", "x-bizriva-cron": String(secret) }, body: "{}" }).catch(() => {});
  }
  for (const l of leads) {
    const k = await keysFor(l.owner);
    if (!k) { refused++; continue; }
    let fields: Record<string, string> = {}, err: string | null = null, ad = l.ad, form = l.form, platform: string | null = null;
    try {
      const r = await fetch(`${GRAPH}/${l.leadgen}?fields=field_data,ad_id,form_id,platform,created_time&access_token=${encodeURIComponent(k.token)}`, { signal: AbortSignal.timeout(10_000) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`(#${res.error?.code ?? r.status}) ${res.error?.message ?? "Meta didn't give the lead"}`);
      fields = leadFields(res); ad = res.ad_id ?? ad; form = res.form_id ?? form; platform = res.platform ?? null;
    } catch (e) { err = (e instanceof Error ? e.message : String(e)).slice(0, 300); }
    await db.rpc("svc_meta_lead", { p_workspace: k.workspace_id, p_leadgen: l.leadgen, p_form: form, p_ad: ad, p_platform: platform, p_fields: fields, p_error: err });
    saved++;
  }
  if (refused && !saved) return new Response("Signature check failed", { status: 401 });
  return new Response(JSON.stringify({ saved, refused }), { status: 200, headers: { "Content-Type": "application/json" } });
});
