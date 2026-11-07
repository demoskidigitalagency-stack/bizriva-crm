// The free Basic assistant — answers without any AI service (no key, no cost).
// Pure rules over the business's own data; unit-tested in tests/basic_assistant.test.ts.
//
//   greeting           → the business's greeting + a few products with prices
//   names a product    → its price, options and stock, plus its photo
//   asks a FAQ         → the closest knowledge-base answer (keyword match)
//   wants to order     → asks, one thing at a time: product → option → how many → address,
//                        then the server prices it and sends the summary ("reply YES")
//   anything else      → handed to the team
// Questions it asks carry fixed wording so the next reply can be read as the answer.
import { quickRules, type Ctx, type Decision, type Draft } from "./brain.ts";

type Product = Ctx["products"][number];
export const ASK = {
  product: "Which product would you like to order?",
  option: "Which option would you like",
  qty: "How many would you like?",
  address: "Please send your full delivery address (house number, street, area and state).",
  name: "What name should we put on the order?",
  phone: "What phone number should the rider call?",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => norm(s).split(" ").filter(Boolean);
const STOP = new Set(["the", "and", "for", "you", "your", "with", "how", "much", "what", "is", "are", "do", "does", "can", "i", "a", "an", "of", "to", "in", "on", "it", "my", "me", "we", "have", "get", "please", "pls", "abeg", "this", "that"]);
const money = (ctx: Ctx, n: number | string) => `${ctx.currency === "NGN" || !ctx.currency ? "₦" : ctx.currency + " "}${Math.round(Number(n)).toLocaleString("en-NG")}`;
const priceOf = (p: Product) => Number(p.promoPrice ?? p.price);

const GREET = /^(hi|hello|hey|hallo|good (morning|afternoon|evening|day)|morning|evening|afternoon|how far|howfa|hw far|sup|yo|greetings)\b/;
const ORDER = /\b(order|buy|purchase|want|need|i ll take|ill take|i will take|send me|deliver|book|get me|carry)\b/;
const NUMS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Products a message names: the full name, or a distinctive word (4+ letters) that only one product has. */
export function productsIn(ctx: Ctx, text: string): Product[] {
  const t = ` ${norm(text)} `;
  const full = ctx.products.filter((p) => t.includes(` ${norm(p.name)} `));
  if (full.length) return full;
  const hits = new Map<Product, number>();
  for (const w of words(text).filter((w) => w.length >= 4 && !STOP.has(w))) {
    const owners = ctx.products.filter((p) => words(p.name).some((pw) => pw === w || (pw.length >= 5 && w.length >= 5 && (pw.startsWith(w) || w.startsWith(pw)))));
    if (owners.length === 1) hits.set(owners[0]!, (hits.get(owners[0]!) ?? 0) + 1);
  }
  return [...hits.keys()];
}

export function quantityIn(text: string): number | null {
  if (/\d{7,}/.test(text.replace(/[\s-]/g, ""))) return null;                        // a phone number, not a quantity
  const t = norm(text);
  const m = /(?:^|\s)x?\s?(\d{1,2})(?:\s?(?:x|pcs|pieces|piece|units|packs|pack|bottles|jars|sets|pairs))?(?=\s|$)/.exec(t);
  if (m && Number(m[1]) > 0 && Number(m[1]) <= 50) return Number(m[1]);
  for (const [w, n] of Object.entries(NUMS)) if (new RegExp(`\\b${w}\\b`).test(t)) return n;
  return null;
}

/** How many: the answer to our "How many" question, or a number said together with the product. */
function quantityFrom(ctx: Ctx, recent: Ctx["messages"]): number | null {
  let q: number | null = null;
  recent.forEach((m, i) => {
    if (m.from !== "customer") return;
    const prev = recent.slice(0, i).reverse().find((x) => x.from === "business");
    if (prev?.text.includes(ASK.qty) || productsIn(ctx, m.text).length) { const n = quantityIn(m.text); if (n) q = n; }
  });
  return q;
}

/** Best knowledge-base answer by shared keywords (at least 2, or 1 on a short question). */
export function faqAnswer(ctx: Ctx, text: string): string | null {
  const q = new Set(words(text).filter((w) => w.length >= 3 && !STOP.has(w)));
  if (!q.size) return null;
  let best: { score: number; answer: string } | null = null;
  for (const k of ctx.knowledge) {
    const kw = new Set(words(`${k.topic} ${k.question ?? ""}`).filter((w) => w.length >= 3 && !STOP.has(w)));
    let score = 0;
    for (const w of q) if (kw.has(w) || [...kw].some((x) => x.length >= 5 && w.length >= 5 && (x.startsWith(w) || w.startsWith(x)))) score++;
    if (score && (!best || score > best.score)) best = { score, answer: k.answer };
  }
  return best && (best.score >= 2 || (best.score >= 1 && q.size <= 3)) ? best.answer.slice(0, 1500) : null;
}

function describe(ctx: Ctx, p: Product): string {
  const lines = [`*${p.name}* — ${money(ctx, priceOf(p))}${p.inStock ? "" : " (sold out right now)"}`];
  if (p.description) lines.push(p.description.slice(0, 200));
  if (p.variants?.length) lines.push(`Options: ${p.variants.map((v) => `${v.name} ${money(ctx, v.price)}${v.inStock ? "" : " (sold out)"}`).join(", ")}`);
  return lines.join("\n");
}

/** The customer's messages since our last order summary / confirmation, oldest first. */
function sinceLastOrder(ctx: Ctx) {
  const msgs = ctx.messages;
  let start = 0;
  msgs.forEach((m, i) => { if (m.from === "business" && /(Here is your order:|Order BZ-\d+ placed|✅ Order)/.test(m.text)) start = i + 1; });
  return msgs.slice(start);
}

export function basicReply(ctx: Ctx): Decision {
  const quick = quickRules(ctx);
  if (quick) return quick;
  const msgs = ctx.messages;
  const last = [...msgs].reverse().find((m) => m.from === "customer")!;
  const lastUs = [...msgs].reverse().find((m) => m.from === "business");
  const text = last.text ?? "";
  const t = norm(text);
  const handoff = (reason: string): Decision => ({ reply: "Let me get a member of our team to help you with that — they'll reply here shortly.", handoff: true, reason });

  // A summary is waiting and the customer didn't say YES → a person handles the change.
  if (ctx.checkout) return handoff("Customer wants to change their order summary");

  // ── Ordering, one question at a time ──
  const recent = sinceLastOrder(ctx);
  const said = recent.filter((m) => m.from === "customer").map((m) => m.text).join("\n");
  const asked = lastUs?.text ?? "";
  const wanted = productsIn(ctx, said);
  const ordering = ORDER.test(norm(said)) || asked.includes(ASK.qty) || asked.includes(ASK.product) || asked.includes(ASK.option) || asked.includes(ASK.address);
  if (ordering && (wanted.length || asked.includes(ASK.product))) {
    if (!wanted.length) return asked.includes(ASK.product) ? handoff("Couldn't tell which product the customer wants") : { reply: `${ASK.product}\n${ctx.products.filter((p) => p.inStock).slice(0, 6).map((p) => `• ${p.name} — ${money(ctx, priceOf(p))}`).join("\n")}`, handoff: false, reason: "" };
    const p = wanted[wanted.length - 1]!;
    if (!p.inStock) return { reply: `Sorry, ${p.name} is sold out right now. ${ctx.products.filter((x) => x.inStock && x !== p).slice(0, 3).map((x) => `${x.name} (${money(ctx, priceOf(x))})`).join(", ") || ""}`.trim(), handoff: false, reason: "" };
    let variant: string | undefined;
    if (p.variants?.length) {
      const v = p.variants.find((v) => ` ${norm(said)} `.includes(` ${norm(v.name)} `));
      if (!v) return { reply: `${ASK.option} for ${p.name}? ${p.variants.map((v) => `${v.name} (${money(ctx, v.price)})${v.inStock ? "" : " — sold out"}`).join(", ")}`, handoff: false, reason: "" };
      if (!v.inStock) return { reply: `Sorry, ${p.name} ${v.name} is sold out. ${ASK.option} for ${p.name}? ${p.variants.filter((x) => x.inStock).map((x) => `${x.name} (${money(ctx, x.price)})`).join(", ")}`, handoff: false, reason: "" };
      variant = v.name;
    }
    const qty = quantityFrom(ctx, recent);
    if (!qty) return { reply: ASK.qty, handoff: false, reason: "" };
    // Address: what they sent right after we asked for it, or the one we already have.
    let address: string | undefined;
    const idx = msgs.lastIndexOf(lastUs!);
    if (asked.includes(ASK.address) && idx >= 0 && msgs[msgs.length - 1]?.from === "customer") address = msgs.slice(idx + 1).filter((m) => m.from === "customer").map((m) => m.text).join(", ");
    if (!address && !ctx.customer.address) return { reply: ASK.address, handoff: false, reason: "" };
    if (address && address.replace(/\s/g, "").length < 10) return { reply: `Sorry, I need the full address. ${ASK.address}`, handoff: false, reason: "" };
    const draft: Draft = { items: [{ product: p.name, ...(variant ? { variant } : {}), quantity: qty }], ...(address ? { address } : {}) };
    return { reply: "", handoff: false, reason: "", draft };
  }

  // ── Questions ──
  const named = productsIn(ctx, text);
  if (named.length) {
    const ps = named.slice(0, 3);
    return { reply: `${ps.map((p) => describe(ctx, p)).join("\n\n")}\n\nWould you like to order? Tell me how many and I'll set it up. 🙂`, handoff: false, reason: "", photos: ps.filter((p) => p.hasPhoto).map((p) => p.name) };
  }
  const faq = faqAnswer(ctx, text);
  if (faq) return { reply: faq, handoff: false, reason: "" };
  if (GREET.test(t) || msgs.filter((m) => m.from === "business").length === 0) {
    const greeting = ctx.agent.greeting || `Hello! Welcome to ${ctx.business}. How can I help you today?`;
    const list = ctx.products.filter((p) => p.inStock).slice(0, 5).map((p) => `• ${p.name} — ${money(ctx, priceOf(p))}`).join("\n");
    if (GREET.test(t) && t.split(" ").length <= 4) return { reply: list ? `${greeting}\n\nHere's some of what we have:\n${list}\n\nAsk me about any of them, or tell me what you'd like to order.` : greeting, handoff: false, reason: "" };
  }
  if (/\b(price|prices|how much|hw much|cost|catalogue|catalog|menu|what do you sell|products|list)\b/.test(t)) {
    const list = ctx.products.filter((p) => p.inStock).slice(0, 10).map((p) => `• ${p.name} — ${money(ctx, priceOf(p))}`).join("\n");
    if (list) return { reply: `Here are our prices:\n${list}\n\nTell me which one you'd like and how many.`, handoff: false, reason: "" };
  }
  return handoff("The Basic assistant didn't understand — over to the team");
}
