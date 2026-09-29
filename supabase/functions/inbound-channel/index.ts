import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type InboundMessage = {
  workspaceId: string;
  provider: string;
  externalEventId: string;
  channel: string;
  externalContactId: string;
  phone?: string;
  email?: string;
  displayName?: string;
  messageId: string;
  threadId: string;
  body: string;
  receivedAt?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const expected = Deno.env.get("INBOUND_CHANNEL_SECRET");
  const supplied = req.headers.get("x-bizriva-webhook-secret");
  if (!expected || supplied !== expected) return new Response("Unauthorized", { status: 401 });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response("Server configuration missing", { status: 500 });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  let input: InboundMessage;
  try { input = await req.json(); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  const required = ["workspaceId","provider","externalEventId","channel","externalContactId","messageId","threadId","body"] as const;
  for (const key of required) if (!input[key]) return new Response("Missing "+key, { status: 400 });

  const { error: eventError } = await supabase.from("provider_events").insert({
    workspace_id: input.workspaceId,
    provider: input.provider,
    external_event_id: input.externalEventId,
    event_type: "message.received",
    payload: input,
    status: "received",
  });

  if (eventError && eventError.code === "23505") return new Response(JSON.stringify({ ok: true, duplicate: true }), { headers: { "content-type": "application/json" } });
  if (eventError) return new Response(eventError.message, { status: 500 });

  const names = (input.displayName || "Unknown").trim().split(/\s+/);
  const { data: contactId, error: identityError } = await supabase.rpc("resolve_contact_identity", {
    p_workspace: input.workspaceId,
    p_channel: input.channel,
    p_external_id: input.externalContactId,
    p_phone: input.phone ?? null,
    p_email: input.email ?? null,
    p_first_name: names[0] || "Unknown",
    p_last_name: names.slice(1).join(" "),
    p_country_code: null,
    p_city: null,
  });
  if (identityError) {
    await supabase.from("provider_events").update({ status: "failed", last_error: identityError.message, attempts: 1 }).eq("provider", input.provider).eq("external_event_id", input.externalEventId);
    return new Response(identityError.message, { status: 500 });
  }

  let conversationId: string | null = null;
  const { data: existing } = await supabase.from("conversations").select("id").eq("workspace_id", input.workspaceId).eq("external_thread_id", input.threadId).maybeSingle();
  conversationId = existing?.id ?? null;

  if (!conversationId) {
    const { data: created, error } = await supabase.from("conversations").insert({
      workspace_id: input.workspaceId,
      contact_id: contactId,
      channel: input.channel,
      external_thread_id: input.threadId,
      subject: input.body.slice(0, 120),
      unread: true,
      awaiting_reply: true,
      last_message_at: input.receivedAt ?? new Date().toISOString(),
    }).select("id").single();
    if (error) return new Response(error.message, { status: 500 });
    conversationId = created.id;
  }

  const { error: messageError } = await supabase.from("messages").insert({
    workspace_id: input.workspaceId,
    conversation_id: conversationId,
    external_message_id: input.messageId,
    direction: "in",
    body: input.body,
    sent_at: input.receivedAt ?? new Date().toISOString(),
  });
  if (messageError && messageError.code !== "23505") return new Response(messageError.message, { status: 500 });

  await supabase.from("conversations").update({
    unread: true,
    awaiting_reply: true,
    last_message_at: input.receivedAt ?? new Date().toISOString(),
  }).eq("id", conversationId);

  await supabase.from("activities").insert({
    workspace_id: input.workspaceId,
    contact_id: contactId,
    kind: "conversation",
    title: input.channel + " message received",
    description: input.body.slice(0, 500),
    ref_type: "conversation",
    ref_id: conversationId,
    occurred_at: input.receivedAt ?? new Date().toISOString(),
  });

  await supabase.from("provider_events").update({ status: "processed", processed_at: new Date().toISOString(), attempts: 1 }).eq("provider", input.provider).eq("external_event_id", input.externalEventId);

  return new Response(JSON.stringify({ ok: true, contactId, conversationId }), { headers: { "content-type": "application/json" } });
});
