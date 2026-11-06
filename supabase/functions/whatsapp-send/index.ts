// WhatsApp sender — POST /functions/v1/whatsapp-send (run every minute by the database).
//
// Only the database's scheduled job can call it (x-bizriva-cron header = the
// secret kept in Vault). It takes queued WhatsApp messages and sends them with
// each business's own token:
//   - customer wrote in the last 24 hours → a normal text message
//   - otherwise → the message's approved template (template_name), or the
//     message is marked failed: "Outside the 24-hour window — needs an approved template"
// Results go back to the database; Meta's delivery receipts arrive at whatsapp-webhook.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const GRAPH = "https://graph.facebook.com/v21.0";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Job { id: string; workspace_id: string; phone_number_id: string; token: string; to_phone: string | null; body: string | null; template_name: string | null; in_window: boolean }

/** What we send to Meta for one queued message, or why we can't. */
export function payloadFor(j: Job): { body: Record<string, unknown> } | { error: string } {
  const to = (j.to_phone ?? "").replace(/\D/g, "");
  if (!/^\d{7,15}$/.test(to)) return { error: "No phone number for this customer" };
  if (j.in_window && j.body) return { body: { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: true, body: j.body.slice(0, 4096) } } };
  if (j.template_name) {
    const [name, lang] = j.template_name.split(":");
    return { body: { messaging_product: "whatsapp", to, type: "template", template: { name, language: { code: lang || "en" } } } };
  }
  return { error: "Outside the 24-hour window — needs an approved template" };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const { data: ok } = await db.rpc("svc_cron_ok", { p_secret: req.headers.get("x-bizriva-cron") ?? "" });
  if (ok !== true) return json(401, { error: "Scheduled job only" });

  const { data, error } = await db.rpc("svc_whatsapp_claim", { p_limit: 50 });
  if (error) return json(500, { error: error.message });
  const jobs = (data ?? []) as Job[];
  const out = { sent: 0, failed: 0 };
  for (const j of jobs) {
    const p = payloadFor(j);
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
