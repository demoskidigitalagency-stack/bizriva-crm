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
  | "assigned"
  | "contacted"
  | "qualified"
  | "interested"
  | "negotiating"
  | "order_started"
  | "won";

export type LeadOutcome =
  | "no_response"
  | "follow_up"
  | "nurture"
  | "lost"
  | "disqualified";

export type SlaStatus = "on_track" | "due_soon" | "breached" | "met";

export type OrderStatus =
  | "draft"
  | "needs_confirmation"
  | "confirmed"
  | "processing"
  | "completed"
  | "cancelled"
  | "on_hold";

export type FulfilmentStatus =
  | "unfulfilled"
  | "assigned"
  | "packed"
  | "dispatched"
  | "in_transit"
  | "delivered"
  | "attempted"
  | "failed"
  | "returned"
  | "rescheduled";

export type DeliveryStatus =
  | "not_scheduled"
  | "scheduled"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "failed"
  | "returned"
  | "rescheduled";

export type PaymentStatus =
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "cod_pending"
  | "cod_collected"
  | "cod_remitted"
  | "partially_refunded"
  | "refunded";

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
  orderStatus: OrderStatus;
  fulfilmentStatus: FulfilmentStatus;
  itemsCount: number;
  total: number;
  cogs: number;
  shippingFee: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  channel: Channel;
  productNames: string[];
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
  { id: "assigned", label: "Assigned" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "interested", label: "Interested" },
  { id: "negotiating", label: "Negotiating" },
  { id: "order_started", label: "Order Started" },
  { id: "won", label: "Won" },
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
  draft: { label: "Draft", tone: "neutral" },
  needs_confirmation: { label: "Needs Confirmation", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "info" },
  processing: { label: "Processing", tone: "brand" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  on_hold: { label: "On Hold", tone: "warning" },
};

export const FULFILMENT_STATUS_META: Record<FulfilmentStatus, { label: string; tone: BadgeTone }> = {
  unfulfilled: { label: "Unfulfilled", tone: "neutral" },
  assigned: { label: "Assigned", tone: "info" },
  packed: { label: "Packed", tone: "brand" },
  dispatched: { label: "Dispatched", tone: "brand" },
  in_transit: { label: "In Transit", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  attempted: { label: "Attempted", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  returned: { label: "Returned", tone: "danger" },
  rescheduled: { label: "Rescheduled", tone: "warning" },
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
  partially_paid: { label: "Partially Paid", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  cod_pending: { label: "COD Pending", tone: "warning" },
  cod_collected: { label: "COD Collected", tone: "info" },
  cod_remitted: { label: "COD Remitted", tone: "success" },
  partially_refunded: { label: "Partially Refunded", tone: "warning" },
  refunded: { label: "Refunded", tone: "neutral" },
};

export const SLA_META: Record<SlaStatus, { label: string; tone: BadgeTone }> = {
  on_track: { label: "On Track", tone: "success" },
  due_soon: { label: "Due Soon", tone: "warning" },
  breached: { label: "Breached", tone: "danger" },
  met: { label: "Met", tone: "neutral" },
};