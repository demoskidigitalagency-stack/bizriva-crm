/**
 * Website and form connections: one intake address that understands the
 * payloads sent by WordPress form plugins, WooCommerce, Shopify, Google Forms,
 * Typeform, Jotform, Tally and automation tools. Each payload is flattened,
 * then matched to Bizriva fields by name (or by the business's own mapping).
 *
 * The backend runs this same file in the Supabase Edge Function
 * supabase/functions/intake (/functions/v1/intake/<connection id>), which
 * checks the connection's secret key before anything is stored.
 */

export type PlatformId =
  | "elementor" | "gravity" | "wpforms" | "cf7" | "fluent" | "woocommerce" | "shopify"
  | "google_forms" | "typeform" | "jotform" | "tally" | "zapier" | "custom";

export type IntakeField = "name" | "first_name" | "last_name" | "phone" | "email" | "address" | "city" | "state" | "landmark" | "product" | "quantity" | "total" | "note" | "utm_source" | "external_id";

/* ───────────── flatten any payload into label → value pairs ───────────── */

export function flatten(raw: unknown, platform: PlatformId): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => { if (v === null || v === undefined || v === "") return; const s = Array.isArray(v) ? v.join(", ") : String(v); if (s.trim()) out[k] = s.trim(); };
  const walk = (v: unknown, path: string) => {
    if (v && typeof v === "object" && !Array.isArray(v)) Object.entries(v as Record<string, unknown>).forEach(([k, x]) => walk(x, path ? `${path}.${k}` : k));
    else if (Array.isArray(v) && v.length && typeof v[0] === "object") v.forEach((x, i) => walk(x, `${path}.${i}`));
    else put(path, v);
  };
  const r = (raw ?? {}) as Record<string, unknown>;
  if (platform === "elementor" && r["fields"]) {
    Object.values(r["fields"] as Record<string, { id: string; title?: string; value: unknown }>).forEach((f) => { put(f.title || f.id, f.value); put(f.id, f.value); });
    const url = (r["meta"] as Record<string, { value?: string }> | undefined)?.["page_url"]?.value; if (url) put("page_url", url);
    return out;
  }
  if (platform === "gravity") {
    const g = r as Record<string, string>;
    const name = [g["1.3"], g["1.6"]].filter(Boolean).join(" ");
    if (name) put("name", name);
    if (g["2"]) put("phone", g["2"]); if (g["3"]) put("email", g["3"]);
    put("address", [g["4.1"], g["4.3"]].filter(Boolean).join(", ")); put("state", g["4.4"]);
    put("product", g["5"]); put("quantity", g["6"]); put("source_url", g["source_url"]); put("entry id", g["id"]);
    return out;
  }
  if (platform === "google_forms" && r["namedValues"]) { Object.entries(r["namedValues"] as Record<string, string[]>).forEach(([k, v]) => put(k, v)); return out; }
  if (platform === "typeform" && r["form_response"]) {
    const fr = r["form_response"] as { token: string; definition: { fields: { id: string; title: string }[] }; answers: Record<string, unknown>[]; hidden?: Record<string, string> };
    fr.answers.forEach((a) => {
      const title = fr.definition.fields.find((f) => f.id === (a["field"] as { id: string }).id)?.title ?? "answer";
      const v = a["text"] ?? a["phone_number"] ?? a["email"] ?? a["number"] ?? (a["choice"] as { label?: string } | undefined)?.label;
      put(title, v);
    });
    Object.entries(fr.hidden ?? {}).forEach(([k, v]) => put(k, v)); put("external id", fr.token);
    return out;
  }
  if (platform === "jotform" && typeof r["rawRequest"] === "string") {
    const q = JSON.parse(r["rawRequest"] as string) as Record<string, unknown>;
    Object.entries(q).forEach(([k, v]) => {
      const label = k.replace(/^q\d+_/, "");
      if (v && typeof v === "object") {
        const o = v as Record<string, string>;
        if (o["first"] || o["last"]) put(label, `${o["first"] ?? ""} ${o["last"] ?? ""}`.trim());
        else if (o["full"]) put(label, o["full"]);
        else { put(label, [o["addr_line1"], o["city"]].filter(Boolean).join(", ")); put("state", o["state"]); }
      } else put(label, v);
    });
    put("external id", r["submissionID"]);
    return out;
  }
  if (platform === "tally" && r["data"]) { ((r["data"] as { fields: { label: string; value: unknown }[] }).fields ?? []).forEach((f) => put(f.label, f.value)); put("external id", (r["data"] as { responseId?: string }).responseId); return out; }
  if (platform === "woocommerce" && r["billing"]) {
    const b = r["billing"] as Record<string, string>; const s = (r["shipping"] ?? {}) as Record<string, string>;
    put("name", `${b["first_name"] ?? ""} ${b["last_name"] ?? ""}`.trim()); put("phone", b["phone"]); put("email", b["email"]);
    put("address", s["address_1"] || b["address_1"]); put("city", s["city"] || b["city"]); put("state", s["state"] || b["state"]);
    const items = (r["line_items"] as { name: string; quantity: number }[]) ?? [];
    put("product", items.map((i) => i.name).join(", ")); put("quantity", items.reduce((n, i) => n + Number(i.quantity), 0));
    put("total", r["total"]); put("note", r["customer_note"]); put("payment", r["payment_method"]); put("external id", r["id"]);
    put("utm_source", ((r["meta_data"] as { key: string; value: string }[]) ?? []).find((m) => m.key === "_utm_source")?.value);
    return out;
  }
  if (platform === "shopify" && r["line_items"]) {
    const c = (r["customer"] ?? {}) as Record<string, string>; const a = (r["shipping_address"] ?? {}) as Record<string, string>;
    put("name", `${c["first_name"] ?? ""} ${c["last_name"] ?? ""}`.trim()); put("phone", c["phone"] || a["phone"]); put("email", r["email"]);
    put("address", a["address1"]); put("city", a["city"]); put("state", a["province"]);
    const items = r["line_items"] as { title: string; quantity: number }[];
    put("product", items.map((i) => i.title).join(", ")); put("quantity", items.reduce((n, i) => n + Number(i.quantity), 0));
    put("total", r["total_price"]); put("note", r["note"]); put("payment", r["gateway"]); put("external id", r["id"]); put("page_url", r["landing_site"]);
    return out;
  }
  walk(raw, "");
  return out;
}

/* ───────────── match labels to Bizriva fields ───────────── */

const ALIASES: Record<IntakeField, RegExp> = {
  name: /^(name|full ?name|your-name|names|customer name|what'?s your name\??|fullname|contact name)$/i,
  first_name: /(^|\.)(first[_ ]?name|firstname|fname)$/i,
  last_name: /(^|\.)(last[_ ]?name|lastname|surname|lname)$/i,
  phone: /(phone|whatsapp|mobile|tel|telephone|phone ?number|your-phone)/i,
  email: /(e-?mail)/i,
  address: /(address|street|addr_line1|address_1|address1|delivery address)/i,
  city: /^(city|town|area|lga)$|\.city$/i,
  state: /^(state|province|region)$|\.state$/i,
  landmark: /(landmark|nearest|bus ?stop)/i,
  product: /(product|item|which product|what would you like|package name|order item)/i,
  quantity: /(quantity|qty|how many|^package$)/i,
  total: /^(total|amount|price|total_price)$/i,
  note: /(message|note|comment|your-message|customer_note|instructions)/i,
  utm_source: /(utm_source|source_url|page_url|landing|referr?er|^source$)/i,
  external_id: /(external id|entry id|^id$|submission|token|order ?number)/i,
};

export type FieldMap = Partial<Record<IntakeField, string>>;

export function autoMap(flat: Record<string, string>): FieldMap {
  const map: FieldMap = {};
  const keys = Object.keys(flat);
  (Object.keys(ALIASES) as IntakeField[]).forEach((f) => {
    const hit = keys.find((k) => ALIASES[f].test(k) && !Object.values(map).includes(k) && !(f === "address" && /email/i.test(k)) && !(f === "product" && /quantity/i.test(k)));
    if (hit) map[f] = hit;
  });
  return map;
}

export interface Normalised {
  name: string; phone: string; email?: string; address?: string; city?: string; landmark?: string;
  product?: string; quantity: number; total?: number; note?: string; source?: string; externalId?: string;
  missing: string[];
}

export function normalise(flat: Record<string, string>, map: FieldMap): Normalised {
  const g = (f: IntakeField) => (map[f] ? flat[map[f]!] : undefined)?.trim();
  const name = g("name") || [g("first_name"), g("last_name")].filter(Boolean).join(" ");
  const phone = g("phone") ?? "";
  const qty = Number(String(g("quantity") ?? "1").replace(/\D/g, "")) || 1;
  const total = g("total") ? Number(String(g("total")).replace(/[^\d.]/g, "")) : undefined;
  const src = g("utm_source");
  const utm = src ? (/utm_source=([^&]+)/.exec(src)?.[1] ?? src) : undefined;
  const city = g("city") || g("state");
  const missing = [!name && "name", phone.replace(/\D/g, "").length < 10 && "phone"].filter(Boolean) as string[];
  return {
    name, phone, quantity: qty, missing,
    ...(g("email") ? { email: g("email")! } : {}), ...(g("address") ? { address: g("address")! } : {}), ...(city ? { city: city === "LA" ? "Lagos" : city } : {}),
    ...(g("landmark") ? { landmark: g("landmark")! } : {}), ...(g("product") ? { product: g("product")! } : {}), ...(total ? { total } : {}),
    ...(g("note") ? { note: g("note")! } : {}), ...(utm ? { source: utm } : {}), ...(g("external_id") ? { externalId: g("external_id")! } : {}),
  };
}
