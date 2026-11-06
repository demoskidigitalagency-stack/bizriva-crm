// bun test tests/ai_brain.test.ts — the AI agent's safety rules.
import { describe, expect, test } from "bun:test";
import { allowedAmounts, amountsIn, checkReply, quickRules, turns, systemPrompt, type Ctx } from "../supabase/functions/ai-reply/brain";

const base: Ctx = {
  business: "Glow Naturals", currency: "NGN", deliveryFee: 2500, freeDeliveryOver: 50000,
  agent: { name: "Ada", tone: "friendly", handoffKeywords: ["human", "manager", "call me"] }, optOutKeywords: ["STOP"],
  customer: { name: "Tolu Ade", location: "Lagos" },
  products: [{ name: "Glow Body Cream", price: "12000.00", inStock: true }, { name: "Shea Butter Jar", price: 6000, promoPrice: 5000, inStock: false }],
  knowledge: [{ topic: "delivery", question: "How long is delivery?", answer: "Lagos 1–2 days." }],
  orders: [{ ref: "BZ-1003", status: "confirmed", total: "8500.00", paid: 0, placed: "2026-11-06" }],
  facts: [], messages: [{ from: "customer", text: "How much is the body cream?", at: "x" }],
};
const withLast = (text: string): Ctx => ({ ...base, messages: [...base.messages, { from: "business", text: "Hi!", at: "y" }, { from: "customer", text, at: "z" }] });

describe("rules before the model", () => {
  test("asking for a person hands over", () => expect(quickRules(withLast("Let me talk to your manager"))?.handoff).toBe(true));
  test("a complaint hands over", () => expect(quickRules(withLast("This is a scam, I want a refund"))?.handoff).toBe(true));
  test("STOP gets no reply", () => { const d = quickRules(withLast("stop")); expect(d?.handoff).toBe(false); expect(d?.reply).toBe(""); });
  test("an ordinary question goes to the model", () => expect(quickRules(withLast("Do you deliver to Ikeja?"))).toBeNull());
  test("'human' inside another word doesn't trigger", () => expect(quickRules(withLast("Is it humane to test on animals?"))).toBeNull());
});

describe("money check on the model's reply", () => {
  test("finds amounts written many ways", () => expect(amountsIn("₦12,000 or N6000, NGN 2,500, 12k naira, 3,000 naira")).toEqual([12000, 6000, 2500, 12000, 3000]));
  test("prices, quantities, delivery and order totals are allowed", () => {
    const ok = allowedAmounts(base);
    for (const n of [12000, 24000, 26500, 5000, 2500, 50000, 8500]) expect(ok.has(n)).toBe(true);
  });
  test("a correct price goes out", () => expect(checkReply(base, { reply: "The Glow Body Cream is ₦12,000. Delivery in Lagos is ₦2,500.", handoff: false, reason: "" }).handoff).toBe(false));
  test("an invented discount is stopped and handed over", () => {
    const d = checkReply(base, { reply: "For you, just ₦9,999!", handoff: false, reason: "" });
    expect(d.handoff).toBe(true); expect(d.reason).toContain("9999"); expect(d.reply).not.toContain("9,999");
  });
  test("an empty answer hands over", () => expect(checkReply(base, { reply: " ", handoff: false, reason: "" }).handoff).toBe(true));
});

describe("what the model sees", () => {
  test("history starts with the customer and merges runs", () => {
    const t = turns({ ...base, messages: [{ from: "business", text: "Welcome", at: "a" }, { from: "customer", text: "Hi", at: "b" }, { from: "customer", text: "Price?", at: "c" }] });
    expect(t).toEqual([{ role: "user", content: "Hi\nPrice?" }]);
  });
  test("the prompt carries this business's data and the rules", () => {
    const p = systemPrompt(base);
    expect(p).toContain("Glow Naturals"); expect(p).toContain("Glow Body Cream"); expect(p).toContain("Never invent"); expect(p).toContain("Never ask for card details");
  });
});

describe("checkout", () => {
  const pending = (text: string): Ctx => ({ ...withLast(text), checkout: { total: 14500, summary_at: "now" } });
  test("a clear yes to the summary confirms, by rule", () => {
    for (const y of ["YES", "Yes please", "ok", "Oya", "confirm", "👍", "yes, go ahead"]) expect(quickRules(pending(y))?.confirm).toBe(true);
  });
  test("anything else is not a yes", () => {
    for (const n of ["no", "yes but change the address", "not yet", "how much again?", "yes not now"]) expect(quickRules(pending(n))?.confirm).toBeFalsy();
  });
  test("yes without a pending summary is not an order", () => expect(quickRules(withLast("yes"))).toBeNull());
  test("a draft goes to the server to be priced, not checked as a reply", () => {
    const d = checkReply(base, { reply: "Great!", handoff: false, reason: "", draft: { items: [{ product: "Glow Body Cream", quantity: 1 }], name: "Tolu", phone: "0806", address: "Ikeja" } });
    expect(d.draft?.items[0]?.product).toBe("Glow Body Cream"); expect(d.handoff).toBe(false);
  });
  test("the prompt tells the model never to write totals or say the order is placed", () => expect(systemPrompt(base)).toContain("never say the order is placed"));
});

describe("variants and product photos", () => {
  const v: Ctx = { ...base, products: [{ name: "Glow Body Cream", price: 12000, inStock: true, hasPhoto: true, variants: [{ name: "500ml", price: 18000, inStock: true }] }, { name: "Shea Butter Jar", price: 6000, inStock: true }] };
  test("a variant's own price may be quoted", () => expect(checkReply(v, { reply: "The 500ml is ₦18,000.", handoff: false, reason: "" }).handoff).toBe(false));
  test("photos only for products that have one", () => expect(checkReply(v, { reply: "Here you go!", handoff: false, reason: "", photos: ["glow body cream", "Shea Butter Jar", "Made-up thing"] }).photos).toEqual(["Glow Body Cream"]));
  test("a photo alone is a valid answer", () => { const d = checkReply(v, { reply: "", handoff: false, reason: "", photos: ["Glow Body Cream"] }); expect(d.handoff).toBe(false); expect(d.photos).toEqual(["Glow Body Cream"]); });
});
