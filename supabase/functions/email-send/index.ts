// Email sender — POST /functions/v1/email-send (run every minute by the database).
// Only the scheduled job can call it (x-bizriva-cron). Sends the outbox through
// each business's own email service and reports results back.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { providerId, request, type Job } from "./mail.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const { data: ok } = await db.rpc("svc_cron_ok", { p_secret: req.headers.get("x-bizriva-cron") ?? "" });
  if (ok !== true) return json(401, { error: "Scheduled job only" });
  const { data, error } = await db.rpc("svc_email_claim", { p_limit: 50 });
  if (error) return json(500, { error: error.message });
  const out = { sent: 0, failed: 0 };
  for (const j of (data ?? []) as Job[]) {
    let id: string | null = null, err: string | null = null;
    const r = request(j);
    if ("error" in r) err = r.error;
    else {
      try {
        const res = await fetch(r.url, { ...r.init, signal: AbortSignal.timeout(15_000) });
        const body = await res.json().catch(() => ({}));
        if (res.ok) id = providerId(j.provider, body) ?? "accepted";
        else err = `${res.status} ${body?.message ?? body?.error?.message ?? body?.name ?? "The email service refused the email"}`.slice(0, 500);
      } catch (e) { err = `Couldn't reach the email service: ${e instanceof Error ? e.message : e}`; }
    }
    await db.rpc("svc_email_result", { p_id: j.id, p_provider_id: id, p_error: err });
    if (id) out.sent++; else out.failed++;
  }
  return json(200, out);
});
