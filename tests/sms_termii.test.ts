// bun test tests/sms_termii.test.ts — what we send to Termii.
import { describe, expect, test } from "bun:test";
import { baseUrl, msisdn, outcome, request, smsText } from "../supabase/functions/sms-send/termii";

const job = { id: "m", workspace_id: "w", to_phone: "2348031234567", body: "✅ *Order BZ-1001* is confirmed", api_key: "TLkey", sender: "GlowNG", route: "dnd" };

describe("Termii SMS", () => {
  test("service messages go on the DND route, WhatsApp bold removed", () => expect(request(job)).toEqual({ url: "https://v3.api.termii.com/api/sms/send", body: { api_key: "TLkey", to: "2348031234567", from: "GlowNG", sms: "✅ Order BZ-1001 is confirmed", type: "plain", channel: "dnd" } }));
  test("other messages use the generic route", () => expect("body" in request({ ...job, route: "generic" }) && (request({ ...job, route: "generic" }) as { body: { channel: string } }).body.channel).toBe("generic"));
  test("local numbers become international", () => expect(msisdn("0803 123 4567")).toBe("2348031234567"));
  test("no number, no send", () => expect(request({ ...job, to_phone: "" })).toEqual({ error: "No phone number for this customer" }));
  test("long texts are cut at 3 pages", () => { const t = smsText("a".repeat(600)); expect(t.length).toBe(459); expect(t.endsWith("…")).toBe(true); });
  test("only Termii addresses are used", () => { expect(baseUrl("https://api.ng.termii.com/")).toBe("https://api.ng.termii.com"); expect(baseUrl("https://evil.example.com")).toBe("https://v3.api.termii.com"); });
  test("Termii's answer", () => { expect(outcome(200, { message_id: "9122", message: "Successfully Sent" })).toEqual({ id: "9122" }); expect(outcome(400, { message: "Insufficient balance" })).toEqual({ error: "400 Insufficient balance" }); });
});
