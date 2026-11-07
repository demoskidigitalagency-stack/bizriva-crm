// bun test tests/basic_assistant.test.ts — the free Basic assistant (no AI service).
import { describe, expect, test } from "bun:test";
import { ASK, basicReply, faqAnswer, productsIn, quantityIn } from "../supabase/functions/ai-reply/basic";
import type { Ctx } from "../supabase/functions/ai-reply/brain";

const base: Ctx = {
  business: "Dxmart", currency: "NGN", deliveryFee: 2500, freeDeliveryOver: null,
  agent: { greeting: "Welcome to Dxmart! How can we help?" }, optOutKeywords: ["STOP"], customer: { name: "Ada", location: null },
  products: [
    { name: "Glow Body Cream", price: 12000, inStock: true, hasPhoto: true },
    { name: "Shea Butter Jar", price: 6000, inStock: true, variants: [{ name: "250g", price: 6000, inStock: true }, { name: "500g", price: 10000, inStock: false }] },
    { name: "Black Soap", price: 3000, inStock: false },
  ],
  knowledge: [{ topic: "Delivery", question: "How long does delivery take to Lagos?", answer: "Lagos delivery takes 1–2 days. Outside Lagos 3–5 days." }, { topic: "Payment", question: "Do you accept pay on delivery?", answer: "Yes — pay when it arrives." }],
  orders: [], facts: [], messages: [],
};
const chat = (...lines: [("c" | "b"), string][]): Ctx => ({ ...base, messages: lines.map(([f, text], i) => ({ from: f === "c" ? "customer" : "business", text, at: new Date(1793990000000 + i * 60000).toISOString() })) });

describe("understanding", () => {
  test("products by full name or a word only one product has", () => { expect(productsIn(base, "how much is the body cream").map((p) => p.name)).toEqual(["Glow Body Cream"]); expect(productsIn(base, "do you have shea?").map((p) => p.name)).toEqual(["Shea Butter Jar"]); });
  test("quantities, not phone numbers or sizes", () => { expect([quantityIn("2 pcs"), quantityIn("I want two"), quantityIn("x3"), quantityIn("08031234567"), quantityIn("the 500g size")]).toEqual([2, 2, 3, null, null]); });
  test("FAQ by keywords", () => { expect(faqAnswer(base, "how long delivery to lagos")).toContain("1–2 days"); expect(faqAnswer(base, "can I pay on delivery?")).toContain("pay when it arrives"); expect(faqAnswer(base, "what colour is the sky")).toBeNull(); });
});

describe("answers", () => {
  test("hello → greeting and prices", () => { const d = basicReply(chat(["c", "Hello"])); expect(d.reply).toContain("Welcome to Dxmart"); expect(d.reply).toContain("Glow Body Cream — ₦12,000"); expect(d.handoff).toBe(false); });
  test("a product question → price, options and photo", () => { const d = basicReply(chat(["c", "Hi"], ["b", "Welcome"], ["c", "How much is the shea butter?"])); expect(d.reply).toContain("₦6,000"); expect(d.reply).toContain("500g ₦10,000 (sold out)"); expect(d.photos).toEqual([]); });
  test("photos only for products that have one", () => expect(basicReply(chat(["c", "price of glow body cream?"])).photos).toEqual(["Glow Body Cream"]));
  test("FAQ answered", () => expect(basicReply(chat(["c", "Do you accept pay on delivery?"])).reply).toContain("pay when it arrives"));
  test("not understood → the team", () => { const d = basicReply(chat(["c", "Hi"], ["b", "Welcome"], ["c", "My last parcel came damaged and I am not happy"])); expect(d.handoff).toBe(true); });
  test("asks for a person → handover", () => expect(basicReply(chat(["c", "I want to talk to a human"])).handoff).toBe(true));
  test("STOP → nothing", () => expect(basicReply(chat(["c", "STOP"])).reply).toBe(""));
});

describe("ordering step by step", () => {
  test("wants it → how many", () => expect(basicReply(chat(["c", "I want the glow body cream"])).reply).toBe(ASK.qty));
  test("then the address", () => expect(basicReply(chat(["c", "I want the glow body cream"], ["b", ASK.qty], ["c", "2"])).reply).toBe(ASK.address));
  test("then the server prices it", () => {
    const d = basicReply(chat(["c", "I want the glow body cream"], ["b", ASK.qty], ["c", "2"], ["b", ASK.address], ["c", "12 Allen Avenue, Ikeja, Lagos"]));
    expect(d.draft).toEqual({ items: [{ product: "Glow Body Cream", quantity: 2 }], address: "12 Allen Avenue, Ikeja, Lagos" });
  });
  test("a number in the address doesn't change the quantity", () => {
    const d = basicReply(chat(["c", "order 3 glow body cream"], ["b", ASK.address], ["c", "45 Awolowo Road Ikoyi"]));
    expect(d.draft?.items[0]?.quantity).toBe(3);
  });
  test("a product with options asks which one, refuses sold-out ones", () => {
    expect(basicReply(chat(["c", "I want to buy shea butter"])).reply).toContain(ASK.option);
    expect(basicReply(chat(["c", "I want to buy shea butter 500g"])).reply).toContain("sold out");
    expect(basicReply(chat(["c", "I want to buy shea butter 250g"])).reply).toBe(ASK.qty);
  });
  test("sold-out product is refused", () => expect(basicReply(chat(["c", "I want to buy black soap"])).reply).toContain("sold out"));
  test("order with an unclear product asks which", () => expect(basicReply(chat(["c", "I want to order"])).reply).toBeTruthy());
  test("a summary waiting and they want changes → the team", () => expect(basicReply({ ...chat(["c", "change it to 3"]), checkout: { total: 1 } }).handoff).toBe(true));
});
