// Pure parts of the store importer (tested in tests/catalog-import.test.ts).
export interface Item { name: string; description: string; price: number; category: string; image: string | null; sku: string | null; stock: number | null }
export type Platform = "shopify" | "woocommerce";

/** Only public https shops: no IPs, no localhost, no internal names. */
export function shopUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  u.protocol = "https:";
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h)) return null;
  u.pathname = "/"; u.search = ""; u.hash = "";
  return u;
}

const strip = (html: string | null | undefined) => String(html ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, 2000);

/** Shopify /products.json (public) or Admin API products. */
export function fromShopify(json: any): Item[] {
  return ((json?.products ?? []) as any[]).map((p) => {
    const v = (p.variants ?? [])[0] ?? {};
    const stock = (p.variants ?? []).reduce((n: number | null, x: any) => (typeof x.inventory_quantity === "number" ? (n ?? 0) + Math.max(0, x.inventory_quantity) : n), null);
    return { name: String(p.title ?? "").trim().slice(0, 200), description: strip(p.body_html), price: Number(v.price ?? 0), category: String(p.product_type || "Imported").slice(0, 80),
      image: p.image?.src ?? p.images?.[0]?.src ?? null, sku: v.sku || null, stock };
  }).filter((x) => x.name && x.price > 0);
}

/** WooCommerce Store API (/wp-json/wc/store/v1/products, public) or REST v3 (with keys). */
export function fromWoo(list: any): Item[] {
  return ((Array.isArray(list) ? list : []) as any[]).map((p) => {
    const store = p.prices && typeof p.prices === "object";
    const minor = store ? Number(p.prices.currency_minor_unit ?? 2) : 0;
    const raw = store ? Number(p.prices.price ?? 0) / 10 ** minor : Number(p.price ?? p.regular_price ?? 0);
    return { name: strip(p.name).slice(0, 200), description: strip(p.short_description || p.description), price: Math.round(raw * 100) / 100,
      category: String(p.categories?.[0]?.name ?? "Imported").slice(0, 80), image: p.images?.[0]?.src ?? null, sku: p.sku || null,
      stock: typeof p.stock_quantity === "number" ? p.stock_quantity : null };
  }).filter((x) => x.name && x.price > 0);
}

/** Where to ask for page n. */
export function pageUrl(base: URL, platform: Platform, page: number, keys: boolean): string {
  if (platform === "shopify") return keys ? `${base.origin}/admin/api/2024-10/products.json?limit=250` : `${base.origin}/products.json?limit=250&page=${page}`;
  return keys ? `${base.origin}/wp-json/wc/v3/products?per_page=100&page=${page}` : `${base.origin}/wp-json/wc/store/v1/products?per_page=100&page=${page}`;
}
