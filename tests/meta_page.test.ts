// bun test tests/meta_page.test.ts — Facebook Page webhooks and replies.
import { describe, expect, test } from "bun:test";
import { leadFields, parse } from "../supabase/functions/meta-webhook/parse";
import { sendBody } from "../supabase/functions/meta-send/payload";

describe("what Meta sends us", () => {
  test("a Messenger message, our own echo skipped", () => {
    const r = parse({ object: "page", entry: [{ id: "111", messaging: [
      { sender: { id: "999" }, recipient: { id: "111" }, timestamp: 1793990000000, message: { mid: "m1", text: "How much?" } },
      { sender: { id: "111" }, recipient: { id: "999" }, timestamp: 1793990000000, message: { mid: "m2", text: "₦12,000", is_echo: true } }] }] });
    expect(r.dms).toEqual([{ channel: "messenger", owner: "111", sender: "999", mid: "m1", text: "How much?", at: new Date(1793990000000).toISOString(), files: [] }]);
  });
  test("an Instagram photo", () => {
    const r = parse({ object: "instagram", entry: [{ id: "178", messaging: [{ sender: { id: "555" }, timestamp: 1, message: { mid: "ig1", attachments: [{ type: "image", payload: { url: "https://cdn/x.jpg" } }] } }] }] });
    expect(r.dms[0]).toMatchObject({ channel: "instagram", text: "[image]", files: [{ kind: "image", url: "https://cdn/x.jpg" }] });
  });
  test("a lead-form submission", () => expect(parse({ object: "page", entry: [{ id: "111", changes: [{ field: "leadgen", value: { leadgen_id: "L1", form_id: "F1", page_id: "111", ad_id: "A1" } }] }] }).leads).toEqual([{ owner: "111", leadgen: "L1", form: "F1", ad: "A1" }]));
  test("anything else is ignored", () => expect(parse({ object: "whatsapp_business_account", entry: [] })).toEqual({ dms: [], leads: [] }));
  test("lead answers become fields", () => expect(leadFields({ field_data: [{ name: "full_name", values: ["Tolu Ade"] }, { name: "phone_number", values: ["+2348031112222"] }, { name: "Which size?", values: ["500ml"] }] })).toEqual({ full_name: "Tolu Ade", phone_number: "+2348031112222", which_size_: "500ml" }));
});

describe("our replies", () => {
  const job = { id: "m", workspace_id: "w", channel: "messenger", page_id: "111", token: "t", recipient: "999", body: "*Glow cream* is ₦12,000", in_window: true, media_path: null, media_kind: null };
  test("text reply, WhatsApp bold removed", () => expect(sendBody(job)).toEqual({ body: [{ recipient: { id: "999" }, messaging_type: "RESPONSE", message: { text: "Glow cream is ₦12,000" } }] }));
  test("photo then caption", () => { const r = sendBody({ ...job, media_path: "w/out/x.jpg", media_kind: "image" }, "https://signed"); expect("body" in r && r.body.length).toBe(2); });
  test("after 24 hours it's refused with the reason", () => expect(sendBody({ ...job, in_window: false })).toMatchObject({ error: expect.stringContaining("24-hour") }));
});

describe("ads", () => {
  test("a click-to-Messenger ad comes with the first message", () => {
    const r = parse({ object: "page", entry: [{ id: "111", messaging: [{ sender: { id: "999" }, timestamp: 1, referral: { source: "ADS", type: "OPEN_THREAD", ad_id: "120200001", ads_context_data: { ad_title: "Glow promo" } }, message: { mid: "m9", text: "Is this available?" } }] }] });
    expect(r.dms[0]?.ad).toEqual({ id: "120200001", headline: "Glow promo" });
  });
});
