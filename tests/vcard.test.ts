// bun test tests/vcard.test.ts — contacts download for the phone / Google Contacts.
import { describe, expect, test } from "bun:test";
import { buildCsv, buildVcf, savedName } from "../src/lib/vcard";

describe("saved names", () => {
  const kemi = { phone: "+234 803 111 2222", name: "Kemi", tags: ["No order yet", "Asked about: Hair dryer"] };
  test("template tokens", () => {
    expect(savedName(kemi, "{name}")).toBe("Kemi");
    expect(savedName(kemi, "{name} - {product}")).toBe("Kemi - Hair dryer");
    expect(savedName(kemi, "Lead {name} {last4}")).toBe("Lead Kemi 2222");
  });
  test("no name or no product: falls back cleanly", () => {
    expect(savedName({ phone: "2348039990000", name: null, tags: [] }, "{name} - {product}")).toBe("Customer 0000");
    expect(savedName({ phone: "2348039990000", name: " ", tags: [] }, "")).toBe("Customer 0000");
  });
});

describe("vcf file", () => {
  test("one card per number, international format, duplicates and bad numbers dropped, commas escaped", () => {
    const v = buildVcf([
      { phone: "2348031112222", name: "Kemi, Lekki", tags: [] },
      { phone: "+234 803 111 2222", name: "Kemi again", tags: [] },
      { phone: "123", name: "bad", tags: [] },
    ]);
    expect(v.match(/BEGIN:VCARD/g)).toHaveLength(1);
    expect(v).toContain("TEL;TYPE=CELL:+2348031112222");
    expect(v).toContain("FN:Kemi\\, Lekki");
    expect(buildVcf([])).toBe("");
  });
});

test("{city} token and empty tokens collapse cleanly", () => {
  expect(savedName({ phone: "233241234490", name: null, tags: ["Asked about: Table tennis table"], location: "Kumasi" }, "{name} - {city} - {product}")).toBe("Customer 4490 - Kumasi - Table tennis table");
  expect(savedName({ phone: "233241234490", name: "Ama", tags: [], location: null }, "{name} - {city} - {product}")).toBe("Ama");
});

test("csv: quoted names, +international, no duplicates", () => {
  expect(buildCsv([{ phone: "233244114567", name: 'Kofi "K"', tags: [] }, { phone: "+233 244 114 567", name: "dup", tags: [] }])).toBe('Name,Phone\n"Kofi ""K""","+233244114567"\n');
});
