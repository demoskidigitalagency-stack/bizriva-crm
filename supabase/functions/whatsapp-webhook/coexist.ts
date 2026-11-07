// What Meta sends for numbers that stay on the WhatsApp Business app (Coexistence):
// the phone's chat history, its contacts, and messages the business sends from the phone.
// Pure functions, unit-tested in tests/whatsapp_coexist.test.ts.

/** The text we keep for a WhatsApp message of any type. */
// deno-lint-ignore no-explicit-any
export function textOf(m: any): string | null {
  switch (m?.type) {
    case "text": return m.text?.body ?? null;
    case "button": return m.button?.text ?? null;
    case "interactive": return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
    case "image": case "video": case "document": case "audio": case "sticker": {
      const cap = m[m.type]?.caption; return `[${m.type}]${cap ? " " + cap : ""}`;
    }
    case "media_placeholder": return "[photo or file — open the WhatsApp app to see it]";
    case "location": return `[location] ${m.location?.name ?? ""} ${m.location?.address ?? ""} (${m.location?.latitude}, ${m.location?.longitude})`.trim();
    case "contacts": return "[contact card]";
    case "reaction": return m.reaction?.emoji ? `[reacted ${m.reaction.emoji}]` : null;
    default: return null;
  }
}

const iso = (ts: unknown) => (ts ? new Date(Number(ts) * 1000).toISOString() : null);
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export interface HistoryThread { wa: string; messages: { id: string; at: string | null; out: boolean; body: string }[] }
export interface HistoryChunk { progress: number; threads: HistoryThread[]; error?: { code: string; message: string } }

/** A `history` change → chunks of threads (oldest message first). A message is ours when it isn't from the customer. */
// deno-lint-ignore no-explicit-any
export function parseHistory(value: any): HistoryChunk[] {
  const out: HistoryChunk[] = [];
  // deno-lint-ignore no-explicit-any
  const topErr = (value?.errors ?? [])[0] as any;
  if (topErr) out.push({ progress: 0, threads: [], error: { code: String(topErr.code ?? ""), message: String(topErr.title ?? topErr.message ?? "") } });
  for (const h of value?.history ?? []) {
    const err = h?.errors?.[0];
    if (err) { out.push({ progress: 0, threads: [], error: { code: String(err.code ?? ""), message: String(err.title ?? err.message ?? "") } }); continue; }
    const threads: HistoryThread[] = [];
    for (const t of h?.threads ?? []) {
      const wa = digits(t?.id);
      if (!/^\d{7,15}$/.test(wa)) continue;
      const messages = (t?.messages ?? [])
        // deno-lint-ignore no-explicit-any
        .map((m: any) => ({ id: String(m?.id ?? ""), at: iso(m?.timestamp), out: digits(m?.from) !== wa, body: textOf(m) ?? "" }))
        .filter((m: { id: string; body: string }) => m.id && m.body.trim())
        .sort((a: { at: string | null }, b: { at: string | null }) => String(a.at).localeCompare(String(b.at)));
      if (messages.length) threads.push({ wa, messages });
    }
    out.push({ progress: Math.max(0, Math.min(100, Number(h?.metadata?.progress ?? 0) || 0)), threads });
  }
  return out;
}

/** `smb_message_echoes` → messages the business sent from the phone app. */
// deno-lint-ignore no-explicit-any
export function parseEchoes(value: any): { wa: string; id: string; at: string | null; body: string }[] {
  // deno-lint-ignore no-explicit-any
  return (value?.message_echoes ?? []).map((m: any) => ({ wa: digits(m?.to), id: String(m?.id ?? ""), at: iso(m?.timestamp), body: textOf(m) ?? "" }))
    .filter((m: { wa: string; id: string; body: string }) => /^\d{7,15}$/.test(m.wa) && m.id && m.body.trim());
}

/** `smb_app_state_sync` → the phone's contacts (a "remove" never deletes anyone in Bizriva). */
// deno-lint-ignore no-explicit-any
export function parseContacts(value: any): { phone: string; name: string | null; action: string }[] {
  return (value?.state_sync ?? [])
    // deno-lint-ignore no-explicit-any
    .filter((s: any) => s?.type === "contact" && s.contact?.phone_number)
    // deno-lint-ignore no-explicit-any
    .map((s: any) => ({ phone: digits(s.contact.phone_number), name: s.contact.full_name || s.contact.first_name || null, action: String(s.action ?? "add") }));
}
