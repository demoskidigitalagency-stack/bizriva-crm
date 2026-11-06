// SMS sender — POST /functions/v1/sms-send (run every minute by the database).
//
// Sends queued SMS (an SMS chat, or WhatsApp order updates falling back to SMS)
// through each business's own Termii key and sender ID. Results go back to
// the database (svc_sms_result).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { outcome, request, type SmsJob } from "./termii.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const { data: ok } = await db.rpc("svc_cron_ok", { p_secret: req.headers.get("x-bizriva-cron") ?? "" });
  if (ok !== true) return json(401, { error: "Scheduled job only" });
  const { data, error } = await db.rpc("svc_sms_claim", { p_limit: 50 });
  if (error) return json(500, { error: error.message });
  const out = { sent: 0, failed: 0 };
  const jobs = (data ?? []) as SmsJob[];
  const { data: wss } = jobs.length ? await db.from("workspaces").select("id, sms_settings").in("id", [...new Set(jobs.map((j) => j.workspace_id))]) : { data: [] };
  const base = new Map((wss ?? []).map((w) => [w.id as string, (w.sms_settings?.base_url ?? null) as string | null]));
  for (const j of jobs) {
    const r = request({ ...j, base_url: base.get(j.workspace_id) ?? null });
    let id: string | null = null, err: string | null = null;
    if ("error" in r) err = r.error;
    else {
      try {
        const res = await fetch(r.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r.body), signal: AbortSignal.timeout(15_000) });
        const o = outcome(res.status, await res.json().catch(() => ({})));
        if ("id" in o) id = o.id; else err = o.error;
      } catch (e) { err = `Couldn't reach Termii: ${e instanceof Error ? e.message : e}`; }
    }
    await db.rpc("svc_sms_result", { p_message: j.id, p_provider_id: id, p_error: err });
    if (id) out.sent++; else out.failed++;
  }
  return json(200, out);
});
