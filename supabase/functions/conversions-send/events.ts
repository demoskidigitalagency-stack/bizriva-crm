// Building the Purchase events for Meta (Conversions API) and TikTok (Events API).
// Pure apart from hashing (Web Crypto, in Deno and Bun); tested in tests/conversions.test.ts.
export interface Job {
  id: string; platform: "meta" | "tiktok"; event_id: string; value: number; currency: string; at: number;
  pixel: string; token: string | null; test_code: string | null; phone: string; email: string; name: string; city: string; ad_id: string | null;
  contents: { id: string; quantity: number; price: number; name: string }[];
}

export async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-zÀ-ɏ]/g, "");

export async function request(j: Job): Promise<{ url: string; init: RequestInit } | { error: string }> {
  if (!j.token) return { error: "The access token was removed — connect again" };
  const [first, ...rest] = j.name.trim().split(/\s+/);
  const ph = j.phone ? await sha256(j.phone) : null, em = j.email.includes("@") ? await sha256(j.email) : null;
  if (j.platform === "meta") {
    const user_data: Record<string, string[]> = {};
    if (ph) user_data["ph"] = [ph];
    if (em) user_data["em"] = [em];
    if (first) user_data["fn"] = [await sha256(norm(first))];
    if (rest.length) user_data["ln"] = [await sha256(norm(rest.join("")))];
    if (j.city) user_data["ct"] = [await sha256(norm(j.city))];
    const body = { data: [{ event_name: "Purchase", event_time: j.at, event_id: j.event_id, action_source: "business_messaging", messaging_channel: "whatsapp", user_data,
      custom_data: { value: Number(j.value), currency: j.currency, content_type: "product", contents: j.contents.map((c) => ({ id: c.id, quantity: c.quantity, item_price: Number(c.price) })) } }],
      ...(j.test_code ? { test_event_code: j.test_code } : {}) };
    return { url: `https://graph.facebook.com/v21.0/${encodeURIComponent(j.pixel)}/events?access_token=${encodeURIComponent(j.token)}`, init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } };
  }
  const body = { event_source: "web", event_source_id: j.pixel, ...(j.test_code ? { test_event_code: j.test_code } : {}),
    data: [{ event: "CompletePayment", event_time: j.at, event_id: j.event_id, user: { ...(ph ? { phone: ph } : {}), ...(em ? { email: em } : {}) },
      properties: { value: Number(j.value), currency: j.currency, content_type: "product", contents: j.contents.map((c) => ({ content_id: c.id, quantity: c.quantity, price: Number(c.price), content_name: c.name })) } }] };
  return { url: "https://business-api.tiktok.com/open_api/v1.3/event/track/", init: { method: "POST", headers: { "Content-Type": "application/json", "Access-Token": j.token }, body: JSON.stringify(body) } };
}

/** Did the platform accept it? Returns null when OK, else a short reason. */
export function verdict(platform: "meta" | "tiktok", status: number, body: any): string | null {
  if (platform === "meta") return status === 200 && Number(body?.events_received ?? 0) >= 1 ? null : `${status} ${body?.error?.message ?? "Meta didn't accept the sale"}`.slice(0, 300);
  return status === 200 && Number(body?.code) === 0 ? null : `${status} ${body?.message ?? "TikTok didn't accept the sale"}`.slice(0, 300);
}
