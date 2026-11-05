/**
 * Morning Money Brief: what happened yesterday and what needs you today,
 * in plain words. Revenue counts only delivered orders (cash-on-delivery
 * isn't money until it's delivered). The backend sends the same brief to
 * WhatsApp or email at the chosen time.
 */
import type { Database } from "./database";
import { codRisk, fullName } from "./repositories";
import { daysToBirthday } from "./memory";

const DAY = 86_400_000;
const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export interface BriefAction { label: string; detail: string; to: string; tone: "danger" | "warning" | "info" | "success" }

export interface MoneyBrief {
  date: Date;
  headline: string;
  yesterday: { delivered: number; deliveredCount: number; created: number; confirmed: number; cancelled: number; avgDelivered: number; change: number | null };
  cash: { withRiders: number; riders: { name: string; amount: number }[]; overdue: number; partPaidBalance: number };
  pipeline: { toConfirm: number; toConfirmValue: number; highRisk: number; readyToDispatch: number; failedDeliveries: number };
  ads: { spend: number; delivered: number; roas: number | null; best?: { name: string; roas: number }; worst?: { name: string; roas: number } };
  topProduct?: { name: string; units: number };
  lowStock: { name: string; stock: number }[];
  complaints: number;
  needsReply: number;
  birthdays: { contactId: string; name: string; inDays: number }[];
  actions: BriefAction[];
}

export function buildBrief(db: Database, now: Date): MoneyBrief {
  const today = sod(now);
  const yStart = today - DAY;
  const inRange = (iso: string | undefined, a: number, b: number) => { if (!iso) return false; const t = new Date(iso).getTime(); return t >= a && t < b; };

  // Delivered revenue by day comes from delivery dates.
  const deliveredOn = (a: number, b: number) => db.deliveries.filter((d) => d.status === "delivered" && inRange(d.deliveredAt, a, b))
    .map((d) => db.orders.find((o) => o.id === d.orderId)).filter((o): o is NonNullable<typeof o> => !!o);
  const yDelivered = deliveredOn(yStart, today);
  const delivered = yDelivered.reduce((s, o) => s + o.total, 0);
  const weekDelivered = deliveredOn(today - 8 * DAY, yStart).reduce((s, o) => s + o.total, 0);
  const avgDelivered = weekDelivered / 7;
  const change = avgDelivered > 0 ? Math.round(((delivered - avgDelivered) / avgDelivered) * 100) : null;

  const yOrders = db.orders.filter((o) => inRange(o.placedAt, yStart, today));
  const confirmedStatuses = ["confirmed", "processing", "ready_for_dispatch", "dispatched", "in_transit", "delivered"];

  const unremitted = db.payments.filter((p) => p.method === "cash_on_delivery" && p.remitted === false);
  const byRider = new Map<string, number>();
  unremitted.forEach((p) => {
    const rider = db.deliveries.find((d) => d.orderId === p.orderId)?.riderId;
    const name = db.riders.find((r) => r.id === rider)?.name ?? "Courier or unassigned";
    byRider.set(name, (byRider.get(name) ?? 0) + p.amount);
  });
  const overdue = unremitted.filter((p) => p.remittanceDueAt && new Date(p.remittanceDueAt).getTime() < now.getTime()).reduce((s, p) => s + p.amount, 0);
  const partPaidBalance = db.orders.filter((o) => o.paymentStatus === "part_paid" && !["cancelled", "returned", "refused"].includes(o.status)).reduce((s, o) => s + (o.total - (o.amountPaid ?? 0)), 0);

  const toConfirm = db.orders.filter((o) => o.status === "pending_verification");
  const highRisk = toConfirm.filter((o) => o.paymentMethod === "cash_on_delivery" && codRisk(db, o).level === "high").length;

  const spend = db.campaigns.reduce((s, c) => s + c.spend, 0);
  const adRevenue = db.campaigns.reduce((s, c) => s + c.revenue, 0);
  const ranked = db.campaigns.filter((c) => c.spend > 0).map((c) => ({ name: c.name, roas: c.revenue / c.spend })).sort((a, b) => b.roas - a.roas);

  const units = new Map<string, number>();
  deliveredOn(today - 7 * DAY, today).forEach((o) => o.productNames.forEach((p) => {
    const [, qty, name] = p.match(/^(\d+)× (.+)$/) ?? [, "1", p];
    if (!name!.startsWith("Gift:")) units.set(name!, (units.get(name!) ?? 0) + Number(qty));
  }));
  const top = [...units.entries()].sort((a, b) => b[1] - a[1])[0];

  const birthdays = db.contacts.flatMap((c) => (c.facts ?? []).filter((f) => f.kind === "birthday" && f.monthDay).map((f) => ({ contactId: c.id, name: fullName(c), inDays: daysToBirthday(f.monthDay!, now) })))
    .filter((b) => b.inDays <= 7).sort((a, b) => a.inDays - b.inDays);

  const lowStock = db.products.filter((p) => p.active !== false && p.stock <= p.reorderLevel).map((p) => ({ name: p.name, stock: p.stock }));
  const complaints = db.conversations.filter((c) => c.complaint?.status === "open").length;
  const needsReply = db.conversations.filter((c) => c.awaitingReply).length;
  const failedDeliveries = db.deliveries.filter((d) => d.status === "failed").length;
  const readyToDispatch = db.orders.filter((o) => o.status === "ready_for_dispatch").length;
  const withRiders = unremitted.reduce((s, p) => s + p.amount, 0);

  const actions: BriefAction[] = [];
  if (highRisk) actions.push({ label: `Call ${highRisk} high-risk COD order${highRisk > 1 ? "s" : ""} before dispatch`, detail: `${toConfirm.length} waiting to be confirmed in total`, to: "/cod", tone: "danger" });
  else if (toConfirm.length) actions.push({ label: `Confirm ${toConfirm.length} order${toConfirm.length > 1 ? "s" : ""}`, detail: "Call or message before any rider moves", to: "/cod", tone: "warning" });
  if (overdue) actions.push({ label: "Collect cash that's overdue from riders", detail: `${[...byRider.keys()].slice(0, 2).join(", ")}`, to: "/payments", tone: "danger" });
  if (complaints) actions.push({ label: `Resolve ${complaints} open complaint${complaints > 1 ? "s" : ""}`, detail: "Unhappy buyers stop reordering", to: "/inbox", tone: "warning" });
  if (needsReply) actions.push({ label: `Reply to ${needsReply} waiting chat${needsReply > 1 ? "s" : ""}`, detail: "Oldest first", to: "/inbox", tone: "info" });
  if (birthdays.some((b) => b.inDays === 0)) actions.push({ label: `Send birthday wishes to ${birthdays.filter((b) => b.inDays === 0).map((b) => b.name.split(" ")[0]).join(", ")}`, detail: "Use the birthday greeting in Replies", to: "/calendar", tone: "success" });
  if (lowStock.length) actions.push({ label: `Restock ${lowStock.length} product${lowStock.length > 1 ? "s" : ""}`, detail: lowStock.slice(0, 2).map((p) => p.name).join(", "), to: "/inventory", tone: "info" });
  if (ranked.length > 1 && ranked[ranked.length - 1]!.roas < 1) actions.push({ label: `Review the "${ranked[ranked.length - 1]!.name}" ad`, detail: "It returns less than it costs", to: "/ads", tone: "warning" });

  const money = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: db.workspaces[0]?.currency ?? "NGN", maximumFractionDigits: 0 }).format(n);
  const trend = change === null ? "" : change >= 0 ? `, up ${change}% on your daily average` : `, down ${Math.abs(change)}% on your daily average`;
  const headline = yDelivered.length
    ? `Yesterday you delivered ${money(delivered)} across ${yDelivered.length} order${yDelivered.length > 1 ? "s" : ""}${trend}. ${withRiders ? `${money(withRiders)} is still with riders.` : "All rider cash is in."}`
    : `No deliveries were completed yesterday. ${toConfirm.length} order${toConfirm.length === 1 ? " is" : "s are"} waiting to be confirmed${withRiders ? ` and ${money(withRiders)} is still with riders` : ""}.`;

  return {
    date: now,
    headline,
    yesterday: { delivered, deliveredCount: yDelivered.length, created: yOrders.length, confirmed: yOrders.filter((o) => confirmedStatuses.includes(o.status)).length, cancelled: yOrders.filter((o) => ["cancelled", "refused"].includes(o.status)).length, avgDelivered, change },
    cash: { withRiders, riders: [...byRider.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount), overdue, partPaidBalance },
    pipeline: { toConfirm: toConfirm.length, toConfirmValue: toConfirm.reduce((s, o) => s + o.total, 0), highRisk, readyToDispatch, failedDeliveries },
    ads: { spend, delivered: adRevenue, roas: spend ? adRevenue / spend : null, ...(ranked[0] ? { best: ranked[0] } : {}), ...(ranked.length > 1 ? { worst: ranked[ranked.length - 1]! } : {}) },
    ...(top ? { topProduct: { name: top[0], units: top[1] } } : {}),
    lowStock,
    complaints,
    needsReply,
    birthdays,
    actions: actions.slice(0, 5),
  };
}

/** The brief as a WhatsApp-ready text message. */
export function briefText(b: MoneyBrief, business: string, money: (n: number) => string): string {
  const lines = [
    `☀️ *${business} — Money Brief, ${b.date.toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" })}*`,
    "",
    b.headline,
    "",
    `💰 Delivered yesterday: ${money(b.yesterday.delivered)} (${b.yesterday.deliveredCount} orders)`,
    `🧾 New orders: ${b.yesterday.created} · confirmed ${b.yesterday.confirmed} · cancelled ${b.yesterday.cancelled}`,
    `🏍️ Cash with riders: ${money(b.cash.withRiders)}${b.cash.overdue ? ` (${money(b.cash.overdue)} overdue)` : ""}`,
    `📞 To confirm: ${b.pipeline.toConfirm} (${money(b.pipeline.toConfirmValue)})${b.pipeline.highRisk ? ` · ${b.pipeline.highRisk} high-risk` : ""}`,
    b.ads.roas !== null ? `📣 Ads: ${money(b.ads.spend)} spent → ${money(b.ads.delivered)} delivered (${b.ads.roas.toFixed(1)}×)` : "",
    b.topProduct ? `🏆 Best seller this week: ${b.topProduct.name} (${b.topProduct.units} delivered)` : "",
    b.birthdays.length ? `🎂 Birthdays: ${b.birthdays.map((x) => `${x.name.split(" ")[0]} ${x.inDays === 0 ? "today" : `in ${x.inDays}d`}`).join(", ")}` : "",
    "",
    "*Today:*",
    ...b.actions.map((a, i) => `${i + 1}. ${a.label}`),
  ];
  return lines.filter((l, i, arr) => l !== "" || (arr[i - 1] !== "" && i > 0)).join("\n");
}
