// WhatsApp templates — POST /functions/v1/whatsapp-templates (scheduled job only).
//
// Submits templates staff marked "Submit to Meta" to the business's WhatsApp
// Business Account, then reads back Meta's decisions and records them
// (svc_wa_template_result). Runs every 5 minutes while anything is waiting.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { checkTemplate, createBody, ourStatus, reasonFor, type Tpl } from "./meta.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const GRAPH = "https://graph.facebook.com/v21.0";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Work { workspace_id: string; waba_id: string; token: string; to_submit: Tpl[] }
const result = (ws: string, p: { template?: string | null; name?: string | null; language?: string | null; metaId?: string | null; status: string; reason?: string | null }) =>
  db.rpc("svc_wa_template_result", { p_workspace: ws, p_template: p.template ?? null, p_name: p.name ?? null, p_language: p.language ?? null, p_meta_id: p.metaId ?? null, p_status: p.status, p_reason: p.reason ?? null });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const { data: ok } = await db.rpc("svc_cron_ok", { p_secret: req.headers.get("x-bizriva-cron") ?? "" });
  if (ok !== true) return json(401, { error: "Scheduled job only" });
  const { data, error } = await db.rpc("svc_wa_templates_work");
  if (error) return json(500, { error: error.message });
  const out = { submitted: 0, refused: 0, synced: 0, errors: 0 };
  for (const w of (data ?? []) as Work[]) {
    const auth = { Authorization: `Bearer ${w.token}`, "Content-Type": "application/json" };
    for (const t of w.to_submit ?? []) {
      const bad = checkTemplate(t);
      if (bad) { await result(w.workspace_id, { template: t.id, status: "rejected", reason: bad }); out.refused++; continue; }
      try {
        const r = await fetch(`${GRAPH}/${w.waba_id}/message_templates`, { method: "POST", headers: auth, body: JSON.stringify(createBody(t)), signal: AbortSignal.timeout(15_000) });
        const res = await r.json().catch(() => ({}));
        if (r.ok && res.id) { await result(w.workspace_id, { template: t.id, metaId: String(res.id), status: ourStatus(res.status) ?? "submitted", reason: reasonFor(res.status) }); out.submitted++; }
        else { await result(w.workspace_id, { template: t.id, status: "rejected", reason: `Meta: ${res.error?.error_user_msg ?? res.error?.message ?? `error ${r.status}`}` }); out.refused++; }
      } catch (e) { out.errors++; console.error("submit", t.name, e); }
    }
    try {
      let url: string | null = `${GRAPH}/${w.waba_id}/message_templates?fields=id,name,language,status,rejected_reason&limit=200`;
      for (let page = 0; url && page < 10; page++) {
        const r = await fetch(url, { headers: auth, signal: AbortSignal.timeout(15_000) });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) { out.errors++; break; }
        for (const m of res.data ?? []) {
          const s = ourStatus(m.status);
          if (!s) continue;
          await result(w.workspace_id, { name: m.name, language: m.language, metaId: m.id, status: s, reason: reasonFor(m.status, m.rejected_reason) });
          out.synced++;
        }
        url = res.paging?.next ?? null;
      }
    } catch (e) { out.errors++; console.error("sync", e); }
  }
  return json(200, out);
});
