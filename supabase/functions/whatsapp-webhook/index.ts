// WhatsApp Cloud API webhook — /functions/v1/whatsapp-webhook
//
// GET  Meta's one-time check: hub.verify_token must be a business's verify token
//      (shown in the app under Integrations → WhatsApp); we answer hub.challenge.
// POST Messages and delivery receipts. Each change names the business's
//      phone_number_id; the X-Hub-Signature-256 header must equal
//      HMAC-SHA256(raw body, that business's Meta app secret) or nothing is saved.
//      The same Meta message id is saved once, so Meta's retries can't duplicate.
// Always answers 200 quickly for a verified request (Meta retries otherwise).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

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

/** The text we keep for a WhatsApp message of any type. */
// deno-lint-ignore no-explicit-any
export function textOf(m: any): string | null {
  switch (m?.type) {
    case "text": return m.text?.body ?? null;
    case "button": return m.button?.text ?? null;
    case "interactive": return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
    case "image": case "video": case "document": case "audio": case "sticker": {
      const cap = m[m.type]?.caption; return `[${m.type}]${cap ? " " + cap : ""}`;
    }
    case "location": return `[location] ${m.location?.name ?? ""} ${m.location?.address ?? ""} (${m.location?.latitude}, ${m.location?.longitude})`.trim();
    case "contacts": return "[contact card]";
    case "reaction": return m.reaction?.emoji ? `[reacted ${m.reaction.emoji}]` : null;
    default: return null;
  }
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
  if (body.length > 1_000_000) return json(413, { error: "Too large" });
  // deno-lint-ignore no-explicit-any
  let evt: any;
  try { evt = JSON.parse(body); } catch { return json(400, { error: "Not JSON" }); }
  if (evt?.object !== "whatsapp_business_account") return json(200, { ignored: true });

  const sig = (req.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
  // deno-lint-ignore no-explicit-any
  const changes: any[] = (evt.entry ?? []).flatMap((e: any) => e?.changes ?? []).filter((c: any) => c?.field === "messages");
  const keys = new Map<string, { workspace_id: string; app_secret: string } | null>();
  const out = { saved: 0, duplicates: 0, statuses: 0, rejected: 0 };

  for (const ch of changes) {
    const v = ch.value ?? {};
    const pnid = String(v.metadata?.phone_number_id ?? "");
    if (!keys.has(pnid)) {
      const { data } = await db.rpc("svc_whatsapp_keys", { p_phone_number_id: pnid });
      const k = (data as { workspace_id: string; app_secret: string }[] | null)?.[0] ?? null;
      keys.set(pnid, k && same(await hmac256(k.app_secret, body), sig) ? k : null);
    }
    const k = keys.get(pnid);
    if (!k) { out.rejected++; continue; }

    // deno-lint-ignore no-explicit-any
    const names = new Map<string, string>((v.contacts ?? []).map((c: any) => [String(c.wa_id), c.profile?.name ?? ""]));
    for (const m of v.messages ?? []) {
      const { data } = await db.rpc("svc_whatsapp_inbound", {
        p_workspace: k.workspace_id, p_wa_id: String(m.from ?? ""), p_name: names.get(String(m.from)) ?? null, p_msg_id: String(m.id ?? ""),
        p_body: textOf(m), p_type: String(m.type ?? "message"), p_at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
      });
      if ((data as { status?: string } | null)?.status === "saved") out.saved++; else out.duplicates++;
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
  // Unsigned or unknown numbers get 401 so a forged call learns nothing and saves nothing.
  return out.rejected && !out.saved && !out.statuses && !out.duplicates ? json(401, { error: "Bad signature" }) : json(200, out);
});
