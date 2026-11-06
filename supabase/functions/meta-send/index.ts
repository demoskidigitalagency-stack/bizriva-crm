// Messenger / Instagram sender — POST /functions/v1/meta-send (run every minute by the database).
// Replies go out through the business's Facebook Page token; results go back with svc_meta_result.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { sendBody, type MetaJob } from "./payload.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const GRAPH = "https://graph.facebook.com/v21.0";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const { data: ok } = await db.rpc("svc_cron_ok", { p_secret: req.headers.get("x-bizriva-cron") ?? "" });
  if (ok !== true) return json(401, { error: "Scheduled job only" });
  const { data, error } = await db.rpc("svc_meta_claim", { p_limit: 50 });
  if (error) return json(500, { error: error.message });
  const out = { sent: 0, failed: 0 };
  for (const j of (data ?? []) as MetaJob[]) {
    let link: string | null = null;
    if (j.media_path) link = (await db.storage.from("chat-media").createSignedUrl(j.media_path, 3600)).data?.signedUrl ?? null;
    const p = sendBody(j, link);
    let id: string | null = null, err: string | null = null;
    if ("error" in p) err = p.error;
    else {
      for (const b of p.body) {
        try {
          const r = await fetch(`${GRAPH}/${j.page_id}/messages?access_token=${encodeURIComponent(j.token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b), signal: AbortSignal.timeout(15_000) });
          const res = await r.json().catch(() => ({}));
          if (r.ok && res.message_id) id = String(res.message_id);
          else { err = `(#${res.error?.code ?? r.status}) ${res.error?.message ?? "Meta refused the message"}`.slice(0, 500); break; }
        } catch (e) { err = `Couldn't reach Meta: ${e instanceof Error ? e.message : e}`; break; }
      }
    }
    await db.rpc("svc_meta_result", { p_message: j.id, p_provider_id: err ? null : id, p_error: err });
    if (!err) out.sent++; else out.failed++;
  }
  return json(200, out);
});
