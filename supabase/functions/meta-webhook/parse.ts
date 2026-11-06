// Facebook Page webhooks (Messenger, Instagram DMs, lead forms) — pure parsing, unit-tested in tests/meta_page.test.ts.

export interface Dm { channel: "messenger" | "instagram"; owner: string; sender: string; mid: string; text: string | null; at: string; files: { kind: "image" | "video" | "audio" | "document"; url: string }[]; ad?: { id: string; headline: string | null } }
export interface LeadPing { owner: string; leadgen: string; form: string | null; ad: string | null }

const KIND: Record<string, Dm["files"][number]["kind"]> = { image: "image", video: "video", audio: "audio", file: "document" };

/** What Meta sent: customer messages (echoes of our own replies skipped) and new leads. */
// deno-lint-ignore no-explicit-any
export function parse(payload: any): { dms: Dm[]; leads: LeadPing[] } {
  const dms: Dm[] = [], leads: LeadPing[] = [];
  const channel = payload?.object === "instagram" ? "instagram" : payload?.object === "page" ? "messenger" : null;
  if (!channel) return { dms, leads };
  for (const e of payload.entry ?? []) {
    const owner = String(e.id ?? "");
    for (const m of e.messaging ?? []) {
      const msg = m.message;
      if (!msg?.mid || msg.is_echo || String(m.sender?.id) === owner) continue;
      const files = (msg.attachments ?? []).filter((a: { type: string; payload?: { url?: string } }) => KIND[a.type] && a.payload?.url).map((a: { type: string; payload: { url: string } }) => ({ kind: KIND[a.type]!, url: a.payload.url }));
      const text = msg.text ?? (files.length ? `[${files[0].kind}]` : msg.attachments?.length ? `[${msg.attachments[0].type}]` : null);
      // Click-to-Messenger / Instagram ads send the ad with the first message.
      const ref = m.referral ?? msg.referral;
      const ad = ref?.ad_id ? { id: String(ref.ad_id), headline: ref.ads_context_data?.ad_title ?? null } : undefined;
      dms.push({ channel, owner, sender: String(m.sender?.id ?? ""), mid: String(msg.mid), text, at: new Date(Number(m.timestamp) || Date.now()).toISOString(), files, ...(ad ? { ad } : {}) });
    }
    for (const c of e.changes ?? []) {
      if (c.field === "leadgen" && c.value?.leadgen_id) leads.push({ owner: String(c.value.page_id ?? owner), leadgen: String(c.value.leadgen_id), form: c.value.form_id ? String(c.value.form_id) : null, ad: c.value.ad_id ? String(c.value.ad_id) : null });
    }
  }
  return { dms, leads };
}

/** Lead-form answers as { field: value }, e.g. full_name, phone_number, email, city. */
// deno-lint-ignore no-explicit-any
export function leadFields(lead: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of lead?.field_data ?? []) {
    const k = String(f.name ?? "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 60);
    const v = (f.values ?? []).map(String).join(", ").slice(0, 500);
    if (k && v) out[k] = v;
  }
  return out;
}
