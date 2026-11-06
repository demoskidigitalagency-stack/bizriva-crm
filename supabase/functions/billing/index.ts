// Paying for a Bizriva plan — /functions/v1/billing (uses Bizriva's own Paystack account).
//
// POST { workspace_id, plan } with the owner's sign-in → a Paystack checkout link for the plan.
// POST /billing/paystack (Paystack's webhook) — x-paystack-signature must equal
//      HMAC-SHA512(raw body, BIZRIVA_PAYSTACK_SECRET); charge.success marks the plan paid for 30 days.
// Needs the secret BIZRIVA_PAYSTACK_SECRET (Supabase → Edge Functions → Secrets) and APP_URL.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SECRET = Deno.env.get("BIZRIVA_PAYSTACK_SECRET") ?? "";
const APP = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const enc = new TextEncoder();

async function hmac512(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body))), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  if (!SECRET) return json(503, { error: "Plan payments aren't switched on yet — contact Bizriva to upgrade." });
  const url = new URL(req.url);

  if (url.pathname.endsWith("/paystack")) {
    const raw = await req.text();
    if ((await hmac512(SECRET, raw)) !== (req.headers.get("x-paystack-signature") ?? "")) return new Response("Bad signature", { status: 401 });
    const ev = JSON.parse(raw);
    if (ev.event === "charge.success" && String(ev.data?.reference ?? "").startsWith("BZP-") && ev.data?.currency === "NGN") {
      const { data } = await db.rpc("svc_plan_paid", { p_reference: ev.data.reference, p_amount: Number(ev.data.amount) / 100 });
      return json(200, data ?? {});
    }
    return json(200, { ignored: true });
  }

  const { data: u } = await db.auth.getUser((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!u?.user) return json(401, { error: "Please sign in again" });
  const b = await req.json().catch(() => ({}));
  const { data: c, error } = await db.rpc("svc_plan_checkout", { p_user: u.user.id, p_workspace: String(b.workspace_id ?? ""), p_plan: String(b.plan ?? "") });
  if (error) return json(400, { error: "Couldn't start the payment" });
  if (c?.error) return json(400, { error: c.error });
  const r = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST", headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: c.email, amount: Math.round(Number(c.amount) * 100), currency: "NGN", reference: c.reference, ...(APP ? { callback_url: `${APP}/billing?paid=1` } : {}), metadata: { workspace_id: b.workspace_id, plan: b.plan, kind: "bizriva_plan" } }),
    signal: AbortSignal.timeout(15_000),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok || !res.data?.authorization_url) return json(502, { error: `Paystack: ${res.message ?? "couldn't start the payment"}` });
  return json(200, { url: res.data.authorization_url, reference: c.reference });
});
