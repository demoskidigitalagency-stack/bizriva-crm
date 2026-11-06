// Payment link requests for each provider — pure, unit-tested in tests/payment_link.test.ts.

export interface Ctx {
  workspace_id: string; order_id: string; order_ref: string; amount: number | string; currency: string; business: string;
  name: string; phone: string | null; email: string | null; provider: "paystack" | "flutterwave" | string; key: string;
}
export const RETURN_URL = "https://bizriva-crm.vercel.app/paid";

/** Our reference for this link: the order number plus a random part, so each link is unique. */
export function linkRef(orderRef: string, rand: string): string {
  return `${orderRef}-${rand}`.replace(/[^A-Za-z0-9-]/g, "").slice(0, 60);
}

/** Paystack needs an email; customers without one get a stand-in at our domain (no mail is sent to it). */
export function payerEmail(c: Ctx): string {
  if (c.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) return c.email.toLowerCase();
  const digits = (c.phone ?? "").replace(/\D/g, "") || c.order_ref.replace(/\W/g, "").toLowerCase();
  return `${digits}@customers.bizriva-crm.vercel.app`;
}

export function linkRequest(c: Ctx, ref: string): { url: string; init: RequestInit } | { error: string } {
  const amount = Math.round(Number(c.amount) * 100) / 100;
  if (!(amount > 0)) return { error: "Nothing to pay on this order" };
  if (c.provider === "paystack") {
    return { url: "https://api.paystack.co/transaction/initialize", init: { method: "POST", headers: { authorization: `Bearer ${c.key}`, "content-type": "application/json" },
      body: JSON.stringify({ email: payerEmail(c), amount: Math.round(amount * 100), currency: c.currency || "NGN", reference: ref, callback_url: RETURN_URL,
        metadata: { order_ref: c.order_ref, workspace_id: c.workspace_id, custom_fields: [{ display_name: "Order", variable_name: "order_ref", value: c.order_ref }] } }) } };
  }
  if (c.provider === "flutterwave") {
    return { url: "https://api.flutterwave.com/v3/payments", init: { method: "POST", headers: { authorization: `Bearer ${c.key}`, "content-type": "application/json" },
      body: JSON.stringify({ tx_ref: ref, amount, currency: c.currency || "NGN", redirect_url: RETURN_URL,
        customer: { email: payerEmail(c), name: c.name, ...(c.phone ? { phonenumber: c.phone } : {}) },
        meta: { order_ref: c.order_ref, workspace_id: c.workspace_id }, customizations: { title: c.business, description: `Order ${c.order_ref}` } }) } };
  }
  return { error: "Payment links work with Paystack or Flutterwave" };
}

/** The link from the provider's answer, or why there isn't one. */
// deno-lint-ignore no-explicit-any
export function linkFrom(provider: string, status: number, res: any): { url: string } | { error: string } {
  const url = provider === "paystack" ? res?.data?.authorization_url : res?.data?.link;
  if (status >= 200 && status < 300 && typeof url === "string" && url.startsWith("https://")) return { url };
  return { error: `${status} ${res?.message ?? "The payment provider refused the request"}`.slice(0, 300) };
}
