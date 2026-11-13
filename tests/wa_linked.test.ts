// bun test tests/wa_linked.test.ts — WhatsApp linked device (worker/src/parse.ts, worker/src/auth.ts).
import { describe, expect, test } from "bun:test";
import { batches, chatPhone, contactNames, pause, phoneOfJid, rememberLid, textOf, toRow, toThreads } from "../worker/src/parse";
import { keyFrom, open, seal } from "../worker/src/auth";

const CUST = "2348031112222";

describe("who a chat belongs to", () => {
  test("phone chats only — not groups, status or channels", () => {
    expect(phoneOfJid(`${CUST}@s.whatsapp.net`)).toBe(CUST);
    expect(phoneOfJid(`${CUST}:12@s.whatsapp.net`)).toBe(CUST);
    expect(phoneOfJid("120363000000000000@g.us")).toBeNull();
    expect(phoneOfJid("status@broadcast")).toBeNull();
    expect(phoneOfJid("12345@newsletter")).toBeNull();
  });
  test("hidden ids (@lid) map to the phone WhatsApp told us", () => {
    const lid = new Map<string, string>();
    expect(chatPhone({ remoteJid: "998877@lid" }, lid)).toBeNull();
    rememberLid(lid, "998877@lid", `${CUST}@s.whatsapp.net`);
    expect(chatPhone({ remoteJid: "998877@lid" }, lid)).toBe(CUST);
    expect(chatPhone({ remoteJid: "555@lid", remoteJidAlt: `${CUST}@s.whatsapp.net` }, lid)).toBe(CUST);
  });
});

describe("message text", () => {
  test("text, captions and placeholders", () => {
    expect(textOf({ conversation: "How much?" })).toBe("How much?");
    expect(textOf({ extendedTextMessage: { text: "Hair dryer price pls" } })).toBe("Hair dryer price pls");
    expect(textOf({ imageMessage: { caption: "This one" } })).toBe("[photo] This one");
    expect(textOf({ audioMessage: { ptt: true } })).toBe("[voice note]");
    expect(textOf({ documentMessage: { fileName: "list.pdf" } })).toBe("[document: list.pdf]");
    expect(textOf({ ephemeralMessage: { message: { conversation: "hidden" } } })).toBe("hidden");
    expect(textOf({ viewOnceMessageV2: { message: { imageMessage: {} } } })).toBe("[photo]");
  });
  test("not chat: reactions, deletes, empty", () => {
    expect(textOf({ reactionMessage: { text: "👍" } })).toBeNull();
    expect(textOf({ protocolMessage: { type: 0 } })).toBeNull();
    expect(textOf(null)).toBeNull();
  });
});

describe("history → threads", () => {
  const lid = new Map<string, string>();
  const msgs = [
    { key: { remoteJid: `${CUST}@s.whatsapp.net`, id: "B", fromMe: true }, messageTimestamp: 1725190000, message: { conversation: "It's ₦12,000" } },
    { key: { remoteJid: `${CUST}@s.whatsapp.net`, id: "A", fromMe: false }, messageTimestamp: { low: 1725189000, high: 0 }, pushName: "Kemi", message: { conversation: "How much is the hair dryer?" } },
    { key: { remoteJid: "120363@g.us", id: "G", fromMe: false }, messageTimestamp: 1, message: { conversation: "group" } },
    { key: { remoteJid: `${CUST}@s.whatsapp.net`, id: "R", fromMe: false }, messageTimestamp: 1725191000, message: { reactionMessage: { text: "❤️" } } },
  ];
  test("one thread per customer, oldest first, ours vs theirs, name from the chat", () => {
    const [t, ...rest] = toThreads(msgs, lid, new Map());
    expect(rest).toHaveLength(0);
    expect(t!.wa).toBe(CUST);
    expect(t!.name).toBe("Kemi");
    expect(t!.messages.map((m) => [m.id, m.out])).toEqual([["wa:A", false], ["wa:B", true]]);
    expect(t!.messages[0]!.at).toBe(new Date(1725189000 * 1000).toISOString());
  });
  test("the name saved on the phone wins", () => {
    expect(toThreads(msgs, lid, new Map([[CUST, "Kemi Bello (Lekki)"]]))[0]!.name).toBe("Kemi Bello (Lekki)");
  });
  test("our own messages carry no customer name", () => {
    expect(toRow(msgs[0], lid)!.name).toBeNull();
  });
  test("batches stay small but keep chats whole", () => {
    const mk = (n: number, wa: string) => ({ wa, name: null, messages: Array.from({ length: n }, (_, i) => ({ id: `${wa}${i}`, at: "", out: false, body: "x" })) });
    const b = batches([mk(300, "1"), mk(300, "2"), mk(50, "3"), mk(900, "4")], 400);
    expect(b.map((x) => x.map((t) => t.wa))).toEqual([["1"], ["2", "3"], ["4"]]);
    expect(batches([])).toEqual([]);
  });
});

describe("contacts from the phone", () => {
  test("saved name, else their WhatsApp name; hidden ids resolved", () => {
    const lid = new Map<string, string>();
    expect(contactNames([
      { id: `${CUST}@s.whatsapp.net`, name: "Kemi Bello" },
      { id: "777@lid", lid: "777@lid", phoneNumber: "2348039990000@s.whatsapp.net", notify: "Tunde" },
      { id: "120363@g.us", name: "Group" },
      { id: "2348030000000@s.whatsapp.net" },
    ], lid)).toEqual([{ phone: CUST, name: "Kemi Bello" }, { phone: "2348039990000", name: "Tunde" }]);
    expect(lid.get("777")).toBe("2348039990000");
  });
});

describe("pacing", () => {
  test("replies 2–5 s, marketing 6–15 s", () => {
    expect(pause("service", () => 0)).toBe(2000);
    expect(pause(null, () => 0.999)).toBeLessThan(5000);
    expect(pause("marketing", () => 0)).toBe(6000);
    expect(pause("marketing", () => 0.999)).toBeLessThan(15000);
  });
});

describe("session encryption", () => {
  test("round trip; another key can't read it; short keys refused", () => {
    const k = keyFrom("x".repeat(40));
    const s = seal(k, '{"a":1}');
    expect(s).not.toContain('{"a":1}');
    expect(seal(k, '{"a":1}')).not.toBe(s); // fresh nonce every time
    expect(open(k, s)).toBe('{"a":1}');
    expect(() => open(keyFrom("y".repeat(40)), s)).toThrow();
    expect(() => keyFrom("short")).toThrow();
  });
});
