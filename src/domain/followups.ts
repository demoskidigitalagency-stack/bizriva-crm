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
/** Conversation id prefix for a customer with no chat yet; sending opens one. */
export const NEW_CHAT = "new:";
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
  /** Why this follow-up exists, for order-based ones (failed delivery, re-order…). */
  reason?: string;
}

export function inQuietHours(now: Date, start: string, end: string, timeZone = "Africa/Lagos") {
  const hm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(now);
  return start > end ? hm >= start || hm < end : hm >= start && hm < end;
}

function pickRule(db: Database, conv: Conversation): FollowUpRule | undefined {
  const outText = conv.messages.filter((m) => m.direction === "out").map((m) => m.body.toLowerCase()).join(" ");
  const pendingOrder = db.orders.some((o) => o.contactId === conv.contactId && o.status === "pending_verification");
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
  // Order-based follow-ups take the conversation's place when both apply.
  const byOrder = orderFollowUps(db, now, quiet);
  const taken = new Set(byOrder.map((i) => i.conversation.id));
  return [...byOrder, ...items.filter((i) => !taken.has(i.conversation.id))]
    .sort((a, b) => Number(b.due) - Number(a.due) || b.hoursWaiting - a.hoursWaiting);
}

/**
 * Follow-ups started by what happened to an order rather than a quiet chat:
 * a failed delivery to rebook, a customer agents couldn't reach, a cancelled
 * order worth winning back, and a re-order reminder when the product usually
 * runs out. Same rules: 24-hour window, templates, consent, quiet hours, limits.
 */
function orderFollowUps(db: Database, now: Date, quiet: boolean): FollowUpItem[] {
  const out: FollowUpItem[] = [];
  const seen = new Set<string>();
  const rule = (t: FollowUpRule["trigger"]) => db.followUpRules.find((r) => r.trigger === t && r.enabled);
  const push = (trigger: FollowUpRule["trigger"], contactId: string, sinceIso: string, product: string, needsConsent = false) => {
    const r = rule(trigger);
    if (!r || seen.has(contactId)) return;
    const contact = db.contacts.find((c) => c.id === contactId);
    // Customers from forms or websites may never have chatted: the first message opens a WhatsApp chat (template only).
    const conv = db.conversations.filter((c) => c.contactId === contactId).sort((a, b) => Number(b.channel === "whatsapp") - Number(a.channel === "whatsapp"))[0]
      ?? (contact ? { id: `${NEW_CHAT}${contactId}`, contactId, channel: "whatsapp" as const, subject: "", unread: false, awaitingReply: false, assigneeId: "", lastMessageAt: sinceIso, messages: [] } : undefined);
    if (!contact || !conv) return;
    // A newer customer message means they're already talking — the chat rules handle it.
    const lastIn = [...conv.messages].reverse().find((m) => m.direction === "in");
    if (lastIn && new Date(lastIn.at) > new Date(sinceIso)) return;
    seen.add(contactId);
    const since = new Date(sinceIso).getTime();
    const hoursWaiting = (now.getTime() - since) / HOUR;
    const windowOpen = !!lastIn && now.getTime() - new Date(lastIn.at).getTime() < 24 * HOUR;
    const attempts = db.workflowRuns.filter((x) => x.workflowId === FOLLOWUP_WORKFLOW_ID && x.contactId === contactId && x.status === "succeeded" && new Date(x.at).getTime() >= since).length;
    const template = db.templates.find((t) => t.id === r.templateId);
    let send: SendMode;
    if (attempts >= r.maxAttempts) send = { ok: false, reason: `Reached the limit of ${r.maxAttempts} follow-up${r.maxAttempts > 1 ? "s" : ""}` };
    else if (quiet) send = { ok: false, reason: `Quiet hours until ${db.settings.quietEnd}` };
    else if (needsConsent && !contact.consentMarketing) send = { ok: false, reason: "No marketing consent" };
    else if (windowOpen) send = { ok: true, via: "free_text" };
    else if (!template) send = { ok: false, reason: "Over 24 hours since their last message, and this rule has no template" };
    else if (template.status !== "approved") send = { ok: false, reason: `Over 24 hours — template "${template.name}" isn't approved yet` };
    else if (template.category === "marketing" && !contact.consentMarketing) send = { ok: false, reason: "No marketing consent" };
    else send = { ok: true, via: "template", template };
    const fill = (x: string) => x.replace(/\{\{name\}\}/g, contact.firstName).replace(/\{\{product\}\}/g, product);
    const text = send.ok && send.via === "template" && send.template ? send.template.body.replace("{{1}}", contact.firstName).replace("{{2}}", product) : fill(r.message);
    out.push({ conversation: conv, contact, rule: r, hoursWaiting, windowOpen, attempts, due: hoursWaiting >= r.delayHours && attempts < r.maxAttempts, dueInHours: Math.max(0, r.delayHours - hoursWaiting), send, text, ...(REASON[trigger] ? { reason: REASON[trigger]! } : {}) });
  };
  const productOf = (orderId: string) => db.orders.find((o) => o.id === orderId)?.productNames[0]?.replace(/^\d+×\s*/, "") ?? "order";

  for (const d of db.deliveries) {
    const o = db.orders.find((x) => x.id === d.orderId);
    if (d.status === "failed" && o && !["cancelled", "returned", "delivered"].includes(o.status)) push("delivery_failed", d.contactId, d.scheduledFor, productOf(o.id));
  }
  for (const o of db.orders) {
    const misses = (o.contactAttempts ?? []).filter((a) => a.outcome === "no_answer" || a.outcome === "busy");
    if (o.status === "pending_verification" && misses.length >= 2) push("unreachable", o.contactId, misses.at(-1)!.at, productOf(o.id));
  }
  for (const o of db.orders) {
    const age = (now.getTime() - new Date(o.placedAt).getTime()) / HOUR;
    if (o.status === "cancelled" && age < 90 * 24 && !db.orders.some((x) => x.contactId === o.contactId && x.placedAt > o.placedAt)) push("order_cancelled", o.contactId, o.placedAt, productOf(o.id), true);
  }
  for (const o of db.orders) {
    if (o.status !== "delivered") continue;
    if (db.orders.some((x) => x.contactId === o.contactId && x.placedAt > o.placedAt && x.status !== "cancelled")) continue;
    const del = db.deliveries.find((d) => d.orderId === o.id);
    const name = productOf(o.id);
    const p = db.products.find((x) => name.includes(x.name) || x.name.includes(name));
    if (!p?.reorderDays) continue;
    const dueAt = new Date(new Date(del?.deliveredAt ?? o.placedAt).getTime() + (p.reorderDays - 5) * 24 * HOUR);
    if (dueAt <= now && now.getTime() - dueAt.getTime() < 90 * 24 * HOUR) push("reorder_due", o.contactId, dueAt.toISOString(), p.name, true);
  }
  return out;
}

const REASON: Partial<Record<FollowUpRule["trigger"], string>> = {
  delivery_failed: "Delivery failed",
  unreachable: "Agents couldn't reach them",
  order_cancelled: "Cancelled order",
  reorder_due: "Due to re-order",
};
