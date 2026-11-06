/**
 * Live writes: what each screen action does to the real database. Each one
 * makes the smallest change the server needs; triggers in
 * supabase/migrations then apply the business rules (order numbers, agent
 * sharing, payments, receipts, lead stages, delivery records…) and the store
 * reloads to show what the server decided. A refused change comes back as a
 * plain-English error from the server and nothing is half-saved.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domain/database";
import { deliveryLink, partnerMessage, pickAgent } from "@/domain/ops";
import type { CreateContactInput, CreateOrderInput } from "@/domain/store";
import type { AttemptOutcome, BusinessSettings, Contact, ID, OrderStatus, PaymentMethod, Product } from "@/domain/types";

interface CreateLike {
  contact: CreateContactInput;
  contactPatch: Partial<Pick<Contact, "firstName" | "lastName" | "phone" | "city" | "address" | "landmark">>;
  order: CreateOrderInput;
  product: Omit<Product, "id"> & { id?: ID };
}
import { DB_CHANNEL, DB_ROLE, METHOD_TO_DB } from "./live";

export type Result = { error?: string };
const fail = (e: { message: string } | null | undefined): Result => (e ? { error: e.message } : {});

const SNAKE_ASSIGN = (a: BusinessSettings["assignment"]) => ({ mode: a.mode, call_within_minutes: a.callWithinMinutes, move_uncalled: a.moveUncalled, ...(a.lastAssigned ? { last_assigned: a.lastAssigned } : {}) });
const PAY_KIND = (paidBefore: number, amount: number, total: number) => (paidBefore === 0 && amount >= total ? "full" : paidBefore === 0 ? "deposit" : "balance");
const PAY_METHOD_DB: Record<PaymentMethod, string> = { cash_on_delivery: "cash", bank_transfer: "bank_transfer", card: "card", wallet: "wallet", ussd: "ussd" };

/** Collections the generic save/remove buttons write to, and their tables. */
const TABLE: Record<string, string> = {
  riders: "logistics_partners", knowledge: "knowledge_entries", templates: "message_templates", followUpRules: "followup_rules",
  orderForms: "order_forms", events: "calendar_events", broadcasts: "campaigns",
};
const isUuid = (s?: string) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function liveWriter(sb: SupabaseClient, ws: string, getDb: () => Database) {
  const order = (id: ID) => getDb().orders.find((o) => o.id === id);

  async function setStatus(orderId: ID, status: OrderStatus): Promise<Result> {
    const o = order(orderId);
    if (!o) return { error: "Order not found" };
    // Dispatching or delivering a confirmed order passes through "ready for dispatch" first (the server checks each step).
    const steps: OrderStatus[] = ["dispatched", "in_transit", "delivered"].includes(status) && ["confirmed", "processing"].includes(o.status) ? ["ready_for_dispatch", status] : [status];
    for (const s of steps) {
      const { error } = await sb.from("orders").update({ status: s }).eq("id", orderId);
      if (error) return fail(error);
    }
    return {};
  }

  async function conversationFor(contactId: ID): Promise<{ id?: string; error?: string }> {
    const existing = getDb().conversations.filter((c) => c.contactId === contactId).sort((a, b) => Number(b.channel === "whatsapp") - Number(a.channel === "whatsapp"))[0];
    if (existing) return { id: existing.id };
    const { data, error } = await sb.from("conversations").insert({ workspace_id: ws, contact_id: contactId, channel: "whatsapp" }).select("id").single();
    return error ? { error: error.message } : { id: data.id as string };
  }

  return {
    async addContact(input: CreateLike["contact"]): Promise<Result> {
      const { data, error } = await sb.from("contacts").insert({ workspace_id: ws, name: `${input.firstName} ${input.lastName}`.trim(), phone: input.phone, ...(input.email ? { email: input.email } : {}), location: input.city }).select("id").single();
      if (error) return fail(error);
      const members = getDb().team;
      return fail((await sb.from("leads").insert({ workspace_id: ws, contact_id: data.id, ...(members.some((m) => m.id === input.ownerId) ? { assigned_to: input.ownerId } : {}) })).error);
    },
    async updateContactDetails(contactId: ID, patch: CreateLike["contactPatch"]): Promise<Result> {
      const c = getDb().contacts.find((x) => x.id === contactId);
      if (!c) return { error: "Customer not found" };
      const first = patch.firstName ?? c.firstName; const last = patch.lastName ?? c.lastName;
      return fail((await sb.from("contacts").update({ name: `${first} ${last}`.trim(), phone: patch.phone ?? c.phone, location: patch.city ?? c.city, address: patch.address ?? c.address ?? null, landmark: patch.landmark ?? c.landmark ?? null, updated_at: new Date().toISOString() }).eq("id", contactId)).error);
    },
    async createOrder(input: CreateLike["order"]): Promise<Result> {
      const db = getDb();
      const lines = input.items.filter((i) => i.qty > 0).map((i) => ({ ...i, p: db.products.find((p) => p.id === i.productId) })).filter((l) => l.p);
      if (!lines.length) return { error: "Add at least one product" };
      const subtotal = lines.reduce((n, l) => n + l.p!.price * l.qty, 0);
      const fee = subtotal >= db.settings.freeDeliveryOver ? 0 : db.settings.deliveryFee;
      const conv = db.conversations.find((c) => c.contactId === input.contactId);
      const { data, error } = await sb.from("orders").insert({ workspace_id: ws, contact_id: input.contactId, subtotal, delivery_fee: fee, total: subtotal + fee, payment_method: METHOD_TO_DB[input.method], channel: DB_CHANNEL(input.channel), ...(conv ? { conversation_id: conv.id } : {}) }).select("id").single();
      if (error) return fail(error);
      return fail((await sb.from("order_items").insert(lines.map((l) => ({ workspace_id: ws, order_id: data.id, product_id: l.productId, quantity: l.qty, unit_price: l.p!.price })))).error);
    },
    setOrderStatus: (orderId: ID, status: OrderStatus) => setStatus(orderId, status),
    async recordCodCheck(orderId: ID, result: "confirmed" | "unreachable" | "cancelled", by: ID): Promise<Result> {
      if (result === "unreachable") return fail((await sb.from("order_contact_attempts").insert({ workspace_id: ws, order_id: orderId, by_user: by, via: "call", outcome: "no_answer" })).error);
      return setStatus(orderId, result);
    },
    async setDeliveryStatus(deliveryId: ID, status: string, reason?: string): Promise<Result> {
      const d = getDb().deliveries.find((x) => x.id === deliveryId);
      if (!d) return { error: "Delivery not found" };
      if (status === "delivered") return setStatus(d.orderId, "delivered");
      if (status === "in_transit" || status === "picked_up") return setStatus(d.orderId, "dispatched");
      if (status === "returned") return setStatus(d.orderId, "returned");
      if (status === "failed") return fail((await sb.from("deliveries").update({ outcome: "failed", attempts: d.attempts + 1, failure_reason: reason ?? "Customer unreachable" }).eq("id", deliveryId)).error);
      if (status === "scheduled") return fail((await sb.from("deliveries").update({ outcome: null }).eq("id", deliveryId)).error);
      return {};
    },
    assignRider: async (deliveryId: ID, riderId?: ID): Promise<Result> => fail((await sb.from("deliveries").update({ partner_id: riderId ?? null }).eq("id", deliveryId)).error),
    markRemitted: async (paymentId: ID): Promise<Result> => fail((await sb.from("payments").update({ remitted_at: new Date().toISOString() }).eq("id", paymentId)).error),
    async recordPayment(orderId: ID, method: PaymentMethod, amount?: number): Promise<Result> {
      const o = order(orderId);
      if (!o) return { error: "Order not found" };
      const due = o.total - (o.amountPaid ?? 0);
      const amt = Math.min(amount ?? due, due);
      if (!(amt > 0)) return { error: "Nothing left to pay on this order" };
      return fail((await sb.from("payments").insert({ workspace_id: ws, order_id: orderId, contact_id: o.contactId, kind: PAY_KIND(o.amountPaid ?? 0, amt, o.total), method: PAY_METHOD_DB[method], amount: amt })).error);
    },
    async saveProduct(p: CreateLike["product"]): Promise<Result> {
      const row = { workspace_id: ws, name: p.name, category: p.category, price: p.price, cost: p.cost, stock: p.stock, reorder_level: p.reorderLevel, description: p.description ?? null, active: p.active !== false, deposit: p.deposit ?? 0, care_guide: p.careGuide ?? null, reorder_days: p.reorderDays ?? null };
      return fail((isUuid(p.id) ? await sb.from("products").update(row).eq("id", p.id!) : await sb.from("products").insert(row)).error);
    },
    async adjustStock(productId: ID, delta: number): Promise<Result> {
      const p = getDb().products.find((x) => x.id === productId);
      if (!p) return { error: "Product not found" };
      return fail((await sb.from("products").update({ stock: Math.max(0, p.stock + delta) }).eq("id", productId)).error);
    },
    async saveRecord(collection: string, r: Record<string, any>): Promise<Result> { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (collection === "team") {
        return fail((await sb.from("workspace_members").update({ states: r["states"] ?? [], monthly_target: r["monthlyTarget"] ?? 0, ...(r["role"] ? { role: DB_ROLE[r["role"] as keyof typeof DB_ROLE] } : {}) }).eq("workspace_id", ws).eq("user_id", r["id"])).error);
      }
      const table = TABLE[collection];
      if (!table) return { error: "This part isn't saved to your real data yet." };
      const db = getDb();
      const row: Record<string, unknown> = collection === "riders" ? { name: r["name"], phone: r["phone"], zone: r["zone"], vehicle: r["vehicle"], active: r["active"], kind: r["kind"] ?? "rider", states: r["states"] ?? [], fees: r["fees"] ?? {}, failed_fee: r["failedFee"] ?? 0, whatsapp_group: r["whatsappGroup"] ?? null }
        : collection === "knowledge" ? { topic: r["topic"], question: r["question"], answer: r["answer"], keywords: r["keywords"] ?? [], updated_at: new Date().toISOString() }
        : collection === "templates" ? { name: r["name"], category: r["category"], language: r["language"], purpose: r["purpose"] ?? null, body: r["body"], status: r["status"], updated_at: new Date().toISOString() }
        : collection === "followUpRules" ? { name: r["name"], trigger: r["trigger"], delay_hours: r["delayHours"], max_attempts: r["maxAttempts"], template_name: db.templates.find((t) => t.id === r["templateId"])?.name ?? null, message: r["message"], quiet_start: r["quietStart"], quiet_end: r["quietEnd"], enabled: r["enabled"] }
        : collection === "orderForms" ? { name: r["name"], product_id: r["productId"], headline: r["headline"], banner: r["banner"] ?? null, packages: r["packages"], fields: r["fields"], pay_on_delivery: r["payOnDelivery"], meta_pixel: r["pixels"]?.meta ?? false, tiktok_pixel: r["pixels"]?.tiktok ?? false, thank_you: r["thankYou"], active: r["active"] }
        : collection === "events" ? { title: r["title"], kind: r["kind"], starts_at: r["at"], contact_id: r["contactId"] ?? null, order_id: r["orderId"] ?? null, note: r["note"] ?? null }
        : { name: r["name"], channel: r["channel"] ?? "whatsapp", template_name: db.templates.find((t) => t.id === r["templateId"])?.name ?? null, subject: r["subject"] ?? null, body: r["body"] ?? null, status: r["status"] === "scheduled" ? "scheduled" : "draft", scheduled_for: r["scheduledFor"] ?? null };
      return fail((isUuid(r["id"]) ? await sb.from(table).update(row).eq("id", r["id"]) : await sb.from(table).insert({ workspace_id: ws, ...row })).error);
    },
    async removeRecord(collection: string, id: ID): Promise<Result> {
      const table = TABLE[collection];
      if (!table) return { error: "This part isn't saved to your real data yet." };
      return fail((await sb.from(table).delete().eq("id", id)).error);
    },
    async updateSettings(patch: Partial<BusinessSettings>): Promise<Result> {
      const cur = getDb().settings;
      const cols: Record<string, unknown> = {};
      const { brief, afterDelivery, assignment, commission, partnerAcceptMinutes, email, businessName, plan: _plan, meta: _meta, payments: _payments, ...rest } = patch;
      if (brief) { cols["brief_time"] = brief.time; cols["brief_channels"] = brief.channels; }
      if (afterDelivery) cols["after_delivery"] = afterDelivery;
      if (assignment) cols["assignment"] = SNAKE_ASSIGN(assignment);
      if (commission) cols["commission_per_order"] = commission.perOrder;
      if (partnerAcceptMinutes) cols["partner_accept_minutes"] = partnerAcceptMinutes;
      if (email) cols["email_settings"] = { provider: email.provider, from: email.fromEmail };
      if (businessName) cols["name"] = businessName;
      if (Object.keys(rest).length || email) {
        const { meta: _m, payments: _p, plan: _pl, assignment: _a, commission: _c, brief: _b, afterDelivery: _d, partnerAcceptMinutes: _pa, ...everyday } = { ...cur, ...rest };
        cols["settings"] = { ...everyday, ...(email ? { email: { fromName: email.fromName } } : {}) };
      }
      return fail((await sb.from("workspaces").update(cols).eq("id", ws)).error);
    },
    async sendReply(conversationId: ID, text: string): Promise<Result> {
      return fail((await sb.from("messages").insert({ workspace_id: ws, conversation_id: conversationId, direction: "out", body: text.trim(), status: "queued" })).error);
    },
    async messageContact(contactId: ID, body: string): Promise<Result> {
      const conv = await conversationFor(contactId);
      if (conv.error) return conv;
      return fail((await sb.from("messages").insert({ workspace_id: ws, conversation_id: conv.id, direction: "out", body, status: "queued" })).error);
    },
    async assignOrders(orderIds: ID[], memberId?: ID): Promise<Result> {
      for (const id of orderIds) {
        const o = order(id);
        if (!o) continue;
        const who = memberId ?? pickAgent(getDb(), o, o.assignedTo ? [o.assignedTo] : []);
        if (!who) return { error: "Nobody is on duty to take it" };
        const { error } = await sb.from("orders").update({ assigned_to: who }).eq("id", id);
        if (error) return fail(error);
      }
      return {};
    },
    logAttempt: async (orderId: ID, by: ID, via: "call" | "whatsapp", outcome: AttemptOutcome, note?: string): Promise<Result> =>
      fail((await sb.from("order_contact_attempts").insert({ workspace_id: ws, order_id: orderId, by_user: by, via, outcome, ...(note ? { note } : {}) })).error),
    setOnDuty: async (memberId: ID, on: boolean): Promise<Result> => fail((await sb.rpc("set_on_duty", { p_workspace: ws, p_user: memberId, p_on: on })).error),
    async sendToPartner(deliveryId: ID, riderId?: ID): Promise<{ text: string; waUrl: string; link: string } | { error: string }> {
      const { data, error } = await sb.rpc("send_to_partner", { p_delivery: deliveryId, p_partner: riderId ?? null });
      if (error) return { error: error.message };
      const res = data as { token: string; phone: string; group: string | null };
      const db = getDb();
      const d = db.deliveries.find((x) => x.id === deliveryId)!;
      const text = partnerMessage(db, d, res.token, db.workspaces[0]?.currency ?? "NGN");
      const digits = res.phone.replace(/\D/g, "").replace(/^0/, "234");
      return { text, waUrl: res.group ? `https://wa.me/?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}?text=${encodeURIComponent(text)}`, link: deliveryLink(res.token) };
    },
    payCommission: async (memberId: ID): Promise<Result> => fail((await sb.rpc("pay_commission", { p_workspace: ws, p_user: memberId })).error),
    matchPayment: async (eventId: ID, orderId: ID): Promise<Result> => fail((await sb.rpc("match_payment", { p_event: eventId, p_order: orderId })).error),
    async sendBroadcast(id: ID): Promise<Result> {
      return fail((await sb.from("campaigns").update({ status: "scheduled", scheduled_for: new Date().toISOString() }).eq("id", id)).error);
    },
    async issueInvoice(orderId: ID): Promise<Result & { invoiceNo?: string }> {
      const o = order(orderId);
      if (!o) return { error: "Order not found" };
      if (o.invoiceNo) return { invoiceNo: o.invoiceNo };
      const invoiceNo = `INV-${o.reference.replace(/\D/g, "")}`;
      const { error } = await sb.from("orders").update({ invoice_no: invoiceNo }).eq("id", orderId);
      return error ? fail(error) : { invoiceNo };
    },
    async flagComplaint(conversationId: ID, reason: string): Promise<Result> {
      const c = getDb().conversations.find((x) => x.id === conversationId);
      if (!c) return { error: "Chat not found" };
      return fail((await sb.from("complaints").insert({ workspace_id: ws, conversation_id: conversationId, contact_id: c.contactId, reason })).error);
    },
    async resolveComplaint(conversationId: ID, resolution: string): Promise<Result> {
      return fail((await sb.from("complaints").update({ status: "resolved", resolution, resolved_at: new Date().toISOString() }).eq("conversation_id", conversationId).neq("status", "resolved")).error);
    },
    async saveFacts(contactId: ID, facts: { kind: string; value: string; monthDay?: string }[], source: "chat" | "staff"): Promise<Result> {
      if (!facts.length) return {};
      return fail((await sb.from("contact_facts").insert(facts.map((f) => ({ workspace_id: ws, contact_id: contactId, kind: f.kind, value: f.value, month_day: f.monthDay ?? null, source })))).error);
    },
    removeFact: async (_contactId: ID, factId: ID): Promise<Result> => fail((await sb.from("contact_facts").delete().eq("id", factId)).error),
    setLeadStage: async (leadId: ID, stage: string): Promise<Result> => fail((await sb.from("leads").update({ stage, last_activity_at: new Date().toISOString() }).eq("id", leadId)).error),
    assignOwner: async (contactId: ID, ownerId: ID): Promise<Result> => fail((await sb.from("leads").update({ assigned_to: ownerId }).eq("contact_id", contactId)).error),
    startLead: async (contactId: ID): Promise<Result> => fail((await sb.from("leads").insert({ workspace_id: ws, contact_id: contactId })).error),
    async addKnowledge(entries: { topic: string; question: string; answer: string; keywords: string[] }[]): Promise<Result> {
      const have = new Set(getDb().knowledge.map((k) => k.question.toLowerCase()));
      const fresh = entries.filter((e) => !have.has(e.question.toLowerCase()));
      if (!fresh.length) return {};
      return fail((await sb.from("knowledge_entries").insert(fresh.map((e) => ({ workspace_id: ws, ...e })))).error);
    },
  };
}

export type LiveWriter = ReturnType<typeof liveWriter>;
