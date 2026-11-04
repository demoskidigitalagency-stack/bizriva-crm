"""Checks for the 14 items carried over from Sandala and Kobolink on 2026-11-04.

Run with the dev server on 127.0.0.1:5173 (see tests/README.md).
"""
import asyncio, re
from playwright.async_api import async_playwright

B = "http://127.0.0.1:5173"
results = []


def ok(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra) if extra else ""))


async def ready(pg, path):
    await pg.goto(B + path)
    await pg.wait_for_load_state("load")
    await pg.wait_for_timeout(1000)


async def step(name, coro):
    try:
        await coro
    except Exception as e:
        ok(name, False, f"error: {str(e).splitlines()[0][:180]}")


async def reset_data(pg):
    await ready(pg, "/settings")
    for _ in range(10):
        await pg.get_by_role("button", name="Reset sample data").click()
        try:
            await pg.get_by_role("alertdialog").wait_for(timeout=1500)
            break
        except Exception:
            await pg.wait_for_timeout(500)
    await pg.get_by_role("alertdialog").get_by_role("button", name="Reset").click()
    await pg.wait_for_timeout(300)


async def unread_bell(pg):
    return await pg.locator("header [aria-label=Notifications] span.rounded-full").count()


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width": 1440, "height": 900})).new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" and "ERR_TUNNEL" not in m.text and "fonts.g" not in m.text else None)
        await reset_data(pg)

        async def t_filters():
            await ready(pg, "/inbox")
            tabs = pg.get_by_role("tablist", name="Inbox filters").get_by_role("tab")
            labels = [re.sub(r"\s*\d+$", "", (await t.inner_text()).strip()) for t in await tabs.all()]
            ok("1. inbox has 8 COD filters", labels == ["Needs reply", "All", "Unread", "New enquiries", "Unverified orders", "Dispatched", "Cancelled or out of town", "Assigned to me"], labels)
            await pg.get_by_role("tab", name=re.compile("^Unverified orders")).click(); await pg.wait_for_timeout(300)
            n = int(re.search(r"(\d+)$", (await pg.get_by_role("tab", name=re.compile("^Unverified orders")).inner_text()).strip()).group(1))
            ok("1. unverified filter lists matching chats", n > 0 and await pg.locator("main ul li button").count() >= 1, n)
        await step("filters", t_filters())

        async def t_extract():
            await ready(pg, "/inbox")
            await pg.get_by_role("tab", name=re.compile("^All")).click(); await pg.wait_for_timeout(200)
            await pg.get_by_label("Search conversations").fill("Admiralty"); await pg.wait_for_timeout(300)
            await pg.locator("main ul li button").first.click(); await pg.wait_for_timeout(300)
            panel = pg.get_by_role("complementary", name="Customer details")
            ok("2. details found in chat", await panel.get_by_text("14 Admiralty Way, Lekki Phase 1, Lagos").count() > 0)
            await panel.get_by_role("button", name=re.compile(r"Save \d+ to contact")).click(); await pg.wait_for_timeout(300)
            ok("2. saved to the contact", await panel.get_by_text("Already saved").count() > 0 and await panel.locator("dd", has_text="14 Admiralty Way").count() >= 1)
            ok("3. ad source shown above the chat", await pg.get_by_title("Ad source").count() == 1)
            ok("10. customer panel beside the chat", await panel.is_visible())
        await step("extract", t_extract())

        async def t_product_card():
            await pg.get_by_role("button", name="Send product").click()
            await pg.get_by_label("Find a product").fill("frontal")
            await pg.get_by_role("button", name=re.compile("HD Lace Frontal")).click(); await pg.wait_for_timeout(300)
            ok("4. product card sent into chat", await pg.locator("main li", has_text="HD Lace Frontal 13x4 —").count() > 0)
        await step("product card", t_product_card())

        async def t_alerts():
            before = await unread_bell(pg)
            await pg.get_by_role("button", name="Simulate a customer message").click()
            await pg.get_by_label("Simulated customer message").fill("My name is Bisi Ade. Deliver to 3 Ogunlana Drive, Surulere. 0806 552 1180")
            await pg.get_by_role("button", name="Receive").click(); await pg.wait_for_timeout(300)
            await pg.get_by_role("button", name="Notifications").click(); await pg.wait_for_timeout(200)
            ok("5. new-message alert in the bell", await pg.get_by_text(re.compile("^New message from")).count() > 0)
            await pg.keyboard.press("Escape")
        await step("alerts", t_alerts())

        async def t_products():
            await ready(pg, "/products")
            await pg.locator("tr", has_text="Pixie Curl Glueless Wig").get_by_role("button", name="Edit").click()
            dlg = pg.get_by_role("dialog")
            ok("8. product has description field", "Glueless pixie curl" in await dlg.get_by_label(re.compile("^Description")).input_value())
            await dlg.get_by_label("Deposit to book (optional)").fill("20000")
            await dlg.get_by_role("switch", name="Visible").click()
            await dlg.get_by_role("button", name="Save changes").click(); await pg.wait_for_timeout(300)
            row = pg.locator("tr", has_text="Pixie Curl Glueless Wig")
            ok("8. hidden badge and deposit shown", await row.get_by_text("Hidden").count() == 1 and await row.get_by_text(re.compile("deposit")).count() == 1)
            await ready(pg, "/ai-agent")
            await pg.get_by_label("Customer message").fill("how much is the pixie curl wig"); await pg.get_by_role("button", name="Send", exact=True).click(); await pg.wait_for_timeout(300)
            ok("8. AI agent won't quote a hidden product", "Pixie Curl" not in await pg.locator("[aria-live=polite]").inner_text())
        await step("products", t_products())

        async def t_contacts():
            await ready(pg, "/crm/contacts")
            total = int(re.search(r"(\d+) people", await pg.locator("main").inner_text()).group(1))
            await pg.get_by_label("Ad campaign").click(); await pg.get_by_role("option").nth(1).click(); await pg.wait_for_timeout(300)
            n = int(re.search(r"(\d+) (people|person)", await pg.locator("main").inner_text()).group(1))
            ok("6. filter contacts by ad campaign", 0 < n < total, f"{total} -> {n}")
            await pg.get_by_label("Ad campaign").click(); await pg.get_by_role("option", name="All ad campaigns").click()
            await pg.get_by_label("COD verification").click(); await pg.get_by_role("option", name="Unverified COD order").click(); await pg.wait_for_timeout(300)
            m = int(re.search(r"(\d+) (people|person)", await pg.locator("main").inner_text()).group(1))
            ok("6. filter contacts by COD verification", 0 < m < total, f"{total} -> {m}")
            await ready(pg, "/crm/customers")
            ok("11. Customers shows repeat buyers and total value", await pg.get_by_text("Repeat buyers").count() == 1 and await pg.get_by_text("Total lifetime value").count() == 1)
            await ready(pg, "/analytics")
            ok("11. Analytics shows average order value and repeat customers", await pg.get_by_text("Average order value").count() == 1 and await pg.get_by_text("Repeat customers").count() == 1)
        await step("contacts", t_contacts())

        async def t_settings():
            await ready(pg, "/settings")
            await pg.get_by_label("Currency").click(); await pg.get_by_role("option", name="GHS").click()
            await pg.get_by_role("switch", name="Bubble tails").click()
            await pg.get_by_role("button", name="Save settings").click(); await pg.wait_for_timeout(300)
            await ready(pg, "/products")
            ok("7. currency change applies", "GH₵" in await pg.locator("main").inner_text() or "GHS" in await pg.locator("main").inner_text())
            await ready(pg, "/inbox")
            tails_off = await pg.locator("main li div.rounded-bl-none, main li div.rounded-br-none").count()
            ok("9. bubble-tails setting changes the chat", tails_off == 0, tails_off)
            await ready(pg, "/settings")
            ok("9. team alert switches exist", await pg.get_by_role("switch", name="Dispatch risk alerts").count() == 1 and await pg.get_by_role("switch", name="New customer message alerts").count() == 1)
            await ready(pg, "/settings")
            await pg.get_by_label("Currency").click(); await pg.get_by_role("option", name="NGN").click()
            await pg.get_by_role("switch", name="Bubble tails").click()
            await pg.get_by_role("button", name="Save settings").click(); await pg.wait_for_timeout(300)
            await ready(pg, "/inbox")
            ok("9. bubble tails back on", await pg.locator("main li div.rounded-bl-none, main li div.rounded-br-none").count() > 0)
        await step("settings", t_settings())

        async def t_integrations():
            await ready(pg, "/integrations")
            ok("12. delivery partners card", await pg.get_by_text("Delivery partners (GIG, Fez, Kwik, Topship)").count() == 1)
            await pg.get_by_label("Test name").fill("Funke Akindele Test"); await pg.get_by_label("Test phone").fill("08099887766")
            await pg.get_by_role("button", name="Submit test form").click(); await pg.wait_for_timeout(300)
            ok("13. lead form creates a lead", await pg.get_by_text("Lead created.").count() == 1)
            await ready(pg, "/inbox")
            ok("13. form lead appears in the Inbox", await pg.locator("main ul").get_by_text("Funke Akindele Test").count() > 0)
        await step("integrations", t_integrations())

        async def t_quick():
            await ready(pg, "/analytics")
            await pg.get_by_role("button", name="New", exact=True).click()
            await pg.get_by_role("menuitem", name="New order").click()
            await pg.get_by_label("Find customer").fill("Funke"); await pg.wait_for_timeout(200)
            await pg.get_by_role("dialog").get_by_role("button", name=re.compile("Funke")).click(); await pg.wait_for_timeout(300)
            ok("14. New order from any page opens the order form", await pg.get_by_role("dialog", name="Create order").count() == 1)
            await pg.keyboard.press("Escape")
        await step("quick", t_quick())

        async def t_mobile():
            m = await b.new_page(viewport={"width": 390, "height": 844}); wide = []
            for r in ["/inbox", "/crm/contacts", "/crm/customers", "/products", "/settings", "/integrations", "/analytics"]:
                await m.goto(B + r); await m.wait_for_load_state("load"); await m.wait_for_timeout(1500)
                sw = await m.evaluate("document.documentElement.scrollWidth")
                if sw > 392: wide.append(f"{r}={sw}")
            ok("no sideways scroll on a phone", not wide, ", ".join(wide))
        await step("mobile", t_mobile())

        await reset_data(pg)
        ok("no console errors", not errs, " | ".join(errs[:3]))
        await b.close()
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")


asyncio.run(main())
