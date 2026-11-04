/**
 * Reads WhatsApp's "Export chat" text file (Android and iPhone formats) so
 * old conversations can be brought into Bizriva when the number can't use
 * coexistence. Group chats are not supported: one customer per file.
 *
 * Android: 04/11/2026, 14:32 - Ada Okafor: message
 *          4/11/26, 2:32 pm - Ada Okafor: message
 * iPhone:  [04/11/2026, 14:32:10] Ada Okafor: message
 * Lines that don't start with a date continue the previous message.
 */

export interface ParsedMessage {
  at: string; // ISO
  sender: string;
  body: string;
}

export interface ParsedChat {
  fileName: string;
  /** "Ada Okafor" from "WhatsApp Chat with Ada Okafor.txt", if present. */
  titleName?: string;
  messages: ParsedMessage[];
  senders: { name: string; count: number }[];
  skippedSystem: number;
  mediaOmitted: number;
  dateOrder: "day-first" | "month-first";
  firstAt?: string;
  lastAt?: string;
}

const LINE = /^‎?\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:[-–]\s*)?(.*)$/;
const MEDIA = /<media omitted>|(image|video|audio|sticker|gif|document) omitted|<attached:|\.(jpg|jpeg|png|opus|mp4|pdf|webp) \(file attached\)/i;
/** Lines with a sender that are WhatsApp notices, not real messages. */
const SYSTEM = /^(this message was deleted|you deleted this message|missed (voice|video) call|null|waiting for this message.*|messages and calls are end-to-end encrypted.*|your security code with .* changed.*|this business (uses|is now using) .*)$/i;

interface Raw { a: number; b: number; y: number; h: number; m: number; s: number; ampm?: string | undefined; rest: string }

export function parseWhatsAppExport(text: string, fileName = "chat.txt"): ParsedChat {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const raws: Raw[] = [];
  for (const line of lines) {
    const m = LINE.exec(line);
    if (m) {
      raws.push({ a: +m[1]!, b: +m[2]!, y: +m[3]!, h: +m[4]!, m: +m[5]!, s: m[6] ? +m[6] : 0, ampm: m[7], rest: m[8] ?? "" });
    } else if (raws.length && line.trim()) {
      raws[raws.length - 1]!.rest += `\n${line.replace(/^‎/, "")}`;
    }
  }
  // If any first number is over 12 it must be the day; if any second number is over 12, month comes first.
  const monthFirst = !raws.some((r) => r.a > 12) && raws.some((r) => r.b > 12);
  const messages: ParsedMessage[] = [];
  let skippedSystem = 0;
  let mediaOmitted = 0;
  for (const r of raws) {
    const colon = r.rest.indexOf(": ");
    if (colon <= 0) { skippedSystem++; continue; }
    const sender = r.rest.slice(0, colon).replace(/^‎/, "").trim();
    let body = r.rest.slice(colon + 2).replace(/‎/g, "").trim();
    if (!sender || SYSTEM.test(body)) { skippedSystem++; continue; }
    if (MEDIA.test(body)) { mediaOmitted++; body = "[Photo, video or file — not included in the export]"; }
    const day = monthFirst ? r.b : r.a;
    const month = monthFirst ? r.a : r.b;
    const year = r.y < 100 ? 2000 + r.y : r.y;
    let hour = r.h;
    if (r.ampm) {
      const pm = /p/i.test(r.ampm);
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    const d = new Date(year, month - 1, day, hour, r.m, r.s);
    if (Number.isNaN(d.getTime())) { skippedSystem++; continue; }
    messages.push({ at: d.toISOString(), sender, body });
  }
  const counts = new Map<string, number>();
  messages.forEach((x) => counts.set(x.sender, (counts.get(x.sender) ?? 0) + 1));
  const title = /WhatsApp Chat (?:with|-)\s*(.+?)(?:\.txt)?$/i.exec(fileName.replace(/\.zip$/i, ""))?.[1]?.trim();
  return {
    fileName,
    ...(title ? { titleName: title } : {}),
    messages,
    senders: [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    skippedSystem,
    mediaOmitted,
    dateOrder: monthFirst ? "month-first" : "day-first",
    ...(messages[0] ? { firstAt: messages[0].at, lastAt: messages[messages.length - 1]!.at } : {}),
  };
}

/** Guess which sender is the customer: the one named in the file title, or one that looks like a phone number. */
export function guessCustomer(chat: ParsedChat): string | undefined {
  const names = chat.senders.map((s) => s.name);
  if (chat.titleName) {
    const hit = names.find((n) => n.toLowerCase() === chat.titleName!.toLowerCase());
    if (hit) return hit;
  }
  return names.find((n) => /^\+?[\d\s-]{10,}$/.test(n)) ?? (names.length === 2 ? names[1] : names[0]);
}

export const SAMPLE_EXPORT = `04/10/2026, 09:12 - Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.
04/10/2026, 09:12 - Chioma Eze: Good morning, how much is the bone straight 20 inches?
04/10/2026, 09:15 - Luxe Hair: Good morning Chioma! It's ₦185,000. Pay on delivery in Lagos.
04/10/2026, 09:16 - Chioma Eze: <Media omitted>
04/10/2026, 09:16 - Chioma Eze: Is it like this one?
04/10/2026, 09:20 - Luxe Hair: Yes, same texture. Which length do you want?
05/10/2026, 18:40 - Chioma Eze: Ok I'll take 20 inches. Deliver to 12 Ogunlana Drive, Surulere.
Near the Total filling station. My number is 0805 331 2094
05/10/2026, 18:45 - Luxe Hair: Thank you! We'll call to confirm.`;
