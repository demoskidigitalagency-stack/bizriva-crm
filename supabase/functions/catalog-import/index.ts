// Store importer — POST /functions/v1/catalog-import { url, platform?, key?, secret? }
//
// Signed-in owners/managers paste their Shopify or WooCommerce shop address; this reads the
// public catalogue (Shopify /products.json, WooCommerce Store API) — or the private one with the
// key they type — and returns name, price, description, category, photo, SKU and stock for them
// to pick from. Nothing is saved here; the app adds the products they tick. Keys are never stored.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { fromShopify, fromWoo, pageUrl, shopUrl, type Item, type Platform } from "./catalog.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function get(url: string, headers: Record<string, string>): Promise<{ status: number; body: any }> {
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Bizriva catalogue import", ...headers }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
  const text = (await r.text()).slice(0, 8_000_000);
  try { return { status: r.status, body: JSON.parse(text) }; } catch { return { status: r.status, body: null }; }
}

async function read(base: URL, platform: Platform, key: string, secret: string): Promise<Item[] | null> {
  const keys = !!key;
  const headers: Record<string, string> = platform === "shopify" && keys ? { "X-Shopify-Access-Token": key }
    : platform === "woocommerce" && keys ? { Authorization: `Basic ${btoa(`${key}:${secret}`)}` } : {};
  const out: Item[] = [];
  for (let page = 1; page <= 5 && out.length < 500; page++) {
    const r = await get(pageUrl(base, platform, page, keys), headers);
    if (r.status !== 200 || r.body === null) return page === 1 ? null : out;
    const got = platform === "shopify" ? fromShopify(r.body) : fromWoo(r.body);
    out.push(...got);
    if (!got.length || (platform === "shopify" && keys)) break;
  }
  return out.slice(0, 500);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await db.auth.getUser(jwt);
  if (!who?.user) return json(401, { error: "Sign in again" });
  const { data: okRate } = await db.rpc("svc_rate_ok", { p_key: `catalog:${who.user.id}`, p_max: 10, p_seconds: 600 });
  if (okRate === false) return json(429, { error: "Too many imports in a short time — try again in a few minutes" });
  const body = await req.json().catch(() => ({}));
  const base = shopUrl(String(body?.url ?? ""));
  if (!base) return json(400, { error: "Type your shop's web address, e.g. myshop.com or myshop.myshopify.com" });
  const key = String(body?.key ?? "").trim().slice(0, 200), secret = String(body?.secret ?? "").trim().slice(0, 200);
  const order: Platform[] = body?.platform === "shopify" ? ["shopify"] : body?.platform === "woocommerce" ? ["woocommerce"] : base.hostname.endsWith("myshopify.com") ? ["shopify"] : ["shopify", "woocommerce"];
  try {
    for (const p of order) {
      const items = await read(base, p, key, secret);
      if (items && items.length) return json(200, { platform: p, items });
    }
  } catch (e) { return json(502, { error: `Couldn't reach the shop: ${e instanceof Error ? e.message : e}` }); }
  return json(404, { error: "No products found there. If the shop is private, add its API key (Shopify Admin token, or WooCommerce consumer key and secret)." });
});
