// The AI sales agent's rules — pure functions, no network (unit-tested in tests/ai_brain.test.ts).

export interface Ctx {
  business: string; currency: string; deliveryFee?: number | null; freeDeliveryOver?: number | null;
  agent: { name?: string; greeting?: string; tone?: string; handoffKeywords?: string[]; enabled?: boolean };
  optOutKeywords: string[];
  customer: { name?: string | null; location?: string | null };
  products: { name: string; price: number | string; promoPrice?: number | string | null; inStock: boolean; category?: string | null; description?: string | null; benefits?: string | null }[];
  knowledge: { topic: string; question?: string | null; answer: string }[];
  orders: { ref: string; status: string; total: number | string; paid: number | string; placed: string }[];
  facts: { kind: string; value: string }[];
  messages: { from: "customer" | "business"; text: string; at: string }[];
  checkout?: { total?: number | string; summary_at?: string } | null;
}
export interface Draft { items: { product: string; quantity?: number | string }[]; name?: string; phone?: string; address?: string; state?: string }
export interface Decision { reply: string; handoff: boolean; reason: string; confirm?: boolean; draft?: Draft }

const YES = ["yes", "yes please", "yeah", "yep", "yup", "confirm", "confirmed", "i confirm", "ok", "okay", "ok confirm", "go ahead", "sure", "correct", "proceed", "oya", "abeg confirm", "yes confirm", "place it", "place the order"];
/** A clear yes to the order summary — decided by rule, never by the model. */
export function isYes(text: string): boolean {
  const t = norm(text.replace(/👍|✅/g, " yes "));
  return YES.includes(t) || /^yes\b/.test(t) && !/\b(but|change|not|no)\b/.test(t);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const num = (v: unknown) => (v === null || v === undefined || v === "" ? NaN : Number(v));

export const DEFAULT_HANDOFF = ["human", "agent", "person", "manager", "call me", "speak to someone"];
const COMPLAINT = ["scam", "fraud", "refund", "report you", "useless", "angry", "disappointed", "fake product", "police", "lawyer"];

/** Decide without the model when the rules already say what to do. */
export function quickRules(ctx: Ctx): Decision | null {
  const last = [...ctx.messages].reverse().find((m) => m.from === "customer");
  if (!last) return { reply: "", handoff: false, reason: "No customer message" };
  const t = ` ${norm(last.text)} `;
  if ((ctx.optOutKeywords ?? ["STOP"]).some((k) => norm(last.text) === norm(k))) return { reply: "", handoff: false, reason: "Customer opted out" };
  const words = (ctx.agent.handoffKeywords?.length ? ctx.agent.handoffKeywords : DEFAULT_HANDOFF).map(norm).filter(Boolean);
  if (words.some((w) => t.includes(` ${w} `))) return { reply: "Sure — I'm passing you to a member of our team now. They'll reply here shortly.", handoff: true, reason: "Customer asked for a person" };
  if (ctx.checkout && isYes(last.text)) return { reply: "", handoff: false, reason: "Customer confirmed the order", confirm: true };
  if (COMPLAINT.some((w) => t.includes(` ${norm(w)} `))) return { reply: "I'm sorry about this. I'm passing you to a member of our team right away so they can sort it out.", handoff: true, reason: "Possible complaint" };
  return null;
}

/** Every amount of money a reply is allowed to mention. */
export function allowedAmounts(ctx: Ctx): Set<number> {
  const ok = new Set<number>();
  const add = (v: unknown) => { const n = num(v); if (Number.isFinite(n) && n > 0) ok.add(Math.round(n)); };
  const fee = num(ctx.deliveryFee);
  for (const p of ctx.products) for (const v of [p.price, p.promoPrice]) {
    const n = num(v); if (!Number.isFinite(n) || n <= 0) continue;
    for (let q = 1; q <= 10; q++) { add(n * q); if (Number.isFinite(fee)) add(n * q + fee); }
  }
  add(ctx.deliveryFee); add(ctx.freeDeliveryOver);
  for (const o of ctx.orders) { add(o.total); add(o.paid); add(num(o.total) - num(o.paid)); }
  return ok;
}

/** Money amounts written in a reply: ₦12,000 · N12000 · NGN 12,000 · 12,000 naira · 12k naira. */
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  const re = /(?:₦|\bngn\s?|\bn(?=\d))\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(k)?|(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(k)?\s?(?:naira|ngn)\b/gi;
  for (const m of text.matchAll(re)) {
    const raw = (m[1] ?? m[3] ?? "").replace(/,/g, ""); const k = m[2] ?? m[4];
    const n = Number(raw) * (k ? 1000 : 1);
    if (Number.isFinite(n)) out.push(Math.round(n));
  }
  return out;
}

/** The safety check on the model's answer. Returns the decision to apply. */
export function checkReply(ctx: Ctx, d: Decision): Decision {
  const reply = (d.reply ?? "").trim().slice(0, 1500);
  if (!d.handoff && d.draft?.items?.length) return { reply, handoff: false, reason: "", draft: d.draft };   // the server prices and words the summary
  if (d.handoff) return { reply: reply || "I'm passing you to a member of our team — they'll reply here shortly.", handoff: true, reason: d.reason || "The AI wasn't sure" };
  if (!reply) return { reply: "", handoff: true, reason: "The AI had no answer" };
  const ok = allowedAmounts(ctx);
  const bad = amountsIn(reply).filter((n) => !ok.has(n));
  if (bad.length) return { reply: "Let me confirm that for you — a member of our team will reply here shortly.", handoff: true, reason: `The AI quoted an amount that isn't in your prices (${bad.join(", ")})` };
  return { reply, handoff: false, reason: "" };
}

const TONE: Record<string, string> = { friendly: "warm and friendly, like a helpful shop assistant", formal: "polite and professional", playful: "light and playful, but still clear" };

export function systemPrompt(ctx: Ctx): string {
  const name = ctx.agent.name || "the sales assistant";
  const data = { pendingCheckout: ctx.checkout ?? null, products: ctx.products, knowledge: ctx.knowledge, customer: ctx.customer, customerFacts: ctx.facts, customerOrders: ctx.orders, deliveryFee: ctx.deliveryFee, freeDeliveryOver: ctx.freeDeliveryOver, currency: ctx.currency };
  return [
    `You are ${name}, answering customers on WhatsApp for ${ctx.business}, a Nigerian business that sells with pay on delivery.`,
    `Tone: ${TONE[ctx.agent.tone ?? "friendly"] ?? TONE.friendly}. Write short WhatsApp messages (1–4 sentences), plain text, no markdown. Match the customer's language (English or Nigerian Pidgin).`,
    "Rules:",
    "- Use ONLY the business data below. Never invent products, prices, discounts, stock, delivery times or policies.",
    `- Prices are in ${ctx.currency}. Write amounts like ₦12,000. Only quote prices, delivery fees and order totals exactly as given.`,
    "- If a product is out of stock, say so and suggest a similar in-stock one if there is one.",
    "- To take an order, collect: which product and how many, full name, phone number, delivery address and state. Don't promise a delivery date unless the data says it.",
    "- When the customer has chosen what to buy and you have their name, phone and address, fill `checkout` (use product names exactly as in the data). The system then sends the priced summary and asks them to reply YES — don't write the summary or totals yourself, and never say the order is placed.",
    "- If `checkout` in the data is set, a summary is waiting for the customer's YES. If they want changes, fill `checkout` again with the new details.",
    "- For an existing order, use customerOrders (ref and status) to answer.",
    "- Set handoff=true when the customer wants a person, is upset or complaining, asks something the data doesn't answer, wants a discount, or you are unsure. Then tell them a team member will reply shortly.",
    "- Never ask for card details, PINs, passwords or OTPs.",
    ctx.agent.greeting ? `- If this is the start of the chat, you may open with: "${ctx.agent.greeting}"` : "",
    "",
    "Business data (JSON):",
    JSON.stringify(data),
  ].filter(Boolean).join("\n");
}

/** Chat history as model turns: customer = user, business = assistant; starts with the customer. */
export function turns(ctx: Ctx): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of ctx.messages) {
    const role = m.from === "customer" ? "user" : "assistant";
    const text = (m.text ?? "").trim(); if (!text) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.content += "\n" + text; else out.push({ role, content: text });
  }
  while (out.length && out[0]!.role !== "user") out.shift();
  return out;
}

export const RESPOND_TOOL = {
  name: "respond",
  description: "Send your reply to the customer, or hand the chat to a person.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "The WhatsApp message to send to the customer." },
      handoff: { type: "boolean", description: "true to pass the chat to a human team member." },
      reason: { type: "string", description: "If handing off, why (one short line for the team)." },
      checkout: {
        type: "object", description: "Only when the customer has chosen what to buy and given name, phone and delivery address.",
        properties: {
          items: { type: "array", items: { type: "object", properties: { product: { type: "string" }, quantity: { type: "integer" } }, required: ["product"] } },
          name: { type: "string" }, phone: { type: "string" }, address: { type: "string" }, state: { type: "string" },
        },
        required: ["items"],
      },
    },
    required: ["reply", "handoff"],
  },
};
