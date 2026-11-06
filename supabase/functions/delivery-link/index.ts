// Rider / logistics partner private link — /functions/v1/delivery-link/<token>
//   GET   → the delivery (customer, address, items, amount to collect)
//   POST  → { action: "accept" | "delivered" | "failed", cash?, reason? }
//
// No login: the token is the key. Only its sha256 hash is stored, links expire
// after 30 days, closed deliveries can't be changed, and cash can't exceed the
// order total. Rate-limited per connection.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const TOKEN = /^[0-9a-f]{24,64}$/;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const token = parts[parts.indexOf("delivery-link") + 1] ?? "";
  if (!TOKEN.test(token)) return json(404, { error: "This delivery link isn't valid" });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { data: ok } = await db.rpc("svc_rate_ok", { p_key: `dlink:${ip}`, p_max: 60, p_seconds: 60 });
  if (ok === false) return json(429, { error: "Too many tries — wait a minute" });

  if (req.method === "GET") {
    const { data } = await db.rpc("svc_delivery_view", { p_token: token });
    return data ? json(200, data) : json(404, { error: "This delivery link isn't valid" });
  }
  if (req.method !== "POST") return json(405, { error: "Not allowed" });
  let body: Record<string, unknown> = {};
  try { const t = await req.text(); if (t.length > 4000) return json(413, { error: "Too large" }); body = JSON.parse(t || "{}"); } catch { return json(400, { error: "Send JSON" }); }
  const action = String(body.action ?? "");
  if (!["accept", "delivered", "failed"].includes(action)) return json(422, { error: "Unknown action" });
  const cash = body.cash === undefined || body.cash === null || body.cash === "" ? null : Number(body.cash);
  if (cash !== null && !Number.isFinite(cash)) return json(422, { error: "Cash must be a number" });
  const { data, error } = await db.rpc("svc_delivery_action", { p_token: token, p_action: action, p_cash: cash, p_reason: typeof body.reason === "string" ? body.reason.slice(0, 200) : null });
  if (error) { console.error("delivery-link", error.message); return json(500, { error: "Couldn't save — please try again" }); }
  const res = data as { status: string; reason?: string };
  if (res.status === "not_found") return json(404, { error: "This delivery link isn't valid" });
  if (res.status === "closed") return json(409, { error: "This delivery is already closed" });
  if (res.status === "invalid") return json(422, { error: res.reason });
  return json(200, res);
});
