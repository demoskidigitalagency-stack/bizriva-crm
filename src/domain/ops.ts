/**
 * Pay-on-delivery operations: sharing orders between customer agents,
 * calling, routing to riders and logistics partners, commission and true
 * profit. Pure functions over the Database, so Practice Mode and the
 * database rules (supabase/migrations/20261106030000_pod_ops.sql) agree.
 */
import type { Database } from "./database";
import type { AttemptOutcome, ContactAttempt, DeliverySummary, ID, OrderStatus, OrderSummary, Rider, TeamMember } from "./types";

const MIN = 60_000;

/* ───────────────────────────── states ───────────────────────────── */

/** City or area → Nigerian state. Unknown places stay as written. */
const CITY_STATE: Record<string, string> = {
  lagos: "Lagos", ikeja: "Lagos", lekki: "Lagos", surulere: "Lagos", yaba: "Lagos", ajah: "Lagos", ikorodu: "Lagos", "victoria island": "Lagos",
  abuja: "FCT", gwarinpa: "FCT", wuse: "FCT", "port harcourt": "Rivers", ibadan: "Oyo", "benin city": "Edo", benin: "Edo", kano: "Kano",
  kaduna: "Kaduna", enugu: "Enugu", owerri: "Imo", abeokuta: "Ogun", ilorin: "Kwara", jos: "Plateau", calabar: "Cross River", uyo: "Akwa Ibom",
  asaba: "Delta", warri: "Delta", onitsha: "Anambra", awka: "Anambra", akure: "Ondo", osogbo: "Osun", "ado ekiti": "Ekiti", aba: "Abia", umuahia: "Abia",
};
export const NG_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT",
  "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
  "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];
export function stateOf(city?: string): string {
  const c = (city ?? "").trim();
  if (!c) return "Unknown";
  if (NG_STATES.includes(c)) return c;
  return CITY_STATE[c.toLowerCase()] ?? c;
}
export function orderState(db: Database, o: OrderSummary): string {
  return stateOf(db.contacts.find((c) => c.id === o.contactId)?.city);
}

/* ───────────────────────────── agents ───────────────────────────── */

/** Orders an agent still has to call or confirm. */
export const CALL_STATUSES: OrderStatus[] = ["pending_verification"];
export const OPEN_STATUSES: OrderStatus[] = ["pending_verification", "confirmed", "processing", "ready_for_dispatch"];
const AGENT_ROLES: TeamMember["role"][] = ["sales_rep", "support", "manager"];

export function isAgent(m: TeamMember) { return m.active && AGENT_ROLES.includes(m.role); }
export function agentsOnDuty(db: Database) { return db.team.filter((m) => isAgent(m) && m.onDuty !== false); }
export function workload(db: Database, memberId: ID) {
  return db.orders.filter((o) => o.assignedTo === memberId && CALL_STATUSES.includes(o.status)).length;
}

/** Who should get this order, by the business's rule. */
export function pickAgent(db: Database, o: OrderSummary, exclude: ID[] = []): ID | undefined {
  const pool = agentsOnDuty(db).filter((m) => !exclude.includes(m.id));
  if (!pool.length) return undefined;
  const least = (list: TeamMember[]) => [...list].sort((a, b) => workload(db, a.id) - workload(db, b.id) || a.name.localeCompare(b.name))[0]!.id;
  const mode = db.settings.assignment.mode;
  if (mode === "by_state") {
    const st = orderState(db, o);
    const local = pool.filter((m) => m.states?.includes(st));
    return least(local.length ? local : pool);
  }
  if (mode === "round_robin") {
    const order = [...pool].sort((a, b) => a.name.localeCompare(b.name));
    const last = order.findIndex((m) => m.id === db.settings.assignment.lastAssigned);
    return order[(last + 1) % order.length]!.id;
  }
  return least(pool);
}

export function assignTo(db: Database, orderId: ID, memberId: ID | undefined, now = new Date()): Database {
  if (!memberId) return db;
  return {
    ...db,
    orders: db.orders.map((o) => (o.id === orderId ? { ...o, assignedTo: memberId, assignedAt: now.toISOString() } : o)),
    settings: { ...db.settings, assignment: { ...db.settings.assignment, lastAssigned: memberId } },
  };
}

export function lastAttempt(o: OrderSummary): ContactAttempt | undefined { return o.contactAttempts?.at(-1); }

/** Minutes since the order reached its current agent without a single call or chat. */
export function minutesUncalled(o: OrderSummary, now = new Date()): number | null {
  if (!CALL_STATUSES.includes(o.status) || o.contactAttempts?.length) return null;
  return Math.max(0, (now.getTime() - new Date(o.assignedAt ?? o.placedAt).getTime()) / MIN);
}
/** Supervisors are alerted once an order waits this long without a call… */
export function isOverdue(db: Database, o: OrderSummary, now = new Date()) {
  const m = minutesUncalled(o, now);
  return m !== null && m >= db.settings.assignment.callWithinMinutes;
}
/** …and it moves to another agent at twice that time, if moving is on. */
export function shouldMove(db: Database, o: OrderSummary, now = new Date()) {
  const m = minutesUncalled(o, now);
  return db.settings.assignment.moveUncalled && m !== null && m >= 2 * db.settings.assignment.callWithinMinutes;
}

/**
 * Share every unassigned order, and (if switched on) move orders nobody
 * called in time to someone else. Returns what changed.
 */
export function runAssignment(db: Database, now = new Date(), opts: { move?: boolean } = {}): { db: Database; assigned: number; moved: number } {
  let next = db; let assigned = 0; let moved = 0;
  for (const o of db.orders) {
    if (!OPEN_STATUSES.includes(o.status)) continue;
    const cur = next.orders.find((x) => x.id === o.id)!;
    if (!cur.assignedTo || !next.team.some((m) => m.id === cur.assignedTo && m.active)) {
      const who = pickAgent(next, cur);
      if (who) { next = assignTo(next, cur.id, who, now); assigned++; }
    } else if (opts.move !== false && shouldMove(next, cur, now)) {
      const who = pickAgent(next, cur, [cur.assignedTo, ...(cur.movedFrom ?? [])]);
      if (who) {
        next = assignTo(next, cur.id, who, now);
        next = { ...next, orders: next.orders.map((x) => (x.id === cur.id ? { ...x, movedFrom: [...(x.movedFrom ?? []), cur.assignedTo!] } : x)) };
        moved++;
      }
    }
  }
  return { db: next, assigned, moved };
}

export function recordAttempt(db: Database, orderId: ID, by: ID, via: ContactAttempt["via"], outcome: AttemptOutcome, note?: string, now = new Date()): Database {
  return {
    ...db,
    orders: db.orders.map((o) => (o.id === orderId ? { ...o, contactAttempts: [...(o.contactAttempts ?? []), { at: now.toISOString(), by, via, outcome, ...(note ? { note } : {}) }] } : o)),
  };
}

export const OUTCOME_LABEL: Record<AttemptOutcome, string> = { reached: "Reached", no_answer: "No answer", busy: "Busy", wrong_number: "Wrong number", call_back: "Call back later" };

/** Phone in international digits for tel: and wa.me links. */
export function phoneDigits(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("0") && d.length === 11 ? `234${d.slice(1)}` : d;
}

/* ───────────────────────────── commission ───────────────────────────── */

const CLOSED: OrderStatus[] = ["confirmed", "processing", "ready_for_dispatch", "dispatched", "in_transit", "delivered"];
export const isPaid = (o: OrderSummary) => o.paymentStatus === "paid" || (o.amountPaid ?? 0) >= o.total;
/** Commission is earned only when the order is delivered and the money is in. */
export const earnsCommission = (o: OrderSummary) => o.status === "delivered" && isPaid(o);

export interface AgentScore {
  member: TeamMember; closed: number; delivered: number; earnedOrders: number; earned: number; unpaid: number; pending: number;
  target: number; progress: number; calls: number; uncalled: number; deliveryRate: number;
}

/** On or after the first day of `ref`'s month (Practice data is dated to its own "today"). */
function inMonth(iso: string, ref: Date) { return new Date(iso) >= new Date(ref.getFullYear(), ref.getMonth(), 1); }

/** Leaderboard for the month of `monthOf`. Earned commission counts every period; targets count this month. */
export function agentScores(db: Database, monthOf = new Date(), now = new Date()): AgentScore[] {
  const per = db.settings.commission.perOrder;
  return db.team.filter(isAgent).map((m) => {
    const mine = db.orders.filter((o) => o.assignedTo === m.id);
    const month = mine.filter((o) => inMonth(o.placedAt, monthOf));
    const closed = month.filter((o) => CLOSED.includes(o.status)).length;
    const delivered = mine.filter((o) => o.status === "delivered").length;
    const earnedList = mine.filter(earnsCommission);
    const unpaidList = earnedList.filter((o) => !o.commissionPaidAt);
    const pending = mine.filter((o) => CLOSED.includes(o.status) && !earnsCommission(o)).length;
    const ended = mine.filter((o) => ["delivered", "refused", "returned"].includes(o.status)).length;
    const target = m.monthlyTarget ?? 0;
    return {
      member: m, closed, delivered, earnedOrders: earnedList.length, earned: earnedList.length * per, unpaid: unpaidList.length * per, pending: pending * per,
      target, progress: target ? Math.min(1, closed / target) : 0,
      calls: mine.reduce((s, o) => s + (o.contactAttempts?.filter((a) => inMonth(a.at, monthOf)).length ?? 0), 0),
      uncalled: mine.filter((o) => isOverdue(db, o, now)).length,
      deliveryRate: ended ? delivered / ended : 0,
    };
  }).sort((a, b) => b.closed - a.closed || b.earned - a.earned);
}

export function payCommission(db: Database, memberId: ID, now = new Date()): Database {
  return { ...db, orders: db.orders.map((o) => (o.assignedTo === memberId && earnsCommission(o) && !o.commissionPaidAt ? { ...o, commissionPaidAt: now.toISOString() } : o)) };
}

/* ───────────────────────────── logistics ───────────────────────────── */

/** Cheapest active rider or partner who covers the state. */
export function partnerFor(db: Database, state: string): Rider | undefined {
  return db.riders.filter((r) => r.active && r.states?.includes(state)).sort((a, b) => (a.fees?.[state] ?? 0) - (b.fees?.[state] ?? 0))[0];
}
export function feeFor(r: Rider | undefined, state: string): number { return r?.fees?.[state] ?? 0; }

export function newToken() {
  const b = new Uint8Array(12);
  (globalThis.crypto ?? { getRandomValues: (x: Uint8Array) => x.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export const APP_ORIGIN = "https://bizriva-crm.vercel.app";
export const deliveryLink = (token: string) => `${APP_ORIGIN}/d/${token}`;

/** The one-tap WhatsApp message to the rider or partner. */
export function partnerMessage(db: Database, d: DeliverySummary, token: string, currency = "NGN"): string {
  const o = db.orders.find((x) => x.id === d.orderId);
  const c = db.contacts.find((x) => x.id === d.contactId);
  const due = o ? Math.max(0, o.total - (o.amountPaid ?? 0)) : 0;
  const money = new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(due);
  return [
    `🚚 *New delivery — ${o?.reference ?? d.trackingRef}*`,
    `${c ? `${c.firstName} ${c.lastName}` : "Customer"} · ${c?.phone ?? ""}`,
    `${c?.address ? `${c.address}, ` : ""}${d.city}${c?.landmark ? ` (near ${c.landmark})` : ""}`,
    o ? `Items: ${o.productNames.join(", ")}` : "",
    due > 0 ? `*Collect: ${money}*` : "Already paid — collect nothing",
    "",
    `Accept and update here (no login): ${deliveryLink(token)}`,
  ].filter(Boolean).join("\n");
}

export function minutesNotAccepted(d: DeliverySummary, now = new Date()): number | null {
  if (!d.sentAt || d.acceptedAt || !["scheduled", "not_scheduled"].includes(d.status)) return null;
  return (now.getTime() - new Date(d.sentAt).getTime()) / MIN;
}

export interface PartnerStatement { rider: Rider; delivered: number; failed: number; cashCollected: number; fees: number; failedCharges: number; remitted: number; owes: number }

/** What each rider/partner owes you: cash collected − their fees − what they've handed in. */
export function partnerStatement(db: Database, r: Rider): PartnerStatement {
  const dels = db.deliveries.filter((d) => d.riderId === r.id);
  const delivered = dels.filter((d) => d.status === "delivered");
  const failed = dels.reduce((n, d) => n + (d.status === "failed" || d.status === "returned" ? Math.max(1, d.attempts) : 0), 0);
  const orderIds = new Set(delivered.map((d) => d.orderId));
  const cod = db.payments.filter((p) => orderIds.has(p.orderId) && p.method === "cash_on_delivery" && p.status === "paid");
  const cashCollected = cod.reduce((s, p) => s + p.amount, 0);
  const remitted = cod.filter((p) => p.remitted).reduce((s, p) => s + p.amount, 0);
  const fees = delivered.reduce((s, d) => s + (d.fee ?? feeFor(r, stateOf(d.city))), 0);
  const failedCharges = failed * (r.failedFee ?? 0);
  return { rider: r, delivered: delivered.length, failed, cashCollected, fees, failedCharges, remitted, owes: cashCollected - remitted - fees - failedCharges };
}

/* ───────────────────────────── profit ───────────────────────────── */

export interface TrueProfit {
  deliveredRevenue: number; productCost: number; deliveryFees: number; failedCharges: number; commission: number; adSpend: number; profit: number; orders: number;
}

/** Profit on delivered orders after product cost, delivery fees, failed deliveries, commission and ad spend. */
export function trueProfit(db: Database, since?: Date): TrueProfit {
  const delivered = db.orders.filter((o) => o.status === "delivered" && (!since || new Date(o.placedAt) >= since));
  const ids = new Set(delivered.map((o) => o.id));
  const dels = db.deliveries.filter((d) => ids.has(d.orderId));
  const rider = (id?: ID) => db.riders.find((r) => r.id === id);
  const deliveryFees = dels.reduce((s, d) => s + (d.fee ?? (rider(d.riderId) ? feeFor(rider(d.riderId), stateOf(d.city)) : 0)), 0)
    + delivered.filter((o) => !dels.some((d) => d.orderId === o.id && (d.fee || rider(d.riderId)))).reduce((s, o) => s + o.shippingFee, 0);
  const failedCharges = db.deliveries.filter((d) => (d.status === "failed" || d.status === "returned") && (!since || new Date(d.scheduledFor) >= since))
    .reduce((s, d) => s + Math.max(1, d.attempts) * (rider(d.riderId)?.failedFee ?? 0), 0);
  const commission = delivered.filter((o) => o.assignedTo && isPaid(o)).length * db.settings.commission.perOrder;
  const adSpend = db.campaigns.reduce((s, c) => s + c.spend, 0) * (since ? 0.25 : 1);
  const deliveredRevenue = delivered.reduce((s, o) => s + o.total, 0);
  const productCost = delivered.reduce((s, o) => s + o.cogs, 0);
  return { deliveredRevenue, productCost, deliveryFees, failedCharges, commission, adSpend: Math.round(adSpend), orders: delivered.length,
    profit: Math.round(deliveredRevenue - productCost - deliveryFees - failedCharges - commission - adSpend) };
}

/** Delivery success by state. */
export function deliveryByState(db: Database) {
  const rows = new Map<string, { state: string; orders: number; delivered: number; failed: number; revenue: number }>();
  for (const o of db.orders) {
    if (["pending_verification", "cancelled"].includes(o.status)) continue;
    const st = orderState(db, o);
    const r = rows.get(st) ?? { state: st, orders: 0, delivered: 0, failed: 0, revenue: 0 };
    r.orders++;
    if (o.status === "delivered") { r.delivered++; r.revenue += o.total; }
    if (o.status === "refused" || o.status === "returned") r.failed++;
    rows.set(st, r);
  }
  return [...rows.values()].map((r) => ({ ...r, rate: r.delivered + r.failed ? r.delivered / (r.delivered + r.failed) : 0 })).sort((a, b) => b.orders - a.orders);
}
