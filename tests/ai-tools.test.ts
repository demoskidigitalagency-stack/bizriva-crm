// bun test tests/ai-tools.test.ts — checks on what the AI tools return (no network).
import { expect, test } from "bun:test";
import { adsPrompt, chatPrompt, checkAds, checkMemory, checkPhoto } from "../supabase/functions/ai-tools/tools";

test("photo: trims, needs a name, keeps up to 4 aliases", () => {
  expect(checkPhoto({ name: "  6ft pool table ", description: "Green felt", category: "", aliases: ["snooker", "x", "billiards", "pool", "8-ball", "extra"] }))
    .toEqual({ name: "6ft pool table", description: "Green felt", category: "General", aliases: ["snooker", "billiards", "pool", "8-ball"] });
  expect(checkPhoto({ description: "no name" })).toBeNull();
});

test("ads: three usable variants, unknown CTA replaced", () => {
  const v = checkAds({ variants: [{ headline: "Play at home", text: "Order on WhatsApp", cta: "Buy" }, { headline: "", text: "x" }, { headline: "Gift", text: "y", cta: "Order now" }] });
  expect(v).toHaveLength(2);
  expect(v[0]!.cta).toBe("Send WhatsApp message");
  expect(adsPrompt({ name: "Table tennis table", price: "GHS 6,500" }, "Dxmart", "", "TikTok")).toContain("Price: GHS 6,500");
});

test("memory: known kinds only, sensitive facts dropped, birthdays keep MM-DD", () => {
  const f = checkMemory({ facts: [
    { kind: "likes", value: "black colour", quote: "I prefer black" },
    { kind: "weird", value: "lives near the market", quote: "near the market" },
    { kind: "note", value: "is sick", quote: "I'm sick this week" },
    { kind: "birthday", value: "12 March", quote: "my birthday is 12 March", month_day: "03-12" },
  ] });
  expect(f.map((x) => x.kind)).toEqual(["likes", "note", "birthday"]);
  expect(f[2]!.monthDay).toBe("03-12");
  expect(chatPrompt([{ out: false, body: "how much" }, { out: true, body: "GH₵ 6,900" }])).toBe("Customer: how much\nShop: GH₵ 6,900");
});
