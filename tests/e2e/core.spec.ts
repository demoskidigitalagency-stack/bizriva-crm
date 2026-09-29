import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@bizriva.test");
  await page.getByLabel("Password").fill("test1234");
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("authenticated operator can navigate CRM", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "CRM" }).click();
  await expect(page.getByRole("heading", { name: "CRM" })).toBeVisible();
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page.getByPlaceholder("Search name, phone, email, city...")).toBeVisible();
  const firstContact = page.locator("tbody a").first();
  await expect(firstContact).toBeVisible();
  await firstContact.click();
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
});

test("public storefront creates an order confirmation", async ({ page }) => {
  await page.goto("/shop/luxehair");
  await expect(page.getByRole("heading", { name: "Shop products" })).toBeVisible();
  await page.getByLabel("Full name").fill("Test Customer");
  await page.getByLabel("Phone / WhatsApp").fill("+2348012345678");
  await page.getByLabel("City").fill("Lagos");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("heading", { name: "Order received" })).toBeVisible();
});
