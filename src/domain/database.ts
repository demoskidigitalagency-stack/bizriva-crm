/**
 * The in-memory database snapshot shape.
 *
 * `createInitialDatabase()` is the single adapter boundary: replacing it (and
 * the repository functions) with network calls is the only change required to
 * move Bizriva CRM onto a real backend.
 */

import * as seed from "./seed";
import * as practice from "./practice-seed";
import type {
  AgentConfig,
  CalendarEvent,
  Connection,
  ConnectionEvent,
  FormSubmission,
  OrderForm,
  Broadcast,
  BusinessSettings,
  FollowUpRule,
  IntegrationState,
  KnowledgeEntry,
  MediaAsset,
  MessageTemplate,
  Rider,
  StockMovement,
  Workflow,
  WorkflowRun,
  Activity,
  AcquisitionAttribution,
  Campaign,
  ChannelIdentity,
  Contact,
  Conversation,
  DeliverySummary,
  Lead,
  NotificationItem,
  Opportunity,
  OrderSummary,
  PaymentSummary,
  Product,
  ProductInterest,
  Segment,
  Task,
  TeamMember,
  Workspace,
} from "./types";

export interface Database {
  workspaces: Workspace[];
  team: TeamMember[];
  contacts: Contact[];
  channelIdentities: ChannelIdentity[];
  attributions: AcquisitionAttribution[];
  leads: Lead[];
  opportunities: Opportunity[];
  activities: Activity[];
  tasks: Task[];
  conversations: Conversation[];
  productInterests: ProductInterest[];
  segments: Segment[];
  orders: OrderSummary[];
  deliveries: DeliverySummary[];
  payments: PaymentSummary[];
  products: Product[];
  campaigns: Campaign[];
  notifications: NotificationItem[];
  revenueTrend: typeof seed.revenueTrend;
  riders: Rider[];
  knowledge: KnowledgeEntry[];
  templates: MessageTemplate[];
  followUpRules: FollowUpRule[];
  broadcasts: Broadcast[];
  workflows: Workflow[];
  workflowRuns: WorkflowRun[];
  media: MediaAsset[];
  stockMovements: StockMovement[];
  integrations: IntegrationState[];
  agent: AgentConfig;
  settings: BusinessSettings;
  orderForms: OrderForm[];
  formSubmissions: FormSubmission[];
  events: CalendarEvent[];
  connections: Connection[];
  connectionEvents: ConnectionEvent[];
}

/** A few sample chats get a customer message with delivery details (see practice-seed). */
function withDetailMessages(conversations: Conversation[], contacts: Contact[]): Conversation[] {
  return conversations.map((c, i) => {
    if (i % 5 !== 1) return c;
    const who = contacts.find((x) => x.id === c.contactId);
    const tpl = practice.detailMessages[i % practice.detailMessages.length]!;
    const body = tpl.replace("{first}", who?.firstName ?? "Ada").replace("{last}", who?.lastName ?? "Okafor");
    const first = c.messages[0];
    if (!first) return c;
    const at = new Date(new Date(first.at).getTime() + 5 * 60_000).toISOString();
    const msg = { id: `${first.id}_details`, conversationId: c.id, direction: "in" as const, body, at };
    return { ...c, messages: [first, msg, ...c.messages.slice(1)] };
  });
}

/** Some sample chats contain personal details for customer memory to find. */
function withFactMessages(conversations: Conversation[]): Conversation[] {
  return conversations.map((c, i) => {
    if (i % 7 !== 2) return c;
    const last = c.messages[c.messages.length - 1];
    if (!last) return c;
    const body = practice.factMessages[i % practice.factMessages.length]!;
    const at = new Date(new Date(last.at).getTime() - 2 * 60_000).toISOString();
    const msg = { id: `${last.id}_facts`, conversationId: c.id, direction: "in" as const, body, at };
    return { ...c, messages: [...c.messages.slice(0, -1), msg, last] };
  });
}

function withSavedFacts(contacts: Contact[]): Contact[] {
  return contacts.map((c) => {
    const f = practice.savedFacts[c.id];
    if (!f) return c;
    return { ...c, facts: f.map((x, i) => ({ id: `fact_${c.id}_${i}`, ...x, source: "chat" as const, at: c.lastActivityAt })) };
  });
}

/** Two sample chats carry a complaint: one open, one resolved. */
function withComplaints(conversations: Conversation[]): Conversation[] {
  return conversations.map((c, i) => {
    if (i === 3) return { ...c, complaint: { status: "open" as const, reason: "Received the wrong length (18 inch instead of 20 inch)", openedAt: c.lastMessageAt } };
    if (i === 8) return { ...c, complaint: { status: "resolved" as const, reason: "Rider arrived two days late", openedAt: c.lastMessageAt, resolvedAt: c.lastMessageAt, resolution: "Apologised and refunded the delivery fee" } };
    return c;
  });
}

/** Part-paid sample orders get a recorded deposit so balances show. */
function withDeposits(orders: OrderSummary[]): OrderSummary[] {
  return orders.map((o) => (o.paymentStatus === "part_paid" ? { ...o, amountPaid: Math.round(o.total * 0.4) } : o));
}

/** Spread some completed deliveries over the past week so the Money Brief has a "yesterday". */
function withRecentDeliveries(deliveries: DeliverySummary[]): DeliverySummary[] {
  let n = 0;
  return deliveries.map((d) => {
    if (d.status !== "delivered" || n >= 28) return d;
    const i = n++;
    const day = 1 + (i % 7);
    const at = new Date(seed.NOW.getFullYear(), seed.NOW.getMonth(), seed.NOW.getDate() - day, 10 + (i % 8), (i * 7) % 60);
    return { ...d, deliveredAt: at.toISOString() };
  });
}

/** In-house deliveries get a rider by city so the Riders module has real-looking work. */
function withRiders(deliveries: DeliverySummary[]): DeliverySummary[] {
  const byCity: Record<string, string> = { Lagos: "r_musa", Ikeja: "r_kunle", Abuja: "r_emeka", Ibadan: "r_bisi" };
  return deliveries.map((d, i) => {
    if (d.courier !== "In-house Rider") return d;
    const riderId = byCity[d.city] ?? (i % 2 ? "r_kunle" : "r_musa");
    return { ...d, riderId };
  });
}

export function createInitialDatabase(): Database {
  return {
    workspaces: seed.workspaces,
    team: seed.team,
    contacts: withSavedFacts(seed.contacts),
    channelIdentities: seed.channelIdentities,
    attributions: seed.attributions,
    leads: seed.leads,
    opportunities: seed.opportunities,
    activities: seed.activities,
    tasks: seed.tasks,
    conversations: withComplaints(withFactMessages(withDetailMessages(seed.conversations, seed.contacts))),
    productInterests: seed.productInterests,
    segments: seed.segments,
    orders: withDeposits(seed.orders),
    deliveries: withRecentDeliveries(withRiders(seed.deliveries)),
    payments: seed.payments,
    products: seed.products.map((p) => ({ ...p, active: true, description: practice.productDescriptions[p.id] ?? "" })),
    campaigns: seed.campaigns,
    notifications: seed.notifications,
    revenueTrend: seed.revenueTrend,
    riders: practice.riders,
    knowledge: practice.knowledge,
    templates: [...practice.templates, ...practice.replyLibrary],
    followUpRules: practice.followUpRules,
    broadcasts: practice.broadcasts,
    workflows: [...practice.workflows, ...practice.extraWorkflows],
    workflowRuns: practice.workflowRuns,
    media: practice.media,
    stockMovements: practice.stockMovements,
    integrations: practice.integrations,
    agent: practice.agent,
    settings: practice.settings,
    orderForms: practice.orderForms,
    formSubmissions: practice.formSubmissions,
    events: practice.events,
    connections: practice.connections,
    connectionEvents: [],
  };
}

export const NOW = seed.NOW;
export const CURRENT_USER_ID = seed.currentUser.id;
