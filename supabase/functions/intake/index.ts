// Website, form and store intake — POST /functions/v1/intake/<connection id>
//
// Elementor, Gravity Forms, WPForms, Contact Form 7, Fluent Forms, WooCommerce,
// Shopify, Google Forms, Typeform, Jotform, Tally, Zapier/Make or any website
// POSTs here with the connection's secret key (header X-Bizriva-Key or ?key=).
// The key is checked in the database against its sha256 hash before anything
// is stored; prices come from the business's catalogue when the product is known.
//
// intake.ts is a copy of src/domain/intake.ts (the same normaliser the app's
// "Send test" uses). tests/check_functions.py fails if the two drift apart.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { autoMap, flatten, normalise, type FieldMap, type PlatformId } from "./intake.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 256 * 1024;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-bizriva-key", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function readBody(req: Request): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  const text = await req.text();
  if (text.length > MAX_BYTES) throw new Error("too_large");
  if (type.includes("application/json") || /^\s*[{[]/.test(text)) return JSON.parse(text);
  if (type.includes("multipart/form-data")) {
    const form = await new Response(text, { headers: { "content-type": type } }).formData();
    return Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : v.name]));
  }
  return Object.fromEntries(new URLSearchParams(text));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Send a POST request" });
  const url = new URL(req.url);
  const id = url.pathname.split("/").filter(Boolean).pop() ?? "";
  if (!UUID.test(id)) return json(404, { error: "Unknown connection" });
  const key = req.headers.get("x-bizriva-key") ?? url.searchParams.get("key") ?? "";
  if (!key) return json(401, { error: "Add your secret key (header X-Bizriva-Key or ?key=)" });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return json(413, { error: "Too large" });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const [a, b] = await Promise.all([
    db.rpc("svc_rate_ok", { p_key: `intake:${id}`, p_max: 120, p_seconds: 60 }),
    db.rpc("svc_rate_ok", { p_key: `intake-ip:${ip}`, p_max: 60, p_seconds: 60 }),
  ]);
  if (a.data === false || b.data === false) return json(429, { error: "Too many submissions — slow down" });

  let raw: unknown;
  try { raw = await readBody(req); } catch (e) { return json((e as Error).message === "too_large" ? 413 : 400, { error: "Couldn't read the submission" }); }

  const { data: conn } = await db.from("connections").select("platform, field_map").eq("id", id).maybeSingle();
  if (!conn) return json(401, { error: "Unknown connection or wrong key" }); // same answer as a wrong key
  const flat = flatten(raw, conn.platform as PlatformId);
  const map: FieldMap = { ...autoMap(flat), ...((conn.field_map ?? {}) as FieldMap) };
  const n = normalise(flat, map);
  const fields = {
    name: n.name, phone: n.phone, email: n.email, address: n.address, city: n.city, landmark: n.landmark,
    product: n.product, quantity: String(n.quantity), total: n.total, note: n.note, source: n.source, externalId: n.externalId,
  };

  const { data, error } = await db.rpc("svc_ingest", { p_connection: id, p_secret: key, p_fields: fields, p_raw: raw });
  if (error) { console.error("intake", error.message); return json(500, { error: "Something went wrong — it was not saved, please retry" }); }
  const res = data as { status: string; reason?: string; order_ref?: string };
  if (res.status === "unauthorized") return json(401, { error: "Unknown connection or wrong key" });
  if (res.status === "failed") return json(422, { error: res.reason ?? "Missing details", mapped: map });
  return json(200, { ok: true, status: res.status, order: res.order_ref ?? null });
});
