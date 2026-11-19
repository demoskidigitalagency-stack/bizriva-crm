// AI sales agent — POST /functions/v1/ai-reply
//
// Woken by the database every minute and by whatsapp-webhook as soon as a
// customer writes (x-bizriva-cron header = the secret in Vault). For each chat
// waiting on the AI it loads that business's data only and answers with Claude
// (or Google Gemini) on the business's own key — or, with no key, with the free Basic assistant
// (basic.ts, rules only). The reply is checked (brain.ts), then queued, or the
// chat is handed to a person.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { checkReply, quickRules, RESPOND_TOOL, systemPrompt, turns, type Ctx, type Decision, type Draft } from "./brain.ts";
import { basicReply } from "./basic.ts";
import { askTool, pickModel } from "./llm.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const DEFAULT_MODEL = Deno.env.get("AI_MODEL") ?? "claude-haiku-5-5";

interface Job { conversation_id: string; workspace_id: string; message_id: string; api_key: string | null; model: string | null }

async function ask(key: string, model: string, ctx: Ctx): Promise<Decision> {
  const input = await askTool({ key, model, system: systemPrompt(ctx), messages: turns(ctx), tool: RESPOND_TOOL, maxTokens: 600, timeoutMs: 30_000 });
  if (!input) throw new Error("The AI didn't return a reply");
  const ck = input?.checkout;
  const photos = Array.isArray(input?.photos) ? input.photos.map(String) : [];
  return { reply: String(input?.reply ?? ""), handoff: !!input?.handoff, reason: String(input?.reason ?? ""), ...(ck?.items?.length ? { draft: ck as Draft } : {}), ...(photos.length ? { photos } : {}) };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const { data: ok } = await db.rpc("svc_cron_ok", { p_secret: req.headers.get("x-bizriva-cron") ?? "" });
  if (ok !== true) return json(401, { error: "Scheduled job only" });

  const { data, error } = await db.rpc("svc_ai_claim", { p_limit: 10 });
  if (error) return json(500, { error: error.message });
  const out = { replied: 0, handedOff: 0, skipped: 0, errors: 0 };
  for (const j of (data ?? []) as Job[]) {
    let decision: Decision | null = null, err: string | null = null;
    try {
      const { data: ctx } = await db.rpc("svc_ai_context", { p_conversation: j.conversation_id });
      if (!ctx) throw new Error("Chat not found");
      // The business's own key → the full AI. No key → the free Basic assistant (rules, no AI service).
      const key = j.api_key ?? "";
      if (!key) decision = basicReply(ctx as Ctx);
      else {
        decision = quickRules(ctx as Ctx);
        if (!decision) decision = checkReply(ctx as Ctx, await ask(key, pickModel(key, j.model, DEFAULT_MODEL), ctx as Ctx));
      }
      // Checkout: the server prices the draft and words the summary; a YES creates the order.
      if (decision?.confirm) {
        const { data: r } = await db.rpc("svc_ai_checkout_confirm", { p_conversation: j.conversation_id });
        decision = r?.ok
          ? { reply: `✅ Order ${r.order_ref} placed. One of our team will call you shortly to confirm before we send it out. You pay on delivery.`, handoff: false, reason: "" }
          : { reply: "", handoff: true, reason: "Customer said yes but the order summary had expired" };
      } else if (decision?.draft) {
        const d = decision.draft;
        const { data: r } = await db.rpc("svc_ai_checkout_draft", { p_conversation: j.conversation_id, p_items: d.items, p_name: d.name ?? null, p_phone: d.phone ?? null, p_address: d.address ?? null, p_state: d.state ?? null });
        if (r?.ok) decision = { reply: String(r.summary), handoff: false, reason: "" };
        else if (r?.error === "missing") decision = { reply: `To place your order I still need your ${(r.missing as string[]).join(", ")}.`, handoff: false, reason: "" };
        else if (r?.error === "unknown_items") decision = { reply: `Sorry, I couldn't find ${(r.items as string[]).join(", ")} in our list right now. Would you like something else?`, handoff: false, reason: "" };
        else decision = { reply: "", handoff: true, reason: "The order couldn't be priced" };
      }
      // Product photos go out before the text reply, straight from the media library.
      for (const name of decision?.photos ?? []) await db.rpc("svc_ai_send_photo", { p_conversation: j.conversation_id, p_product: name });
    } catch (e) { err = (e instanceof Error ? e.message : String(e)).slice(0, 500); }
    await db.rpc("svc_ai_result", {
      p_conversation: j.conversation_id, p_message: j.message_id, p_reply: decision?.reply ?? null,
      p_handoff: decision?.handoff ?? false, p_reason: decision?.reason ?? null, p_error: err,
    });
    if (err) out.errors++; else if (decision?.handoff) out.handedOff++; else if (decision?.reply) out.replied++; else out.skipped++;
  }
  return json(200, out);
});
