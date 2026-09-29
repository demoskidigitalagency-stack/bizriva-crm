/**
 * Query layer. All business rules for reading CRM data live here — never in a
 * component. Every function is pure: (database, params) -> result.
 */

import type { Database } from "./database";
import { NOW } from "./database";
import type {
  Activity,
  Contact,
  ID,
  Lead,
  LeadStage,
  Lifecycle,
  AcquisitionSource,
  OrderSummary,
  Task,
} from "./types";

/* ------------------------------------------------------------ primitives */

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function paginate<T>(rows: T[], page: number, pageSize: number): Paged<T> {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  return {
    rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    total: rows.length,
    page: safePage,
    pageSize,
    pageCount,
  };
}

export const fullName = (c: Contact) => `${c.firstName} ${c.lastName}`;

const isWithinDays = (iso: string, days: number) =>
  NOW.getTime() - new Date(iso).getTime() <= days * 86_400_000;

const isPast = (iso?: string) => (iso ? new Date(iso).getTime() < NOW.getTime() : false);

const isToday = (iso?: string) => {
  if (!iso) return false;
  const d = new Date(iso);
  return (
    d.getUTCFullYear() === NOW.getUTCFullYear() &&
    d.getUTCMonth() === NOW.getUTCMonth() &&
    d.getUTCDate() === NOW.getUTCDate()
  );
};

/* -------------------------------------------------------------- contacts */

export type ContactSortKey =
  | "name"
  | "leadScore"
  | "lastActivityAt"
  | "totalOrders"
  | "lifetimeValue"
  | "createdAt";

export interface ContactQuery {
  search?: string;
  lifecycle?: Lifecycle[];
  sources?: AcquisitionSource[];
  owners?: ID[];
  countries?: string[];
  minScore?: number;
  hasOrders?: boolean;
  sortKey?: ContactSortKey;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export function queryContacts(db: Database, q: ContactQuery = {}): Paged<Contact> {
  const {
    search = "",
    lifecycle = [],
    sources = [],
    owners = [],
    countries = [],
    minScore = 0,
    hasOrders,
    sortKey = "lastActivityAt",
    sortDir = "desc",
    page = 1,
    pageSize = 15,
  } = q;

  const needle = search.trim().toLowerCase();
  let rows = db.contacts.filter((c) => {
    if (needle) {
      const hay = `${c.firstName} ${c.lastName} ${c.phone} ${c.email ?? ""} ${c.city} ${c.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (lifecycle.length && !lifecycle.includes(c.lifecycle)) return false;
    if (sources.length && !sources.includes(c.source)) return false;
    if (owners.length && !owners.includes(c.ownerId)) return false;
    if (countries.length && !countries.includes(c.countryCode)) return false;
    if (c.leadScore < minScore) return false;
    if (hasOrders === true && c.totalOrders === 0) return false;
    if (hasOrders === false && c.totalOrders > 0) return false;
    return true;
  });

  const dir = sortDir === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    switch (sortKey) {
      case "name":
        return fullName(a).localeCompare(fullName(b)) * dir;
      case "leadScore":
        return (a.leadScore - b.leadScore) * dir;
      case "totalOrders":
        return (a.totalOrders - b.totalOrders) * dir;
      case "lifetimeValue":
        return (a.lifetimeValue - b.lifetimeValue) * dir;
      case "createdAt":
        return (+new Date(a.createdAt) - +new Date(b.createdAt)) * dir;
      default:
        return (+new Date(a.lastActivityAt) - +new Date(b.lastActivityAt)) * dir;
    }
  });

  return paginate(rows, page, pageSize);
}

export const getContact = (db: Database, id: ID) => db.contacts.find((c) => c.id === id);
export const getMember = (db: Database, id?: ID) => db.team.find((t) => t.id === id);

/* ------------------------------------------------------------------ leads */

export interface LeadQuery {
  search?: string;
  stages?: LeadStage[];
  owners?: ID[];
  sources?: AcquisitionSource[];
  onlyOverdue?: boolean;
  page?: number;
  pageSize?: number;
}

export interface LeadRow extends Lead {
  contact: Contact;
  productInterest?: string;
  ownerName: string;
}

export function buildLeadRows(db: Database): LeadRow[] {
  return db.leads.reduce<LeadRow[]>((rows, l) => {
    const contact = db.contacts.find((c) => c.id === l.contactId);
    if (!contact) return rows;
    rows.push({
      ...l,
      contact,
      productInterest: db.productInterests.find((p) => p.contactId === l.contactId)?.productName,
      ownerName: getMember(db, l.ownerId)?.name ?? "Unassigned",
    });
    return rows;
  }, []);
}

export function queryLeads(db: Database, q: LeadQuery = {}): Paged<LeadRow> {
  const { search = "", stages = [], owners = [], sources = [], onlyOverdue, page = 1, pageSize = 15 } = q;
  const needle = search.trim().toLowerCase();

  const rows = buildLeadRows(db)
    .filter((l) => {
      if (needle && !`${fullName(l.contact)} ${l.contact.phone} ${l.productInterest ?? ""} ${l.campaign ?? ""}`.toLowerCase().includes(needle))
        return false;
      if (stages.length && !stages.includes(l.stage)) return false;
      if (owners.length && !owners.includes(l.ownerId)) return false;
      if (sources.length && !sources.includes(l.source)) return false;
      if (onlyOverdue && !(l.nextFollowUpAt && isPast(l.nextFollowUpAt))) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score);

  return paginate(rows, page, pageSize);
}

export function leadsByStage(db: Database, owners: ID[] = []): Record<LeadStage, LeadRow[]> {
  const grouped = {} as Record<LeadStage, LeadRow[]>;
  const stages: LeadStage[] = [
    "new_lead", "assigned", "contacted", "qualified", "interested", "negotiating", "order_started", "won",
  ];
  stages.forEach((s) => (grouped[s] = []));
  buildLeadRows(db)
    .filter((l) => (owners.length ? owners.includes(l.ownerId) : true))
    .forEach((l) => grouped[l.stage].push(l));
  return grouped;
}

/* --------------------------------------------------------- customer 360 */

export interface Customer360 {
  contact: Contact;
  owner?: ReturnType<typeof getMember>;
  identities: Database["channelIdentities"];
  attribution?: Database["attributions"][number];
  lead?: Lead;
  opportunities: Database["opportunities"];
  activities: Activity[];
  tasks: Task[];
  conversations: Database["conversations"];
  orders: OrderSummary[];
  deliveries: Database["deliveries"];
  payments: Database["payments"];
  interests: Database["productInterests"];
  segments: Database["segments"];
  kpis: {
    lifetimeRevenue: number;
    deliveredRevenue: number;
    contributionProfit: number;
    orders: number;
    deliveredOrders: number;
    averageOrderValue: number;
    lastPurchaseAt?: string;
    openOpportunities: number;
    outstandingBalance: number;
  };
}

export function getCustomer360(db: Database, id: ID): Customer360 | undefined {
  const contact = getContact(db, id);
  if (!contact) return undefined;

  const orders = db.orders.filter((o) => o.contactId === id).sort((a, b) => +new Date(b.placedAt) - +new Date(a.placedAt));
  const deliveredOrders = orders.filter((o) => o.fulfilmentStatus === "delivered");
  const deliveredRevenue = deliveredOrders.reduce((s, o) => s + o.total, 0);
  const lifetimeRevenue = orders.filter((o) => o.orderStatus !== "cancelled").reduce((s, o) => s + o.total, 0);
  const contributionProfit = deliveredOrders.reduce((s, o) => s + (o.total - o.cogs - o.shippingFee), 0);
  const opportunities = db.opportunities.filter((o) => o.contactId === id);

  return {
    contact,
    owner: getMember(db, contact.ownerId),
    identities: db.channelIdentities.filter((c) => c.contactId === id),
    attribution: db.attributions.find((a) => a.contactId === id),
    lead: db.leads.find((l) => l.contactId === id),
    opportunities,
    activities: db.activities.filter((a) => a.contactId === id).sort((a, b) => +new Date(b.at) - +new Date(a.at)),
    tasks: db.tasks.filter((t) => t.contactId === id),
    conversations: db.conversations.filter((c) => c.contactId === id),
    orders,
    deliveries: db.deliveries.filter((d) => d.contactId === id),
    payments: db.payments.filter((p) => p.contactId === id),
    interests: db.productInterests.filter((p) => p.contactId === id),
    segments: db.segments.filter((_, i) => (contact.lifetimeValue > 0 ? i % 3 === 0 : i % 5 === 0)),
    kpis: {
      lifetimeRevenue,
      deliveredRevenue,
      contributionProfit,
      orders: orders.length,
      deliveredOrders: deliveredOrders.length,
      averageOrderValue: orders.length ? Math.round(lifetimeRevenue / orders.length) : 0,
      lastPurchaseAt: deliveredOrders[0]?.placedAt ?? orders[0]?.placedAt,
      openOpportunities: opportunities.filter((o) => o.status === "open").length,
      outstandingBalance: contact.outstandingBalance,
    },
  };
}

/* ------------------------------------------------------------- dashboard */

export interface DashboardFilters {
  rangeDays: 7 | 30 | 90;
  ownerId?: ID | "all";
  channel?: string;
}

export function getDashboard(db: Database, filters: DashboardFilters) {
  const { rangeDays, ownerId = "all" } = filters;
  const scopedContacts = ownerId === "all" ? db.contacts : db.contacts.filter((c) => c.ownerId === ownerId);
  const scopedIds = new Set(scopedContacts.map((c) => c.id));

  const inRange = db.orders.filter(
    (o) => scopedIds.has(o.contactId) && isWithinDays(o.placedAt, rangeDays),
  );
  const delivered = inRange.filter((o) => o.fulfilmentStatus === "delivered");
  const revenue = inRange.filter((o) => o.orderStatus !== "cancelled").reduce((s, o) => s + o.total, 0);
  const deliveredRevenue = delivered.reduce((s, o) => s + o.total, 0);
  const contributionProfit = delivered.reduce((s, o) => s + (o.total - o.cogs - o.shippingFee), 0);

  const newLeads = db.leads.filter(
    (l) => scopedIds.has(l.contactId) && isWithinDays(l.createdAt, rangeDays),
  );
  const wonLeads = newLeads.filter((l) => l.stage === "won");
  const adSpend = db.campaigns.reduce((s, c) => s + c.spend, 0) * (rangeDays / 30);
  const codOutstanding = db.payments
    .filter((p) => p.status === "cod_pending" && scopedIds.has(p.contactId))
    .reduce((s, p) => s + p.amount, 0);

  const trend = db.revenueTrend.slice(-rangeDays > -db.revenueTrend.length ? -rangeDays : 0);

  const sourceCounts = new Map<AcquisitionSource, { leads: number; won: number; revenue: number }>();
  scopedContacts.forEach((c) => {
    const entry = sourceCounts.get(c.source) ?? { leads: 0, won: 0, revenue: 0 };
    entry.leads += 1;
    if (c.totalOrders > 0) entry.won += 1;
    entry.revenue += c.deliveredRevenue;
    sourceCounts.set(c.source, entry);
  });

  const reactivation = scopedContacts
    .filter((c) => (c.lifecycle === "dormant" || c.lifecycle === "at_risk") && c.totalOrders > 0)
    .sort((a, b) => b.lifetimeValue - a.lifetimeValue)
    .slice(0, 6);

  return {
    kpis: {
      revenue,
      deliveredRevenue,
      contributionProfit,
      orders: inRange.length,
      deliveredOrders: delivered.length,
      newLeads: newLeads.length,
      conversionRate: newLeads.length ? (wonLeads.length / newLeads.length) * 100 : 0,
      adSpend: Math.round(adSpend),
      deliveredRoas: adSpend ? deliveredRevenue / adSpend : 0,
      codOutstanding,
    },
    trend,
    funnel: [
      { stage: "Reached", value: Math.round(scopedContacts.length * 9.4) },
      { stage: "Captured", value: scopedContacts.length },
      { stage: "Qualified", value: db.leads.filter((l) => scopedIds.has(l.contactId) && ["qualified", "interested", "negotiating", "order_started", "won"].includes(l.stage)).length },
      { stage: "Ordered", value: inRange.length },
      { stage: "Delivered", value: delivered.length },
    ],
    salesPerformance: db.team
      .filter((t) => ["sales_rep", "manager"].includes(t.role))
      .map((t) => {
        const own = db.contacts.filter((c) => c.ownerId === t.id);
        const ids = new Set(own.map((c) => c.id));
        const reps = db.orders.filter((o) => ids.has(o.contactId) && isWithinDays(o.placedAt, rangeDays));
        return {
          id: t.id,
          name: t.name,
          leads: db.leads.filter((l) => l.ownerId === t.id).length,
          orders: reps.length,
          revenue: reps.reduce((s, o) => s + o.total, 0),
          conversion: own.length ? (own.filter((c) => c.totalOrders > 0).length / own.length) * 100 : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue),
    ads: db.campaigns.map((c) => ({ ...c, roas: c.spend ? c.revenue / c.spend : 0 })),
    fulfilment: {
      pendingConfirmation: db.orders.filter((o) => o.orderStatus === "needs_confirmation").length,
      awaitingDispatch: db.orders.filter((o) => o.fulfilmentStatus === "packed").length,
      inTransit: db.orders.filter((o) => o.fulfilmentStatus === "in_transit").length,
      delivered: db.orders.filter((o) => o.fulfilmentStatus === "delivered").length,
      failed: db.deliveries.filter((d) => d.status === "failed").length,
      returned: db.orders.filter((o) => o.fulfilmentStatus === "returned").length,
    },
    sources: [...sourceCounts.entries()]
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    reactivation,
    recentActivity: db.activities.slice(0, 12),
  };
}

/* ----------------------------------------------------------------- today */

export type QueueKey =
  | "new_leads"
  | "unanswered"
  | "followups_due"
  | "followups_overdue"
  | "orders_confirm"
  | "awaiting_dispatch"
  | "failed_deliveries"
  | "cod_outstanding"
  | "overdue_remittances"
  | "low_stock"
  | "campaign_attention";

export interface QueueItem {
  id: ID;
  primary: string;
  secondary: string;
  meta?: string;
  amount?: number;
  contactId?: ID;
  tone?: "neutral" | "warning" | "danger" | "success";
}

export interface Queue {
  key: QueueKey;
  label: string;
  description: string;
  count: number;
  amount?: number;
  tone: "brand" | "warning" | "danger" | "info" | "success";
  items: QueueItem[];
  /** Where the "Open module" action should route to. */
  route: string;
}

export function getTodayQueues(db: Database): Queue[] {
  const name = (id: ID) => {
    const c = getContact(db, id);
    return c ? fullName(c) : "Unknown contact";
  };

  const newLeads = db.leads.filter((l) => l.stage === "new_lead");
  const unanswered = db.conversations.filter((c) => c.awaitingReply);
  const tasksOpen = db.tasks.filter((t) => t.status === "open");
  const dueToday = tasksOpen.filter((t) => isToday(t.dueAt));
  const overdue = tasksOpen.filter((t) => isPast(t.dueAt) && !isToday(t.dueAt));
  const confirm = db.orders.filter((o) => o.orderStatus === "needs_confirmation");
  const dispatch = db.orders.filter((o) => o.fulfilmentStatus === "packed");
  const failed = db.deliveries.filter((d) => d.status === "failed");
  const cod = db.payments.filter((p) => p.status === "cod_pending");
  const remit = db.payments.filter((p) => p.remittanceDueAt && !p.remitted);
  const lowStock = db.products.filter((p) => p.stock <= p.reorderLevel);
  const badCampaigns = db.campaigns.filter((c) => c.status === "review_needed");

  return [
    {
      key: "new_leads",
      label: "New Leads",
      description: "Captured and not yet assigned or contacted",
      count: newLeads.length,
      tone: "brand",
      route: "/crm/leads",
      items: newLeads.slice(0, 8).map((l) => ({
        id: l.id,
        primary: name(l.contactId),
        secondary: l.campaign ?? l.source.replace(/_/g, " "),
        meta: `Score ${l.score}`,
        contactId: l.contactId,
      })),
    },
    {
      key: "unanswered",
      label: "Unanswered Conversations",
      description: "Customer sent the last message",
      count: unanswered.length,
      tone: "warning",
      route: "/inbox",
      items: unanswered.slice(0, 8).map((c) => ({
        id: c.id,
        primary: name(c.contactId),
        secondary: c.messages[c.messages.length - 1]!.body,
        meta: c.channel,
        contactId: c.contactId,
        tone: "warning",
      })),
    },
    {
      key: "followups_due",
      label: "Follow-ups Due",
      description: "Scheduled for today",
      count: dueToday.length,
      tone: "info",
      route: "/crm/follow-ups",
      items: dueToday.slice(0, 8).map((t) => ({
        id: t.id,
        primary: t.contactId ? name(t.contactId) : "Unassigned contact",
        secondary: t.title,
        meta: t.priority,
        contactId: t.contactId,
      })),
    },
    {
      key: "followups_overdue",
      label: "Overdue Follow-ups",
      description: "Past their due date and still open",
      count: overdue.length,
      tone: "danger",
      route: "/crm/follow-ups",
      items: overdue.slice(0, 8).map((t) => ({
        id: t.id,
        primary: t.contactId ? name(t.contactId) : "Unassigned contact",
        secondary: t.title,
        meta: t.priority,
        contactId: t.contactId,
        tone: "danger",
      })),
    },
    {
      key: "orders_confirm",
      label: "Orders Need Confirmation",
      description: "Placed but not confirmed with the customer",
      count: confirm.length,
      amount: confirm.reduce((s, o) => s + o.total, 0),
      tone: "warning",
      route: "/orders",
      items: confirm.slice(0, 8).map((o) => ({
        id: o.id,
        primary: `${o.reference} — ${name(o.contactId)}`,
        secondary: o.productNames.join(", "),
        amount: o.total,
        contactId: o.contactId,
      })),
    },
    {
      key: "awaiting_dispatch",
      label: "Awaiting Dispatch",
      description: "Confirmed and waiting on the fulfilment desk",
      count: dispatch.length,
      amount: dispatch.reduce((s, o) => s + o.total, 0),
      tone: "brand",
      route: "/delivery",
      items: dispatch.slice(0, 8).map((o) => ({
        id: o.id,
        primary: `${o.reference} — ${name(o.contactId)}`,
        secondary: o.productNames.join(", "),
        amount: o.total,
        contactId: o.contactId,
      })),
    },
    {
      key: "failed_deliveries",
      label: "Failed Deliveries",
      description: "Needs a recovery call before the next attempt",
      count: failed.length,
      tone: "danger",
      route: "/delivery",
      items: failed.slice(0, 8).map((d) => ({
        id: d.id,
        primary: name(d.contactId),
        secondary: d.failureReason ?? "Delivery failed",
        meta: `${d.courier} · attempt ${d.attempts}`,
        contactId: d.contactId,
        tone: "danger",
      })),
    },
    {
      key: "cod_outstanding",
      label: "COD Outstanding",
      description: "Cash owed on delivered or in-transit orders",
      count: cod.length,
      amount: cod.reduce((s, p) => s + p.amount, 0),
      tone: "warning",
      route: "/finance",
      items: cod.slice(0, 8).map((p) => ({
        id: p.id,
        primary: name(p.contactId),
        secondary: `Order ${p.orderId.replace("ord_", "BZ-")}`,
        amount: p.amount,
        contactId: p.contactId,
        tone: "warning",
      })),
    },
    {
      key: "overdue_remittances",
      label: "Overdue Remittances",
      description: "Courier cash not yet remitted to the business",
      count: remit.length,
      amount: remit.reduce((s, p) => s + p.amount, 0),
      tone: "danger",
      route: "/finance",
      items: remit.slice(0, 8).map((p) => ({
        id: p.id,
        primary: name(p.contactId),
        secondary: `Order ${p.orderId.replace("ord_", "BZ-")}`,
        amount: p.amount,
        contactId: p.contactId,
        tone: "danger",
      })),
    },
    {
      key: "low_stock",
      label: "Low Stock",
      description: "At or below reorder level",
      count: lowStock.length,
      tone: "warning",
      route: "/inventory",
      items: lowStock.map((p) => ({
        id: p.id,
        primary: p.name,
        secondary: `${p.stock} in stock · reorder at ${p.reorderLevel}`,
        meta: p.category,
        tone: p.stock < p.reorderLevel / 2 ? "danger" : "warning",
      })),
    },
    {
      key: "campaign_attention",
      label: "Campaigns Needing Attention",
      description: "Efficiency or delivery issues detected",
      count: badCampaigns.length,
      tone: "info",
      route: "/ads",
      items: badCampaigns.map((c) => ({
        id: c.id,
        primary: c.name,
        secondary: c.issue ?? "Needs review",
        meta: `ROAS ${(c.revenue / c.spend).toFixed(2)}`,
        tone: "warning",
      })),
    },
  ];
}

/* --------------------------------------------------------- crm overview */

export function getCrmOverview(db: Database) {
  const leadRows = buildLeadRows(db);
  const open = leadRows.filter((l) => l.stage !== "won");
  const pipelineValue = open.reduce((s, l) => s + l.value, 0);
  const won = leadRows.filter((l) => l.stage === "won");

  const stageCounts = ["new_lead", "assigned", "contacted", "qualified", "interested", "negotiating", "order_started", "won"].map(
    (stage) => ({ stage, count: leadRows.filter((l) => l.stage === stage).length }),
  );

  const sourceMap = new Map<AcquisitionSource, { leads: number; won: number; value: number }>();
  leadRows.forEach((l) => {
    const e = sourceMap.get(l.source) ?? { leads: 0, won: 0, value: 0 };
    e.leads += 1;
    if (l.stage === "won") e.won += 1;
    e.value += l.value;
    sourceMap.set(l.source, e);
  });

  return {
    kpis: {
      openLeads: open.length,
      pipelineValue,
      wonThisMonth: won.length,
      winRate: leadRows.length ? (won.length / leadRows.length) * 100 : 0,
      avgDealSize: won.length ? Math.round(won.reduce((s, l) => s + l.value, 0) / won.length) : 0,
      overdueFollowUps: db.tasks.filter((t) => t.status === "open" && isPast(t.dueAt)).length,
      activeCustomers: db.contacts.filter((c) => ["customer", "repeat_customer", "vip"].includes(c.lifecycle)).length,
      atRisk: db.contacts.filter((c) => c.lifecycle === "at_risk" || c.lifecycle === "dormant").length,
    },
    stageCounts,
    lifecycleSplit: (
      ["contact", "prospect", "lead", "customer", "repeat_customer", "vip", "at_risk", "dormant", "reactivated"] as Lifecycle[]
    ).map((lc) => ({ lifecycle: lc, count: db.contacts.filter((c) => c.lifecycle === lc).length })),
    recentLeads: leadRows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8),
    upcomingFollowUps: db.tasks
      .filter((t) => t.status === "open")
      .sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt))
      .slice(0, 8),
    sources: [...sourceMap.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.value - a.value),
  };
}

/* ------------------------------------------------------------ duplicates */

export interface DuplicateGroup {
  key: string;
  reason: string;
  contacts: Contact[];
}

export function findDuplicates(db: Database): DuplicateGroup[] {
  const byLastName = new Map<string, Contact[]>();
  db.contacts.forEach((c) => {
    const key = `${c.lastName.toLowerCase()}|${c.city.toLowerCase()}`;
    byLastName.set(key, [...(byLastName.get(key) ?? []), c]);
  });
  return [...byLastName.entries()]
    .filter(([, list]) => list.length > 1)
    .slice(0, 8)
    .map(([key, list]) => ({
      key,
      reason: "Same surname and city — review before merging",
      contacts: list,
    }));
}

/* ---------------------------------------------------------- global search */

export interface SearchHit {
  id: string;
  label: string;
  sublabel: string;
  group: "Contacts" | "Leads" | "Orders" | "Segments" | "Products";
  to: string;
  params?: Record<string, string>;
}

export function globalSearch(db: Database, term: string, limit = 12): SearchHit[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  const hits: SearchHit[] = [];

  db.contacts.forEach((c) => {
    if (hits.length > 40) return;
    if (`${fullName(c)} ${c.phone} ${c.email ?? ""}`.toLowerCase().includes(needle)) {
      hits.push({
        id: c.id,
        label: fullName(c),
        sublabel: `${c.phone} · ${c.city}`,
        group: "Contacts",
        to: "/crm/contacts/$contactId",
        params: { contactId: c.id },
      });
    }
  });
  db.orders.forEach((o) => {
    if (o.reference.toLowerCase().includes(needle)) {
      hits.push({ id: o.id, label: o.reference, sublabel: o.productNames.join(", "), group: "Orders", to: "/orders" });
    }
  });
  db.segments.forEach((s) => {
    if (s.name.toLowerCase().includes(needle)) {
      hits.push({ id: s.id, label: s.name, sublabel: s.rulesSummary, group: "Segments", to: "/crm/segments" });
    }
  });
  db.products.forEach((p) => {
    if (p.name.toLowerCase().includes(needle)) {
      hits.push({ id: p.id, label: p.name, sublabel: p.category, group: "Products", to: "/products" });
    }
  });

  return hits.slice(0, limit);
}