// Termii SMS — pure helpers, unit-tested in tests/sms_termii.test.ts.

export interface SmsJob { id: string; workspace_id: string; to_phone: string | null; body: string | null; api_key: string; sender: string; route: string; base_url?: string | null }

export const DEFAULT_BASE = "https://v3.api.termii.com";
/** Only Termii's own addresses are used (the address is shown on the Termii dashboard). */
export function baseUrl(b?: string | null): string {
  const u = (b ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+\.termii\.com$/i.test(u) ? u : DEFAULT_BASE;
}

/** Nigerian numbers in international form without "+": 0803… → 234803… */
export function msisdn(p: string | null): string | null {
  let d = (p ?? "").replace(/\D/g, "");
  if (d.startsWith("0") && d.length === 11) d = "234" + d.slice(1);
  return /^\d{11,15}$/.test(d) ? d : null;
}

/** 3 SMS pages at most (459 characters); longer texts are cut with "…". */
export function smsText(body: string | null): string {
  const t = (body ?? "").replace(/\*([^*\n]+)\*/g, "$1").replace(/[ \t]+\n/g, "\n").trim();
  return t.length > 459 ? t.slice(0, 458).trimEnd() + "…" : t;
}

export function request(j: SmsJob): { url: string; body: Record<string, unknown> } | { error: string } {
  const to = msisdn(j.to_phone);
  if (!to) return { error: "No phone number for this customer" };
  const sms = smsText(j.body);
  if (!sms) return { error: "Empty message" };
  return { url: `${baseUrl(j.base_url)}/api/sms/send`, body: { api_key: j.api_key, to, from: j.sender, sms, type: "plain", channel: j.route === "dnd" ? "dnd" : "generic" } };
}

/** Termii's answer: the message id, or the error to record (4xx = won't work on retry). */
// deno-lint-ignore no-explicit-any
export function outcome(status: number, res: any): { id: string } | { error: string } {
  if (status >= 200 && status < 300 && res?.message_id) return { id: String(res.message_id) };
  const why = String(res?.message ?? res?.error ?? "Termii refused the message").slice(0, 300);
  return { error: `${status} ${why}` };
}
