// Ad spend from Meta — POST /functions/v1/meta-ads-sync (scheduled every 4 hours).
// For each business that linked its ad account (Ads → Link Meta), pulls the last 7 days of spend,
// clicks and impressions per ad and stores them (svc_ad_spend_upsert) for ad_performance().
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const GRAPH = "https://graph.facebook.com/v21.0";
const FIELDS = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,account_currency";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const { data: ok } = await db.rpc("svc_cron_ok", { p_secret: req.headers.get("x-bizriva-cron") ?? "" });
  if (ok !== true) return json(401, { error: "Scheduled job only" });
  const { data: accts } = await db.rpc("svc_ad_accounts");
  const out: Record<string, number | string> = {};
  for (const a of (accts ?? []) as { workspace_id: string; ad_account_id: string; token: string }[]) {
    try {
      // deno-lint-ignore no-explicit-any
      const rows: any[] = [];
      let url: string | null = `${GRAPH}/${a.ad_account_id}/insights?level=ad&time_increment=1&date_preset=last_7d&limit=500&fields=${FIELDS}&access_token=${encodeURIComponent(a.token)}`;
      for (let page = 0; url && page < 20; page++) {
        const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`(#${res.error?.code ?? r.status}) ${res.error?.message ?? "Meta refused"}`);
        rows.push(...(res.data ?? []));
        url = res.paging?.next ?? null;
      }
      const { data: n } = await db.rpc("svc_ad_spend_upsert", { p_workspace: a.workspace_id, p_rows: rows });
      out[a.workspace_id] = Number(n ?? 0);
    } catch (e) { out[a.workspace_id] = (e instanceof Error ? e.message : String(e)).slice(0, 200); }
  }
  return json(200, out);
});
