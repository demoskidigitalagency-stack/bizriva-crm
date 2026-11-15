// bun test tests/catalog-import.test.ts — Shopify / WooCommerce catalogue import (pure parts).
import { expect, test } from "bun:test";
import { fromShopify, fromWoo, pageUrl, shopUrl } from "../supabase/functions/catalog-import/catalog";

test("only public https shop addresses", () => {
  expect(shopUrl("myshop.myshopify.com/collections/all")?.href).toBe("https://myshop.myshopify.com/");
  expect(shopUrl("http://dxmart.com")?.protocol).toBe("https:");
  for (const bad of ["localhost", "127.0.0.1", "http://10.0.0.1", "intranet", "ftp://x.com", "shop.internal"]) expect(shopUrl(bad)).toBeNull();
});

test("Shopify products.json", () => {
  const items = fromShopify({ products: [
    { title: "Pool table 7ft", body_html: "<p>Solid <b>wood</b>&nbsp;frame</p>", product_type: "Game tables", image: { src: "https://cdn.shopify.com/a.jpg" }, variants: [{ price: "6900.00", sku: "PT7", inventory_quantity: 3 }, { price: "7100.00", inventory_quantity: 2 }] },
    { title: "Free sticker", variants: [{ price: "0.00" }] },
  ] });
  expect(items).toEqual([{ name: "Pool table 7ft", description: "Solid wood frame", price: 6900, category: "Game tables", image: "https://cdn.shopify.com/a.jpg", sku: "PT7", stock: 5 }]);
});

test("WooCommerce Store API prices are in minor units", () => {
  const items = fromWoo([{ name: "Table tennis &amp; bats", short_description: "<p>Indoor</p>", prices: { price: "650000", currency_minor_unit: 2 }, categories: [{ name: "Sports" }], images: [{ src: "https://x.com/t.jpg" }], sku: "", stock_quantity: null }]);
  expect(items[0]).toMatchObject({ name: "Table tennis & bats", price: 6500, category: "Sports", description: "Indoor", sku: null });
  expect(fromWoo([{ name: "Bats", price: "120.5" }])[0]!.price).toBe(120.5);
});

test("page addresses", () => {
  const u = shopUrl("dxmart.com")!;
  expect(pageUrl(u, "woocommerce", 2, false)).toBe("https://dxmart.com/wp-json/wc/store/v1/products?per_page=100&page=2");
  expect(pageUrl(u, "shopify", 1, false)).toBe("https://dxmart.com/products.json?limit=250&page=1");
});
