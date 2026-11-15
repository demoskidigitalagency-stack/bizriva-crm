/**
 * Message to order — turns a chat message ("2 frontals for Tola, deposit 30k", or an agent's
 * list of customers with phones and towns) into draft orders for the owner to check.
 * Rules only (no AI): product names, the other names you give a product, and its price.
 * Unit-tested in tests/message-order.test.ts.
 */

export interface OrderProduct { id: string; name: string; price: number; aliases?: string[] }
export interface DraftItem { productId: string; qty: number }
export interface DraftOrder {
  name: string;
  phone: string;           // digits with country code, or "" when none was written
  town: string;
  items: DraftItem[];
  deposit: number;
  payOnDelivery: boolean;
  text: string;            // the part of the message this draft came from
}

export const TOWNS = [
  "Accra", "Kumasi", "Tema", "Takoradi", "Tamale", "Cape Coast", "Koforidua", "Sunyani", "Bolgatanga", "Tarkwa", "Kasoa",
  "Obuasi", "Techiman", "Ejisu", "Madina", "Spintex", "East Legon", "Adenta", "Ashaiman", "Nkawkaw", "Winneba", "Agona Swedru",
  "Swedru", "Hohoe", "Aflao", "Keta", "Jirapa", "Kade", "Dansoman", "Lapaz", "Kpandai", "Yendi", "Nsawam", "Teshie", "Weija",
  "Amasaman", "Sekondi", "Atonsu", "Shai Hills", "Kintampo", "Akim Oda", "Mankessim", "Elmina", "Dambai", "Ho", "Wa", "Shiashi",
  "Lagos", "Abuja", "Ibadan", "Port Harcourt", "Kano", "Ikeja", "Lekki", "Enugu", "Benin City", "Abeokuta", "Owerri", "Uyo",
  "Kaduna", "Ajah", "Surulere", "Osogbo", "Ilorin", "Akure", "Ile-Ife", "Ogbomoso", "Nairobi", "Mombasa", "Kisumu",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PHONE = /(?:\+?\d[\d\s-]{7,15}\d)/g;
const NUMWORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** "0538699550" → "233538699550" for Ghana (dial "233"); keeps numbers that already carry a code. */
export function normalisePhone(raw: string, dial: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length < 9 || d.length > 15) return "";
  if (d.startsWith("0") && d.length >= 10 && d.length <= 11) return dial + d.slice(1);
  if (d.startsWith(dial)) return d;
  if (d.length === 9 && dial === "233") return dial + d;
  if (d.length === 10 && dial === "234" && /^[789]/.test(d)) return dial + d;
  return d;
}

/** Dial code from the business currency. */
export function dialFor(currency: string): string {
  return ({ GHS: "233", NGN: "234", KES: "254", UGX: "256", TZS: "255", ZAR: "27", XOF: "225", USD: "1", GBP: "44" } as Record<string, string>)[currency] ?? "234";
}

/** Words a product is known by: its name, the other names given to it, and its price written the usual ways. */
function words(p: OrderProduct): RegExp[] {
  const out = [p.name, ...(p.aliases ?? [])].map((w) => w.trim()).filter((w) => w.length >= 3);
  const price = Math.round(p.price);
  if (price >= 100) out.push(price.toLocaleString("en-US"), String(price));
  return [...new Set(out.map((w) => w.toLowerCase()))].map((w) => new RegExp(`(^|[^\\p{L}\\p{N},.])${esc(w)}(?=$|[^\\p{L}\\p{N}])`, "iu"));
}

function qtyNear(text: string, at: number): number {
  const before = text.slice(Math.max(0, at - 14), at).toLowerCase();
  const m = /(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:x|pcs|pieces|units|sets?|of)?\s*$/.exec(before);
  if (m) { const n = NUMWORDS[m[1]!] ?? Number(m[1]); if (n > 0 && n < 500 && !(n >= 100 && /\d{3}$/.test(m[1]!))) return n; }
  const after = text.slice(at, at + 60).toLowerCase();
  const a = /^[^\n]*?\s(?:x\s?|qty:?\s?|quantity:?\s?)(\d{1,3})\b/.exec(after);
  return a ? Number(a[1]) : 1;
}

function money(s: string): number {
  const m = /([\d][\d,]*(?:\.\d+)?)\s*(k)?\b/i.exec(s);
  if (!m) return 0;
  const n = Number(m[1]!.replace(/,/g, ""));
  return Math.round(m[2] ? n * 1000 : n);
}

function cleanName(s: string, town: string): string {
  let t = s.replace(PHONE, " ").replace(/\b(name|full name|phone|number|tel|location|address|town|city)\s*[:=-]?/gi, " ");
  if (town) t = t.replace(new RegExp(`\\b${esc(town)}\\b`, "ig"), " ");
  t = t.replace(/^[\s\d.)\-–•*]+/, "").replace(/[^\p{L}\s.'-]/gu, " ").replace(/\s{2,}/g, " ").trim();
  return t.split(" ").slice(0, 4).join(" ").slice(0, 80);
}

function findTown(text: string): string {
  let best = "";
  for (const t of TOWNS) {
    const short = t.length <= 2;
    const re = new RegExp(`(^|[^\\p{L}])${esc(t)}(?=$|[^\\p{L}])`, short ? "u" : "iu"); // "Ho"/"Wa" only when capitalised
    if (re.test(text) && t.length > best.length) best = t;
  }
  return best;
}

function draftFrom(text: string, products: OrderProduct[], dial: string, fallbackName = ""): DraftOrder {
  const items: DraftItem[] = [];
  for (const p of products) {
    for (const re of words(p)) {
      const m = re.exec(text);
      if (m) { items.push({ productId: p.id, qty: qtyNear(text, m.index + m[1]!.length) }); break; }
    }
  }
  const phones = text.match(PHONE) ?? [];
  const phone = phones.map((x) => normalisePhone(x, dial)).find(Boolean) ?? "";
  const town = findTown(text);
  const named = /(?:full\s*)?name\s*(?:is)?\s*[:=-]\s*([^\n,.;\d+]+)/i.exec(text)?.[1];
  const forName = /\bfor\s+((?:Mr|Mrs|Miss|Dr|Madam|Aunty|Uncle)\.?\s+)?(\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+){0,3})/u.exec(text);
  let phoneLine = text.split("\n").find((l) => (l.match(PHONE) ?? []).length > 0) ?? "";
  // Product words and quantities aren't part of the name.
  for (const p of products) for (const re of words(p)) phoneLine = phoneLine.replace(new RegExp(re.source, "giu"), "$1 ");
  phoneLine = phoneLine.replace(/\bfor\b.*$/i, "").replace(/\b\d{1,3}\s*(x|pcs|pieces)?\b/gi, " ");
  const name = cleanName(named ?? (forName ? `${forName[1] ?? ""}${forName[2]}` : null) ?? (phones.length ? phoneLine : ""), town) || fallbackName;
  const dep = /(deposit|paid|part[- ]?payment|advance|sent)\D{0,12}([\d][\d,]*(?:\.\d+)?\s*k?)/i.exec(text);
  return {
    name, phone, town, items, deposit: dep ? money(dep[2]!) : 0,
    payOnDelivery: /(pay(ment)?\s+(on|after)\s+delivery|cash on delivery|\bpod\b)/i.test(text),
    text: text.trim(),
  };
}

/**
 * One message → one or more draft orders. A message with two or more phone numbers on separate
 * lines (an agent's list) becomes one draft per phone line; lines without a phone just above it
 * (e.g. "2 table tennis") belong to it.
 */
export function messageToOrders(message: string, products: OrderProduct[], opts: { dial?: string; senderName?: string } = {}): DraftOrder[] {
  const dial = opts.dial ?? "234";
  const text = (message ?? "").replace(/\r/g, "").trim();
  if (!text) return [];
  const lines = text.split("\n");
  const phoneLines = lines.filter((l) => (l.match(PHONE) ?? []).some((x) => normalisePhone(x, dial)));
  if (phoneLines.length < 2) return [draftFrom(text, products, dial, opts.senderName ?? "")];
  const out: DraftOrder[] = [];
  // Lines before the first customer (e.g. "Orders today 4ft") also apply to anyone listed without a product.
  const firstPhone = lines.findIndex((l) => (l.match(PHONE) ?? []).some((x) => normalisePhone(x, dial)));
  const head = firstPhone > 0 ? draftFrom(lines.slice(0, firstPhone).join("\n"), products, dial).items : [];
  let pending: string[] = [];
  for (const l of lines) {
    pending.push(l);
    if ((l.match(PHONE) ?? []).some((x) => normalisePhone(x, dial))) { out.push(draftFrom(pending.join("\n"), products, dial)); pending = []; }
  }
  // Trailing lines with no phone (e.g. "all 4ft") apply to every draft without a product.
  const tail = pending.join("\n").trim();
  const extra = tail ? draftFrom(tail, products, dial).items : [];
  const fallback = extra.length ? extra : head;
  for (const d of out) if (!d.items.length) d.items = fallback.map((i) => ({ ...i }));
  return out;
}

export function draftTotal(d: DraftOrder, products: OrderProduct[]): number {
  return d.items.reduce((n, i) => n + (products.find((p) => p.id === i.productId)?.price ?? 0) * i.qty, 0);
}
