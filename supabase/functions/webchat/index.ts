// Website chat — POST /functions/v1/webchat (public; the chat bubble on a business's website calls it).
//
// { action: "info",  key }                         → business name, greeting, colour
// { action: "start", key, token, name, phone? }    → opens the visitor's chat (token = a secret made in their browser)
// { action: "send",  token, text }                 → their message lands in the Inbox (the AI answers like on WhatsApp)
// { action: "poll",  token, after? }               → messages in their chat since `after` (photos as 10-minute links)
// The database does every check (see supabase/migrations/20261106240000_webchat.sql).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  // deno-lint-ignore no-explicit-any
  const b: any = await req.json().catch(() => ({}));
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) { console.error(fn, error.message); return json(500, { error: "Chat is unavailable right now" }); }
    if (data === null) return json(404, { error: "Chat is turned off" });
    return json(data?.error ? 400 : 200, data);
  };
  switch (b.action) {
    case "info": return call("svc_webchat_info", { p_key: str(b.key, 60) });
    case "start": return call("svc_webchat_start", { p_key: str(b.key, 60), p_token: str(b.token, 100), p_name: str(b.name, 120), p_phone: str(b.phone, 30) || null });
    case "send": return call("svc_webchat_send", { p_token: str(b.token, 100), p_text: str(b.text, 2000) });
    case "poll": {
      const after = typeof b.after === "string" && !Number.isNaN(Date.parse(b.after)) ? b.after : null;
      const { data, error } = await db.rpc("svc_webchat_poll", { p_token: str(b.token, 100), p_after: after });
      if (error) return json(500, { error: "Chat is unavailable right now" });
      if (data?.error) return json(400, data);
      // deno-lint-ignore no-explicit-any
      const msgs = (data?.messages ?? []) as any[];
      for (const m of msgs) {
        if (m.media?.path && String(m.media.path).split("/")[1] === "out") {
          const s = await db.storage.from("chat-media").createSignedUrl(m.media.path, 600);
          m.media = { kind: m.media.kind, name: m.media.name, url: s.data?.signedUrl ?? null };
        } else if (m.media) m.media = null;
      }
      return json(200, { ok: true, messages: msgs });
    }
    default: return json(400, { error: "Unknown action" });
  }
});
