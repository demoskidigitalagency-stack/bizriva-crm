/**
 * Follow-up decisions (master prompt, module 6). Pure functions so the
 * backend scheduler can reuse exactly the same rules.
 *
 * For each conversation waiting on the customer, decide whether a follow-up
 * is due and how it may be sent:
 *   - inside 24 hours of the customer's last message → free text allowed
 *   - outside it → only an approved template
 *   - marketing templates need marketing consent
 *   - never during quiet hours, never past the attempt limit
 */
import type { Database } from "./database";
import type { Contact, Conversation, FollowUpRule, MessageTemplate } from "./types";

export const FOLLOWUP_WORKFLOW_ID = "followups";
const HOUR = 3_600_000;

export type SendMode =
  | { ok: true; via: "free_text" | "template"; template?: MessageTemplate }
  | { ok: false; reason: string };

export interface FollowUpItem {
  conversation: Conversation;
  contact: Contact;
  rule: FollowUpRule;
  hoursWaiting: number;
  windowOpen: boolean;
  attempts: number;
  due: boolean;
  dueInHours: number;
  send: SendMode;
  text: string;
}

export function inQuietHours(now: Date, start: string, end: string, timeZone = "Africa/Lagos") {
  const hm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(now);
  return start > end ? hm >= start || hm < end : hm >= start && hm < end;
}

function pickRule(db: Database, conv: Conversation): FollowUpRule | undefined {
  const outText = conv.messages.filter((m) => m.direction === "out").map((m) => m.body.toLowerCase()).join(" ");
  const pendingOrder = db.orders.some((o) => o.contactId === conv.contactId && o.status === "pending_confirmation");
  const trigger: FollowUpRule["trigger"] = pendingOrder ? "checkout_abandoned" : /₦|price|cost|naira/.test(outText) ? "no_reply_after_price" : /deliver/.test(outText) ? "delivery_concern" : "no_reply_after_details";
  return db.followUpRules.find((r) => r.trigger === trigger && r.enabled) ?? db.followUpRules.find((r) => r.trigger === "no_reply_after_details" && r.enabled);
}

export function followUpQueue(db: Database, now = new Date()): FollowUpItem[] {
  const quiet = inQuietHours(now, db.settings.quietStart, db.settings.quietEnd, db.settings.timezone);
  const items: FollowUpItem[] = [];
  for (const conv of db.conversations) {
    const last = conv.messages.at(-1);
    if (!last || last.direction !== "out" || conv.awaitingReply) continue;
    const contact = db.contacts.find((c) => c.id === conv.contactId);
    const rule = pickRule(db, conv);
    if (!contact || !rule) continue;

    const lastIn = [...conv.messages].reverse().find((m) => m.direction === "in");
    const windowOpen = !!lastIn && now.getTime() - new Date(lastIn.at).getTime() < 24 * HOUR;
    const hoursWaiting = (now.getTime() - new Date(last.at).getTime()) / HOUR;
    const since = lastIn ? new Date(lastIn.at).getTime() : 0;
    const attempts = db.workflowRuns.filter((r) => r.workflowId === FOLLOWUP_WORKFLOW_ID && r.contactId === contact.id && r.status === "succeeded" && new Date(r.at).getTime() >= since).length;
    const product = db.productInterests.find((p) => p.contactId === contact.id)?.productName ?? "item you asked about";
    const fill = (s: string) => s.replace(/\{\{name\}\}/g, contact.firstName).replace(/\{\{product\}\}/g, product);

    let send: SendMode;
    const template = db.templates.find((t) => t.id === rule.templateId);
    if (attempts >= rule.maxAttempts) send = { ok: false, reason: `Reached the limit of ${rule.maxAttempts} follow-up${rule.maxAttempts > 1 ? "s" : ""}` };
    else if (quiet) send = { ok: false, reason: `Quiet hours until ${db.settings.quietEnd}` };
    else if (windowOpen) send = { ok: true, via: "free_text" };
    else if (!template) send = { ok: false, reason: "Over 24 hours since their last message, and this rule has no template" };
    else if (template.status !== "approved") send = { ok: false, reason: `Over 24 hours — template "${template.name}" isn't approved yet` };
    else if (template.category === "marketing" && !contact.consentMarketing) send = { ok: false, reason: "No marketing consent" };
    else send = { ok: true, via: "template", template };

    const text = send.ok && send.via === "template" && send.template
      ? send.template.body.replace("{{1}}", contact.firstName).replace("{{2}}", product)
      : fill(rule.message);

    items.push({
      conversation: conv, contact, rule, hoursWaiting, windowOpen, attempts,
      due: hoursWaiting >= rule.delayHours && attempts < rule.maxAttempts,
      dueInHours: Math.max(0, rule.delayHours - hoursWaiting),
      send, text,
    });
  }
  return items.sort((a, b) => Number(b.due) - Number(a.due) || b.hoursWaiting - a.hoursWaiting);
}
