/**
 * Financing readiness score — how a lender would read the business from its own records:
 * real delivered orders and money actually collected, not what was booked. 0–100, with the
 * reasons, so the owner sees what to improve. Pure; tested in tests/financing.test.ts.
 */
export interface FinOrder { placedAt: string; status: string; total: number; amountPaid?: number; paymentStatus?: string; contactId: string }
export interface FinancingScore {
  score: number;
  band: "Not ready yet" | "Getting there" | "Ready to talk to a lender" | "Strong";
  months: { month: string; delivered: number; revenue: number }[];
  parts: { label: string; points: number; max: number; detail: string }[];
  tips: string[];
}

const DONE = new Set(["delivered"]);
const DEAD = new Set(["cancelled", "refused", "returned"]);
const SENT = new Set(["dispatched", "in_transit", "delivered", "refused", "returned"]);

export function financingScore(orders: FinOrder[], now: Date = new Date()): FinancingScore {
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); keys.push(d.toISOString().slice(0, 7)); }
  const since = `${keys[0]}-01`;
  const recent = orders.filter((o) => o.placedAt.slice(0, 10) >= since);
  const delivered = recent.filter((o) => DONE.has(o.status));
  const months = keys.map((m) => {
    const ds = delivered.filter((o) => o.placedAt.slice(0, 7) === m);
    return { month: m, delivered: ds.length, revenue: ds.reduce((n, o) => n + o.total, 0) };
  });
  const parts: FinancingScore["parts"] = [];
  const tips: string[] = [];

  // 1. Track record: months (of 6) with delivered sales.
  const active = months.filter((m) => m.delivered > 0).length;
  parts.push({ label: "Months with delivered sales", points: Math.round((active / 6) * 25), max: 25, detail: `${active} of the last 6 months` });
  if (active < 6) tips.push("Record every delivery in Bizriva — lenders look for sales in each of the last 6 months.");

  // 2. Volume: delivered orders in 6 months (40+ = full marks).
  parts.push({ label: "Delivered orders", points: Math.round(Math.min(1, delivered.length / 40) * 20), max: 20, detail: `${delivered.length} in 6 months` });

  // 3. Steadiness: low swing between months that had sales.
  const rev = months.map((m) => m.revenue).filter((r) => r > 0);
  const mean = rev.reduce((a, b) => a + b, 0) / Math.max(1, rev.length);
  const cv = rev.length >= 2 ? Math.sqrt(rev.reduce((a, r) => a + (r - mean) ** 2, 0) / rev.length) / (mean || 1) : 1;
  parts.push({ label: "Steady monthly sales", points: rev.length >= 2 ? Math.round(Math.max(0, 1 - cv) * 15) : 0, max: 15, detail: rev.length >= 2 ? `sales swing about ${Math.round(cv * 100)}% month to month` : "needs 2+ months of sales" });

  // 4. Delivery success: of orders that went out, how many arrived.
  const sent = recent.filter((o) => SENT.has(o.status));
  const rate = sent.length ? delivered.length / sent.length : 0;
  parts.push({ label: "Delivery success", points: Math.round(rate * 15), max: 15, detail: sent.length ? `${Math.round(rate * 100)}% of dispatched orders delivered` : "no dispatched orders yet" });
  if (sent.length && rate < 0.8) tips.push("Cut returns: confirm orders before dispatch and take deposits from new buyers.");

  // 5. Money collected on delivered orders.
  const due = delivered.reduce((n, o) => n + o.total, 0);
  const got = delivered.reduce((n, o) => n + Math.min(o.total, o.amountPaid ?? (o.paymentStatus === "paid" ? o.total : 0)), 0);
  const coll = due ? got / due : 0;
  parts.push({ label: "Money collected", points: Math.round(coll * 15), max: 15, detail: due ? `${Math.round(coll * 100)}% of delivered value recorded as paid` : "no delivered orders yet" });
  if (due && coll < 0.9) tips.push("Mark payments as received (deposits, transfers, rider cash) so collected money shows.");

  // 6. Repeat buyers.
  const buyers = new Map<string, number>();
  for (const o of orders.filter((x) => DONE.has(x.status))) buyers.set(o.contactId, (buyers.get(o.contactId) ?? 0) + 1);
  const repeat = buyers.size ? [...buyers.values()].filter((n) => n >= 2).length / buyers.size : 0;
  parts.push({ label: "Repeat buyers", points: Math.round(Math.min(1, repeat / 0.3) * 10), max: 10, detail: buyers.size ? `${Math.round(repeat * 100)}% of buyers ordered again` : "no buyers yet" });
  if (buyers.size && repeat < 0.3) tips.push("Follow up past buyers — repeat customers show a lender the business lasts.");

  const cancelled = recent.filter((o) => DEAD.has(o.status)).length;
  if (recent.length >= 10 && cancelled / recent.length > 0.3) tips.push("Over 30% of recent orders were cancelled, refused or returned.");

  const score = Math.max(0, Math.min(100, parts.reduce((n, p) => n + p.points, 0)));
  const band = score >= 80 ? "Strong" : score >= 60 ? "Ready to talk to a lender" : score >= 35 ? "Getting there" : "Not ready yet";
  return { score, band, months, parts, tips };
}
