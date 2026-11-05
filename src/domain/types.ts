/**
 * Bizriva CRM domain model.
 *
 * These types are the contract between screens and the data layer. Swapping the
 * in-memory adapter for a real backend must not require changing these types.
 *
 * Identity rule: one Contact per person across all channels. A Lead is a
 * lifecycle *state + pursuit record* attached to a Contact, never a second
 * person record.
 */

import type { CurrencyCode } from "@/lib/format";

export type ID = string;

export type Lifecycle =
  | "contact"
  | "prospect"
  | "lead"
  | "customer"
  | "repeat_customer"
  | "vip"
  | "at_risk"
  | "dormant"
  | "reactivated";

export type Channel =
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "email"
  | "sms"
  | "phone"
  | "webchat";

export type AcquisitionSource =
  | "meta_ads"
  | "tiktok_ads"
  | "google_ads"
  | "instagram_organic"
  | "whatsapp_status"
  | "referral"
  | "marketplace"
  | "website"
  | "walk_in"
  | "import";

export type LeadStage =
  | "new_lead"
  | "first_contact"
  | "engaged"
  | "qualified"
  | "high_intent"
  | "negotiating"
  | "checkout_started"
  | "order_created"
  | "order_confirmed"
  | "follow_up_required"
  | "unresponsive"
  | "lost"
  | "converted";

export type LeadOutcome =
  | "no_response"
  | "follow_up"
  | "nurture"
  | "lost"
  | "disqualified";

export type SlaStatus = "on_track" | "due_soon" | "breached" | "met";

export type OrderStatus =
  | "pending_verification"
  | "confirmed"
  | "processing"
  | "ready_for_dispatch"
  | "dispatched"
  | "in_transit"
  | "delivered"
  | "cancelled"
  | "refused"
  | "returned";

export type DeliveryStatus =
  | "not_scheduled"
  | "scheduled"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "failed"
  | "returned";

export type PaymentStatus = "unpaid" | "part_paid" | "paid" | "refunded" | "cod_pending";

export type PaymentMethod = "cash_on_delivery" | "bank_transfer" | "card" | "wallet" | "ussd";

export type ActivityKind =
  | "acquisition"
  | "conversation"
  | "lead"
  | "order"
  | "delivery"
  | "payment"
  | "task"
  | "note"
  | "marketing"
  | "system";

export type TaskStatus = "open" | "done" | "snoozed" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface Workspace {
  id: ID;
  name: string;
  handle: string;
  industry: string;
  currency: CurrencyCode;
  country: string;
  plan: string;
}

export interface TeamMember {
  id: ID;
  name: string;
  email: string;
  role: "owner" | "manager" | "sales_rep" | "support" | "fulfilment" | "finance";
  avatarColor: string;
  active: boolean;
}

export interface ChannelIdentity {
  id: ID;
  contactId: ID;
  channel: Channel;
  handle: string;
  verified: boolean;
  primary: boolean;
  lastSeenAt: string;
}

export interface AcquisitionAttribution {
  id: ID;
  contactId: ID;
  source: AcquisitionSource;
  campaign?: string;
  adSet?: string;
  creative?: string;
  landedAt: string;
  firstTouchChannel: Channel;
}

export interface Contact {
  id: ID;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  countryCode: string;
  city: string;
  lifecycle: Lifecycle;
  source: AcquisitionSource;
  ownerId: ID;
  leadScore: number;
  tags: string[];
  createdAt: string;
  lastActivityAt: string;
  totalOrders: number;
  lifetimeValue: number;
  deliveredRevenue: number;
  contributionProfit: number;
  outstandingBalance: number;
  lastPurchaseAt?: string;
  consentMarketing: boolean;
  notesCount: number;
  /** Saved delivery details (often pulled from the chat). */
  address?: string;
  landmark?: string;
  /** What we know about this person, learned from chats or added by staff. */
  facts?: CustomerFact[];
}

export type FactKind = "birthday" | "size" | "likes" | "dislikes" | "budget" | "buys_for" | "note";

export interface CustomerFact {
  id: ID;
  kind: FactKind;
  value: string;
  /** For birthdays: "MM-DD", so reminders work without a year. */
  monthDay?: string;
  source: "chat" | "staff";
  at: string;
}

export interface Lead {
  id: ID;
  contactId: ID;
  stage: LeadStage;
  outcome?: LeadOutcome;
  productInterestId?: ID;
  source: AcquisitionSource;
  campaign?: string;
  ownerId: ID;
  score: number;
  value: number;
  nextFollowUpAt?: string;
  slaStatus: SlaStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: ID;
  contactId: ID;
  leadId?: ID;
  title: string;
  value: number;
  stage: LeadStage;
  probability: number;
  expectedCloseAt: string;
  ownerId: ID;
  createdAt: string;
  status: "open" | "won" | "lost";
}

export interface Activity {
  id: ID;
  contactId: ID;
  kind: ActivityKind;
  title: string;
  description?: string;
  at: string;
  actorId?: ID;
  channel?: Channel;
  amount?: number;
  refId?: ID;
}

export interface Task {
  id: ID;
  contactId?: ID;
  title: string;
  dueAt: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: ID;
  type: "follow_up" | "call" | "delivery_check" | "payment_chase" | "general";
  createdAt: string;
}

export interface Message {
  id: ID;
  conversationId: ID;
  direction: "in" | "out";
  body: string;
  at: string;
  authorId?: ID;
}

export interface Conversation {
  id: ID;
  contactId: ID;
  channel: Channel;
  subject: string;
  unread: boolean;
  awaitingReply: boolean;
  assigneeId: ID;
  lastMessageAt: string;
  messages: Message[];
  /** A complaint raised in this chat, tracked until resolved. */
  complaint?: { status: "open" | "resolved"; reason: string; openedAt: string; resolvedAt?: string; resolution?: string };
}

export interface ProductInterest {
  id: ID;
  contactId: ID;
  productId: ID;
  productName: string;
  category: string;
  intent: "browsing" | "asked_price" | "requested_sample" | "ready_to_buy";
  capturedAt: string;
}

export interface OrderSummary {
  id: ID;
  reference: string;
  contactId: ID;
  placedAt: string;
  status: OrderStatus;
  itemsCount: number;
  total: number;
  cogs: number;
  shippingFee: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  channel: Channel;
  productNames: string[];
  /** Deposits and part payments received so far. Missing means nothing paid before delivery. */
  amountPaid?: number;
  /** Set once an invoice has been issued. */
  invoiceNo?: string;
  /** Order Form that created this order, if any. */
  formId?: ID;
}

export interface DeliverySummary {
  id: ID;
  orderId: ID;
  contactId: ID;
  courier: string;
  trackingRef: string;
  status: DeliveryStatus;
  scheduledFor: string;
  deliveredAt?: string;
  attempts: number;
  city: string;
  failureReason?: string;
  riderId?: ID;
}

export interface PaymentSummary {
  id: ID;
  orderId: ID;
  contactId: ID;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  at: string;
  remittanceDueAt?: string;
  remitted?: boolean;
}

export interface Segment {
  id: ID;
  name: string;
  description: string;
  type: "static" | "smart";
  memberCount: number;
  updatedAt: string;
  rulesSummary: string;
}

export interface Product {
  id: ID;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  reorderLevel: number;
  description?: string;
  /** Hidden products aren't quoted by the AI agent or shown in the store. Missing means visible. */
  active?: boolean;
  /** Optional deposit asked before dispatch. Missing or 0 means pure cash on delivery. */
  deposit?: number;
}

export interface Campaign {
  id: ID;
  name: string;
  platform: "meta" | "tiktok" | "google";
  status: "active" | "paused" | "review_needed";
  spend: number;
  revenue: number;
  leads: number;
  issue?: string;
}

export interface NotificationItem {
  id: ID;
  title: string;
  body: string;
  at: string;
  read: boolean;
  tone: "info" | "warning" | "success";
}

/** Lifecycle presentation metadata, shared by every screen. */
export const LIFECYCLE_META: Record<Lifecycle, { label: string; tone: BadgeTone }> = {
  contact: { label: "Contact", tone: "neutral" },
  prospect: { label: "Prospect", tone: "info" },
  lead: { label: "Lead", tone: "brand" },
  customer: { label: "Customer", tone: "success" },
  repeat_customer: { label: "Repeat Customer", tone: "success" },
  vip: { label: "VIP", tone: "purple" },
  at_risk: { label: "At Risk", tone: "warning" },
  dormant: { label: "Dormant", tone: "neutral" },
  reactivated: { label: "Reactivated", tone: "info" },
};

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple";

export const LEAD_STAGES: { id: LeadStage; label: string }[] = [
  { id: "new_lead", label: "New Lead" },
  { id: "first_contact", label: "First Contact" },
  { id: "engaged", label: "Engaged" },
  { id: "qualified", label: "Qualified" },
  { id: "high_intent", label: "High Purchase Intent" },
  { id: "negotiating", label: "Negotiating" },
  { id: "checkout_started", label: "Checkout Started" },
  { id: "order_created", label: "Order Created" },
  { id: "order_confirmed", label: "Order Confirmed" },
  { id: "follow_up_required", label: "Follow-up Required" },
  { id: "unresponsive", label: "Unresponsive" },
  { id: "lost", label: "Lost" },
  { id: "converted", label: "Converted" },
];

export const LEAD_OUTCOMES: { id: LeadOutcome; label: string; tone: BadgeTone }[] = [
  { id: "no_response", label: "No Response", tone: "neutral" },
  { id: "follow_up", label: "Follow-up", tone: "info" },
  { id: "nurture", label: "Nurture", tone: "purple" },
  { id: "lost", label: "Lost", tone: "danger" },
  { id: "disqualified", label: "Disqualified", tone: "warning" },
];

export const SOURCE_LABELS: Record<AcquisitionSource, string> = {
  meta_ads: "Meta Ads",
  tiktok_ads: "TikTok Ads",
  google_ads: "Google Ads",
  instagram_organic: "Instagram Organic",
  whatsapp_status: "WhatsApp Status",
  referral: "Referral",
  marketplace: "Marketplace",
  website: "Website",
  walk_in: "Walk-in",
  import: "Imported",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  email: "Email",
  sms: "SMS",
  phone: "Phone",
  webchat: "Web Chat",
};

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  pending_verification: { label: "Pending Verification", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "info" },
  processing: { label: "Processing", tone: "info" },
  ready_for_dispatch: { label: "Ready for Dispatch", tone: "brand" },
  dispatched: { label: "Dispatched", tone: "brand" },
  in_transit: { label: "In Transit", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  refused: { label: "Refused", tone: "danger" },
  returned: { label: "Returned", tone: "danger" },
};

export const DELIVERY_STATUS_META: Record<DeliveryStatus, { label: string; tone: BadgeTone }> = {
  not_scheduled: { label: "Not Scheduled", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info" },
  picked_up: { label: "Picked Up", tone: "info" },
  in_transit: { label: "In Transit", tone: "brand" },
  delivered: { label: "Delivered", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  returned: { label: "Returned", tone: "warning" },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  unpaid: { label: "Unpaid", tone: "danger" },
  part_paid: { label: "Part Paid", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  refunded: { label: "Refunded", tone: "neutral" },
  cod_pending: { label: "COD Pending", tone: "warning" },
};

export const SLA_META: Record<SlaStatus, { label: string; tone: BadgeTone }> = {
  on_track: { label: "On Track", tone: "success" },
  due_soon: { label: "Due Soon", tone: "warning" },
  breached: { label: "Breached", tone: "danger" },
  met: { label: "Met", tone: "neutral" },
};

/* ===================================================================
 * Practice-mode records for the remaining modules (added 2026-11-02).
 * Same rule as above: the backend must be able to serve these shapes.
 * =================================================================== */

export interface Rider {
  id: ID;
  name: string;
  phone: string;
  zone: string;
  vehicle: "bike" | "car" | "van";
  active: boolean;
}

export interface KnowledgeEntry {
  id: ID;
  topic: "company" | "faq" | "delivery" | "payment" | "returns" | "promotion" | "terms" | "script";
  question: string;
  answer: string;
  keywords: string[];
  updatedAt: string;
}

export type TemplatePurpose =
  | "enquiry" | "order" | "payment" | "delivery" | "complaint" | "objection" | "follow_up" | "reactivation" | "referral" | "policy" | "birthday";

export interface MessageTemplate {
  id: ID;
  name: string;
  category: "utility" | "marketing" | "authentication";
  /** "en" English, "pcm" Nigerian Pidgin. */
  language: string;
  /** What the reply is for, so staff can find it fast. */
  purpose?: TemplatePurpose;
  body: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  updatedAt: string;
}

export interface FollowUpRule {
  id: ID;
  name: string;
  trigger: "no_reply_after_details" | "no_reply_after_price" | "checkout_abandoned" | "delivery_concern";
  delayHours: number;
  maxAttempts: number;
  templateId?: ID;
  message: string;
  quietStart: string; // "21:00"
  quietEnd: string; // "08:00"
  enabled: boolean;
}

export interface Broadcast {
  id: ID;
  name: string;
  segmentId: ID;
  templateId: ID;
  status: "draft" | "scheduled" | "sent";
  scheduledFor?: string;
  sentAt?: string;
  recipients: number;
  skippedNoConsent: number;
}

export interface WorkflowStep {
  id: ID;
  kind: "trigger" | "condition" | "wait" | "action";
  label: string;
}

export interface Workflow {
  id: ID;
  name: string;
  description: string;
  active: boolean;
  steps: WorkflowStep[];
  updatedAt: string;
}

export interface WorkflowRun {
  id: ID;
  workflowId: ID;
  contactId?: ID;
  status: "succeeded" | "failed" | "skipped" | "running";
  detail: string;
  at: string;
}

export interface MediaAsset {
  id: ID;
  name: string;
  kind: "image" | "video";
  bytes: number;
  productId?: ID;
  /** Practice Mode keeps small images inline; the backend uses cloud storage URLs. */
  url?: string;
  addedAt: string;
}

export interface StockMovement {
  id: ID;
  productId: ID;
  delta: number;
  reason: "restock" | "sale" | "adjustment" | "return" | "damaged";
  note?: string;
  at: string;
}

export interface IntegrationState {
  id: "whatsapp" | "messenger" | "instagram" | "tiktok" | "meta_ads" | "sms" | "email" | "paystack" | "webchat" | "couriers" | "lead_form";
  status: "not_connected" | "simulated";
  connectedAt?: string;
}

export interface AgentConfig {
  enabled: boolean;
  name: string;
  greeting: string;
  tone: "friendly" | "formal" | "playful";
  handoffKeywords: string[];
  maxImages: number;
}

export interface BusinessSettings {
  businessName: string;
  timezone: string;
  deliveryFee: number;
  freeDeliveryOver: number;
  paymentLinkTemplate: string;
  optOutKeywords: string[];
  quietStart: string;
  quietEnd: string;
  maxFollowUpsPerDay: number;
  notify: Record<"order_confirmed" | "dispatched" | "delivered" | "cod_request" | "feedback", "whatsapp" | "sms" | "email" | "off">;
  storeEnabled: boolean;
  storeSlug: string;
  plan: "trial" | "starter" | "growth" | "scale";
  /** Alerts for the team (from Sandala). */
  staffAlerts: { newMessage: boolean; dispatchRisk: boolean };
  /** Chat display (from Sandala's chat appearance settings). */
  chat: { bubbleTails: boolean; flagMissingDetails: boolean };
  /** WhatsApp number customers chat with (share kit, order forms). */
  whatsappNumber: string;
  /** 7-day setup checklist steps the owner has ticked. */
  setupDone: string[];
  /** Morning Money Brief: when and where it's sent. */
  brief: { time: string; channels: ("app" | "whatsapp" | "email")[] };
}

/* ===================================================================
 * Added 2026-11-04 from the competitor and playbook review.
 * =================================================================== */

export interface OrderFormPackage {
  id: ID;
  label: string; // "Buy 2"
  qty: number;
  price: number; // total price for the package
  gift?: string;
}

export type OrderFormField = "name" | "phone" | "address" | "city" | "landmark" | "note";

export interface OrderForm {
  id: ID;
  name: string;
  productId: ID;
  headline: string;
  banner?: string;
  packages: OrderFormPackage[];
  fields: OrderFormField[];
  payOnDelivery: boolean;
  /** One purchase event per order to the ad platforms (sent by the backend). */
  pixels: { meta: boolean; tiktok: boolean };
  thankYou: string;
  active: boolean;
  createdAt: string;
  stats: { views: number; starts: number; submits: number; duplicatesBlocked: number; dropOff: Partial<Record<OrderFormField, number>> };
}

export interface FormSubmission {
  id: ID;
  formId: ID;
  orderId: ID;
  contactId: ID;
  packageId: ID;
  total: number;
  region: string;
  adSource: string;
  at: string;
  /** Saved before any email is tried, so an order is never lost. */
  emailSent: boolean;
  eventSent: boolean;
}

export interface CalendarEvent {
  id: ID;
  title: string;
  kind: "callback" | "delivery" | "meeting" | "reminder" | "birthday";
  at: string;
  contactId?: ID;
  orderId?: ID;
  note?: string;
}

/* Website and form connections (2026-11-05). */
export interface Connection {
  id: ID;
  platform: import("./intake").PlatformId;
  name: string;
  /** Sent by the platform in the X-Bizriva-Key header (or ?key=). */
  secret: string;
  /** Their field label → our field. Empty means "match by name". */
  fieldMap: import("./intake").FieldMap;
  /** What a submission with a product becomes. */
  createAs: "order" | "lead";
  active: boolean;
  createdAt: string;
  lastEventAt?: string;
}

export interface ConnectionEvent {
  id: ID;
  connectionId: ID;
  at: string;
  status: "created_order" | "created_lead" | "duplicate" | "failed";
  summary: string;
  raw: string;
  contactId?: ID;
  orderId?: ID;
  externalId?: string;
}
