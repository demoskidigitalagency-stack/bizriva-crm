// Payment link — POST /functions/v1/payment-link  { order_id }
//
// Called from the Inbox by signed-in staff (their session token). Checks they
// may request payment on that order, creates a link for the balance with the
// business's own Paystack or Flutterwave key, and posts it into the customer's
// chat. The payment itself is confirmed later by payments-webhook.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { linkFrom, linkRef, linkRequest, type Ctx } from "./link.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await db.auth.getUser(jwt);
  if (!who?.user) return json(401, { error: "Sign in again" });
  const body = await req.json().catch(() => ({}));
  if (!UUID.test(String(body?.order_id ?? ""))) return json(400, { error: "Which order?" });
  const { data: okRate } = await db.rpc("svc_rate_ok", { p_key: `paylink:${who.user.id}`, p_max: 30, p_seconds: 600 });
  if (okRate === false) return json(429, { error: "Too many links in a short time — try again in a few minutes" });

  const { data: ctx, error } = await db.rpc("svc_payment_context", { p_user: who.user.id, p_order: body.order_id });
  if (error) return json(500, { error: "Couldn't load the order" });
  if (ctx?.error) return json(400, { error: ctx.error });
  const c = ctx as Ctx;
  const ref = linkRef(c.order_ref, crypto.randomUUID().slice(0, 8));
  const r = linkRequest(c, ref);
  if ("error" in r) return json(400, r);
  let link: { url: string } | { error: string };
  try {
    const res = await fetch(r.url, { ...r.init, signal: AbortSignal.timeout(15_000) });
    link = linkFrom(c.provider, res.status, await res.json().catch(() => ({})));
  } catch (e) { link = { error: `Couldn't reach the payment provider: ${e instanceof Error ? e.message : e}` }; }
  if ("error" in link) return json(502, link);

  const { data: saved, error: e2 } = await db.rpc("svc_payment_request", { p_user: who.user.id, p_order: c.order_id, p_amount: Number(c.amount), p_url: link.url, p_provider: c.provider, p_ref: ref });
  if (e2) return json(500, { error: "The link was made but couldn't be saved — try again" });
  return json(200, { url: link.url, reference: ref, amount: Number(c.amount), queued: !!saved?.queued });
});
