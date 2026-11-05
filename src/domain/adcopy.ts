/**
 * Ad text drafts and a Meta-policy pre-check. Practice Mode uses templates
 * built from the product; with the backend the same function calls an AI
 * model and keeps these templates as the fallback.
 */
import type { Product } from "./types";

export interface CopyDraft { angle: string; primaryText: string; headline: string }

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

export function draftCopy(p: Product, lang: "en" | "pcm", places: string[], cod: boolean): CopyDraft[] {
  const where = places.length ? places.slice(0, 2).join(" and ") : "Nigeria";
  const desc = (p.description ?? "").split(/[.!]/)[0]?.trim();
  if (lang === "pcm") {
    return [
      { angle: "Straight to the point", primaryText: `${p.name} don land! ${naira(p.price)} only${cod ? `, and you go pay when e reach your hand for ${where}` : ""}. ${desc ? `${desc}. ` : ""}Tap make we yarn for WhatsApp 👇`, headline: cod ? `Pay on delivery · ${where}` : `${naira(p.price)} · order today` },
      { angle: "Trust", primaryText: `You don tire for "what I ordered vs what I got"? We no dey do that one. ${p.name} — wetin you see na wetin you go get. ${cod ? "Check am well before you pay the rider." : ""} Chat us now 👇`, headline: "Wetin you see na wetin you get" },
      { angle: "Limited stock", primaryText: `${p.name} dey move fast this week o! ${p.stock > 0 && p.stock < 20 ? `Na only few remain. ` : ""}${naira(p.price)}${cod ? ", pay on delivery" : ""}. Send us message make we hold one for you 👇`, headline: "E dey finish — hold yours" },
    ];
  }
  return [
    { angle: "Straight to the point", primaryText: `${p.name} — ${naira(p.price)}${cod ? `, and you pay on delivery in ${where}` : ""}. ${desc ? `${desc}. ` : ""}Tap below to chat with us on WhatsApp 👇`, headline: cod ? `Pay on delivery · ${where}` : `${naira(p.price)} · order today` },
    { angle: "Trust", primaryText: `Tired of "what I ordered vs what I got"? Not here. ${p.name} — exactly as pictured.${cod ? " Check it at your door before you pay the rider." : ""} Chat with us to order 👇`, headline: "Exactly as pictured" },
    { angle: "Limited stock", primaryText: `${p.name} is moving fast this week.${p.stock > 0 && p.stock < 20 ? " Only a few left." : ""} ${naira(p.price)}${cod ? ", pay on delivery" : ""}. Message us and we'll hold one for you 👇`, headline: "Selling fast — hold yours" },
  ];
}

export interface PolicyFlag { phrase: string; why: string }

/** Wording Meta often rejects or restricts. A warning, not a guarantee of approval. */
const RULES: { re: RegExp; why: string }[] = [
  { re: /\bbefore\s*(and|&|\/)\s*after\b/i, why: "Before-and-after claims are often rejected, especially for beauty and body products." },
  { re: /\b(guarantee[ds]?|100%\s*(result|guarantee|effective))\b/i, why: "Guaranteed results are treated as misleading claims." },
  { re: /\b(cure[sd]?|heal[s]?|treat[s]?)\b/i, why: "Health or medical claims need proof and are often restricted." },
  { re: /\b(lose|losing)\s+\d+\s*(kg|kilos?|pounds|lbs)\b/i, why: "Weight-loss numbers are restricted." },
  { re: /\b(are you|do you have|you are)\s+(fat|ugly|bald|broke|single|depressed)\b/i, why: "Ads can't assert or imply personal attributes about the viewer." },
  { re: /\b(get rich|make money fast|double your money)\b/i, why: "Get-rich-quick claims are prohibited." },
  { re: /\b(original|authentic)\s+(gucci|chanel|louis vuitton|nike|apple)\b|\b(replica|first copy|1st copy)\b/i, why: "Counterfeit or replica wording breaks Meta's rules." },
  { re: /!!!|\b[A-Z]{6,}\b.*\b[A-Z]{6,}\b/, why: "Excessive capitals or punctuation can reduce delivery." },
];

export function policyCheck(...texts: string[]): PolicyFlag[] {
  const all = texts.join("\n");
  return RULES.flatMap((r) => { const m = r.re.exec(all); return m ? [{ phrase: m[0], why: r.why }] : []; });
}

export const NG_LOCATIONS = [
  "Lagos", "Abuja (FCT)", "Rivers (Port Harcourt)", "Oyo (Ibadan)", "Kano", "Kaduna", "Enugu", "Anambra", "Delta", "Edo (Benin)", "Ogun", "Kwara (Ilorin)", "Akwa Ibom", "Plateau (Jos)", "Imo (Owerri)", "Abia", "Osun", "Ondo", "Ekiti", "Cross River (Calabar)",
];
export const INTERESTS = ["Wigs", "Hair care", "Beauty", "Fashion", "Online shopping", "Weddings", "Skincare", "Makeup", "Shopping and fashion", "Engaged shoppers"];
export const PLACEMENT_LABEL = { fb_feed: "Facebook feed", ig_feed: "Instagram feed", stories: "Stories", reels: "Reels" } as const;
export const CTA_LABEL = { send_whatsapp: "Send WhatsApp message", order_now: "Order now", learn_more: "Learn more" } as const;
