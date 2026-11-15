// AI tools on the business's own Anthropic key — prompts, tool schemas and output checks.
// Pure (no network); tested in tests/ai-tools.test.ts.
export const FACT_KINDS = ["birthday", "size", "likes", "dislikes", "budget", "buys_for", "note"] as const;

export const PHOTO_TOOL = {
  name: "product", description: "The product in the photo, for a seller's catalogue.",
  input_schema: { type: "object", required: ["name", "description", "category"], properties: {
    name: { type: "string", description: "Short product name a buyer would search for (max 80 chars)" },
    description: { type: "string", description: "2–3 plain sentences: what it is, size/material/colour you can see, who it's for. No prices, no claims you can't see." },
    category: { type: "string", description: "One short category, e.g. Game tables, Wigs, Shoes" },
    aliases: { type: "array", items: { type: "string" }, description: "Up to 4 other names buyers use for it" },
  } },
};

export const ADS_TOOL = {
  name: "ads", description: "Ad copy variants.",
  input_schema: { type: "object", required: ["variants"], properties: { variants: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", required: ["headline", "text", "cta"], properties: {
    headline: { type: "string", description: "Max 40 characters" }, text: { type: "string", description: "Primary text, max 400 characters, short lines, ends by asking them to message on WhatsApp" },
    cta: { type: "string", enum: ["Send WhatsApp message", "Order now", "Learn more"] }, angle: { type: "string" } } } } } },
};

export const MEMORY_TOOL = {
  name: "memory", description: "Facts worth remembering about this customer, taken only from what they said.",
  input_schema: { type: "object", required: ["facts"], properties: { facts: { type: "array", maxItems: 8, items: { type: "object", required: ["kind", "value", "quote"], properties: {
    kind: { type: "string", enum: [...FACT_KINDS] }, value: { type: "string", description: "Short, e.g. 'black colour', 'size 42', 'for her son', 'budget 3,000'" },
    quote: { type: "string", description: "The customer's own words this comes from" }, month_day: { type: "string", description: "MM-DD for a birthday" } } } } } },
};

export const SYSTEM_PHOTO = "You catalogue products for small African online sellers. Describe only what is visible. Never invent prices, brands or specifications you cannot see.";
export const SYSTEM_ADS = "You write Facebook, Instagram and TikTok ad copy for small sellers in Nigeria and Ghana who take orders on WhatsApp. Plain words, local buyers, honest claims only from the product details given, prices exactly as given. No emojis overload (max 3), no fake urgency or fake reviews.";
export const SYSTEM_MEMORY = "You read a WhatsApp chat between a shop and a customer and note durable facts about the CUSTOMER that help serve them later (sizes, colours they like or dislike, budget, who they buy for, birthday, location details). Only facts the customer stated. Never health, religion, politics, money troubles or anything sensitive. If nothing useful, return an empty list.";

export function adsPrompt(p: { name: string; price: string; description?: string | null; benefits?: string | null }, business: string, angle: string, platform: string): string {
  return [`Business: ${business}`, `Product: ${p.name}`, `Price: ${p.price}`, p.description ? `Details: ${p.description}` : "", p.benefits ? `Benefits: ${p.benefits}` : "",
    `Platform: ${platform}`, angle ? `Angle the owner wants: ${angle}` : "Give three different angles (e.g. gift, quality, convenience).", "Write 3 variants."].filter(Boolean).join("\n");
}

export function chatPrompt(lines: { out: boolean; body: string }[]): string {
  return lines.map((l) => `${l.out ? "Shop" : "Customer"}: ${l.body.replace(/\s+/g, " ").slice(0, 400)}`).join("\n").slice(-12000);
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function checkPhoto(x: any): { name: string; description: string; category: string; aliases: string[] } | null {
  const name = str(x?.name, 80), description = str(x?.description, 600), category = str(x?.category, 60);
  if (!name) return null;
  const aliases = Array.isArray(x?.aliases) ? x.aliases.map((a: unknown) => str(a, 40)).filter((a: string) => a.length >= 3).slice(0, 4) : [];
  return { name, description, category: category || "General", aliases };
}

export function checkAds(x: any): { headline: string; text: string; cta: string; angle: string }[] {
  const ok = new Set(["Send WhatsApp message", "Order now", "Learn more"]);
  return (Array.isArray(x?.variants) ? x.variants : []).map((v: any) => ({ headline: str(v?.headline, 60), text: str(v?.text, 600), cta: ok.has(v?.cta) ? v.cta : "Send WhatsApp message", angle: str(v?.angle, 60) }))
    .filter((v: { headline: string; text: string }) => v.headline && v.text).slice(0, 3);
}

const SENSITIVE = /\b(hiv|cancer|pregnan|diabet|church|mosque|muslim|christian|religio|politic|vote|debt|loan|broke|sick|illness|disease)\b/i;
export function checkMemory(x: any): { kind: string; value: string; quote: string; monthDay?: string }[] {
  return (Array.isArray(x?.facts) ? x.facts : []).map((f: any) => {
    const md = str(f?.month_day, 5);
    return { kind: (FACT_KINDS as readonly string[]).includes(f?.kind) ? f.kind : "note", value: str(f?.value, 120), quote: str(f?.quote, 200), ...(/^\d{2}-\d{2}$/.test(md) ? { monthDay: md } : {}) };
  }).filter((f: { value: string; quote: string }) => f.value && !SENSITIVE.test(`${f.value} ${f.quote}`)).slice(0, 8);
}
