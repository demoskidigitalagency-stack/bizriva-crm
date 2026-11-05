/**
 * Customer messages around an order: confirmation, dispatch, and after
 * delivery the receipt and each product's "how to use and care" guide.
 */
import type { Database } from "./database";
import type { OrderSummary, Product } from "./types";

const naira = (db: Database, n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: db.workspaces[0]?.currency ?? "NGN", maximumFractionDigits: 0 }).format(n);

export function receiptNo(order: OrderSummary): string {
  return `RCPT-${order.reference.replace(/\D/g, "")}`;
}

export function productsIn(db: Database, order: OrderSummary): Product[] {
  return db.products.filter((p) => order.productNames.some((n) => n.includes(p.name)));
}

export function receiptText(db: Database, order: OrderSummary): string {
  const c = db.contacts.find((x) => x.id === order.contactId);
  const del = db.deliveries.find((d) => d.orderId === order.id);
  const rider = db.riders.find((r) => r.id === del?.riderId)?.name ?? del?.courier;
  const paid = order.amountPaid ?? (order.paymentStatus === "paid" ? order.total : 0);
  const how = order.paymentMethod === "cash_on_delivery" ? "Cash on delivery" : order.paymentMethod.replace(/_/g, " ");
  return [
    `🧾 *Receipt ${receiptNo(order)}* — ${db.settings.businessName}`,
    `Order ${order.reference}${c ? ` · ${c.firstName} ${c.lastName}` : ""}`,
    "",
    ...order.productNames.map((n) => `• ${n}`),
    order.shippingFee ? `Delivery: ${naira(db, order.shippingFee)}` : "",
    `*Total: ${naira(db, order.total)}*`,
    `Paid: ${naira(db, paid)} (${how})${order.total - paid > 0 ? ` · balance ${naira(db, order.total - paid)}` : ""}`,
    del?.deliveredAt ? `Delivered ${new Date(del.deliveredAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}${rider ? ` by ${rider}` : ""}` : "",
    "",
    "Thank you for shopping with us 💛 Keep this message as your receipt.",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

export function careGuideText(db: Database, order: OrderSummary): string | null {
  const guides = productsIn(db, order).filter((p) => p.careGuide?.trim());
  if (!guides.length) return null;
  return [
    `✨ *How to use and care for your order*`,
    ...guides.flatMap((p) => ["", `*${p.name}*`, p.careGuide!.trim()]),
    "",
    "Questions? Reply here any time — we're happy to help.",
  ].join("\n");
}

export function confirmedText(db: Database, order: OrderSummary): string {
  const c = db.contacts.find((x) => x.id === order.contactId);
  return `Hi ${c?.firstName ?? "there"}, your order ${order.reference} is confirmed ✅\n${order.productNames.join(", ")} · ${naira(db, order.total)}${order.paymentMethod === "cash_on_delivery" ? " (pay on delivery)" : ""}.\nWe'll message you when it's on the way.`;
}

export function dispatchedText(db: Database, order: OrderSummary): string {
  const c = db.contacts.find((x) => x.id === order.contactId);
  const del = db.deliveries.find((d) => d.orderId === order.id);
  const rider = db.riders.find((r) => r.id === del?.riderId);
  return `Good news ${c?.firstName ?? ""}! 🚚 Order ${order.reference} is on its way${rider ? ` with ${rider.name} (${rider.phone})` : del ? ` with ${del.courier}` : ""}.${del?.trackingRef ? ` Tracking: ${del.trackingRef}.` : ""}\nPlease keep your phone close — the rider will call before arriving.${order.paymentMethod === "cash_on_delivery" && order.paymentStatus !== "paid" ? `\nAmount to pay on delivery: ${naira(db, order.total - (order.amountPaid ?? 0))}.` : ""}`;
}

/** Starter guides by category, so new businesses aren't starting from a blank box. */
export const CARE_STARTERS: Record<string, string> = {
  "Hair Bundles": "1. Before installing, wash once with a mild sulphate-free shampoo and let it air-dry.\n2. Detangle from the ends up with a wide-tooth comb — never from the root down.\n3. Keep heat under 180°C and always use a heat protectant.\n4. Sleep with a satin bonnet or scarf.\n5. Wash every 1–2 weeks and condition every wash.",
  "Ready-to-Wear Wigs": "1. Store on a wig stand or in the box, away from sun and heat.\n2. Wash every 10–14 wears with sulphate-free shampoo; pat dry, don't wring.\n3. For glueless wigs, adjust the band and clips before wearing — no glue needed.\n4. Comb gently from the tips, using a wide-tooth comb.\n5. Avoid sleeping in the wig to keep the lace and shape.",
  "Closures & Frontals": "1. Do a patch test before using any adhesive.\n2. Bleach knots and pluck lightly before the first install for a natural hairline.\n3. Remove adhesive with a proper remover — never pull the lace.\n4. Re-install every 1–2 weeks to protect your edges.\n5. Store flat or on a mannequin head.",
  Extensions: "1. Brush the clip-ins gently before each use.\n2. Clip in on dry hair, starting from the nape and working up.\n3. Remove before sleeping or swimming.\n4. Wash every 15–20 wears and air-dry flat.\n5. Store in the box to keep them tangle-free.",
  Accessories: "1. Hand-wash in cool water with mild soap.\n2. Dry flat in the shade.\n3. Wear the bonnet every night to protect your hair and wig from friction.",
  "Hair Care": "1. Use a small amount — a little goes a long way.\n2. Apply to clean, dry hair or edges and smooth with a soft brush.\n3. Tie down with a scarf for 5–10 minutes to set.\n4. Close the lid tightly and keep away from heat.\n5. Stop using if irritation occurs.",
};
