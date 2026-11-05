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

export interface Platform {
  id: PlatformId;
  name: string;
  group: "WordPress" | "Stores" | "Form builders" | "Automation" | "Any website";
  /** What it sends: a lead (enquiry) or an order. */
  sends: "lead or order" | "order" | "lead";
  steps: string[];
  /** What the platform needs (plan or add-on) — stated plainly, no guarantees about third-party pricing. */
  needs?: string;
  sample: Record<string, unknown>;
}

const W = "your Bizriva intake address";

export const PLATFORMS: Platform[] = [
  { id: "elementor", name: "Elementor Forms", group: "WordPress", sends: "lead or order", needs: "Elementor Pro (the Form widget)",
    steps: ["Edit the page with Elementor and select your Form widget.", "Under Actions After Submit, add Webhook.", `In the Webhook section paste ${W}. Turn on Advanced Data.`, "Update the page, then send a test submission."],
    sample: { form: { id: "f3a1", name: "Bone straight order" }, fields: { name: { id: "name", title: "Full name", value: "Kemi Adeyemi" }, phone: { id: "phone", title: "WhatsApp number", value: "0813 442 9910" }, address: { id: "address", title: "Delivery address", value: "21 Allen Avenue, Ikeja" }, city: { id: "city", title: "State", value: "Lagos" }, package: { id: "package", title: "Package", value: "Buy 2" }, product: { id: "product", title: "Product", value: "Raw Vietnamese Bone Straight 20\"" } }, meta: { page_url: { title: "Page URL", value: "https://yourshop.com/bone-straight?utm_source=facebook" } } } },
  { id: "gravity", name: "Gravity Forms", group: "WordPress", sends: "lead or order", needs: "The Gravity Forms Webhooks add-on",
    steps: ["In WordPress go to Forms, open your form, then Settings → Webhooks.", "Add New: Request URL is " + W + ", Request Method POST, Request Format JSON.", "Request Body: All Fields.", "Save, then submit the form once to test."],
    sample: { id: "412", form_id: "3", "1.3": "Bayo", "1.6": "Ogunleye", "2": "08034418820", "3": "bayo@example.com", "4.1": "5 Adeola Odeku Street", "4.3": "Victoria Island", "4.4": "Lagos", "5": "HD Lace Frontal 13x4", "6": "1", "source_url": "https://yourshop.com/frontal?utm_source=instagram" } },
  { id: "wpforms", name: "WPForms", group: "WordPress", sends: "lead or order", needs: "WPForms Webhooks addon (paid plans)",
    steps: ["Open the form in WPForms → Settings → Webhooks and turn them on.", `Add a webhook with Request URL ${W}, method POST, format JSON.`, "Map the body fields: name, phone, address, product.", "Save and send a test entry."],
    sample: { name: "Amaka Obi", phone: "0909 221 7765", email: "amaka@example.com", address: "Plot 4, Admiralty Way, Lekki", product: "Glueless Pixie Curl Wig", quantity: "1", entry_id: "991" } },
  { id: "cf7", name: "Contact Form 7", group: "WordPress", sends: "lead",
    needs: "A small webhook plugin (for example \"CF7 to Webhook\") — or the Bizriva WordPress plugin when it's ready",
    steps: ["Install a CF7 webhook plugin from WordPress → Plugins → Add New.", "Open your contact form → the Webhook tab.", `Paste ${W} and save.`, "Send a test message from the form."],
    sample: { "your-name": "Tunde Bakare", "your-email": "tunde@example.com", "your-phone": "08177001234", "your-message": "Do you deliver the 22 inch body wave to Ibadan?" } },
  { id: "fluent", name: "Fluent Forms", group: "WordPress", sends: "lead or order", needs: "Fluent Forms Pro (Webhook integration)",
    steps: ["Open the form → Settings & Integrations → Configure Integrations → Webhooks.", `Add a feed with Request URL ${W}, method POST, format JSON, All Fields.`, "Save the feed and submit a test entry."],
    sample: { names: { first_name: "Ngozi", last_name: "Eze" }, phone: "07031188456", email: "ngozi@example.com", address_1: { address_line_1: "12 Ogunlana Drive", city: "Surulere", state: "Lagos" }, product: "Edge Control 100ml", quantity: "3", _wp_http_referer: "/edge-control" } },
  { id: "woocommerce", name: "WooCommerce", group: "Stores", sends: "order",
    steps: ["In WordPress go to WooCommerce → Settings → Advanced → Webhooks → Add webhook.", "Status Active, Topic Order created.", `Delivery URL: ${W}. API version WP REST API v3.`, "Save. Place a test order (cash on delivery) to see it arrive."],
    sample: { id: 5521, number: "5521", status: "processing", payment_method: "cod", total: "370000.00", billing: { first_name: "Funmi", last_name: "Alade", phone: "08022334455", email: "funmi@example.com", address_1: "9 Bode Thomas Street", city: "Surulere", state: "LA" }, shipping: { address_1: "9 Bode Thomas Street", city: "Surulere", state: "LA" }, line_items: [{ name: "Raw Vietnamese Bone Straight 20\"", quantity: 2, total: "370000.00" }], customer_note: "Call before coming", meta_data: [{ key: "_utm_source", value: "facebook" }] } },
  { id: "shopify", name: "Shopify", group: "Stores", sends: "order",
    steps: ["In Shopify admin go to Settings → Notifications → Webhooks.", "Create webhook: Event Order creation, Format JSON.", `URL: ${W}.`, "Save, then use Send test notification."],
    sample: { id: "820982911946154508", order_number: 1084, total_price: "96000.00", gateway: "Cash on Delivery (COD)", email: "zainab@example.com", customer: { first_name: "Zainab", last_name: "Musa", phone: "+2348061234567" }, shipping_address: { address1: "14 Gimbiya Street", city: "Garki", province: "FCT", phone: "+2348061234567" }, line_items: [{ title: "HD Lace Frontal 13x4", quantity: 1, price: "96000.00" }], landing_site: "/products/frontal?utm_source=tiktok", note: "" } },
  { id: "google_forms", name: "Google Forms", group: "Form builders", sends: "lead or order",
    steps: ["Open the form's linked Google Sheet → Extensions → Apps Script.", "Paste the Bizriva script (Copy script below) and set your intake address in it.", "Triggers → Add trigger: onFormSubmit, From spreadsheet, On form submit.", "Allow access, then submit the form once."],
    sample: { namedValues: { "Full name": ["Chidi Okafor"], "Phone number": ["0816 554 3321"], "Delivery address": ["3 Rumuola Road"], "City": ["Port Harcourt"], "What would you like to order?": ["Double Drawn Body Wave 18\""], "Quantity": ["1"] }, timestamp: "05/11/2026 14:22:09" } },
  { id: "typeform", name: "Typeform", group: "Form builders", sends: "lead or order",
    steps: ["Open the form → Connect → Webhooks → Add a webhook.", `Paste ${W} and save, then switch it on.`, "Use View deliveries → Send test request."],
    sample: { form_response: { token: "a1b2c3", definition: { fields: [{ id: "f1", title: "What's your name?" }, { id: "f2", title: "WhatsApp number" }, { id: "f3", title: "Which product?" }] }, answers: [{ field: { id: "f1" }, type: "text", text: "Halima Bello" }, { field: { id: "f2" }, type: "phone_number", phone_number: "+2348099001122" }, { field: { id: "f3" }, type: "choice", choice: { label: "Silk Press Care Kit" } }], hidden: { utm_source: "instagram" } } } },
  { id: "jotform", name: "Jotform", group: "Form builders", sends: "lead or order",
    steps: ["Open the form → Settings → Integrations → search WebHooks.", `Paste ${W} and Complete Integration.`, "Submit the form once to test."],
    sample: { submissionID: "5893", rawRequest: JSON.stringify({ q3_fullName: { first: "Segun", last: "Ola" }, q4_phoneNumber: { full: "(0803) 555-0199" }, q5_address: { addr_line1: "2 Ring Road", city: "Ibadan", state: "Oyo" }, q6_product: "Raw Vietnamese Bone Straight 20\"", q7_quantity: "1" }) } },
  { id: "tally", name: "Tally", group: "Form builders", sends: "lead or order",
    steps: ["Open the form → Integrations → Webhooks → Connect.", `Paste ${W} and save.`, "Submit a test response."],
    sample: { eventId: "evt_77", data: { responseId: "r_77", fields: [{ label: "Name", value: "Ifeoma Nnaji" }, { label: "Phone", value: "08127766554" }, { label: "Address", value: "Plot 9, Independence Layout, Enugu" }, { label: "Product", value: "Edge Control 100ml" }] } } },
  { id: "zapier", name: "Zapier, Make or Pabbly", group: "Automation", sends: "lead or order",
    steps: ["Create a Zap (or Make scenario) with your app as the trigger.", "Add the action Webhooks → POST.", `URL: ${W}. Payload type JSON. Map name, phone, address, product, quantity.`, "Test the step."],
    sample: { name: "Rotimi Ade", phone: "08035550101", address: "7 Awolowo Road, Ikoyi", product: "Glueless Pixie Curl Wig", quantity: 1, source: "Facebook Lead Ads via Zapier" } },
  { id: "custom", name: "Any website or landing page", group: "Any website", sends: "lead or order",
    steps: ["Send an HTTP POST to " + W + " when someone submits.", "Body: JSON or form fields named name, phone, address, city, product, quantity.", "Add the header X-Bizriva-Key with your secret key.", "Use Send test to check the mapping."],
    sample: { name: "Bisi Akande", phone: "08060002233", address: "11 Oba Akran Avenue, Ikeja", city: "Lagos", product: "HD Lace Frontal 13x4", quantity: 1, note: "Evening delivery please" } },
];

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

export const FIELD_LABEL: Record<IntakeField, string> = {
  name: "Full name", first_name: "First name", last_name: "Last name", phone: "Phone", email: "Email", address: "Address", city: "City", state: "State",
  landmark: "Landmark", product: "Product", quantity: "Quantity", total: "Order total", note: "Note", utm_source: "Ad or page source", external_id: "Their reference",
};

/** Apps Script for Google Forms (pasted into the linked Sheet). */
export const GOOGLE_SCRIPT = (url: string, key: string) => `function onFormSubmit(e) {
  UrlFetchApp.fetch("${url}", {
    method: "post",
    contentType: "application/json",
    headers: { "X-Bizriva-Key": "${key}" },
    payload: JSON.stringify({ namedValues: e.namedValues, timestamp: new Date().toISOString() }),
    muteHttpExceptions: true
  });
}`;
