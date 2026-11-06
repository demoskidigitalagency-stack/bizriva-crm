// What we send to Meta for one queued message — pure, unit-tested in tests/whatsapp_payload.test.ts.

export interface Job {
  id: string; workspace_id: string; phone_number_id: string; token: string; to_phone: string | null; body: string | null;
  template_name: string | null; in_window: boolean; media_path?: string | null; media_kind?: string | null; media_name?: string | null;
}

/** mediaLink: a short-lived link to the file (needed when the message has one). */
export function payloadFor(j: Job, mediaLink?: string | null): { body: Record<string, unknown> } | { error: string } {
  const to = (j.to_phone ?? "").replace(/\D/g, "");
  if (!/^\d{7,15}$/.test(to)) return { error: "No phone number for this customer" };
  if (j.media_path) {
    if (!j.in_window) return { error: "Outside the 24-hour window — files can only be sent within 24 hours of the customer's last message" };
    if (!mediaLink) return { error: "The file couldn't be found" };
    const kind = j.media_kind === "image" || j.media_kind === "video" || j.media_kind === "audio" ? j.media_kind : "document";
    const caption = (j.body ?? "").trim().slice(0, 1024);
    const media: Record<string, unknown> = { link: mediaLink };
    if (kind !== "audio" && caption) media["caption"] = caption;
    if (kind === "document") media["filename"] = (j.media_name || "file").slice(0, 200);
    return { body: { messaging_product: "whatsapp", recipient_type: "individual", to, type: kind, [kind]: media } };
  }
  if (j.in_window && j.body) return { body: { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: true, body: j.body.slice(0, 4096) } } };
  if (j.template_name) {
    const [name, lang] = j.template_name.split(":");
    return { body: { messaging_product: "whatsapp", to, type: "template", template: { name, language: { code: lang || "en" } } } };
  }
  return { error: "Outside the 24-hour window — needs an approved template" };
}
