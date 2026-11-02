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
    contacts: seed.contacts,
    channelIdentities: seed.channelIdentities,
    attributions: seed.attributions,
    leads: seed.leads,
    opportunities: seed.opportunities,
    activities: seed.activities,
    tasks: seed.tasks,
    conversations: seed.conversations,
    productInterests: seed.productInterests,
    segments: seed.segments,
    orders: seed.orders,
    deliveries: withRiders(seed.deliveries),
    payments: seed.payments,
    products: seed.products,
    campaigns: seed.campaigns,
    notifications: seed.notifications,
    revenueTrend: seed.revenueTrend,
    riders: practice.riders,
    knowledge: practice.knowledge,
    templates: practice.templates,
    followUpRules: practice.followUpRules,
    broadcasts: practice.broadcasts,
    workflows: practice.workflows,
    workflowRuns: practice.workflowRuns,
    media: practice.media,
    stockMovements: practice.stockMovements,
    integrations: practice.integrations,
    agent: practice.agent,
    settings: practice.settings,
  };
}

export const NOW = seed.NOW;
export const CURRENT_USER_ID = seed.currentUser.id;
