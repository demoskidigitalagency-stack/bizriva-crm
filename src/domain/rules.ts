/**
 * Business rules shared by Practice Mode and the database (the same rules are
 * enforced by triggers in supabase/migrations/20261106000000_loopholes.sql),
 * so a screen can never put an order or a payment into an impossible state.
 */
import type { OrderStatus, OrderSummary } from "./types";

const PATH: OrderStatus[] = ["pending_verification", "confirmed", "processing", "ready_for_dispatch", "dispatched", "in_transit", "delivered"];

/** Can an order move from one status to another? */
export function canMove(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  if (from === "cancelled" || from === "returned") return false; // final
  if (to === "pending_verification") return false; // never back to the start
  if (to === "cancelled") return PATH.indexOf(from) >= 0 && PATH.indexOf(from) <= PATH.indexOf("ready_for_dispatch");
  if (to === "refused") return from === "dispatched" || from === "in_transit" || from === "ready_for_dispatch";
  if (to === "returned") return ["dispatched", "in_transit", "delivered", "refused"].includes(from);
  if (from === "refused" || from === "delivered") return false;
  const a = PATH.indexOf(from), b = PATH.indexOf(to);
  if (a < 0 || b < 0 || b <= a) return false; // forward only
  // An unverified order must be confirmed before anything else happens to it.
  if (from === "pending_verification") return to === "confirmed";
  return true;
}

/** Statuses where money can still be applied to the order. */
export function acceptsPayment(o: OrderSummary): boolean {
  return !["cancelled", "returned", "refused"].includes(o.status) && o.total - (o.amountPaid ?? 0) > 0;
}

/** Spreadsheet apps run cells starting with = + - @ as formulas; neutralise them. */
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  // Plain numbers and phone numbers (+234 801…) are safe and stay as they are.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().]+$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
