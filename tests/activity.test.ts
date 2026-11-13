// bun test tests/activity.test.ts — Live status wording.
import { describe, expect, test } from "bun:test";
import { eventText, headline } from "../src/lib/activity";

describe("recent activity in plain words", () => {
  test("known events", () => {
    expect(eventText({ action: "whatsapp_history_imported", detail: { messages: 5797, chats: 256, tagged: 40 } }))
      .toBe("Old WhatsApp chats brought in: 5,797 messages from 256 chats, 40 customers tagged by product");
    expect(eventText({ action: "whatsapp_device_link_started", detail: { method: "qr" } })).toBe("Started linking WhatsApp (QR code)");
  });
  test("unknown events still read", () => {
    expect(eventText({ action: "order_cancelled", detail: null })).toBe("Order cancelled");
  });
});

describe("top-bar headline", () => {
  const job = (state: "running" | "waiting") => ({ key: state, title: "", state, done: null, total: null, unit: "", detail: "", at: null });
  test("problems first, then running, else all good", () => {
    expect(headline({ running: [job("running")], problems: [{ key: "p", title: "", detail: null, at: null }] })).toEqual({ tone: "problem", text: "1 problem" });
    expect(headline({ running: [job("running"), job("running"), job("waiting")], problems: [] })).toEqual({ tone: "running", text: "2 running" });
    expect(headline({ running: [job("waiting")], problems: [] })).toEqual({ tone: "ok", text: "All good" });
    expect(headline(null).text).toBe("");
  });
});
