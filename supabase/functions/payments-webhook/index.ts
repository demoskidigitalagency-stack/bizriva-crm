// Payment notifications — POST /functions/v1/payments-webhook/<provider>/<workspace id>
//   provider: paystack | flutterwave | monnify
//
// Every notification is verified before it counts:
//   Paystack    x-paystack-signature = HMAC-SHA512(body, secret key)
//   Monnify     monnify-signature   = HMAC-SHA512(body, client secret)
//   Flutterwave verif-hash          = your secret hash, then the transaction is
//               re-checked with Flutterwave's verify API when a secret key is set
// Keys come from Supabase Vault (saved from the app) or, for a single business,
// the PAYSTACK_SECRET_KEY / MONNIFY_CLIENT_SECRET / FLW_SECRET_HASH / FLW_SECRET_KEY
// function secrets. No key configured → 503, nothing is recorded.
// The same provider reference is applied once (unique in the database).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const enc = new TextEncoder();

async function hmac512(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body))), (b) => b.toString(16).padStart(2, "0")).join("");
}
function same(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const method = (m: string): "transfer" | "card" | "ussd" => (/card/i.test(m) ? "card" : /ussd/i.test(m) ? "ussd" : "transfer");

interface Paid { ref: string; amount: number; method: "transfer" | "card" | "ussd"; payer?: string; paidInto?: string; orderRef?: string }

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const at = parts.indexOf("payments-webhook");
  const provider = parts[at + 1] ?? "";
  const ws = parts[at + 2] ?? "";
  if (!["paystack", "flutterwave", "monnify"].includes(provider) || !UUID.test(ws)) return json(404, { error: "Unknown address" });
  const body = await req.text();
  if (body.length > 512_000) return json(413, { error: "Too large" });

  const { data: keys } = await db.rpc("svc_provider_key", { p_workspace: ws });
  const saved = (keys as { provider: string; secret: string }[] | null)?.find((k) => k.provider === provider)?.secret;

  let paid: Paid | null = null;
  let evt: Record<string, any>;
  try { evt = JSON.parse(body); } catch { return json(400, { error: "Not JSON" }); }

  if (provider === "paystack") {
    const secret = saved ?? Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secret) return json(503, { error: "Paystack key not set up" });
    if (!same(await hmac512(secret, body), req.headers.get("x-paystack-signature") ?? "")) return json(401, { error: "Bad signature" });
    const d = evt.data ?? {};
    if (evt.event === "charge.success" && d.status === "success") {
      paid = {
        ref: String(d.reference), amount: Number(d.amount) / 100, method: method(String(d.channel ?? "")),
        payer: d.authorization?.sender_name ?? [d.customer?.first_name, d.customer?.last_name].filter(Boolean).join(" "),
        paidInto: d.authorization?.receiver_bank_account_number ?? d.metadata?.receiver_account_number,
        orderRef: d.metadata?.order_ref,
      };
    }
  } else if (provider === "monnify") {
    const secret = saved ?? Deno.env.get("MONNIFY_CLIENT_SECRET");
    if (!secret) return json(503, { error: "Monnify key not set up" });
    if (!same(await hmac512(secret, body), req.headers.get("monnify-signature") ?? "")) return json(401, { error: "Bad signature" });
    const d = evt.eventData ?? {};
    if (evt.eventType === "SUCCESSFUL_TRANSACTION" && d.paymentStatus === "PAID") {
      paid = {
        ref: String(d.transactionReference), amount: Number(d.amountPaid), method: method(String(d.paymentMethod ?? "")),
        payer: d.paymentSourceInformation?.[0]?.accountName ?? d.customer?.name,
        paidInto: d.destinationAccountInformation?.accountNumber, orderRef: d.metaData?.order_ref ?? d.product?.reference,
      };
    }
  } else {
    const hash = Deno.env.get("FLW_SECRET_HASH") ?? (saved && !saved.startsWith("FLWSECK") ? saved : undefined);
    if (!hash) return json(503, { error: "Flutterwave secret hash not set up" });
    if (!same(hash, req.headers.get("verif-hash") ?? "")) return json(401, { error: "Bad signature" });
    const d = evt.data ?? {};
    if (evt.event === "charge.completed" && d.status === "successful") {
      // Don't trust the notification alone: ask Flutterwave when a secret key is available.
      const key = saved?.startsWith("FLWSECK") ? saved : Deno.env.get("FLW_SECRET_KEY");
      if (key) {
        const v = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(d.id)}/verify`, { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.json()).catch(() => null);
        if (v?.data?.status !== "successful" || Number(v.data.amount) !== Number(d.amount)) return json(200, { ignored: "not verified" });
      }
      paid = { ref: String(d.flw_ref ?? d.tx_ref ?? d.id), amount: Number(d.amount), method: method(String(d.payment_type ?? "")), payer: d.customer?.name, orderRef: d.meta?.order_ref ?? d.tx_ref };
    }
  }

  // Verified but not a successful payment (refunds, transfers out, etc.): acknowledge so the provider stops retrying.
  if (!paid || !(paid.amount > 0) || !paid.ref) return json(200, { ignored: true });
  const { data, error } = await db.rpc("svc_provider_payment", {
    p_workspace: ws, p_provider: provider, p_ref: paid.ref, p_method: paid.method, p_amount: paid.amount,
    p_payer: paid.payer ?? null, p_paid_into: paid.paidInto ?? null, p_order_ref: paid.orderRef ?? null, p_raw: evt,
  });
  if (error) { console.error("payments-webhook", error.message); return json(500, { error: "Retry later" }); } // provider retries
  return json(200, data);
});
