// Email formatting and the request each provider expects — pure, unit-tested in tests/email_mail.test.ts.

export interface Job {
  id: string; provider: "brevo" | "resend" | "mailgun" | string; from_email: string; from_name: string; api_key: string | null;
  to_email: string; subject: string; body: string; kind: "order" | "broadcast" | "test" | string; tracking_id: string | null;
}
export const UNSUB_BASE = "https://xjhzkciowmklxrtwsikm.supabase.co/functions/v1/email-unsub?t=";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkify = (s: string) => s.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" style="color:#0f766e">$1</a>');

/** Plain text and simple, readable HTML for one email. Broadcasts get an unsubscribe line. */
export function render(j: Job): { text: string; html: string; unsubscribe?: string } {
  const unsub = j.kind === "broadcast" && j.tracking_id ? UNSUB_BASE + j.tracking_id : undefined;
  const footerText = unsub ? `\n\n—\nYou're getting this because you agreed to hear from ${j.from_name}. Unsubscribe: ${unsub}` : "";
  const text = j.body.trim() + footerText;
  const paras = j.body.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${linkify(esc(p)).replace(/\n/g, "<br>")}</p>`).join("");
  const footer = unsub
    ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7280">You're getting this because you agreed to hear from ${esc(j.from_name)}. <a href="${unsub}" style="color:#6b7280">Unsubscribe</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;font:15px/1.55 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827">${paras}${footer}</div></body></html>`;
  return { text, html, ...(unsub ? { unsubscribe: unsub } : {}) };
}

/** The HTTP request to send one email through the business's provider. */
export function request(j: Job): { url: string; init: RequestInit } | { error: string } {
  if (!j.api_key) return { error: "400 The email service isn't connected — add your key under Integrations" };
  const r = render(j);
  const headers: Record<string, string> = r.unsubscribe ? { "List-Unsubscribe": `<${r.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {};
  if (j.provider === "brevo") {
    return { url: "https://api.brevo.com/v3/smtp/email", init: { method: "POST", headers: { "api-key": j.api_key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { email: j.from_email, name: j.from_name }, to: [{ email: j.to_email }], subject: j.subject, htmlContent: r.html, textContent: r.text, ...(Object.keys(headers).length ? { headers } : {}) }) } };
  }
  if (j.provider === "resend") {
    return { url: "https://api.resend.com/emails", init: { method: "POST", headers: { authorization: `Bearer ${j.api_key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: `${j.from_name} <${j.from_email}>`, to: [j.to_email], subject: j.subject, html: r.html, text: r.text, ...(Object.keys(headers).length ? { headers } : {}) }) } };
  }
  if (j.provider === "mailgun") {
    const domain = j.from_email.split("@")[1] ?? "";
    const form = new URLSearchParams({ from: `${j.from_name} <${j.from_email}>`, to: j.to_email, subject: j.subject, text: r.text, html: r.html });
    for (const [k, v] of Object.entries(headers)) form.set(`h:${k}`, v);
    return { url: `https://api.mailgun.net/v3/${domain}/messages`, init: { method: "POST", headers: { authorization: "Basic " + btoa(`api:${j.api_key}`), "content-type": "application/x-www-form-urlencoded" }, body: form.toString() } };
  }
  return { error: `400 Unknown email service ${j.provider}` };
}

/** The provider's message id from its reply. */
// deno-lint-ignore no-explicit-any
export function providerId(provider: string, res: any): string | null {
  const id = provider === "brevo" ? res?.messageId : res?.id;
  return id ? String(id) : null;
}
