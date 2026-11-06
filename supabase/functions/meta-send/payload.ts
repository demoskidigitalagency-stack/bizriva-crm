// What we send to Meta for one Messenger / Instagram reply — pure, unit-tested in tests/meta_page.test.ts.

export interface MetaJob { id: string; workspace_id: string; channel: string; page_id: string; token: string; recipient: string | null; body: string | null; in_window: boolean; media_path: string | null; media_kind: string | null }

export function sendBody(j: MetaJob, mediaLink?: string | null): { body: Record<string, unknown>[] } | { error: string } {
  if (!j.recipient) return { error: "No Messenger/Instagram id for this customer" };
  if (!j.in_window) return { error: "Outside the 24-hour window — Meta only allows replies within 24 hours of the customer's last message" };
  const base = { recipient: { id: j.recipient }, messaging_type: "RESPONSE" };
  const out: Record<string, unknown>[] = [];
  if (j.media_path) {
    if (!mediaLink) return { error: "The file couldn't be found" };
    const type = j.media_kind === "image" || j.media_kind === "video" || j.media_kind === "audio" ? j.media_kind : "file";
    out.push({ ...base, message: { attachment: { type, payload: { url: mediaLink, is_reusable: false } } } });
  }
  const text = (j.body ?? "").replace(/\*([^*\n]+)\*/g, "$1").trim();
  // Messenger text is limited to 2,000 characters (Instagram 1,000).
  if (text) out.push({ ...base, message: { text: text.slice(0, j.channel === "instagram" ? 1000 : 2000) } });
  return out.length ? { body: out } : { error: "Empty message" };
}
