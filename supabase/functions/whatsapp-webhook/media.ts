// Customers' photos, videos, voice notes and documents: which ones to fetch, and where they go.
// Pure helpers (unit-tested in tests/whatsapp_payload.test.ts); the download itself is in index.ts.

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/3gpp": "3gp",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/amr": "amr",
  "application/pdf": "pdf", "text/plain": "txt",
};
export const MAX_BYTES = 16 * 1024 * 1024;

/** Meta's media id, our kind and the file name for a WhatsApp message, if it carries a file. */
// deno-lint-ignore no-explicit-any
export function mediaOf(m: any): { id: string; kind: "image" | "video" | "audio" | "document" | "sticker"; name: string | null; mime: string | null } | null {
  const kind = m?.type;
  if (!["image", "video", "audio", "document", "sticker"].includes(kind)) return null;
  const part = m[kind] ?? {};
  if (!part.id) return null;
  return { id: String(part.id), kind, name: part.filename ? String(part.filename).slice(0, 200) : null, mime: part.mime_type ? String(part.mime_type).split(";")[0]!.trim() : null };
}

/** Where a customer's file is stored: <workspace>/in/<message id>.<ext> */
export function inboundPath(workspaceId: string, messageId: string, mime: string | null): string {
  return `${workspaceId}/in/${messageId}.${(mime && EXT[mime]) || "bin"}`;
}
