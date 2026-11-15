// Sends confirmed/delivered sales back to Meta and TikTok — POST /functions/v1/conversions-send,
// run every minute by the database while sales are queued (x-bizriva-cron only).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { request, verdict, type Job } from "./events.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const { data: ok } = await db.rpc("svc_cron_ok", { p_secret: req.headers.get("x-bizriva-cron") ?? "" });
  if (ok !== true) return json(401, { error: "Scheduled job only" });
  const { data, error } = await db.rpc("svc_conversions_claim", { p_limit: 50 });
  if (error) return json(500, { error: error.message });
  const out = { sent: 0, failed: 0 };
  for (const j of (data ?? []) as Job[]) {
    let err: string | null = null;
    const r = await request(j);
    if ("error" in r) err = r.error;
    else {
      try {
        const res = await fetch(r.url, { ...r.init, signal: AbortSignal.timeout(15_000) });
        err = verdict(j.platform, res.status, await res.json().catch(() => ({})));
      } catch (e) { err = `Couldn't reach ${j.platform === "meta" ? "Meta" : "TikTok"}: ${e instanceof Error ? e.message : e}`; }
    }
    await db.rpc("svc_conversions_result", { p_id: j.id, p_ok: !err, p_error: err });
    if (err) out.failed++; else out.sent++;
  }
  return json(200, out);
});
