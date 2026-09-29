/**
 * The in-memory database snapshot shape.
 *
 * `createInitialDatabase()` is the single adapter boundary: replacing it (and
 * the repository functions) with network calls is the only change required to
 * move Bizriva CRM onto a real backend.
 */

import * as seed from "./seed";
import type {
  Activity,
  AcquisitionAttribution,
  AdCampaign,
  MarketingCampaign,
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
  adCampaigns: AdCampaign[];
  marketingCampaigns: MarketingCampaign[];
  notifications: NotificationItem[];
  revenueTrend: typeof seed.revenueTrend;
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
    deliveries: seed.deliveries,
    payments: seed.payments,
    products: seed.products,
    adCampaigns: seed.adCampaigns,
    marketingCampaigns: seed.marketingCampaigns,
    notifications: seed.notifications,
    revenueTrend: seed.revenueTrend,
  };
}

export const NOW = seed.NOW;
export const CURRENT_USER_ID = seed.currentUser.id;