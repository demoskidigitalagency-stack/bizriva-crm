// Connect WhatsApp with Meta's sign-up — POST /functions/v1/whatsapp-onboard
//
// The owner finishes Meta's sign-up window in the app; the page sends us the
// one-time code and the WhatsApp Business Account id, with their Bizriva login.
//   { workspace, code, redirect_uri, waba_id?, phone_number_id? }   → connect
//   { workspace, action: "sync" }                    → ask Meta again for contacts + history
// We swap the code for the business's token with Bizriva's Meta app secret,
// subscribe Bizriva to their account's webhooks, and:
//   • number already on the WhatsApp Business app (Coexistence) → don't register it;
//     ask Meta for the phone's contacts and up to 6 months of chats (allowed once, within 24 hours);
//   • new number → register it for Cloud API with a random two-step PIN (kept in Vault).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { pickNumber, pickWaba } from "./pick.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const G = "https://graph.facebook.com/v21.0";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
async function graph(path: string, token: string, init?: { method?: string; body?: unknown }): Promise<any> {
  const r = await fetch(`${G}/${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${res?.error?.code ?? r.status} ${res?.error?.error_user_msg ?? res?.error?.message ?? "Meta refused the request"}`.slice(0, 300));
  return res;
}

/** The WhatsApp Business Account a sign-up token was granted (when Meta's window didn't say). */
async function wabaFromToken(token: string, appToken: string): Promise<string> {
  const r = await fetch(`${G}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`, { signal: AbortSignal.timeout(20_000) });
  const res = await r.json().catch(() => ({}));
  return pickWaba(res?.data?.granular_scopes ?? []) ?? "";
}

/** Ask Meta for the phone's contacts, then its chat history. Each is allowed once per connection. */
async function requestSync(ws: string, pnid: string, token: string): Promise<string | null> {
  try {
    await graph(`${pnid}/smb_app_data`, token, { method: "POST", body: { messaging_product: "whatsapp", sync_type: "smb_app_state_sync" } });
    await graph(`${pnid}/smb_app_data`, token, { method: "POST", body: { messaging_product: "whatsapp", sync_type: "history" } });
    await db.rpc("svc_whatsapp_sync_requested", { p_workspace: ws, p_error: null });
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.rpc("svc_whatsapp_sync_requested", { p_workspace: ws, p_error: msg });
    return msg;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } };
  const user = who?.user;
  if (!user) return json(401, { error: "Sign in first" });
  // deno-lint-ignore no-explicit-any
  let b: any; try { b = await req.json(); } catch { return json(400, { error: "Not JSON" }); }
  const ws = String(b?.workspace ?? "");
  if (!/^[0-9a-f-]{36}$/.test(ws)) return json(400, { error: "Which business?" });
  const { data: member } = await db.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
  if (member?.role !== "owner") return json(403, { error: "Only the owner can connect WhatsApp" });

  // Ask again for history (only if our first request failed, within Meta's 24 hours).
  if (b.action === "sync") {
    const { data: row } = await db.from("whatsapp_numbers").select("phone_number_id, on_app, via, connected_at, history_status").eq("workspace_id", ws).maybeSingle();
    if (!row || row.via !== "partner" || !row.on_app) return json(400, { error: "This number isn't linked to the WhatsApp Business app" });
    if (Date.now() - new Date(row.connected_at).getTime() > 24 * 3600_000) return json(400, { error: "Meta only allows this in the first 24 hours. Disconnect in the WhatsApp Business app (Settings → Account → Business Platform) and connect again." });
    if (row.history_status === "syncing" || row.history_status === "done") return json(400, { error: "Your chats are already coming in" });
    const { data: keys } = await db.rpc("svc_whatsapp_keys", { p_phone_number_id: row.phone_number_id });
    const token = (keys as { token: string }[] | null)?.[0]?.token;
    if (!token) return json(400, { error: "Connect WhatsApp again" });
    const err = await requestSync(ws, row.phone_number_id, token);
    return err ? json(502, { error: err }) : json(200, { ok: true });
  }

  const code = String(b?.code ?? "");
  // The exact return address Meta's window used (Bizriva's /meta/callback page); Meta requires the same one here.
  const redirect = String(b?.redirect_uri ?? "");
  if (redirect && !/^https:\/\/[a-z0-9.-]+(:\d+)?\/meta\/callback$/i.test(redirect)) return json(400, { error: "Unexpected return address" });
  let waba = String(b?.waba_id ?? "");
  if (code.length < 10 || (waba && !/^\d{6,25}$/.test(waba))) return json(400, { error: "Meta's sign-up didn't finish — try again" });
  const { data: plat } = await db.rpc("svc_meta_platform");
  const app = (plat as { app_id: string | null; app_secret: string | null }[] | null)?.[0];
  if (!app?.app_id || !app.app_secret) return json(503, { error: "Bizriva's WhatsApp connection isn't switched on yet" });

  try {
    // 1. The one-time code → the business's token (works for their WhatsApp account only).
    const t = await fetch(`${G}/oauth/access_token?client_id=${app.app_id}&client_secret=${encodeURIComponent(app.app_secret)}&code=${encodeURIComponent(code)}${redirect ? `&redirect_uri=${encodeURIComponent(redirect)}` : ""}`, { signal: AbortSignal.timeout(20_000) });
    const tok = await t.json().catch(() => ({}));
    if (!t.ok || !tok.access_token) throw new Error(`${tok?.error?.code ?? t.status} ${tok?.error?.message ?? "Meta didn't accept the sign-up code"}`);
    const token = String(tok.access_token);

    // Which WhatsApp Business Account: from Meta's window, else from what the code was granted.
    if (!waba) waba = await wabaFromToken(token, `${app.app_id}|${app.app_secret}`);
    if (!waba) throw new Error("Meta didn't share a WhatsApp account. Try again and pick your WhatsApp Business account in Meta's window.");

    // 2. Which number, and is it on the WhatsApp Business app?
    const list = await graph(`${waba}/phone_numbers?fields=id,display_phone_number,verified_name,platform_type,is_on_biz_app`, token);
    const num = pickNumber(list?.data ?? [], b.phone_number_id ? String(b.phone_number_id) : null);
    if (!num) throw new Error("No WhatsApp number was found on that account");
    let onApp = !!num.is_on_biz_app;
    try { const info = await graph(`${num.id}?fields=is_on_biz_app,platform_type,display_phone_number`, token); onApp = !!info.is_on_biz_app; } catch { /* keep the list's answer */ }

    // 3. Send this account's webhooks to Bizriva.
    await graph(`${waba}/subscribed_apps`, token, { method: "POST" });

    // 4. New numbers are registered for Cloud API; numbers on the phone app are already registered.
    let pin: string | null = null;
    if (!onApp && num.platform_type !== "CLOUD_API") {
      pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
      await graph(`${num.id}/register`, token, { method: "POST", body: { messaging_product: "whatsapp", pin } });
    }

    const { error } = await db.rpc("svc_whatsapp_partner_connect", {
      p_workspace: ws, p_user: user.id, p_phone_number_id: num.id, p_waba_id: waba, p_display: num.display_phone_number ?? null,
      p_token: token, p_on_app: onApp, p_pin: pin,
    });
    if (error) throw new Error(error.message);

    // 5. Coexistence: bring in the phone's contacts and chats.
    const syncError = onApp ? await requestSync(ws, num.id, token) : null;
    return json(200, { ok: true, display_phone: num.display_phone_number ?? null, name: num.verified_name ?? null, on_app: onApp, history: onApp ? (syncError ? "failed" : "syncing") : "none", sync_error: syncError });
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : String(e) });
  }
});
