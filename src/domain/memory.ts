/**
 * Customer memory: facts picked out of a customer's own messages
 * (birthday, size, likes, budget, who they buy for). Simple patterns tuned
 * for how Nigerian buyers write, in English and Pidgin. The backend swaps in
 * an AI extractor behind the same shape; staff always confirm before saving.
 */
import type { Conversation, CustomerFact, FactKind } from "./types";

export interface FoundFact { kind: FactKind; value: string; monthDay?: string; quote: string }

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MON = MONTHS.map((m) => m.slice(0, 3));
const pad = (n: number) => String(n).padStart(2, "0");

function parseDay(text: string): { label: string; monthDay: string } | undefined {
  // "14 October", "14th of Oct", "October 14", "14/10"
  let m = /(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([a-z]{3,9})/i.exec(text);
  if (m) {
    const mi = MON.indexOf(m[2]!.slice(0, 3).toLowerCase());
    const d = Number(m[1]);
    if (mi >= 0 && d >= 1 && d <= 31) return { label: `${d} ${MONTHS[mi]![0]!.toUpperCase()}${MONTHS[mi]!.slice(1)}`, monthDay: `${pad(mi + 1)}-${pad(d)}` };
  }
  m = /([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?/i.exec(text);
  if (m) {
    const mi = MON.indexOf(m[1]!.slice(0, 3).toLowerCase());
    const d = Number(m[2]);
    if (mi >= 0 && d >= 1 && d <= 31) return { label: `${d} ${MONTHS[mi]![0]!.toUpperCase()}${MONTHS[mi]!.slice(1)}`, monthDay: `${pad(mi + 1)}-${pad(d)}` };
  }
  m = /(\d{1,2})[/.-](\d{1,2})(?![/.-]?\d{3,})/.exec(text);
  if (m) {
    const d = Number(m[1]); const mo = Number(m[2]);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return { label: `${d} ${MONTHS[mo - 1]![0]!.toUpperCase()}${MONTHS[mo - 1]!.slice(1)}`, monthDay: `${pad(mo)}-${pad(d)}` };
  }
  return undefined;
}

const COLOURS = ["black", "brown", "burgundy", "blonde", "ginger", "red", "wine", "pink", "white", "gold", "silver", "blue", "green", "purple", "cream", "nude", "grey", "natural"];
const RELATIONS = ["wife", "husband", "mum", "mom", "mother", "dad", "father", "sister", "brother", "daughter", "son", "friend", "girlfriend", "boyfriend", "aunty", "aunt", "fiancé", "fiancee", "boss", "colleague"];

export function extractFacts(conversation: Conversation): FoundFact[] {
  const out: FoundFact[] = [];
  const push = (f: FoundFact) => { if (!out.some((x) => x.kind === f.kind && x.value.toLowerCase() === f.value.toLowerCase())) out.push(f); };
  for (const msg of conversation.messages.filter((x) => x.direction === "in")) {
    const sentences = msg.body.split(/(?<=[.!?\n])\s+/);
    for (const s of sentences) {
      const t = s.toLowerCase();
      if (/birthday|born on|b-?day|birth day/.test(t)) {
        const own = !/(my|her|his)\s+(sister|wife|mum|mom|mother|daughter|friend|husband|brother|son)'?s?\s+birthday/.test(t) && !/for (her|his) birthday/.test(t);
        const day = parseDay(s);
        if (day && own) push({ kind: "birthday", value: day.label, monthDay: day.monthDay, quote: s.trim() });
      }
      const size = /\b(?:i wear|my size is|size)\s*(?:is\s*)?(\d{1,2}|xs|s|m|l|xl|xxl)\b/i.exec(s);
      if (size) push({ kind: "size", value: `Size ${size[1]!.toUpperCase()}`, quote: s.trim() });
      const len = /\b(\d{2})\s*(?:inches|inch|")\b/i.exec(s);
      if (len && /prefer|always|i like|i love|my length/.test(t)) push({ kind: "likes", value: `${len[1]}-inch length`, quote: s.trim() });
      const like = /\b(?:i (?:like|love|prefer)|i dey like|my favou?rite(?: colou?r)? is)\s+([a-z ]{3,30})/i.exec(s);
      if (like) {
        const colour = COLOURS.find((c) => like[1]!.toLowerCase().includes(c));
        push({ kind: "likes", value: colour ? `${colour[0]!.toUpperCase()}${colour.slice(1)} colour` : like[1]!.trim().replace(/\s+(and|but|so)\b.*$/, ""), quote: s.trim() });
      }
      const dislike = /\b(?:i (?:don'?t|do not) like|i hate|i no like)\s+([a-z ]{3,30})/i.exec(s);
      if (dislike) push({ kind: "dislikes", value: dislike[1]!.trim().replace(/\s+(and|but|so)\b.*$/, ""), quote: s.trim() });
      const budget = /\b(?:my budget is|budget(?: na| is)?|i have|i get)\s*(?:about|around)?\s*₦?\s?(\d{2,3}(?:[,.]\d{3})*\s?k?)\b/i.exec(s);
      if (budget && /budget|i have|i get/.test(t)) push({ kind: "budget", value: `About ₦${budget[1]!.replace(/\s/g, "")}`, quote: s.trim() });
      const forWho = new RegExp(`\\bfor my (${RELATIONS.join("|")})\\b`, "i").exec(s);
      if (forWho) push({ kind: "buys_for", value: `Buys for their ${forWho[1]!.toLowerCase()}`, quote: s.trim() });
    }
  }
  return out;
}

/** Facts in the chat that aren't saved on the contact yet. */
export function newFacts(found: FoundFact[], saved: CustomerFact[] = []): FoundFact[] {
  return found.filter((f) => !saved.some((s) => s.kind === f.kind && s.value.toLowerCase() === f.value.toLowerCase()));
}

/** Days until the next birthday (0 = today), using the practice clock. */
export function daysToBirthday(monthDay: string, now: Date): number {
  const [m, d] = monthDay.split("-").map(Number) as [number, number];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next < today) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((+next - +today) / 86_400_000);
}

export const FACT_LABEL: Record<FactKind, string> = {
  birthday: "Birthday", size: "Size", likes: "Likes", dislikes: "Doesn't like", budget: "Budget", buys_for: "Buys for", note: "Note",
};
