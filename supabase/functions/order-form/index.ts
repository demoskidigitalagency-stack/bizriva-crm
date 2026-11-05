// Public order form — /functions/v1/order-form/<form id>
//   GET                 → the form (headline, packages, prices) to show the visitor
//   POST                → place the order { package, name, phone, address, city, region, source }
//   POST …/event        → analytics { kind: view | start | drop, field, visitor }
//
// Prices are read from the form in the database, never from the browser.
// Bots: a hidden "website" field (honeypot) and per-IP rate limits.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const s = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const at = parts.indexOf("order-form");
  const formId = parts[at + 1] ?? "";
  const sub = parts[at + 2];
  if (!UUID.test(formId)) return json(404, { error: "Form not found" });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (req.method === "GET") {
    const { data } = await db.rpc("svc_public_form", { p_form: formId });
    return data ? json(200, data) : json(404, { error: "This form is closed" });
  }
  if (req.method !== "POST") return json(405, { error: "Not allowed" });
  let body: Record<string, unknown> = {};
  try { const t = await req.text(); if (t.length > 16_000) return json(413, { error: "Too large" }); body = JSON.parse(t || "{}"); } catch { return json(400, { error: "Send JSON" }); }

  if (sub === "event") {
    const { data: ok } = await db.rpc("svc_rate_ok", { p_key: `form-ev:${ip}`, p_max: 300, p_seconds: 60 });
    if (ok) await db.rpc("svc_form_event", { p_form: formId, p_kind: s(body.kind, 10), p_field: s(body.field, 40), p_visitor: s(body.visitor, 64) });
    return new Response(null, { status: 204, headers: cors });
  }

  const { data: ok } = await db.rpc("svc_rate_ok", { p_key: `form:${ip}`, p_max: 8, p_seconds: 600 });
  if (!ok) return json(429, { error: "Too many orders from this connection — please call us instead" });
  if (s(body.website)) return json(200, { status: "created", order_ref: null }); // honeypot: bots fill hidden fields

  const { data, error } = await db.rpc("svc_submit_form", {
    p_form: formId, p_package: s(body.package, 40), p_name: s(body.name, 120), p_phone: s(body.phone, 30),
    p_address: s(body.address), p_city: s(body.city, 80), p_region: s(body.region, 80), p_ad_source: s(body.source, 200),
  });
  if (error) { console.error("order-form", error.message); return json(500, { error: "Your order didn't go through — please try again" }); }
  const res = data as { status: string; reason?: string; order_ref?: string; thank_you?: string };
  if (res.status === "not_found") return json(404, { error: "This form is closed" });
  if (res.status === "invalid") return json(422, { error: res.reason });
  return json(200, res);
});
