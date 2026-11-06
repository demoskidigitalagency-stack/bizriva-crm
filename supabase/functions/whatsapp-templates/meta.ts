// Templates ⇄ Meta — pure functions, unit-tested in tests/wa_templates.test.ts.

export interface Tpl { id: string; name: string; category: string; language: string; body: string }

const SAMPLES = ["Ada", "BZ-1042", "Glow Body Cream", "₦12,000", "Lagos", "tomorrow"];

/** WhatsApp language code: Pidgin has none, so it goes as English. */
export const metaLanguage = (lang: string) => (lang === "pcm" || !lang ? "en" : lang);

/** The create-template request for one of our templates. */
export function createBody(t: Tpl): Record<string, unknown> {
  const nums = [...new Set([...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  const body: Record<string, unknown> = { type: "BODY", text: t.body };
  if (nums.length) body["example"] = { body_text: [nums.map((n) => SAMPLES[(n - 1) % SAMPLES.length])] };
  return { name: t.name, language: metaLanguage(t.language), category: t.category.toUpperCase(), components: [body] };
}

/** Variables must be {{1}}, {{2}}… with none skipped — Meta refuses gaps. */
export function checkTemplate(t: Tpl): string | null {
  const nums = [...new Set([...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  if (nums.some((n, i) => n !== i + 1)) return "Variables must be numbered {{1}}, {{2}}, {{3}} in order, with none skipped";
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(t.body)) return "The message can't start or end with a variable — WhatsApp rule";
  if (t.body.length > 1024) return "The message is longer than WhatsApp's 1,024 characters";
  return null;
}

/** Meta's status in our words. */
export function ourStatus(meta: string): "submitted" | "approved" | "rejected" | null {
  switch ((meta ?? "").toUpperCase()) {
    case "APPROVED": return "approved";
    case "PENDING": case "IN_APPEAL": case "PENDING_DELETION": return "submitted";
    case "REJECTED": case "PAUSED": case "DISABLED": case "LIMIT_EXCEEDED": return "rejected";
    default: return null;
  }
}

export function reasonFor(meta: string, reason?: string | null): string | null {
  const m = (meta ?? "").toUpperCase();
  if (m === "PAUSED") return "Paused by Meta after poor customer feedback";
  if (m === "DISABLED") return "Disabled by Meta";
  if (m !== "REJECTED") return null;
  const r = (reason ?? "").toUpperCase();
  return r === "INVALID_FORMAT" ? "Meta: the format isn't valid" : r === "TAG_CONTENT_MISMATCH" ? "Meta: the text doesn't match the chosen type (utility/marketing)"
    : r === "PROMOTIONAL" ? "Meta: promotional text in a utility template — choose Marketing" : r === "ABUSIVE_CONTENT" ? "Meta: content not allowed" : r && r !== "NONE" ? `Meta: ${r.toLowerCase().replace(/_/g, " ")}` : "Rejected by Meta";
}
