/**
 * Deterministic seed dataset for the Bizriva CRM workspace.
 *
 * This module is the ONLY place that fabricates records. Screens never import
 * it directly — they go through the repositories in `src/domain/repositories.ts`
 * so the source can later be replaced by network calls.
 */

import type {
  Activity,
  AcquisitionAttribution,
  Campaign,
  ChannelIdentity,
  Contact,
  Conversation,
  DeliverySummary,
  Lead,
  LeadStage,
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
  Channel,
  AcquisitionSource,
  Lifecycle,
} from "./types";

/* ---------------------------------------------------------------- utilities */

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rnd = makeRng(20260929);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p: number) => rnd() < p;

/** Fixed "now" anchor keeps server and client renders identical. */
export const NOW = new Date("2026-09-29T09:00:00.000Z");

const daysAgo = (d: number, hourOffset = 0) =>
  new Date(NOW.getTime() - d * 86_400_000 + hourOffset * 3_600_000).toISOString();
const daysAhead = (d: number, hourOffset = 0) =>
  new Date(NOW.getTime() + d * 86_400_000 + hourOffset * 3_600_000).toISOString();

/* -------------------------------------------------------------- workspaces */

export const workspaces: Workspace[] = [
  {
    id: "ws_luxe",
    name: "Luxe Hair Collective",
    handle: "luxehair",
    industry: "Beauty & Hair Ecommerce",
    currency: "NGN",
    country: "NG",
    plan: "Growth",
  },
  {
    id: "ws_urbanfit",
    name: "UrbanFit Apparel",
    handle: "urbanfit",
    industry: "Fashion Dropshipping",
    currency: "NGN",
    country: "NG",
    plan: "Scale",
  },
  {
    id: "ws_gadget",
    name: "Gadget Republic",
    handle: "gadgetrepublic",
    industry: "Consumer Electronics",
    currency: "NGN",
    country: "GH",
    plan: "Starter",
  },
];

export const team: TeamMember[] = [
  { id: "u_ade", name: "Ademola Adeniran", email: "ademola@luxehair.co", role: "owner", avatarColor: "brand", active: true },
  { id: "u_zainab", name: "Zainab Bello", email: "zainab@luxehair.co", role: "manager", avatarColor: "info", active: true },
  { id: "u_chidi", name: "Chidi Okeke", email: "chidi@luxehair.co", role: "sales_rep", avatarColor: "success", active: true },
  { id: "u_amaka", name: "Amaka Nwosu", email: "amaka@luxehair.co", role: "sales_rep", avatarColor: "purple", active: true },
  { id: "u_tobi", name: "Tobi Familusi", email: "tobi@luxehair.co", role: "support", avatarColor: "warning", active: true },
  { id: "u_seyi", name: "Seyi Ogunleye", email: "seyi@luxehair.co", role: "fulfilment", avatarColor: "info", active: true },
  { id: "u_nkechi", name: "Nkechi Eze", email: "nkechi@luxehair.co", role: "finance", avatarColor: "brand", active: true },
];

export const currentUser = team[0]!;

const REPS = ["u_chidi", "u_amaka", "u_zainab", "u_tobi"];

/* ---------------------------------------------------------------- catalogue */

export const products: Product[] = [
  { id: "p_1", name: "Raw Vietnamese Bone Straight 20\"", category: "Hair Bundles", price: 185000, cost: 104000, stock: 42, reorderLevel: 20 },
  { id: "p_2", name: "Double Drawn Body Wave 18\"", category: "Hair Bundles", price: 156000, cost: 88000, stock: 12, reorderLevel: 20 },
  { id: "p_3", name: "HD Lace Frontal 13x4", category: "Closures & Frontals", price: 96000, cost: 51000, stock: 7, reorderLevel: 15 },
  { id: "p_4", name: "Pixie Curl Glueless Wig", category: "Ready-to-Wear Wigs", price: 245000, cost: 141000, stock: 18, reorderLevel: 10 },
  { id: "p_5", name: "Kinky Straight Clip-ins", category: "Extensions", price: 72000, cost: 39000, stock: 64, reorderLevel: 25 },
  { id: "p_6", name: "Silk Press Care Kit", category: "Hair Care", price: 28500, cost: 13200, stock: 3, reorderLevel: 30 },
  { id: "p_7", name: "Bonnet & Satin Scarf Set", category: "Accessories", price: 12500, cost: 4800, stock: 140, reorderLevel: 40 },
  { id: "p_8", name: "Coloured Burgundy Deep Wave 22\"", category: "Hair Bundles", price: 212000, cost: 121000, stock: 9, reorderLevel: 12 },
];

const FIRST = [
  "Adaeze", "Bukola", "Chiamaka", "Damilola", "Efe", "Folake", "Grace", "Halima", "Ifeoma", "Jumoke",
  "Kemi", "Lola", "Maryam", "Ngozi", "Oluchi", "Precious", "Queen", "Rukayat", "Simisola", "Temitope",
  "Uche", "Vivian", "Wunmi", "Yetunde", "Zara", "Blessing", "Chioma", "Deborah", "Esther", "Fatima",
  "Gloria", "Hauwa", "Ijeoma", "Joy", "Khadija", "Linda", "Modupe", "Nneka", "Omotola", "Patience",
];
const LAST = [
  "Adeyemi", "Balogun", "Chukwu", "Dada", "Eze", "Fashola", "Gbadamosi", "Hassan", "Ibrahim", "Johnson",
  "Kalu", "Lawal", "Mohammed", "Nwachukwu", "Okafor", "Popoola", "Quadri", "Raji", "Salami", "Tijani",
  "Udeh", "Vincent", "Williams", "Yusuf", "Zubair",
];
const CITIES: { city: string; country: string }[] = [
  { city: "Lagos", country: "NG" }, { city: "Abuja", country: "NG" }, { city: "Port Harcourt", country: "NG" },
  { city: "Ibadan", country: "NG" }, { city: "Benin City", country: "NG" }, { city: "Kano", country: "NG" },
  { city: "Enugu", country: "NG" }, { city: "Accra", country: "GH" }, { city: "Nairobi", country: "KE" },
  { city: "London", country: "GB" }, { city: "Houston", country: "US" }, { city: "Dubai", country: "AE" },
];
const SOURCES: AcquisitionSource[] = [
  "meta_ads", "tiktok_ads", "instagram_organic", "whatsapp_status", "referral", "google_ads", "website", "marketplace",
];
const CHANNELS: Channel[] = ["whatsapp", "instagram", "tiktok", "facebook", "email", "phone"];
const CAMPAIGNS = [
  "Q3 Bone Straight Retarget", "Lagos Wig Launch", "TikTok Curl Hook", "Search — Human Hair Lagos",
  "Diaspora Bundle Push", "September Restock Blast",
];
const TAGS = ["high-intent", "diaspora", "bulk-buyer", "stylist", "wholesale", "price-sensitive", "referrer", "vip-list"];

/* ----------------------------------------------------------------- contacts */

const LIFECYCLE_POOL: Lifecycle[] = [
  "contact", "prospect", "lead", "lead", "customer", "customer", "repeat_customer",
  "vip", "at_risk", "dormant", "reactivated",
];

function buildContacts(count: number): Contact[] {
  const out: Contact[] = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST[i % FIRST.length]!;
    const last = LAST[(i * 7 + 3) % LAST.length]!;
    const loc = pick(CITIES);
    const lifecycle = LIFECYCLE_POOL[i % LIFECYCLE_POOL.length]!;
    const isBuyer = ["customer", "repeat_customer", "vip", "at_risk", "dormant", "reactivated"].includes(lifecycle);
    const totalOrders = isBuyer ? (lifecycle === "vip" ? int(6, 14) : lifecycle === "repeat_customer" ? int(3, 6) : int(1, 3)) : 0;
    const aov = int(70, 260) * 1000;
    const ltv = totalOrders * aov;
    const delivered = Math.round(ltv * (0.72 + rnd() * 0.25));
    const createdDays = int(4, 420);
    const lastActivityDays = lifecycle === "dormant" ? int(90, 220) : lifecycle === "at_risk" ? int(45, 89) : int(0, 21);
    out.push({
      id: `c_${(i + 1).toString().padStart(4, "0")}`,
      firstName: first,
      lastName: last,
      phone: `+234 ${int(700, 913)} ${int(100, 999)} ${int(1000, 9999)}`,
      email: chance(0.72) ? `${first.toLowerCase()}.${last.toLowerCase()}@${pick(["gmail.com", "yahoo.com", "outlook.com", "icloud.com"])}` : undefined,
      countryCode: loc.country,
      city: loc.city,
      lifecycle,
      source: SOURCES[(i * 5 + 2) % SOURCES.length]!,
      ownerId: REPS[i % REPS.length]!,
      leadScore: lifecycle === "vip" ? int(82, 98) : isBuyer ? int(55, 90) : int(12, 84),
      tags: Array.from(new Set([pick(TAGS), ...(chance(0.35) ? [pick(TAGS)] : [])])),
      createdAt: daysAgo(createdDays),
      lastActivityAt: daysAgo(lastActivityDays, -int(0, 12)),
      totalOrders,
      lifetimeValue: ltv,
      deliveredRevenue: delivered,
      contributionProfit: Math.round(delivered * (0.26 + rnd() * 0.16)),
      outstandingBalance: isBuyer && chance(0.22) ? int(25, 240) * 1000 : 0,
      lastPurchaseAt: totalOrders > 0 ? daysAgo(lastActivityDays + int(0, 25)) : undefined,
      consentMarketing: chance(0.78),
      notesCount: int(0, 6),
    });
  }
  return out;
}

export const contacts: Contact[] = buildContacts(148);

export const channelIdentities: ChannelIdentity[] = contacts.flatMap((c, i) => {
  const rows: ChannelIdentity[] = [
    {
      id: `ci_${c.id}_wa`,
      contactId: c.id,
      channel: "whatsapp",
      handle: c.phone,
      verified: true,
      primary: true,
      lastSeenAt: c.lastActivityAt,
    },
  ];
  if (i % 3 === 0) {
    rows.push({
      id: `ci_${c.id}_ig`,
      contactId: c.id,
      channel: "instagram",
      handle: `@${c.firstName.toLowerCase()}_${c.lastName.toLowerCase().slice(0, 4)}`,
      verified: false,
      primary: false,
      lastSeenAt: c.lastActivityAt,
    });
  }
  if (c.email) {
    rows.push({
      id: `ci_${c.id}_em`,
      contactId: c.id,
      channel: "email",
      handle: c.email,
      verified: true,
      primary: false,
      lastSeenAt: c.lastActivityAt,
    });
  }
  return rows;
});

export const attributions: AcquisitionAttribution[] = contacts.map((c, i) => ({
  id: `at_${c.id}`,
  contactId: c.id,
  source: c.source,
  campaign: c.source.includes("ads") ? CAMPAIGNS[i % CAMPAIGNS.length] : undefined,
  adSet: c.source.includes("ads") ? `${c.city} 25-44 F` : undefined,
  creative: c.source.includes("ads") ? `Reel_${(i % 9) + 1}` : undefined,
  landedAt: c.createdAt,
  firstTouchChannel: CHANNELS[i % CHANNELS.length]!,
}));

/* -------------------------------------------------------------------- leads */

const STAGE_POOL: LeadStage[] = [
  "new_lead", "new_lead", "assigned", "contacted", "contacted", "qualified",
  "interested", "negotiating", "order_started", "won",
];

export const leads: Lead[] = contacts
  .filter((c) => ["contact", "prospect", "lead", "reactivated", "at_risk"].includes(c.lifecycle) || chance(0.18))
  .map((c, i) => {
    const stage = STAGE_POOL[i % STAGE_POOL.length]!;
    const followUpOffset = i % 5;
    const overdue = followUpOffset === 0;
    return {
      id: `l_${c.id}`,
      contactId: c.id,
      stage,
      outcome: stage === "contacted" && i % 7 === 0 ? "no_response" : undefined,
      productInterestId: undefined,
      source: c.source,
      campaign: c.source.includes("ads") ? CAMPAIGNS[i % CAMPAIGNS.length] : undefined,
      ownerId: c.ownerId,
      score: c.leadScore,
      value: int(60, 420) * 1000,
      nextFollowUpAt: overdue ? daysAgo(int(1, 6), int(1, 8)) : daysAhead(followUpOffset - 1, int(1, 9)),
      slaStatus: overdue ? "breached" : followUpOffset === 1 ? "due_soon" : stage === "won" ? "met" : "on_track",
      createdAt: c.createdAt,
      updatedAt: c.lastActivityAt,
    } satisfies Lead;
  });

export const opportunities: Opportunity[] = leads
  .filter((l) => ["qualified", "interested", "negotiating", "order_started"].includes(l.stage))
  .map((l, i) => ({
    id: `o_${l.id}`,
    contactId: l.contactId,
    leadId: l.id,
    title: `${products[i % products.length]!.name} — ${int(1, 4)} unit deal`,
    value: l.value,
    stage: l.stage,
    probability: l.stage === "negotiating" ? 65 : l.stage === "order_started" ? 85 : 40,
    expectedCloseAt: daysAhead(int(2, 28)),
    ownerId: l.ownerId,
    createdAt: l.createdAt,
    status: "open" as const,
  }));

/* ------------------------------------------------------------------- orders */

const ORDER_STATUS_POOL = [
  "pending_confirmation", "confirmed", "awaiting_dispatch", "in_transit",
  "delivered", "delivered", "delivered", "returned", "cancelled",
] as const;

export const orders: OrderSummary[] = [];
export const deliveries: DeliverySummary[] = [];
export const payments: PaymentSummary[] = [];

let orderSeq = 1000;
contacts.forEach((c, ci) => {
  for (let k = 0; k < c.totalOrders; k++) {
    orderSeq += 1;
    const prod = products[(ci + k) % products.length]!;
    const qty = int(1, 3);
    const status = ORDER_STATUS_POOL[(ci + k) % ORDER_STATUS_POOL.length]!;
    const placedDays = int(1, 300);
    const total = prod.price * qty;
    const method = chance(0.55) ? "cash_on_delivery" : chance(0.6) ? "bank_transfer" : "card";
    const paymentStatus =
      status === "delivered" ? (method === "cash_on_delivery" && chance(0.18) ? "cod_pending" : "paid")
        : status === "cancelled" ? "unpaid"
          : method === "cash_on_delivery" ? "cod_pending"
            : chance(0.5) ? "part_paid" : "paid";
    const order: OrderSummary = {
      id: `ord_${orderSeq}`,
      reference: `BZ-${orderSeq}`,
      contactId: c.id,
      placedAt: daysAgo(placedDays, -int(0, 10)),
      status,
      itemsCount: qty,
      total,
      cogs: prod.cost * qty,
      shippingFee: int(3, 12) * 1000,
      paymentStatus,
      paymentMethod: method,
      channel: CHANNELS[(ci + k) % CHANNELS.length]!,
      productNames: [prod.name],
    };
    orders.push(order);

    const dStatus =
      status === "delivered" ? "delivered"
        : status === "in_transit" ? "in_transit"
          : status === "awaiting_dispatch" ? "scheduled"
            : status === "returned" ? "returned"
              : status === "confirmed" ? "scheduled"
                : "not_scheduled";
    const failed = status === "in_transit" && (ci + k) % 11 === 0;
    deliveries.push({
      id: `dl_${orderSeq}`,
      orderId: order.id,
      contactId: c.id,
      courier: pick(["GIG Logistics", "Kwik Delivery", "Sendbox", "DHL Express", "In-house Rider"]),
      trackingRef: `TRK${int(100000, 999999)}`,
      status: failed ? "failed" : dStatus,
      scheduledFor: daysAgo(placedDays - 2),
      deliveredAt: dStatus === "delivered" ? daysAgo(placedDays - int(2, 5)) : undefined,
      attempts: failed ? int(2, 3) : 1,
      city: c.city,
      failureReason: failed ? pick(["Customer unreachable", "Wrong address", "Rescheduled by customer"]) : undefined,
    });

    payments.push({
      id: `pay_${orderSeq}`,
      orderId: order.id,
      contactId: c.id,
      amount: paymentStatus === "part_paid" ? Math.round(total * 0.4) : total,
      method,
      status: paymentStatus,
      at: daysAgo(placedDays - 1),
      remittanceDueAt: method === "cash_on_delivery" && dStatus === "delivered" ? daysAgo(placedDays - 6) : undefined,
      remitted: method === "cash_on_delivery" && dStatus === "delivered" ? !chance(0.25) : undefined,
    });
  }
});

/* ------------------------------------------------------- product interests */

export const productInterests: ProductInterest[] = contacts.slice(0, 96).map((c, i) => {
  const p = products[(i * 3) % products.length]!;
  return {
    id: `pi_${c.id}`,
    contactId: c.id,
    productId: p.id,
    productName: p.name,
    category: p.category,
    intent: (["browsing", "asked_price", "requested_sample", "ready_to_buy"] as const)[i % 4]!,
    capturedAt: daysAgo(int(1, 60)),
  };
});

/* --------------------------------------------------------- conversations */

const SAMPLE_IN = [
  "Hi, is the 20 inch bone straight still available?",
  "How much for two bundles with frontal?",
  "Can you deliver to Lekki today?",
  "I saw your TikTok, do you have burgundy?",
  "Please I want to pay on delivery.",
  "Has my order been shipped?",
  "Do you do wholesale pricing for stylists?",
];
const SAMPLE_OUT = [
  "Yes it's in stock. Would you like me to reserve one for you?",
  "Two bundles with a 13x4 HD frontal comes to ₦437,000 delivered.",
  "Lekki delivery goes out today if you confirm before 2pm.",
  "We do — burgundy deep wave 22\" is available, I'll send photos.",
  "Pay on delivery is available within Lagos. Shall I raise the order?",
];

export const conversations: Conversation[] = contacts.slice(0, 64).map((c, i) => {
  const channel = CHANNELS[i % CHANNELS.length]!;
  const awaiting = i % 3 === 0;
  const last = daysAgo(int(0, 9), -int(0, 20));
  const msgs = [
    { id: `m_${c.id}_1`, conversationId: `cv_${c.id}`, direction: "in" as const, body: SAMPLE_IN[i % SAMPLE_IN.length]!, at: daysAgo(int(2, 10)) },
    { id: `m_${c.id}_2`, conversationId: `cv_${c.id}`, direction: "out" as const, body: SAMPLE_OUT[i % SAMPLE_OUT.length]!, at: daysAgo(int(1, 2)), authorId: c.ownerId },
  ];
  if (awaiting) {
    msgs.push({
      id: `m_${c.id}_3`,
      conversationId: `cv_${c.id}`,
      direction: "in" as const,
      body: SAMPLE_IN[(i + 3) % SAMPLE_IN.length]!,
      at: last,
    });
  }
  return {
    id: `cv_${c.id}`,
    contactId: c.id,
    channel,
    subject: SAMPLE_IN[i % SAMPLE_IN.length]!.slice(0, 48),
    unread: awaiting,
    awaitingReply: awaiting,
    assigneeId: c.ownerId,
    lastMessageAt: last,
    messages: msgs,
  };
});

/* --------------------------------------------------------------- tasks */

const TASK_TITLES = [
  "Follow up on bundle quote",
  "Call back about delivery window",
  "Send restock notification",
  "Chase COD remittance",
  "Confirm wholesale order quantity",
  "Check delivery attempt outcome",
  "Share care kit upsell",
];

export const tasks: Task[] = contacts.slice(0, 72).map((c, i) => {
  const overdue = i % 4 === 0;
  const dueToday = i % 4 === 1;
  return {
    id: `t_${c.id}`,
    contactId: c.id,
    title: TASK_TITLES[i % TASK_TITLES.length]!,
    dueAt: overdue ? daysAgo(int(1, 9), int(2, 8)) : dueToday ? daysAhead(0, int(1, 7)) : daysAhead(int(1, 12), int(1, 8)),
    status: i % 9 === 3 ? "done" : "open",
    priority: (["low", "normal", "high", "urgent"] as const)[i % 4]!,
    assigneeId: c.ownerId,
    type: (["follow_up", "call", "delivery_check", "payment_chase", "general"] as const)[i % 5]!,
    createdAt: daysAgo(int(2, 30)),
  };
});

/* ------------------------------------------------------------ activities */

export const activities: Activity[] = [];
contacts.forEach((c, i) => {
  const attribution = attributions[i]!;
  activities.push({
    id: `a_${c.id}_acq`,
    contactId: c.id,
    kind: "acquisition",
    title: `First touch via ${attribution.source.replace(/_/g, " ")}`,
    description: attribution.campaign ? `Campaign: ${attribution.campaign}` : "Organic first touch",
    at: attribution.landedAt,
    channel: attribution.firstTouchChannel,
  });
  const conv = conversations.find((cv) => cv.contactId === c.id);
  if (conv) {
    activities.push({
      id: `a_${c.id}_conv`,
      contactId: c.id,
      kind: "conversation",
      title: `${conv.channel === "whatsapp" ? "WhatsApp" : conv.channel} message received`,
      description: conv.messages[0]!.body,
      at: conv.messages[0]!.at,
      channel: conv.channel,
      refId: conv.id,
    });
  }
  const lead = leads.find((l) => l.contactId === c.id);
  if (lead) {
    activities.push({
      id: `a_${c.id}_lead`,
      contactId: c.id,
      kind: "lead",
      title: `Lead moved to ${lead.stage.replace(/_/g, " ")}`,
      description: `Owner ${team.find((t) => t.id === lead.ownerId)?.name ?? "Unassigned"}`,
      at: lead.updatedAt,
      actorId: lead.ownerId,
      refId: lead.id,
    });
  }
  orders
    .filter((o) => o.contactId === c.id)
    .forEach((o) => {
      activities.push({
        id: `a_${o.id}_order`,
        contactId: c.id,
        kind: "order",
        title: `Order ${o.reference} placed`,
        description: o.productNames.join(", "),
        at: o.placedAt,
        amount: o.total,
        refId: o.id,
      });
      const d = deliveries.find((x) => x.orderId === o.id);
      if (d && d.status !== "not_scheduled") {
        activities.push({
          id: `a_${o.id}_del`,
          contactId: c.id,
          kind: "delivery",
          title: `Delivery ${d.status.replace(/_/g, " ")} — ${d.courier}`,
          description: d.failureReason ?? `Tracking ${d.trackingRef}`,
          at: d.deliveredAt ?? d.scheduledFor,
          refId: d.id,
        });
      }
      const p = payments.find((x) => x.orderId === o.id);
      if (p) {
        activities.push({
          id: `a_${o.id}_pay`,
          contactId: c.id,
          kind: "payment",
          title: `Payment ${p.status.replace(/_/g, " ")}`,
          description: p.method.replace(/_/g, " "),
          at: p.at,
          amount: p.amount,
          refId: p.id,
        });
      }
    });
});
activities.sort((a, b) => +new Date(b.at) - +new Date(a.at));

/* ------------------------------------------------------------- segments */

export const segments: Segment[] = [
  { id: "sg_1", name: "VIP Repeat Buyers", description: "3+ delivered orders with above-average basket", type: "smart", memberCount: contacts.filter((c) => c.lifecycle === "vip").length, updatedAt: daysAgo(1), rulesSummary: "lifecycle = VIP AND delivered orders ≥ 3" },
  { id: "sg_2", name: "Dormant 90+ Days", description: "No activity in the last 90 days", type: "smart", memberCount: contacts.filter((c) => c.lifecycle === "dormant").length, updatedAt: daysAgo(2), rulesSummary: "last activity > 90 days AND orders ≥ 1" },
  { id: "sg_3", name: "COD Risk Watchlist", description: "Outstanding COD balance over ₦50,000", type: "smart", memberCount: contacts.filter((c) => c.outstandingBalance > 50000).length, updatedAt: daysAgo(0, -4), rulesSummary: "outstanding balance > 50,000" },
  { id: "sg_4", name: "Diaspora Buyers", description: "Contacts outside Nigeria with purchase history", type: "smart", memberCount: contacts.filter((c) => c.countryCode !== "NG" && c.totalOrders > 0).length, updatedAt: daysAgo(4), rulesSummary: "country ≠ NG AND orders ≥ 1" },
  { id: "sg_5", name: "September Restock Waitlist", description: "Manually curated waitlist for restocked bundles", type: "static", memberCount: 36, updatedAt: daysAgo(6), rulesSummary: "Manual list" },
  { id: "sg_6", name: "Stylist Partners", description: "Salon and stylist wholesale accounts", type: "static", memberCount: contacts.filter((c) => c.tags.includes("stylist")).length, updatedAt: daysAgo(9), rulesSummary: "Manual list" },
];

/* ------------------------------------------------------------ campaigns */

export const campaigns: Campaign[] = [
  { id: "cp_1", name: "Q3 Bone Straight Retarget", platform: "meta", status: "active", spend: 1840000, revenue: 7420000, leads: 214, issue: undefined },
  { id: "cp_2", name: "Lagos Wig Launch", platform: "meta", status: "review_needed", spend: 960000, revenue: 1180000, leads: 88, issue: "ROAS below 1.5 for 5 days" },
  { id: "cp_3", name: "TikTok Curl Hook", platform: "tiktok", status: "active", spend: 1250000, revenue: 4980000, leads: 301, issue: undefined },
  { id: "cp_4", name: "Search — Human Hair Lagos", platform: "google", status: "paused", spend: 410000, revenue: 690000, leads: 41, issue: "Paused — budget exhausted" },
  { id: "cp_5", name: "Diaspora Bundle Push", platform: "meta", status: "review_needed", spend: 720000, revenue: 1010000, leads: 57, issue: "Frequency above 4.2" },
];

/* --------------------------------------------------------- notifications */

export const notifications: NotificationItem[] = [
  { id: "n_1", title: "3 deliveries failed today", body: "Lagos route — customers unreachable on second attempt.", at: daysAgo(0, -2), read: false, tone: "warning" },
  { id: "n_2", title: "COD remittance overdue", body: "₦412,000 from GIG Logistics is 3 days past due.", at: daysAgo(0, -5), read: false, tone: "warning" },
  { id: "n_3", title: "Lagos Wig Launch needs review", body: "ROAS has been below 1.5 for five consecutive days.", at: daysAgo(1), read: false, tone: "info" },
  { id: "n_4", title: "Record week for bundles", body: "Delivered revenue is up 18% against last week.", at: daysAgo(2), read: true, tone: "success" },
];

/* -------------------------------------------------------------- trends */

export const revenueTrend = Array.from({ length: 30 }, (_, i) => {
  const day = 29 - i;
  const base = 2_100_000 + Math.sin(i / 3) * 420_000 + i * 38_000;
  const revenue = Math.round(base + int(-180_000, 220_000));
  const deliveredRevenue = Math.round(revenue * (0.74 + rnd() * 0.12));
  return {
    date: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(
      new Date(NOW.getTime() - day * 86_400_000),
    ),
    revenue,
    deliveredRevenue,
    profit: Math.round(deliveredRevenue * (0.28 + rnd() * 0.1)),
    adSpend: Math.round(revenue * (0.16 + rnd() * 0.07)),
  };
});