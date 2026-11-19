// bun test tests/wa_linked.test.ts — WhatsApp linked device (worker/src/parse.ts, worker/src/auth.ts).
import { describe, expect, test } from "bun:test";
import { adOf, batches, chatPhone, groupRows, isPersonChat, statusJids, contactNames, mediaOf, mediaPath, pause, phoneOfJid, rememberLid, textOf, toRow, toThreads } from "../worker/src/parse";
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

describe("names for the phone", () => {
  test("saved name format matches the app's", async () => {
    const { savedName } = await import("../worker/src/parse");
    const { savedName: appName } = await import("../src/lib/vcard");
    const tags = ["No order yet", "Asked about: 4ft 3-in-1 Multi Table"];
    expect(savedName("233538699550", "David Dapaah", tags, "{name} - {product}")).toBe("David Dapaah - 4ft 3-in-1 Multi Table");
    expect(savedName("233538699550", null, [], "{name} - {product}")).toBe("Customer 9550");
    expect(savedName("233538699550", "David", tags, "{name} {last4}")).toBe(appName({ phone: "233538699550", name: "David", tags }, "{name} {last4}"));
  });
  test("chat names from history, including hidden ids", async () => {
    const { chatNames } = await import("../worker/src/parse");
    const lid = new Map<string, string>();
    expect(chatNames([
      { id: "233538699550@s.whatsapp.net", name: "David Kumasi" },
      { id: "888@lid", pnJid: "233571871528@s.whatsapp.net", displayName: "Ama" },
      { id: "120363@g.us", name: "Group" },
      { id: "233500000000@s.whatsapp.net" },
    ], lid)).toEqual([{ phone: "233538699550", name: "David Kumasi" }, { phone: "233571871528", name: "Ama" }]);
  });
});

describe("files in a chat", () => {
  test("a video is recognised with its type, size and storage path", () => {
    const f = mediaOf({ videoMessage: { mimetype: "video/mp4", fileLength: { low: 2_500_000, high: 0 }, caption: "see it" } });
    expect(f).toEqual({ kind: "video", mime: "video/mp4", ext: "mp4", name: null, bytes: 2_500_000 });
    expect(mediaPath("ws-1", "msg-1", f!.ext!)).toBe("ws-1/wa/msg-1.mp4");
  });
  test("voice notes, photos inside disappearing messages and documents", () => {
    expect(mediaOf({ audioMessage: { mimetype: "audio/ogg; codecs=opus", ptt: true, fileLength: 9000 } })).toMatchObject({ kind: "audio", mime: "audio/ogg", ext: "ogg" });
    expect(mediaOf({ ephemeralMessage: { message: { imageMessage: { mimetype: "image/jpeg" } } } })).toMatchObject({ kind: "image", ext: "jpg", bytes: 0 });
    expect(mediaOf({ documentMessage: { mimetype: "application/pdf", fileName: "invoice.pdf" } })).toMatchObject({ kind: "document", ext: "pdf", name: "invoice.pdf" });
  });
  test("plain text has no file; an unknown file type is recognised but has no extension", () => {
    expect(mediaOf({ conversation: "hello" })).toBeNull();
    expect(mediaOf({ documentMessage: { mimetype: "application/zip", fileName: "a.zip" } })).toMatchObject({ kind: "document", ext: null });
  });
});

describe("which ad started the chat", () => {
  test("a click-to-WhatsApp message carries the ad", () => {
    const m = { extendedTextMessage: { text: "What's the price?", contextInfo: { externalAdReply: { sourceType: "ad", sourceId: "1202", title: "6ft game table", sourceUrl: "https://fb.me/abc" } } } };
    expect(adOf(m)).toEqual({ id: "1202", headline: "6ft game table", url: "https://fb.me/abc" });
  });
  test("an ordinary message, or a link preview that isn't an ad, has none", () => {
    expect(adOf({ conversation: "Hello" })).toBeNull();
    expect(adOf({ extendedTextMessage: { text: "see", contextInfo: { externalAdReply: { sourceType: "post", sourceId: "9", title: "x" } } } })).toBeNull();
  });
});

describe("Status posts are not chat messages", () => {
  test("a Status (with the poster in remoteJidAlt) has no chat phone", () => {
    expect(chatPhone({ remoteJid: "status@broadcast", remoteJidAlt: "233596888569@s.whatsapp.net" }, new Map())).toBeNull();
    expect(toRow({ key: { remoteJid: "status@broadcast", remoteJidAlt: "233596888569@s.whatsapp.net", id: "S1" }, message: { videoMessage: { mimetype: "video/mp4" } }, messageTimestamp: 1 }, new Map())).toBeNull();
  });
  test("groups, broadcast lists and channels aren't person chats; numbers and hidden ids are", () => {
    expect(isPersonChat("120363@g.us")).toBe(false);
    expect(isPersonChat("12345@broadcast")).toBe(false);
    expect(isPersonChat("1203@newsletter")).toBe(false);
    expect(isPersonChat("233596888569@s.whatsapp.net")).toBe(true);
    expect(isPersonChat("19283746@lid")).toBe(true);
    expect(chatPhone({ remoteJid: "233596888569@s.whatsapp.net" }, new Map())).toBe("233596888569");
  });
});

describe("Status and groups", () => {
  test("Status recipients: valid numbers only, once each", () => {
    expect(statusJids(["233244000111", "233244000111", "abc", "12", 2348031234567])).toEqual(["233244000111@s.whatsapp.net", "2348031234567@s.whatsapp.net"]);
  });
  test("groups: name, size, whether the business is an admin, admins-only groups", () => {
    const all = {
      "1203-1@g.us": { id: "1203-1@g.us", subject: "Resellers Accra", announce: true, participants: [{ id: "233500000001@s.whatsapp.net" }, { id: "99887766@lid", phoneNumber: "233244000999@s.whatsapp.net", admin: "superadmin" }] },
      "1203-2@g.us": { id: "1203-2@g.us", subject: "Ankara Lovers", size: 250, participants: [{ id: "233500000002@s.whatsapp.net" }] },
      "status@broadcast": { id: "status@broadcast" },
    };
    expect(groupRows(all, ["233244000999:12@s.whatsapp.net"])).toEqual([
      { jid: "1203-2@g.us", name: "Ankara Lovers", size: 250, admin: false, announce: false, members: [{ phone: "233500000002", admin: false }], hidden: 0 },
      { jid: "1203-1@g.us", name: "Resellers Accra", size: 2, admin: true, announce: true, members: [{ phone: "233500000001", admin: false }], hidden: 0 },
    ]);
  });
  test("group members: numbers read, the business left out, hidden numbers counted", () => {
    const all = { "9-1@g.us": { id: "9-1@g.us", subject: "Buyers", participants: [
      { id: "111@lid", phoneNumber: "233200000001@s.whatsapp.net", admin: "admin" }, { id: "222@lid" }, { id: "233200000001@s.whatsapp.net" }, { id: "233244000999@s.whatsapp.net" }] } };
    const [g] = groupRows(all, ["233244000999@s.whatsapp.net"]);
    expect(g!.members).toEqual([{ phone: "233200000001", admin: true }]);
    expect(g!.hidden).toBe(1);
  });
});
