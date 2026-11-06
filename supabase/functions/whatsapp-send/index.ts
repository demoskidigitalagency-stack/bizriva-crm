// WhatsApp sender — POST /functions/v1/whatsapp-send (run every minute by the database).
//
// Only the database's scheduled job can call it (x-bizriva-cron header = the
// secret kept in Vault). It takes queued WhatsApp messages and sends them with
// each business's own token:
//   - customer wrote in the last 24 hours → a normal message, with its photo,
//     video, voice note or document if it has one (Meta gets a 1-hour link)
//   - otherwise → the message's approved template (template_name), or the
//     message is marked failed with the reason
// Results go back to the database; Meta's delivery receipts arrive at whatsapp-webhook.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { payloadFor, type Job } from "./payload.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const GRAPH = "https://graph.facebook.com/v21.0";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const { data: ok } = await db.rpc("svc_cron_ok", { p_secret: req.headers.get("x-bizriva-cron") ?? "" });
  if (ok !== true) return json(401, { error: "Scheduled job only" });

  const { data, error } = await db.rpc("svc_whatsapp_claim_v2", { p_limit: 50 });
  if (error) return json(500, { error: error.message });
  const jobs = (data ?? []) as Job[];
  const out = { sent: 0, failed: 0 };
  for (const j of jobs) {
    let link: string | null = null;
    if (j.media_path) {
      const { data: s } = await db.storage.from("chat-media").createSignedUrl(j.media_path, 3600);
      link = s?.signedUrl ?? null;
    }
    const p = payloadFor(j, link);
    let providerId: string | null = null, err: string | null = null;
    if ("error" in p) err = p.error;
    else {
      try {
        const r = await fetch(`${GRAPH}/${j.phone_number_id}/messages`, {
          method: "POST", headers: { Authorization: `Bearer ${j.token}`, "Content-Type": "application/json" }, body: JSON.stringify(p.body), signal: AbortSignal.timeout(10_000),
        });
        const res = await r.json().catch(() => ({}));
        if (r.ok && res.messages?.[0]?.id) providerId = String(res.messages[0].id);
        else err = `${res.error?.code ?? r.status} ${res.error?.message ?? "WhatsApp refused the message"}`.slice(0, 500);
      } catch (e) { err = `Couldn't reach WhatsApp: ${e instanceof Error ? e.message : e}`; }
    }
    await db.rpc("svc_whatsapp_result", { p_message: j.id, p_provider_id: providerId, p_error: err });
    if (providerId) out.sent++; else out.failed++;
  }
  return json(200, out);
});
