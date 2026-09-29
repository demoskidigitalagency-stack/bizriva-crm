import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !url || !serviceKey) return new Response("Server configuration missing", { status: 500 });

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const digest = bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  if (signature !== digest) return new Response("Invalid signature", { status: 401 });

  const payload = JSON.parse(raw);
  const reference = String(payload?.data?.reference ?? "");
  const event = String(payload?.event ?? "");
  const workspaceId = payload?.data?.metadata?.workspace_id as string | undefined;
  const orderId = payload?.data?.metadata?.order_id as string | undefined;
  const contactId = payload?.data?.metadata?.contact_id as string | undefined;
  if (!reference) return new Response("Missing reference", { status: 400 });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const externalEventId = "paystack:" + event + ":" + reference;
  const { error: eventError } = await supabase.from("provider_events").insert({
    workspace_id: workspaceId ?? null,
    provider: "paystack",
    external_event_id: externalEventId,
    event_type: event,
    payload,
    status: "received",
  });
  if (eventError && eventError.code === "23505") return new Response("ok");
  if (eventError) return new Response(eventError.message, { status: 500 });

  if (event === "charge.success" && workspaceId && orderId) {
    const amountMinor = Number(payload.data.amount ?? 0);
    const currency = String(payload.data.currency ?? "NGN");
    const { error: paymentError } = await supabase.from("payments").upsert({
      workspace_id: workspaceId,
      order_id: orderId,
      contact_id: contactId ?? null,
      provider: "paystack",
      provider_reference: reference,
      method: "card",
      status: "paid",
      amount_minor: amountMinor,
      currency,
      paid_at: payload.data.paid_at ?? new Date().toISOString(),
    }, { onConflict: "workspace_id,provider,provider_reference" });
    if (paymentError) {
      await supabase.from("provider_events").update({ status: "failed", last_error: paymentError.message, attempts: 1 }).eq("provider", "paystack").eq("external_event_id", externalEventId);
      return new Response(paymentError.message, { status: 500 });
    }

    await supabase.from("orders").update({ payment_status: "paid", updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("id", orderId);
  }

  await supabase.from("provider_events").update({ status: "processed", processed_at: new Date().toISOString(), attempts: 1 }).eq("provider", "paystack").eq("external_event_id", externalEventId);
  return new Response("ok");
});
