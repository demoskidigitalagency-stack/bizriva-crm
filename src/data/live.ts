/**
 * Live data: reads one business's real records from Supabase and turns them
 * into the same Database shape the screens already use, so every screen
 * works on real data without being rewritten. Writes go through
 * src/data/live-actions.ts; the database applies the business rules
 * (supabase/migrations) and the screens reload what it decided.
 *
 * `toDatabase` is pure (tested in tests/live_map.test.ts); `fetchRaw` does
 * the reading, with row-level security limiting it to the signed-in team.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/domain/database";
import * as practice from "@/domain/practice-seed";
import { stateOf } from "@/domain/ops";
import type {
  AcquisitionSource, AttemptOutcome, BusinessSettings, Channel, Contact, Conversation, CustomerFact, DeliveryStatus, DeliverySummary, FollowUpRule,
  KnowledgeEntry, Lead, LeadStage, Lifecycle, MessageTemplate, OrderStatus, OrderSummary, PaymentMethod, PaymentStatus, PaymentSummary, Product,
  MediaAsset, ProductVariant, Rider, TeamMember, Activity, ActivityKind, LeadOutcome, Task, TaskStatus, TaskPriority,
} from "@/domain/types";
import { ORDER_STATUS_META } from "@/domain/types";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface RawData {
  workspace: Row;
  team: Row[];
  contacts: Row[]; leads: Row[]; conversations: Row[]; messages: Row[]; complaints: Row[]; consents: Row[]; facts: Row[]; accounts: Row[];
  products: Row[]; orders: Row[]; items: Row[]; attempts: Row[]; deliveries: Row[]; payments: Row[]; partners: Row[];
  templates: Row[]; knowledge: Row[]; rules: Row[]; forms: Row[]; connections: Row[]; events: Row[]; paymentEvents: Row[];
  campaigns: Row[]; campaignResults: Row[]; providers: Row[]; meta: Row[];
  tasks: Row[]; log: Row[]; variants: Row[]; media: Row[];
  /** Short-lived links to the media library's images (private storage). */
  mediaUrls?: Record<string, string>;
}

const TABLES: Record<Exclude<keyof RawData, "workspace" | "team" | "mediaUrls">, { table: string; order?: string; limit?: number }> = {
  contacts: { table: "contacts" }, leads: { table: "leads" }, conversations: { table: "conversations" },
  messages: { table: "messages", order: "created_at", limit: 5000 }, complaints: { table: "complaints" }, consents: { table: "consents", order: "recorded_at" },
  facts: { table: "contact_facts" }, accounts: { table: "customer_accounts" }, products: { table: "products" },
  orders: { table: "orders", order: "created_at", limit: 5000 }, items: { table: "order_items" }, attempts: { table: "order_contact_attempts", order: "at" },
  deliveries: { table: "deliveries" }, payments: { table: "payments" }, partners: { table: "logistics_partners" },
  templates: { table: "message_templates" }, knowledge: { table: "knowledge_entries" }, rules: { table: "followup_rules" },
  forms: { table: "order_forms" }, connections: { table: "connections" }, events: { table: "calendar_events" }, paymentEvents: { table: "payment_events", order: "received_at", limit: 1000 },
  campaigns: { table: "campaigns" }, campaignResults: { table: "campaign_results" }, providers: { table: "payment_providers" }, meta: { table: "meta_links" },
  tasks: { table: "tasks", order: "due_at", limit: 2000 }, log: { table: "activity_log", order: "created_at", limit: 2000 },
  variants: { table: "product_variants" }, media: { table: "media_assets", order: "created_at", limit: 2000 },
};

/** Read everything for one business. Throws with a plain message if the database refuses. */
export async function fetchRaw(sb: SupabaseClient, workspaceId: string): Promise<RawData> {
  const ws = await sb.from("workspaces").select("*").eq("id", workspaceId).single();
  if (ws.error) throw new Error(ws.error.message);
  const team = await sb.rpc("workspace_team", { p_workspace: workspaceId });
  if (team.error) throw new Error(team.error.message);
  const entries = await Promise.all(Object.entries(TABLES).map(async ([key, t]) => {
    let q = sb.from(t.table).select("*").eq("workspace_id", workspaceId);
    if (t.order) q = q.order(t.order, { ascending: false });
    if (t.limit) q = q.limit(t.limit);
    const r = await q;
    if (r.error) throw new Error(`${t.table}: ${r.error.message}`);
    return [key, r.data ?? []] as const;
  }));
  const raw = { workspace: ws.data, team: team.data ?? [], ...Object.fromEntries(entries) } as RawData;
  const paths = (raw.media ?? []).filter((m) => m["kind"] === "image" && m["storage_path"]).map((m) => String(m["storage_path"]));
  if (paths.length) {
    const s = await sb.storage.from("chat-media").createSignedUrls(paths, 3600);
    raw.mediaUrls = Object.fromEntries((s.data ?? []).filter((x) => x.signedUrl && x.path).map((x) => [x.path!, x.signedUrl]));
  }
  return raw;
}

/* ───────────────────────── mapping ───────────────────────── */

const ROLE: Record<string, TeamMember["role"]> = { owner: "owner", manager: "manager", sales: "sales_rep", support: "support", dispatcher: "fulfilment", finance: "finance" };
export const DB_ROLE: Record<TeamMember["role"], string> = { owner: "owner", manager: "manager", sales_rep: "sales", support: "support", fulfilment: "dispatcher", finance: "finance" };
const COLORS = ["brand", "info", "success", "purple", "warning"];
const CHANNEL: Record<string, Channel> = { messenger: "facebook" };
export const DB_CHANNEL = (c: Channel) => (c === "facebook" ? "messenger" : c);
export const METHOD_FROM_DB: Record<string, PaymentMethod> = { cod: "cash_on_delivery", deposit: "cash_on_delivery", part_payment: "cash_on_delivery", online: "card", payment_link: "bank_transfer" };
export const METHOD_TO_DB: Record<PaymentMethod, string> = { cash_on_delivery: "cod", bank_transfer: "payment_link", card: "online", wallet: "online", ussd: "online" };
const PAY_METHOD: Record<string, PaymentMethod> = { cash: "cash_on_delivery", bank_transfer: "bank_transfer", transfer: "bank_transfer", card: "card", ussd: "ussd", wallet: "wallet" };
const hhmm = (t?: string | null, d = "21:00") => (t ? String(t).slice(0, 5) : d);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const iso = (v: unknown, d = new Date(0).toISOString()) => (v ? new Date(String(v)).toISOString() : d);

function splitName(name?: string | null): [string, string] {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return ["Customer", ""];
  return [parts[0]!, parts.slice(1).join(" ")];
}

export function liveSettings(w: Row, providers: Row[], meta: Row[]): BusinessSettings {
  const base = practice.settings;
  const s = (w["settings"] ?? {}) as Partial<BusinessSettings>;
  const a = (w["assignment"] ?? {}) as Row;
  const e = (w["email_settings"] ?? {}) as Row;
  const prov = providers[0];
  const m = meta[0];
  return {
    ...base,
    whatsappNumber: "", setupDone: [], storeSlug: String(w["name"] ?? "store").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    ...s,
    businessName: String(w["name"] ?? ""),
    ...(w["webchat_key"] ? { webchatKey: String(w["webchat_key"]) } : {}),
    billing: (() => {
      const t = w["trial_ends_at"] ? String(w["trial_ends_at"]) : undefined, r = w["plan_renews_at"] ? String(w["plan_renews_at"]) : undefined, now = Date.now();
      const active = !w["suspended_at"] && (String(w["plan"] ?? "trial") === "trial" ? !t || Date.parse(t) > now : !r || Date.parse(r) + 3 * 86_400_000 > now);
      return { ...(t ? { trialEndsAt: t } : {}), ...(r ? { renewsAt: r } : {}), ...(w["suspended_at"] ? { suspended: String(w["suspended_reason"] ?? "Suspended") } : {}), active };
    })(),
    sms: (() => { const x = (w["sms_settings"] ?? {}) as Row; return { provider: x["provider"] === "termii" ? "termii" as const : "none" as const, ...(x["sender"] ? { sender: String(x["sender"]) } : {}), fallback: x["fallback"] !== false, ...(x["base_url"] ? { baseUrl: String(x["base_url"]) } : {}), ...(x["last_error"] ? { lastError: String(x["last_error"]) } : {}), ...(x["last_sent_at"] ? { lastSentAt: String(x["last_sent_at"]) } : {}) }; })(),
    timezone: String(w["timezone"] ?? "Africa/Lagos"),
    plan: (["trial", "starter", "growth", "scale"].includes(String(w["plan"])) ? w["plan"] : "trial") as BusinessSettings["plan"],
    brief: { time: hhmm(w["brief_time"], "07:00"), channels: (w["brief_channels"] ?? ["app"]) as BusinessSettings["brief"]["channels"] },
    afterDelivery: { receipt: (w["after_delivery"]?.receipt ?? true) as boolean, careGuide: (w["after_delivery"]?.careGuide ?? true) as boolean },
    assignment: { mode: (a["mode"] ?? "least_busy") as BusinessSettings["assignment"]["mode"], callWithinMinutes: num(a["call_within_minutes"] ?? 120), moveUncalled: a["move_uncalled"] !== false, ...(a["last_assigned"] ? { lastAssigned: String(a["last_assigned"]) } : {}) },
    commission: { perOrder: num(w["commission_per_order"]) },
    partnerAcceptMinutes: num(w["partner_accept_minutes"] ?? 60),
    email: { provider: (e["provider"] ?? "none") as BusinessSettings["email"]["provider"], fromName: String(s.email?.fromName ?? w["name"] ?? ""), fromEmail: String(e["from"] ?? "") },
    meta: m
      ? { status: "connected", adAccount: { id: String(m["ad_account_id"]), name: String(m["ad_account_name"] ?? m["ad_account_id"]) }, ...(m["pixel_id"] ? { pixel: { id: String(m["pixel_id"]), name: "Pixel" } } : {}), ...(m["connected_at"] ? { connectedAt: iso(m["connected_at"]) } : {}), ...(m["last_sync_at"] ? { lastSyncAt: iso(m["last_sync_at"]) } : {}), capi: { enabled: !!m["capi_enabled"], when: m["capi_when"] === "confirmed" ? "confirmed" : "delivered" } }
      : { status: "not_connected", capi: { enabled: false, when: "delivered" } },
    payments: prov
      ? { ...base.payments, provider: prov["provider"], status: "connected", ...(prov["connected_at"] ? { connectedAt: iso(prov["connected_at"]) } : {}), autoReceipt: prov["auto_receipt"] !== false, autoConfirm: prov["auto_confirm"] !== false, settlement: [], splits: [] }
      : { status: "not_connected", methods: base.payments.methods, autoReceipt: true, autoConfirm: true, settlement: [], splits: [] },
  };
}

function deliveryStatus(d: Row, o: Row | undefined): DeliveryStatus {
  if (d["outcome"] === "delivered") return "delivered";
  if (d["outcome"] === "returned") return "returned";
  if (d["outcome"] === "failed" || d["outcome"] === "refused") return "failed";
  if (o && ["dispatched", "in_transit"].includes(o["status"])) return "in_transit";
  if (d["sent_at"]) return "scheduled";
  return "not_scheduled";
}

function paymentStatus(o: Row): PaymentStatus {
  const paid = num(o["amount_paid"]); const total = num(o["total"]);
  if (total > 0 && paid >= total) return "paid";
  if (paid > 0) return "part_paid";
  return o["payment_method"] === "cod" ? "cod_pending" : "unpaid";
}

/** Turn the raw rows into the app's Database. `now` drives "last 30 days" figures. */
export function toDatabase(raw: RawData, now = new Date()): Database {
  const w = raw.workspace;
  const owner = raw.team.find((t) => t["role"] === "owner")?.["user_id"] ?? raw.team[0]?.["user_id"] ?? "";
  const team: TeamMember[] = raw.team.map((t, i) => ({
    id: t["user_id"], name: t["full_name"] ?? t["email"], email: t["email"] ?? "", role: ROLE[t["role"]] ?? "support", avatarColor: COLORS[i % COLORS.length]!, active: true,
    onDuty: t["on_duty"] !== false, states: t["states"] ?? [], monthlyTarget: num(t["monthly_target"]),
  }));
  const productById = new Map(raw.products.map((p) => [p["id"], p]));
  const contactById = new Map(raw.contacts.map((c) => [c["id"], c]));
  const itemsByOrder = new Map<string, Row[]>();
  raw.items.forEach((i) => itemsByOrder.set(i["order_id"], [...(itemsByOrder.get(i["order_id"]) ?? []), i]));
  const attemptsByOrder = new Map<string, Row[]>();
  [...raw.attempts].sort((a, b) => String(a["at"]).localeCompare(String(b["at"]))).forEach((a) => attemptsByOrder.set(a["order_id"], [...(attemptsByOrder.get(a["order_id"]) ?? []), a]));
  const convChannel = new Map(raw.conversations.map((c) => [c["id"], c["channel"]]));
  const contactLog = (raw.log ?? []).filter((a) => a["entity"] === "contact" && a["entity_id"]);
  const notesByContact = new Map<string, number>();
  contactLog.filter((a) => a["action"] === "note").forEach((a) => notesByContact.set(a["entity_id"], (notesByContact.get(a["entity_id"]) ?? 0) + 1));

  const orders: OrderSummary[] = raw.orders.map((o) => {
    const items = itemsByOrder.get(o["id"]) ?? [];
    const attempts = attemptsByOrder.get(o["id"]) ?? [];
    return {
      id: o["id"], reference: o["ref"], contactId: o["contact_id"], placedAt: iso(o["created_at"]), status: o["status"] as OrderStatus,
      itemsCount: items.reduce((n, i) => n + num(i["quantity"]), 0) || 1, total: num(o["total"]),
      cogs: items.reduce((n, i) => n + num(i["quantity"]) * num(productById.get(i["product_id"])?.["cost"]), 0),
      shippingFee: num(o["delivery_fee"]), paymentStatus: paymentStatus(o), paymentMethod: METHOD_FROM_DB[o["payment_method"]] ?? "cash_on_delivery",
      channel: (CHANNEL[o["channel"] ?? convChannel.get(o["conversation_id"])] ?? o["channel"] ?? "whatsapp") as Channel,
      ...(items.length ? { lines: items.map((i) => ({ productId: i["product_id"], ...(i["variant_id"] ? { variantId: i["variant_id"] } : {}), quantity: num(i["quantity"]), unitPrice: num(i["unit_price"]) })) } : {}),
      ...(o["delivery_address"] ? { address: o["delivery_address"] } : {}),
      productNames: items.length ? items.map((i) => `${i["quantity"]}× ${productById.get(i["product_id"])?.["name"] ?? "Item"}${i["variant_id"] ? ` (${(raw.variants ?? []).find((v) => v["id"] === i["variant_id"])?.["name"] ?? "option"})` : ""}`) : [String(o["notes"] ?? "Order").split("\n")[0]!.slice(0, 60)],
      ...(num(o["amount_paid"]) ? { amountPaid: num(o["amount_paid"]) } : {}),
      ...(o["risk_level"] ? { serverRisk: { score: num(o["risk_score"]), level: o["risk_level"], reasons: o["risk_reasons"] ?? [] } } : {}),
      ...(o["invoice_no"] ? { invoiceNo: o["invoice_no"] } : {}), ...(o["form_id"] ? { formId: o["form_id"] } : {}),
      ...(o["assigned_to"] ? { assignedTo: o["assigned_to"], assignedAt: iso(o["assigned_at"] ?? o["created_at"]) } : {}),
      ...(o["moved_from"]?.length ? { movedFrom: o["moved_from"] } : {}),
      ...(attempts.length ? { contactAttempts: attempts.map((a) => ({ at: iso(a["at"]), by: a["by_user"] ?? "", via: a["via"], outcome: a["outcome"] as AttemptOutcome, ...(a["note"] ? { note: a["note"] } : {}) })) } : {}),
      ...(o["commission_paid_at"] ? { commissionPaidAt: iso(o["commission_paid_at"]) } : {}),
    };
  });
  const ordersByContact = new Map<string, OrderSummary[]>();
  orders.forEach((o) => ordersByContact.set(o.contactId, [...(ordersByContact.get(o.contactId) ?? []), o]));
  const leadByContact = new Map<string, Row>();
  [...raw.leads].sort((a, b) => String(a["created_at"]).localeCompare(String(b["created_at"]))).forEach((l) => leadByContact.set(l["contact_id"], l));

  const msgsByConv = new Map<string, Row[]>();
  [...raw.messages].sort((a, b) => String(a["created_at"]).localeCompare(String(b["created_at"]))).forEach((m) => msgsByConv.set(m["conversation_id"], [...(msgsByConv.get(m["conversation_id"]) ?? []), m]));
  const lastMsgByContact = new Map<string, string>();
  raw.conversations.forEach((c) => { const last = msgsByConv.get(c["id"])?.at(-1); if (last) { const prev = lastMsgByContact.get(c["contact_id"]); if (!prev || prev < last["created_at"]) lastMsgByContact.set(c["contact_id"], last["created_at"]); } });

  const contacts: Contact[] = raw.contacts.map((c) => {
    const [firstName, lastName] = splitName(c["name"]);
    const mine = ordersByContact.get(c["id"]) ?? [];
    const live = mine.filter((o) => o.status !== "cancelled");
    const delivered = mine.filter((o) => o.status === "delivered");
    const lead = leadByContact.get(c["id"]);
    const consent = raw.consents.filter((x) => x["contact_id"] === c["id"] && x["category"] === "marketing").sort((a, b) => String(b["recorded_at"]).localeCompare(String(a["recorded_at"])))[0];
    const lifecycle: Lifecycle = delivered.length >= 2 ? "repeat_customer" : delivered.length === 1 ? "customer" : lead ? "lead" : "contact";
    const source: AcquisitionSource = lead?.["ad_campaign_id"] || lead?.["ad_name"] ? "meta_ads" : lead?.["source_channel"] === "webchat" ? "website" : lead?.["source_channel"] === "instagram" ? "instagram_organic" : lead?.["source_channel"] === "tiktok" ? "tiktok_ads" : "walk_in";
    const facts: CustomerFact[] = raw.facts.filter((f) => f["contact_id"] === c["id"]).map((f) => ({ id: f["id"], kind: f["kind"], value: f["value"], ...(f["month_day"] ? { monthDay: f["month_day"] } : {}), source: f["source"] === "chat" ? "chat" : "staff", at: iso(f["created_at"]) }));
    const acct = raw.accounts.find((a) => a["contact_id"] === c["id"]);
    const last = [c["updated_at"], lastMsgByContact.get(c["id"]), ...mine.map((o) => o.placedAt)].filter(Boolean).sort().at(-1);
    return {
      id: c["id"], firstName, lastName, phone: c["phone"] ?? "", ...(c["email"] ? { email: c["email"] } : {}), countryCode: "NG", city: c["location"] ?? "",
      lifecycle, source, ownerId: lead?.["assigned_to"] ?? owner, leadScore: num(lead?.["score"]), tags: c["tags"] ?? [], createdAt: iso(c["created_at"]), lastActivityAt: iso(last),
      totalOrders: live.length, lifetimeValue: live.reduce((n, o) => n + o.total, 0), deliveredRevenue: delivered.reduce((n, o) => n + o.total, 0),
      contributionProfit: delivered.reduce((n, o) => n + o.total - o.cogs - o.shippingFee, 0),
      outstandingBalance: live.filter((o) => o.status !== "delivered").reduce((n, o) => n + Math.max(0, o.total - (o.amountPaid ?? 0)), 0),
      ...(delivered.length ? { lastPurchaseAt: delivered.map((o) => o.placedAt).sort().at(-1)! } : {}),
      consentMarketing: consent ? !!consent["granted"] : false, notesCount: notesByContact.get(c["id"]) ?? 0,
      ...(c["address"] ? { address: c["address"] } : {}), ...(c["landmark"] ? { landmark: c["landmark"] } : {}),
      ...(facts.length ? { facts } : {}),
      ...(acct ? { virtualAccount: { bank: acct["bank_name"], number: acct["account_number"], name: acct["account_name"], provider: acct["provider"] } } : {}),
    };
  });

  const leads: Lead[] = raw.leads.map((l) => ({
    id: l["id"], contactId: l["contact_id"], stage: l["stage"] as LeadStage, source: (l["ad_campaign_id"] || l["ad_name"] ? "meta_ads" : l["source_channel"] === "webchat" ? "website" : "walk_in") as AcquisitionSource,
    ...(l["ad_campaign_name"] ? { campaign: l["ad_campaign_name"] } : {}), ownerId: l["assigned_to"] ?? owner, score: num(l["score"]),
    value: (ordersByContact.get(l["contact_id"]) ?? []).filter((o) => !["cancelled", "delivered"].includes(o.status)).reduce((n, o) => n + o.total, 0),
    slaStatus: l["stage"] === "converted" ? "met" : "on_track", createdAt: iso(l["created_at"]), updatedAt: iso(l["last_activity_at"] ?? l["created_at"]),
    ...(l["outcome"] ? { outcome: l["outcome"] as LeadOutcome } : {}),
  }));

  const conversations: Conversation[] = raw.conversations.map((c) => {
    const msgs = msgsByConv.get(c["id"]) ?? [];
    const last = msgs.at(-1);
    const cp = raw.complaints.filter((x) => x["conversation_id"] === c["id"]).sort((a, b) => String(b["opened_at"]).localeCompare(String(a["opened_at"])))[0];
    return {
      id: c["id"], contactId: c["contact_id"], channel: (CHANNEL[c["channel"]] ?? c["channel"]) as Channel, subject: c["summary"] ?? (msgs[0]?.["body"] ?? "").slice(0, 48),
      unread: last?.["direction"] === "in" && c["status"] !== "closed", awaitingReply: last?.["direction"] === "in", assigneeId: c["assigned_to"] ?? "",
      lastMessageAt: iso(last?.["created_at"] ?? c["last_inbound_at"] ?? c["created_at"]),
      messages: msgs.map((m) => ({ id: m["id"], conversationId: c["id"], direction: m["direction"], body: m["body"] ?? (m["template_name"] ? `[Template: ${m["template_name"]}]` : "[Media]"), at: iso(m["created_at"]), ...(m["sent_by"] ? { authorId: m["sent_by"] } : {}), ...(m["direction"] === "out" && m["status"] ? { delivery: m["status"] } : {}), ...(m["error"] ? { error: m["error"] } : {}), ...(m["by_ai"] ? { byAi: true } : {}),
        ...(m["media_kind"] ? { media: { kind: m["media_kind"], ...(m["media_path"] ? { path: m["media_path"] } : {}), ...(m["media_name"] ? { name: m["media_name"] } : {}), ...(m["media_error"] ? { error: m["media_error"] } : {}) } } : {}) })),
      ai: { handledBy: c["handled_by"] === "human" ? "human" : "ai", ...(c["ai_error"] ? { error: c["ai_error"] } : {}), ...(c["priority"] ? { priority: true } : {}) },
      ...(cp ? { complaint: { status: cp["status"] === "resolved" ? "resolved" : "open", reason: cp["reason"], openedAt: iso(cp["opened_at"]), ...(cp["resolved_at"] ? { resolvedAt: iso(cp["resolved_at"]) } : {}), ...(cp["resolution"] ? { resolution: cp["resolution"] } : {}) } } : {}),
    } as Conversation;
  });

  const variantsBy = new Map<string, ProductVariant[]>();
  for (const v of [...(raw.variants ?? [])].sort((a, b) => String(a["name"]).localeCompare(String(b["name"])))) {
    const list = variantsBy.get(v["product_id"]) ?? [];
    list.push({ id: v["id"], name: v["name"], price: num(v["price"]), stock: num(v["stock"]) });
    variantsBy.set(v["product_id"], list);
  }
  const products: Product[] = raw.products.map((p) => ({
    id: p["id"], name: p["name"], category: p["category"] ?? "General", price: num(p["promo_price"] ?? p["price"]), cost: num(p["cost"]), stock: num(p["stock"]), reorderLevel: num(p["reorder_level"]),
    ...(p["description"] ? { description: p["description"] } : {}), active: p["active"] !== false, ...(num(p["deposit"]) ? { deposit: num(p["deposit"]) } : {}),
    ...(p["care_guide"] ? { careGuide: p["care_guide"] } : {}), ...(p["reorder_days"] ? { reorderDays: num(p["reorder_days"]) } : {}),
    ...(variantsBy.get(p["id"])?.length ? { variants: variantsBy.get(p["id"])! } : {}),
  }));
  const media: MediaAsset[] = (raw.media ?? []).map((m) => ({
    id: m["id"], name: m["name"] ?? String(m["storage_path"] ?? "").split("/").pop() ?? "file", kind: m["kind"] === "video" ? "video" : "image", bytes: num(m["bytes"]),
    ...(m["product_id"] ? { productId: m["product_id"] } : {}), ...(raw.mediaUrls?.[m["storage_path"]] ? { url: raw.mediaUrls[m["storage_path"]] } : {}),
    path: m["storage_path"], addedAt: iso(m["created_at"]),
  }));

  const orderById = new Map(raw.orders.map((o) => [o["id"], o]));
  const partnerById = new Map(raw.partners.map((p) => [p["id"], p]));
  const deliveries: DeliverySummary[] = raw.deliveries.map((d) => {
    const o = orderById.get(d["order_id"]);
    const c = contactById.get(o?.["contact_id"]);
    return {
      id: d["id"], orderId: d["order_id"], contactId: o?.["contact_id"] ?? "", courier: partnerById.get(d["partner_id"])?.["name"] ?? "Not sent yet", trackingRef: o?.["ref"] ?? "",
      status: deliveryStatus(d, o), scheduledFor: iso(d["sent_at"] ?? d["dispatched_at"] ?? o?.["created_at"]), ...(d["delivered_at"] ? { deliveredAt: iso(d["delivered_at"]) } : {}),
      attempts: num(d["attempts"]), city: c?.["location"] ?? "", ...(d["failure_reason"] ? { failureReason: d["failure_reason"] } : {}),
      ...(d["partner_id"] ? { riderId: d["partner_id"] } : {}), ...(d["sent_at"] ? { sentAt: iso(d["sent_at"]) } : {}), ...(d["accepted_at"] ? { acceptedAt: iso(d["accepted_at"]) } : {}),
      ...(d["fee"] !== null && d["fee"] !== undefined ? { fee: num(d["fee"]) } : {}), ...(d["cash_collected"] !== null && d["cash_collected"] !== undefined ? { cashCollected: num(d["cash_collected"]) } : {}),
    };
  });

  const payments: PaymentSummary[] = raw.payments.map((p) => {
    const method = PAY_METHOD[p["method"]] ?? "bank_transfer";
    const at = iso(p["paid_at"]);
    return {
      id: p["id"], orderId: p["order_id"], contactId: p["contact_id"], amount: p["kind"] === "refund" ? -num(p["amount"]) : num(p["amount"]), method,
      status: p["kind"] === "refund" ? "refunded" : "paid", at,
      ...(method === "cash_on_delivery" ? { remittanceDueAt: new Date(new Date(at).getTime() + 2 * 86_400_000).toISOString(), remitted: !!p["remitted_at"] } : { remitted: true }),
    };
  });

  const riders: Rider[] = raw.partners.map((p) => ({
    id: p["id"], name: p["name"], phone: p["phone"], zone: p["zone"] ?? (p["states"] ?? []).join(", "), vehicle: (p["vehicle"] ?? "bike") as Rider["vehicle"], active: p["active"] !== false,
    kind: p["kind"] === "partner" ? "partner" : "rider", states: p["states"] ?? [], fees: Object.fromEntries(Object.entries(p["fees"] ?? {}).map(([k, v]) => [k, num(v)])), failedFee: num(p["failed_fee"]),
    ...(p["whatsapp_group"] ? { whatsappGroup: p["whatsapp_group"] } : {}),
  }));

  const templates: MessageTemplate[] = raw.templates.map((t) => ({ id: t["id"], name: t["name"], category: t["category"] ?? "utility", language: t["language"] ?? "en", ...(t["purpose"] ? { purpose: t["purpose"] } : {}), body: t["body"], status: t["status"] ?? "draft", ...(t["rejected_reason"] ? { rejectedReason: t["rejected_reason"] } : {}), updatedAt: iso(t["updated_at"]) }));
  const knowledge: KnowledgeEntry[] = raw.knowledge.map((k) => ({ id: k["id"], topic: k["topic"], question: k["question"] ?? "", answer: k["answer"], keywords: k["keywords"] ?? [], updatedAt: iso(k["updated_at"]) }));
  const followUpRules: FollowUpRule[] = raw.rules.map((r) => {
    const tpl = raw.templates.find((t) => t["name"] === r["template_name"]);
    return { id: r["id"], name: r["name"], trigger: r["trigger"] ?? "no_reply_after_details", delayHours: num(r["delay_hours"]), maxAttempts: num(r["max_attempts"] ?? 1), ...(tpl ? { templateId: tpl["id"] } : {}), message: r["message"] ?? "", quietStart: hhmm(r["quiet_start"], "21:00"), quietEnd: hhmm(r["quiet_end"], "08:00"), enabled: r["enabled"] !== false };
  });

  const resultsById = new Map(raw.campaignResults.map((r) => [r["campaign_id"], r]));
  const consenting = contacts.filter((c) => c.consentMarketing).length;

  // Revenue chart: last 30 days from real orders.
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const revenueTrend = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now.getTime() - (29 - i) * 86_400_000);
    const todays = orders.filter((o) => o.placedAt.slice(0, 10) === day(d) && o.status !== "cancelled");
    const del = todays.filter((o) => o.status === "delivered");
    return { date: day(d), revenue: todays.reduce((n, o) => n + o.total, 0), deliveredRevenue: del.reduce((n, o) => n + o.total, 0), profit: del.reduce((n, o) => n + o.total - o.cogs - o.shippingFee, 0), adSpend: 0 };
  }) as Database["revenueTrend"];

  const LOG_TITLE: Record<string, string> = { note: "Note added", call: "Call logged", merged: "Merged duplicate records" };
  const activities: Activity[] = contactLog.filter((a) => LOG_TITLE[a["action"]]).map((a) => ({
    id: a["id"], contactId: a["entity_id"], kind: (a["action"] === "note" ? "note" : "system") as ActivityKind, title: LOG_TITLE[a["action"]]!, at: iso(a["created_at"]),
    ...(a["actor"] ? { actorId: a["actor"] } : {}),
    ...(a["detail"]?.["text"] ? { description: String(a["detail"]["text"]) } : a["action"] === "merged" && Array.isArray(a["detail"]?.["names"]) ? { description: a["detail"]["names"].join(", ") } : {}),
  }));
  // Order history: what the server logged for each order (placed, status changes, edits, cancellations, moves).
  const orderRef = new Map(raw.orders.map((o) => [o["id"], o]));
  const memberName = (id?: string) => team.find((m) => m.id === id)?.name;
  for (const a of (raw.log ?? []).filter((x) => x["entity"] === "order" && orderRef.has(x["entity_id"]))) {
    const o = orderRef.get(a["entity_id"])!;
    const ref = String(o["ref"]); const act = String(a["action"]); const d = a["detail"] ?? {};
    const title = act === "created" ? `Order ${ref} placed`
      : act.startsWith("status:") ? `Order ${ref}: ${ORDER_STATUS_META[act.slice(7) as OrderStatus]?.label ?? act.slice(7).replace(/_/g, " ")}`
      : act === "ai_checkout" ? `Order ${ref} placed in the chat by the AI assistant`
      : act === "moved_uncalled" ? `Order ${ref} moved to another agent — not called in time`
      : act === "edited" ? `Order ${ref} changed${d["before"]?.["total"] !== undefined ? ` (total was ${Number(d["before"]["total"]).toLocaleString("en-NG")})` : ""}`
      : act === "cancel_reason" ? `Order ${ref} cancelled: ${d["reason"] ?? ""}`
      : null;
    if (!title) continue;
    const who = memberName(a["actor"]);
    activities.push({ id: a["id"], contactId: o["contact_id"], kind: "system" as ActivityKind, title: who ? `${title} — ${who}` : title, at: iso(a["created_at"]), ...(a["actor"] ? { actorId: a["actor"] } : {}) });
  }
  activities.sort((x, y) => (x.at < y.at ? 1 : -1));
  const tasks: Task[] = (raw.tasks ?? []).map((t) => ({
    id: t["id"], ...(t["contact_id"] ? { contactId: t["contact_id"] } : {}), title: t["title"], dueAt: iso(t["due_at"]), status: t["status"] as TaskStatus,
    priority: t["priority"] as TaskPriority, assigneeId: t["assigned_to"] ?? owner, type: t["type"] as Task["type"], createdAt: iso(t["created_at"]),
  }));

  return {
    workspaces: [{ id: w["id"], name: w["name"], handle: String(w["name"]).toLowerCase().replace(/[^a-z0-9]+/g, "-"), industry: "", currency: w["currency"] ?? "NGN", country: "NG", plan: w["plan"] ?? "trial" }],
    team, contacts, channelIdentities: [], attributions: [], leads, opportunities: [], activities, tasks, conversations, productInterests: [],
    segments: [{ id: "all", name: "Everyone who agreed to marketing", description: "Customers with marketing consent", type: "smart", memberCount: consenting, updatedAt: now.toISOString(), rulesSummary: "Marketing consent = yes" }],
    orders, deliveries, payments, products, campaigns: [], notifications: [], revenueTrend, riders, knowledge, templates, followUpRules,
    broadcasts: raw.campaigns.map((c) => {
      const r = resultsById.get(c["id"]);
      return {
        id: c["id"], name: c["name"], segmentId: "all", templateId: raw.templates.find((t) => t["name"] === c["template_name"])?.["id"] ?? "", status: (c["status"] === "sending" ? "scheduled" : c["status"]) as "draft" | "scheduled" | "sent",
        ...(c["scheduled_for"] ? { scheduledFor: iso(c["scheduled_for"]) } : {}), ...(c["sent_at"] ? { sentAt: iso(c["sent_at"]) } : {}),
        recipients: num(r?.["recipients"]), skippedNoConsent: 0, channel: c["channel"], ...(c["subject"] ? { subject: c["subject"] } : {}), ...(c["body"] ? { body: c["body"] } : {}),
        ...(r ? { stats: { delivered: num(r["delivered"]), opened: num(r["opened"]), clicked: num(r["clicked"]), orders: num(r["orders"]), revenue: num(r["delivered_revenue"]) } } : {}),
      };
    }),
    workflows: [], workflowRuns: [], media, stockMovements: [],
    integrations: practice.integrations.map((i) => ({ ...i, status: "not_connected" as const })) as Database["integrations"],
    agent: { ...practice.agent, ...((w["settings"]?.["agent"] ?? {}) as Partial<typeof practice.agent>) }, settings: liveSettings(w, raw.providers, raw.meta),
    orderForms: raw.forms.map((f) => ({ id: f["id"], name: f["name"], productId: f["product_id"], headline: f["headline"], ...(f["banner"] ? { banner: f["banner"] } : {}), packages: f["packages"] ?? [], fields: f["fields"] ?? ["name", "phone", "address", "city"], payOnDelivery: f["pay_on_delivery"] !== false, pixels: { meta: !!f["meta_pixel"], tiktok: !!f["tiktok_pixel"] }, thankYou: f["thank_you"] ?? "Thank you!", active: f["active"] !== false, createdAt: iso(f["created_at"]), stats: { views: 0, starts: 0, submits: 0, duplicatesBlocked: 0, dropOff: {} } })),
    formSubmissions: [],
    events: raw.events.map((e) => ({ id: e["id"], title: e["title"], kind: e["kind"], at: iso(e["starts_at"]), ...(e["contact_id"] ? { contactId: e["contact_id"] } : {}), ...(e["order_id"] ? { orderId: e["order_id"] } : {}), ...(e["note"] ? { note: e["note"] } : {}) })),
    connections: raw.connections.map((c) => ({ id: c["id"], platform: c["platform"], name: c["name"], secret: "", fieldMap: c["field_map"] ?? {}, createAs: c["create_as"] === "lead" ? "lead" : "order", active: c["active"] !== false, createdAt: iso(c["created_at"]), ...(c["last_event_at"] ? { lastEventAt: iso(c["last_event_at"]) } : {}) })),
    connectionEvents: [], adDrafts: [], capiEvents: [], paymentRequests: [],
    paymentEvents: raw.paymentEvents.map((p) => ({ id: p["id"], at: iso(p["received_at"]), provider: p["provider"], method: p["method"], amount: num(p["amount"]), payerName: p["payer_name"] ?? "", reference: p["provider_ref"], paidInto: p["paid_into"] ?? "", ...(p["contact_id"] ? { contactId: p["contact_id"] } : {}), ...(p["order_id"] ? { orderId: p["order_id"] } : {}), status: p["status"], settledTo: (p["settled_to"] ?? []).map((s: Row) => ({ label: s["label"], amount: num(s["amount"]) })), ...(p["receipt_no"] ? { receiptNo: p["receipt_no"] } : {}) })),
  } as Database;
}

/** The state an order's customer is in (for the server's by-state sharing). */
export const liveStateOf = (city?: string) => stateOf(city);
