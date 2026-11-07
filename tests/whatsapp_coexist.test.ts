// bun test tests/whatsapp_coexist.test.ts — numbers that stay on the WhatsApp Business app (Coexistence).
import { describe, expect, test } from "bun:test";
import { parseContacts, parseEchoes, parseHistory, textOf } from "../supabase/functions/whatsapp-webhook/coexist";
import { pickNumber } from "../supabase/functions/whatsapp-onboard/pick";

const BIZ = "2348030000000", CUST = "2348031112222";

describe("history", () => {
  const value = {
    messaging_product: "whatsapp", metadata: { display_phone_number: BIZ, phone_number_id: "555000111" },
    history: [{
      metadata: { phase: 1, chunk_order: 2, progress: 55 },
      threads: [
        { id: CUST, messages: [
          { from: BIZ, to: CUST, id: "wamid.2", timestamp: "1725190000", type: "text", text: { body: "It's ₦12,000" }, history_context: { status: "READ" } },
          { from: CUST, id: "wamid.1", timestamp: "1725189000", type: "text", text: { body: "How much?" }, history_context: { status: "DELIVERED" } },
          { from: CUST, id: "wamid.3", timestamp: "1725191000", type: "media_placeholder", history_context: { status: "DELIVERED" } },
          { from: CUST, id: "wamid.4", timestamp: "1725192000", type: "unsupported" },
        ] },
        { id: "not-a-number", messages: [{ from: "x", id: "wamid.9", timestamp: "1", type: "text", text: { body: "hi" } }] },
      ],
    }],
  };
  test("threads, oldest first, ours vs the customer's, progress", () => {
    const [c] = parseHistory(value);
    expect(c!.progress).toBe(55);
    expect(c!.threads).toHaveLength(1);
    const m = c!.threads[0]!.messages;
    expect(c!.threads[0]!.wa).toBe(CUST);
    expect(m.map((x) => x.id)).toEqual(["wamid.1", "wamid.2", "wamid.3"]);
    expect(m.map((x) => x.out)).toEqual([false, true, false]);
    expect(m[1]!.at).toBe(new Date(1725190000 * 1000).toISOString());
    expect(m[2]!.body).toContain("photo or file");
  });
  test("the business turned off history sharing", () => {
    const [c] = parseHistory({ history: [{ errors: [{ code: 2593109, title: "History sync is turned off by the business from the WhatsApp Business App" }] }] });
    expect(c!.error).toEqual({ code: "2593109", message: "History sync is turned off by the business from the WhatsApp Business App" });
  });
  test("progress is kept between 0 and 100", () => {
    expect(parseHistory({ history: [{ metadata: { progress: 250 }, threads: [] }] })[0]!.progress).toBe(100);
    expect(parseHistory({})).toEqual([]);
  });
});

describe("replies sent from the phone", () => {
  test("echoes go to the customer's chat", () => {
    const e = parseEchoes({ message_echoes: [
      { from: BIZ, to: CUST, id: "wamid.E1", timestamp: "1725190000", type: "text", text: { body: "Yes, we deliver" } },
      { from: BIZ, to: CUST, id: "wamid.E2", timestamp: "1725190001", type: "image", image: { caption: "Here it is" } },
      { from: BIZ, to: "", id: "wamid.E3", type: "text", text: { body: "?" } },
    ] });
    expect(e).toEqual([
      { wa: CUST, id: "wamid.E1", at: new Date(1725190000 * 1000).toISOString(), body: "Yes, we deliver" },
      { wa: CUST, id: "wamid.E2", at: new Date(1725190001 * 1000).toISOString(), body: "[image] Here it is" },
    ]);
  });
});

describe("contacts", () => {
  test("adds and removes, names when present", () => {
    expect(parseContacts({ state_sync: [
      { type: "contact", contact: { full_name: "Kemi Bello", first_name: "Kemi", phone_number: "+234 803 111 2222" }, action: "add", metadata: { timestamp: "1" } },
      { type: "contact", contact: { phone_number: "2348039990000" }, action: "remove" },
      { type: "other" },
    ] })).toEqual([{ phone: CUST, name: "Kemi Bello", action: "add" }, { phone: "2348039990000", name: null, action: "remove" }]);
  });
});

describe("picking the number", () => {
  const list = [{ id: "111111111", platform_type: "CLOUD_API" }, { id: "222222222", is_on_biz_app: true }, { id: "bad" }];
  test("the one Meta's window reported, else the phone-app one, else the first", () => {
    expect(pickNumber(list, "111111111")!.id).toBe("111111111");
    expect(pickNumber(list, null)!.id).toBe("222222222");
    expect(pickNumber([{ id: "333333333" }], "999999999")!.id).toBe("333333333");
    expect(pickNumber([{ id: "bad" }], null)).toBeNull();
  });
  test("text of ordinary messages still works", () => {
    expect(textOf({ type: "text", text: { body: "Hi" } })).toBe("Hi");
  });
});
