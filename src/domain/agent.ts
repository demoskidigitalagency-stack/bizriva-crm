/**
 * Practice-mode sales agent.
 *
 * A rules-based stand-in for the AI agent, built to the same contract the
 * real model must follow (master prompt, module 3):
 *   - answer only from the catalogue and knowledge base
 *   - never invent prices, stock, discounts or delivery promises
 *   - hand over to a human when asked, or when it doesn't know
 *   - send a limited number of photos, then a buying question
 *
 * The backend swaps this for an LLM with tool calls against the same data.
 */
import type { Database } from "./database";
import type { KnowledgeEntry, Product } from "./types";
import { formatCurrency } from "@/lib/format";

export interface AgentReply {
  text: string;
  intent: "greeting" | "price" | "photos" | "availability" | "knowledge" | "handoff" | "opt_out" | "payment" | "unknown";
  sources: string[];
  handoff: boolean;
  photos: number;
  productId?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9₦ ]/g, " ").replace(/\s+/g, " ").trim();
const has = (text: string, words: string[]) => words.some((w) => text.includes(norm(w)));

const STOP = new Set(["the", "and", "with", "set", "for", "inch", "raw", "double", "drawn", "hd"]);
function productTokens(p: Product) {
  return norm(p.name).split(" ").filter((w) => w.length >= 4 && !STOP.has(w));
}

export function matchProduct(db: Database, text: string): Product | undefined {
  const t = norm(text);
  let best: { p: Product; hits: number } | undefined;
  for (const p of db.products.filter((x) => x.active !== false)) {
    const hits = productTokens(p).filter((w) => t.includes(w)).length;
    if (hits && (!best || hits > best.hits)) best = { p, hits };
  }
  return best?.p;
}

function matchKnowledge(db: Database, text: string): KnowledgeEntry | undefined {
  const t = norm(text);
  let best: { k: KnowledgeEntry; hits: number } | undefined;
  for (const k of db.knowledge) {
    const hits = k.keywords.filter((w) => t.includes(norm(w))).length;
    if (hits && (!best || hits > best.hits)) best = { k, hits };
  }
  return best?.k;
}

/** A personal touch from customer memory: their name, and a product matching what they like. */
function personal(db: Database, contactId: string | undefined, current?: Product): { hello: string; extra: string; sources: string[] } {
  const c = contactId ? db.contacts.find((x) => x.id === contactId) : undefined;
  if (!c) return { hello: "", extra: "", sources: [] };
  const facts = c.facts ?? [];
  const sources: string[] = [];
  let extra = "";
  const likes = facts.filter((f) => f.kind === "likes").map((f) => f.value.toLowerCase().replace(" colour", "").replace("-inch length", ""));
  const match = db.products.find((p) => p.active !== false && p.id !== current?.id && likes.some((l) => norm(p.name).includes(norm(l))));
  if (match) {
    const liked = likes.find((l) => norm(match.name).includes(norm(l)))!;
    extra = ` Since you like ${liked}, you might love the ${match.name} too.`;
    sources.push(`Customer memory › likes ${liked}`, `Products › ${match.name}`);
  }
  const forWho = facts.find((f) => f.kind === "buys_for");
  if (!extra && forWho) { extra = ` Is this one for your ${forWho.value.replace("Buys for their ", "")} again?`; sources.push(`Customer memory › ${forWho.value}`); }
  return { hello: c.firstName, extra, sources };
}

export function agentReply(db: Database, message: string, opts: { adProductId?: string; firstMessage?: boolean; contactId?: string } = {}): AgentReply {
  const t = norm(message);
  const a = db.agent;
  const currency = db.workspaces[0]?.currency ?? "NGN";
  const money = (n: number) => formatCurrency(n, currency);
  const adProduct = db.products.find((p) => p.id === opts.adProductId);

  if (db.settings.optOutKeywords.some((k) => t === norm(k) || t.startsWith(`${norm(k)} `))) {
    return { text: "You've been unsubscribed from marketing messages. You'll still get updates about orders you place.", intent: "opt_out", sources: ["Settings › Opt-out keywords"], handoff: false, photos: 0 };
  }
  if (has(t, a.handoffKeywords)) {
    return { text: "Of course — I'm passing you to a teammate now. They'll reply here shortly.", intent: "handoff", sources: ["AI agent › Handover keywords"], handoff: true, photos: 0 };
  }

  // "How do I pay?" — share the customer's own account number when payments are connected.
  if (/\b(how (do|can) i pay|account (number|details)|send (me )?(your )?account|where (do|should) i pay|payment details|i want to pay|abeg send account)\b/i.test(message)) {
    const ps = db.settings.payments;
    const c = opts.contactId ? db.contacts.find((x) => x.id === opts.contactId) : undefined;
    if (ps.status === "connected" && c?.virtualAccount) {
      return { text: `You can transfer to your own payment account: ${c.virtualAccount.bank}, ${c.virtualAccount.number} (${c.virtualAccount.name}). It's confirmed instantly and you'll get a receipt right here. You can also pay the rider on delivery.`, intent: "payment", sources: ["Payments › customer account"], handoff: false, photos: 0 };
    }
    if (ps.status === "connected") {
      return { text: "I'll send your payment details right now — a bank account just for you, confirmed the moment you transfer. You can also pay on delivery.", intent: "payment", sources: ["Payments › request payment"], handoff: true, photos: 0 };
    }
    return { text: "You can pay on delivery — check the item, then pay the rider. If you'd rather pay now, a teammate will send you the account details.", intent: "payment", sources: ["Settings › pay on delivery"], handoff: true, photos: 0 };
  }

  const product = matchProduct(db, t) ?? adProduct;
  const sources: string[] = [];

  if (has(t, ["how much", "price", "cost", "amount", "₦"])) {
    if (!product) {
      return { text: "Happy to give you a price — which item are you asking about? For example bundles, frontals or a ready-to-wear wig.", intent: "price", sources: [], handoff: false, photos: 0 };
    }
    sources.push(`Products › ${product.name}`);
    const stock = product.stock === 0 ? " It's out of stock right now, so I'll ask a teammate about the restock date." : product.stock <= product.reorderLevel ? " Only a few left in stock." : "";
    const kb = matchKnowledge(db, "delivery");
    if (kb) sources.push(`Knowledge › ${kb.question}`);
    const me = personal(db, opts.contactId, product);
    return {
      text: `${me.hello ? `${me.hello}, the` : "The"} ${product.name} is ${money(product.price)}.${stock} Delivery in Lagos is ${money(db.settings.deliveryFee)} and you can pay on delivery.${me.extra} How many would you like?`,
      intent: "price", sources: [...sources, ...me.sources], handoff: product.stock === 0, photos: 0, productId: product.id,
    };
  }

  if (has(t, ["picture", "photo", "pic", "image", "video", "see it", "show me"])) {
    if (!product) return { text: "Sure — which item would you like to see?", intent: "photos", sources: [], handoff: false, photos: 0 };
    const media = db.media.filter((m) => m.productId === product.id);
    if (!media.length) {
      return { text: `I don't have photos of the ${product.name} uploaded yet, so I'm asking a teammate to send some.`, intent: "photos", sources: [`Media Library › none for ${product.name}`], handoff: true, photos: 0, productId: product.id };
    }
    const n = Math.min(a.maxImages, media.length);
    return { text: `Here ${n === 1 ? "is a photo" : `are ${n} photos`} of the ${product.name} (${money(product.price)}). Would you like to order one?`, intent: "photos", sources: [`Media Library › ${n} of ${media.length} for ${product.name}`], handoff: false, photos: n, productId: product.id };
  }

  if (has(t, ["available", "in stock", "do you have", "still have"]) && product) {
    sources.push(`Products › ${product.name}`);
    return {
      text: product.stock > 0 ? `Yes, the ${product.name} is available at ${money(product.price)}. Shall I reserve one for you?` : `The ${product.name} is out of stock at the moment. I'll ask a teammate when it's back.`,
      intent: "availability", sources, handoff: product.stock === 0, photos: 0, productId: product.id,
    };
  }

  const kb = matchKnowledge(db, t);
  if (kb) {
    return { text: kb.answer, intent: "knowledge", sources: [`Knowledge › ${kb.question}`], handoff: false, photos: 0 };
  }

  if (opts.firstMessage || has(t, ["hello", "hi", "good morning", "good afternoon", "good evening", "interested", "i need", "details"])) {
    const about = adProduct ? ` You were looking at the ${adProduct.name} — it's ${money(adProduct.price)}.` : "";
    const me = personal(db, opts.contactId, adProduct);
    if (me.hello) {
      return { text: `Welcome back, ${me.hello}! Good to hear from you again.${about}${me.extra}`, intent: "greeting", sources: [`Customer memory › ${me.hello}`, ...me.sources], handoff: false, photos: 0, ...(adProduct ? { productId: adProduct.id } : {}) };
    }
    return { text: `${a.greeting}${about}`, intent: "greeting", sources: adProduct ? [`Products › ${adProduct.name}`] : ["AI agent › Greeting"], handoff: false, photos: 0, ...(adProduct ? { productId: adProduct.id } : {}) };
  }

  return { text: "I want to give you the right answer, so I'm checking with a teammate. They'll reply here shortly.", intent: "unknown", sources: [], handoff: true, photos: 0 };
}
