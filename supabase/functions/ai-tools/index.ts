// AI tools — POST /functions/v1/ai-tools { workspace_id, action, ... } (signed-in team members).
//   photo_product { image (base64), mime }  → name, description, category, aliases for a new product
//   ad_copy      { product_id, angle?, platform? } → 3 ad copy variants
//   memory       { contact_id }               → facts the customer stated, for staff to confirm
// Uses the business's own AI key (AI Agent page: Anthropic, or a free Google Gemini key), else Bizriva's ANTHROPIC_API_KEY. Nothing is
// saved here: the app shows the suggestions and the person decides.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { askTool, isGemini, pickModel } from "./llm.ts";
import { ADS_TOOL, adsPrompt, chatPrompt, checkAds, checkMemory, checkPhoto, MEMORY_TOOL, PHOTO_TOOL, SYSTEM_ADS, SYSTEM_MEMORY, SYSTEM_PHOTO } from "./tools.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const MODEL = Deno.env.get("AI_TOOLS_MODEL") ?? "claude-sonnet-5-5";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// deno-lint-ignore no-explicit-any
const ask = (key: string, model: string, system: string, content: any, tool: any) =>
  askTool({ key, model, system, messages: [{ role: "user", content }], tool, maxTokens: 1500, timeoutMs: 60_000 });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const { data: u } = await db.auth.getUser((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!u?.user) return json(401, { error: "Please sign in again" });
  const b = await req.json().catch(() => ({}));
  const ws = String(b.workspace_id ?? "");
  if (!UUID.test(ws)) return json(400, { error: "Which business?" });
  const { data: k } = await db.rpc("svc_ai_tools_key", { p_user: u.user.id, p_workspace: ws });
  if (!k || k.error) return json(403, { error: k?.error ?? "Not allowed" });
  const key = k.api_key ?? Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!key) return json(503, { error: "Add an AI key on the AI Agent page to use this — a free Google Gemini key works." });
  const { data: okRate } = await db.rpc("svc_rate_ok", { p_key: `ai-tools:${ws}`, p_max: 60, p_seconds: 3600 });
  if (okRate === false) return json(429, { error: "That's a lot of AI requests this hour — try again a bit later." });
  // On a Gemini key with no model chosen, the fast Lite model: these are short jobs and the free
  // full model can take over a minute when Google is busy.
  const model = isGemini(key) && !k.model ? "gemini-flash-lite-latest" : pickModel(key, k.model, MODEL);
  try {
    if (b.action === "photo_product") {
      const mime = String(b.mime ?? "image/jpeg");
      const image = String(b.image ?? "");
      if (!/^image\/(jpeg|png|webp|gif)$/.test(mime) || image.length < 100 || image.length > 7_000_000) return json(400, { error: "Use a JPG, PNG or WebP photo under 5 MB." });
      const out = checkPhoto(await ask(key, model, SYSTEM_PHOTO, [{ type: "image", source: { type: "base64", media_type: mime, data: image } }, { type: "text", text: "Fill in this product for my catalogue." }], PHOTO_TOOL));
      return out ? json(200, out) : json(502, { error: "Couldn't recognise a product in that photo." });
    }
    if (b.action === "ad_copy") {
      if (!UUID.test(String(b.product_id ?? ""))) return json(400, { error: "Pick a product" });
      const { data: p } = await db.from("products").select("name, price, promo_price, description, benefits, workspace_id").eq("id", b.product_id).eq("workspace_id", ws).maybeSingle();
      if (!p) return json(404, { error: "Product not found" });
      const { data: w } = await db.from("workspaces").select("name, currency").eq("id", ws).single();
      const price = `${w?.currency ?? ""} ${Number(p.promo_price ?? p.price).toLocaleString("en")}`;
      const variants = checkAds(await ask(key, model, SYSTEM_ADS, adsPrompt({ ...p, price }, w?.name ?? "", String(b.angle ?? "").slice(0, 200), String(b.platform ?? "Facebook and Instagram").slice(0, 40)), ADS_TOOL));
      return variants.length ? json(200, { variants }) : json(502, { error: "The AI didn't return usable copy — try again." });
    }
    if (b.action === "memory") {
      if (!UUID.test(String(b.contact_id ?? ""))) return json(400, { error: "Which customer?" });
      const { data: msgs } = await db.from("messages").select("direction, body, conversations!inner(contact_id, workspace_id)")
        .eq("conversations.contact_id", b.contact_id).eq("conversations.workspace_id", ws).not("body", "is", null).order("created_at", { ascending: false }).limit(150);
      // deno-lint-ignore no-explicit-any
      const lines = ((msgs ?? []) as any[]).reverse().map((m) => ({ out: m.direction === "out", body: String(m.body) }));
      if (!lines.some((l) => !l.out)) return json(200, { facts: [] });
      return json(200, { facts: checkMemory(await ask(key, model, SYSTEM_MEMORY, chatPrompt(lines), MEMORY_TOOL)) });
    }
    return json(400, { error: "Unknown action" });
  } catch (e) { return json(502, { error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }); }
});
