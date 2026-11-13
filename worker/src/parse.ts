// Turning WhatsApp (linked device) messages into what Bizriva stores.
// Pure functions — unit-tested in tests/wa_linked.test.ts.

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Thread { wa: string; name: string | null; messages: { id: string; at: string; out: boolean; body: string }[] }

const PN = /^(\d{7,15})(?::\d+)?@s\.whatsapp\.net$/;

/** "2348031234567@s.whatsapp.net" → "2348031234567"; groups, status, channels → null. */
export function phoneOfJid(jid: string | null | undefined): string | null {
  const m = PN.exec(String(jid ?? ""));
  return m ? m[1]! : null;
}

/** The customer's phone for a chat. Newer WhatsApp chats use hidden ids (@lid); map them through what WhatsApp told us. */
export function chatPhone(key: { remoteJid?: string | null; remoteJidAlt?: string | null } | null | undefined, lid: Map<string, string>): string | null {
  if (!key) return null;
  const direct = phoneOfJid(key.remoteJid) ?? phoneOfJid(key.remoteJidAlt);
  if (direct) return direct;
  const j = String(key.remoteJid ?? "");
  if (j.endsWith("@lid")) return lid.get(j.split(":")[0]!.replace(/@lid$/, "")) ?? lid.get(j) ?? null;
  return null;
}

/** Record a hidden-id → phone pair (from history, contacts or WhatsApp's mapping updates). */
export function rememberLid(lid: Map<string, string>, lidJid: string | null | undefined, pnJid: string | null | undefined): void {
  const pn = phoneOfJid(pnJid);
  const l = String(lidJid ?? "");
  if (!pn || !l.endsWith("@lid")) return;
  lid.set(l.split(":")[0]!.replace(/@lid$/, ""), pn);
}

function unwrap(m: any): any {
  let x = m;
  for (let i = 0; i < 5 && x; i++) {
    const inner = x.ephemeralMessage?.message ?? x.viewOnceMessage?.message ?? x.viewOnceMessageV2?.message ?? x.viewOnceMessageV2Extension?.message
      ?? x.documentWithCaptionMessage?.message ?? x.editedMessage?.message ?? null;
    if (!inner) break;
    x = inner;
  }
  return x;
}

/** Readable text for a message, or null for things that aren't chat (reactions, receipts, deletes, calls). */
export function textOf(message: any): string | null {
  const m = unwrap(message);
  if (!m) return null;
  const cap = (label: string, c?: string | null) => (c && String(c).trim() ? `${label} ${String(c).trim()}` : label);
  if (typeof m.conversation === "string" && m.conversation.trim()) return m.conversation;
  if (m.extendedTextMessage?.text) return String(m.extendedTextMessage.text);
  if (m.imageMessage) return cap("[photo]", m.imageMessage.caption);
  if (m.videoMessage) return cap(m.videoMessage.gifPlayback ? "[GIF]" : "[video]", m.videoMessage.caption);
  if (m.audioMessage) return m.audioMessage.ptt ? "[voice note]" : "[audio]";
  if (m.documentMessage) return cap(`[document${m.documentMessage.fileName ? `: ${m.documentMessage.fileName}` : ""}]`, m.documentMessage.caption);
  if (m.stickerMessage) return "[sticker]";
  if (m.locationMessage || m.liveLocationMessage) return "[location]";
  if (m.contactMessage) return `[contact: ${m.contactMessage.displayName ?? ""}]`.replace(": ]", "]");
  if (m.contactsArrayMessage) return "[contacts]";
  if (m.buttonsResponseMessage?.selectedDisplayText) return String(m.buttonsResponseMessage.selectedDisplayText);
  if (m.listResponseMessage?.title) return String(m.listResponseMessage.title);
  if (m.templateButtonReplyMessage?.selectedDisplayText) return String(m.templateButtonReplyMessage.selectedDisplayText);
  if (m.productMessage) return cap("[product]", m.productMessage.product?.title);
  if (m.orderMessage) return "[order]";
  return null;
}

function at(ts: any): string {
  const n = typeof ts === "object" && ts !== null && "low" in ts ? Number(ts.low) : Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

/** One message → what Bizriva stores, or null when it isn't a 1:1 chat message with text. */
export function toRow(msg: any, lid: Map<string, string>): { wa: string; id: string; at: string; out: boolean; body: string; name: string | null } | null {
  const key = msg?.key;
  const wa = chatPhone(key, lid);
  const body = textOf(msg?.message);
  if (!wa || !key?.id || !body) return null;
  return { wa, id: `wa:${key.id}`, at: at(msg.messageTimestamp), out: !!key.fromMe, body, name: key.fromMe ? null : (msg.pushName ?? null) };
}

/** History chunk → threads (one per customer), oldest message first. */
export function toThreads(messages: any[], lid: Map<string, string>, names: Map<string, string>): Thread[] {
  const by = new Map<string, Thread>();
  for (const msg of messages ?? []) {
    const r = toRow(msg, lid);
    if (!r) continue;
    let t = by.get(r.wa);
    if (!t) { t = { wa: r.wa, name: names.get(r.wa) ?? null, messages: [] }; by.set(r.wa, t); }
    if (!t.name && r.name) t.name = r.name;
    t.messages.push({ id: r.id, at: r.at, out: r.out, body: r.body });
  }
  for (const t of by.values()) t.messages.sort((a, b) => a.at.localeCompare(b.at));
  return [...by.values()];
}

/** Split threads into batches of about `max` messages so each database call stays small. */
export function batches(threads: Thread[], max = 400): Thread[][] {
  const out: Thread[][] = []; let cur: Thread[] = []; let n = 0;
  for (const t of threads) {
    if (n && n + t.messages.length > max) { out.push(cur); cur = []; n = 0; }
    cur.push(t); n += t.messages.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Contacts from the phone → names for customers ("name" = saved on the phone, else their own WhatsApp name). */
export function contactNames(contacts: any[], lid: Map<string, string>): { phone: string; name: string }[] {
  const out: { phone: string; name: string }[] = [];
  for (const c of contacts ?? []) {
    rememberLid(lid, c?.lid ?? (String(c?.id ?? "").endsWith("@lid") ? c.id : null), c?.phoneNumber ?? c?.id);
    const phone = phoneOfJid(c?.phoneNumber) ?? phoneOfJid(c?.id) ?? (String(c?.id ?? "").endsWith("@lid") ? lid.get(String(c.id).replace(/@lid$/, "")) ?? null : null);
    const name = String(c?.name ?? c?.notify ?? c?.verifiedName ?? "").trim();
    if (phone && name) out.push({ phone, name: name.slice(0, 120) });
  }
  return out;
}

/** Wait between messages so the number isn't flagged: 2–5 s for replies, 6–15 s for marketing. */
export function pause(purpose: string | null, rand = Math.random): number {
  return purpose === "marketing" ? 6000 + Math.floor(rand() * 9000) : 2000 + Math.floor(rand() * 3000);
}

/** Name to save on the phone. Tokens: {name}, {product} (first "Asked about" tag), {last4}. Same rule as src/lib/vcard.ts. */
export function savedName(phone: string, name: string | null, tags: string[], template: string): string {
  const digits = phone.replace(/\D/g, "");
  const product = tags.find((t) => t.startsWith("Asked about: "))?.slice("Asked about: ".length) ?? "";
  const base = (name ?? "").trim() || `Customer ${digits.slice(-4)}`;
  const out = (template.trim() || "{name}").replaceAll("{name}", base).replaceAll("{product}", product).replaceAll("{last4}", digits.slice(-4))
    .replace(/\s*[-–|,]\s*$/, "").replace(/\s{2,}/g, " ").trim();
  return (out || base).slice(0, 100);
}

/** Chats from history → names (the name saved on the phone for that chat). */
export function chatNames(chats: any[], lid: Map<string, string>): { phone: string; name: string }[] {
  const out: { phone: string; name: string }[] = [];
  for (const c of chats ?? []) {
    rememberLid(lid, c?.id, c?.pnJid);
    const phone = chatPhone({ remoteJid: c?.id, remoteJidAlt: c?.pnJid }, lid);
    const name = String(c?.name ?? c?.displayName ?? "").trim();
    if (phone && name) out.push({ phone, name: name.slice(0, 120) });
  }
  return out;
}
