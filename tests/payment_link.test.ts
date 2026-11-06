// bun test tests/payment_link.test.ts — payment link requests.
import { describe, expect, test } from "bun:test";
import { linkFrom, linkRef, linkRequest, payerEmail, RETURN_URL, type Ctx } from "../supabase/functions/payment-link/link";

const c: Ctx = { workspace_id: "ws1", order_id: "o1", order_ref: "BZ-1003", amount: "8500.00", currency: "NGN", business: "Glow Naturals",
  name: "Tolu Ade", phone: "+2348069998888", email: null, provider: "paystack", key: "sk_test_x" };

describe("payment links", () => {
  test("reference is the order number plus a random part", () => expect(linkRef("BZ-1003", "a1b2c3d4")).toBe("BZ-1003-a1b2c3d4"));
  test("Paystack: kobo, our reference, order in metadata, stand-in email when none", () => {
    const r = linkRequest(c, "BZ-1003-x"); if ("error" in r) throw new Error(r.error);
    expect(r.url).toBe("https://api.paystack.co/transaction/initialize");
    const b = JSON.parse(String(r.init.body));
    expect(b.amount).toBe(850000); expect(b.reference).toBe("BZ-1003-x"); expect(b.metadata.order_ref).toBe("BZ-1003");
    expect(b.email).toBe("2348069998888@customers.bizriva-crm.vercel.app"); expect(b.callback_url).toBe(RETURN_URL);
  });
  test("a real email is used when the customer has one", () => expect(payerEmail({ ...c, email: "Tolu@Mail.ng" })).toBe("tolu@mail.ng"));
  test("Flutterwave: naira amount, tx_ref and order in meta", () => {
    const r = linkRequest({ ...c, provider: "flutterwave" }, "BZ-1003-x"); if ("error" in r) throw new Error(r.error);
    const b = JSON.parse(String(r.init.body));
    expect(r.url).toBe("https://api.flutterwave.com/v3/payments");
    expect(b.amount).toBe(8500); expect(b.tx_ref).toBe("BZ-1003-x"); expect(b.meta.order_ref).toBe("BZ-1003"); expect(b.customer.phonenumber).toBe("+2348069998888");
  });
  test("nothing to pay or other providers are refused", () => {
    expect(linkRequest({ ...c, amount: 0 }, "r")).toEqual({ error: "Nothing to pay on this order" });
    expect(linkRequest({ ...c, provider: "monnify" }, "r")).toEqual({ error: expect.stringContaining("Paystack or Flutterwave") });
  });
  test("reads the link from each provider's answer", () => {
    expect(linkFrom("paystack", 200, { data: { authorization_url: "https://checkout.paystack.com/abc" } })).toEqual({ url: "https://checkout.paystack.com/abc" });
    expect(linkFrom("flutterwave", 200, { data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/abc" } })).toEqual({ url: "https://checkout.flutterwave.com/v3/hosted/pay/abc" });
    expect(linkFrom("paystack", 401, { message: "Invalid key" })).toEqual({ error: "401 Invalid key" });
  });
});
