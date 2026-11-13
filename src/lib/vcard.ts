/**
 * Contacts → a .vcf file the phone or Google Contacts can import, so every
 * customer can see the business's WhatsApp Status. Unit-tested in tests/vcard.test.ts.
 */
export interface VcfContact { phone: string; name: string | null; tags: string[] }

/** Name template tokens: {name}, {product} (first "Asked about" tag), {last4}. */
export function savedName(c: VcfContact, template: string): string {
  const digits = c.phone.replace(/\D/g, "");
  const product = c.tags.find((t) => t.startsWith("Asked about: "))?.slice("Asked about: ".length) ?? "";
  const name = (c.name ?? "").trim() || `Customer ${digits.slice(-4)}`;
  const out = (template.trim() || "{name}")
    .replaceAll("{name}", name).replaceAll("{product}", product).replaceAll("{last4}", digits.slice(-4))
    .replace(/\s*[-–|,]\s*$/, "").replace(/\s{2,}/g, " ").trim();
  return out || name;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\r?\n/g, " ");

export function buildVcf(list: VcfContact[], template = "{name}"): string {
  const seen = new Set<string>();
  const cards: string[] = [];
  for (const c of list) {
    const digits = c.phone.replace(/\D/g, "");
    if (digits.length < 7 || seen.has(digits)) continue;
    seen.add(digits);
    const n = esc(savedName(c, template));
    cards.push(["BEGIN:VCARD", "VERSION:3.0", `FN:${n}`, `N:;${n};;;`, `TEL;TYPE=CELL:+${digits}`, "END:VCARD"].join("\r\n"));
  }
  return cards.length ? cards.join("\r\n") + "\r\n" : "";
}

/** Start the browser download of a text file. */
export function downloadText(filename: string, text: string, type = "text/vcard"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
