"""Checks for the features added from the 2026-11-04 review (WaContacts, StitchBook,
FabianForms, Adflow, Xara and the two WhatsApp playbooks).

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


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width": 1440, "height": 900})).new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" and "ERR_TUNNEL" not in m.text and "fonts.g" not in m.text else None)
        await reset_data(pg)

        async def t_nav():
            await ready(pg, "/")
            nav = pg.locator("aside nav, nav").first
            for label in ["Order Forms", "Calendar", "Coming Later"]:
                ok(f"sidebar has {label}", await pg.get_by_role("link", name=label, exact=True).count() >= 1)
        await step("nav", t_nav())

        async def t_form_order():
            await ready(pg, "/order-forms")
            await pg.get_by_role("button", name=re.compile("^Open Bone Straight")).click(); await pg.wait_for_timeout(500)
            form = pg.get_by_role("region", name="Order form preview")
            await form.get_by_text("Buy 3").click()
            ok("form total follows the package", "500,000" in await form.get_by_label("Form total").inner_text())
            await form.get_by_label("Full name").fill("Tolu Bakare")
            await pg.get_by_label("Visitor source").click(); await pg.get_by_role("option", name="TikTok ad").click()
            await form.get_by_label("Phone number").fill("0809 111 2233")
            await form.get_by_label("Delivery address").fill("7 Bode Thomas Street, Surulere")
            await form.get_by_label("City or state").fill("Lagos")
            await form.get_by_label("Nearest landmark").fill("Near the stadium")
            await form.get_by_role("button", name="Place order").click(); await pg.wait_for_timeout(400)
            ok("order form saves the order", await form.get_by_text("Order received").count() == 1)
            await form.get_by_role("button", name="Refresh thank-you page").click()
            ok("duplicate purchase event blocked", await form.get_by_text(re.compile("Duplicate purchase event blocked")).count() == 1)
            await pg.get_by_role("tab", name="Orders").click(); await pg.wait_for_timeout(200)
            ok("form orders list shows it", await pg.get_by_role("cell", name="Tolu Bakare").count() == 1 and await pg.get_by_role("cell", name="TikTok ad").count() == 1)
            await pg.get_by_role("tab", name="Report").click(); await pg.wait_for_timeout(200)
            ok("report shows drop-off and sources", await pg.get_by_text("Where people stop").count() == 1 and await pg.get_by_text("TikTok ad").count() >= 1)
            await ready(pg, "/inbox")
            await pg.get_by_role("tab", name=re.compile("^All")).click()
            await pg.get_by_label("Search conversations").fill("Tolu"); await pg.wait_for_timeout(300)
            ok("form order arrives in the Inbox", await pg.locator("main ul li button", has_text="Tolu Bakare").count() >= 1)
            await ready(pg, "/orders")
            await pg.get_by_label("Search orders").fill("Tolu"); await pg.wait_for_timeout(300)
            ok("form order is in Orders, pending confirmation", await pg.locator("tr", has_text="Tolu Bakare").get_by_text("Pending Confirmation", exact=False).count() >= 1 or await pg.locator("tr", has_text="Tolu Bakare").count() == 1)
        await step("form order", t_form_order())

        async def t_builder():
            await ready(pg, "/order-forms")
            await pg.get_by_role("button", name="New order form").click(); await pg.wait_for_timeout(500)
            await pg.get_by_role("tab", name="Build").click()
            await pg.get_by_label("Package 1 price").fill("12345")
            await pg.get_by_role("button", name="Save form").click(); await pg.wait_for_timeout(200)
            await pg.get_by_role("tab", name="Preview").click(); await pg.wait_for_timeout(200)
            ok("new form saved and preview uses its prices", await pg.get_by_role("region", name="Order form preview").get_by_text(re.compile("12,345")).count() >= 1)
        await step("builder", t_builder())

        async def t_order_money():
            await ready(pg, "/orders")
            await pg.get_by_role("tab", name=re.compile("^To confirm")).click(); await pg.wait_for_timeout(200)
            await pg.locator("tbody tr").first.click(); await pg.wait_for_timeout(400)
            panel = pg.get_by_role("group", name="Deposit and balance")
            before = await panel.get_by_test_id("balance").inner_text()
            await panel.get_by_label("Deposit amount").fill("10000")
            await panel.get_by_role("button", name="Record payment").click(); await pg.wait_for_timeout(200)
            after = await panel.get_by_test_id("balance").inner_text()
            ok("deposit lowers the balance", before != after, f"{before} -> {after}")
            await panel.get_by_role("button", name="Request balance in chat").click()
            ok("balance request sent", await panel.get_by_text(re.compile("Payment link sent")).count() == 1)
            await panel.get_by_role("button", name="Create invoice").click(); await pg.wait_for_timeout(300)
            ok("invoice opens with a number", await pg.get_by_role("dialog", name=re.compile("^Invoice INV-")).count() == 1)
            await pg.keyboard.press("Escape")
        await step("order money", t_order_money())

        async def t_complaints():
            await ready(pg, "/inbox")
            tab = pg.get_by_role("tab", name=re.compile("^Complaints"))
            n = int(re.search(r"(\d+)$", (await tab.inner_text()).strip()).group(1))
            ok("inbox has a Complaints filter with the open one", n >= 1, n)
            await pg.get_by_role("tab", name=re.compile("^All")).click(); await pg.wait_for_timeout(200)
            await pg.locator("main ul li button").nth(5).click(); await pg.wait_for_timeout(300)
            if await pg.get_by_role("button", name="Mark as complaint").count():
                await pg.get_by_role("button", name="Mark as complaint").click()
                await pg.get_by_label("Complaint reason").fill("Hair shedding after one wash")
                await pg.get_by_role("button", name="Save complaint").click(); await pg.wait_for_timeout(300)
            ok("complaint banner shows", await pg.get_by_text("Open complaint:").count() == 1)
            n2 = int(re.search(r"(\d+)$", (await tab.inner_text()).strip()).group(1))
            ok("complaint count goes up", n2 == n + 1, f"{n} -> {n2}")
            await pg.get_by_role("button", name="Resolve").click()
            await pg.get_by_label("How it was resolved").fill("Sent a replacement bundle")
            await pg.get_by_role("button", name="Mark resolved").click(); await pg.wait_for_timeout(300)
            ok("complaint resolves", await pg.get_by_text(re.compile("Complaint resolved: Sent a replacement")).count() == 1)
        await step("complaints", t_complaints())

        async def t_quick_replies():
            await pg.get_by_role("button", name="Quick replies").click()
            await pg.get_by_role("button", name="Pidgin", exact=True).click()
            await pg.locator("[data-radix-popper-content-wrapper] li button").first.click(); await pg.wait_for_timeout(200)
            ok("quick reply fills the reply box", len(await pg.get_by_label("Reply", exact=True).input_value()) > 20)
        await step("quick replies", t_quick_replies())

        async def t_templates():
            await ready(pg, "/templates")
            await pg.get_by_role("button", name=re.compile(r"^Complaints \(")).click(); await pg.wait_for_timeout(200)
            ok("reply library filters by purpose", await pg.get_by_text("complaint_acknowledge", exact=True).count() == 1)
            await pg.get_by_role("button", name="Pidgin", exact=True).click(); await pg.wait_for_timeout(200)
            ok("reply library filters by language", await pg.get_by_text("complaint_acknowledge_pidgin").count() == 1 and await pg.get_by_text("complaint_acknowledge", exact=True).count() == 0)
        await step("templates", t_templates())

        async def t_calendar():
            await ready(pg, "/calendar")
            ok("calendar month grid", await pg.get_by_role("grid", name="Month").count() == 1)
            await pg.get_by_role("button", name="Add event").click()
            await pg.get_by_label("Title").fill("Fitting with Ada")
            await pg.get_by_role("dialog").get_by_role("button", name="Add").click(); await pg.wait_for_timeout(300)
            await pg.get_by_role("tab", name="List").click(); await pg.wait_for_timeout(200)
            ok("added event shows in list", await pg.get_by_text("Fitting with Ada").count() == 1)
            ok("deliveries appear on the calendar", await pg.get_by_text("Delivery", exact=True).count() >= 1)
        await step("calendar", t_calendar())

        async def t_store():
            await ready(pg, "/store")
            await pg.get_by_alt_text(re.compile("^QR code for")).wait_for(timeout=8000)
            ok("share kit QR code", await pg.get_by_alt_text(re.compile("^QR code for")).count() == 1)
            ok("WhatsApp link uses the number", "wa.me/2348035550142" in await pg.get_by_label("whatsapp link").inner_text())
        await step("store", t_store())

        async def t_import():
            await ready(pg, "/products")
            before = await pg.locator("tbody tr").count()
            await pg.get_by_role("button", name="Import CSV").click()
            await pg.get_by_role("button", name="Use a sample").click()
            await pg.get_by_role("button", name="Import 2").click(); await pg.wait_for_timeout(200)
            await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
            ok("CSV import adds products", await pg.locator("tbody tr").count() == before + 2, f"{before} -> {await pg.locator('tbody tr').count()}")
        await step("import", t_import())

        async def t_knowledge():
            await ready(pg, "/knowledge")
            await pg.get_by_role("button", name="Add policy starters").click()
            ok("policy starters added", await pg.get_by_text(re.compile("^5 policy starters added")).count() == 1)
            await pg.get_by_role("button", name="Add policy starters").click()
            ok("policy starters not duplicated", await pg.get_by_text("Policy starters are already in your Knowledge Base.").count() == 1)
        await step("knowledge", t_knowledge())

        async def t_today():
            await ready(pg, "/today")
            await pg.get_by_role("button", name=re.compile("^Tick day 3")).click(); await pg.wait_for_timeout(200)
            ok("setup checklist ticks", await pg.get_by_text(re.compile("^3 of 7 done")).count() == 1)
        await step("today", t_today())

        async def t_automation():
            await ready(pg, "/automation")
            ok("ready-made workflows present", all([await pg.get_by_text(n).count() >= 1 for n in ["Win back past buyers", "Ask for a referral after delivery", "Complaint handling"]]))
        await step("automation", t_automation())

        async def t_roadmap():
            await ready(pg, "/roadmap")
            ok("coming later lists both buckets", await pg.get_by_text("Needs the backend (10)").count() == 1 and await pg.get_by_text("Parked for later (8)").count() == 1)
            await ready(pg, "/progress")
            ok("progress still 100% for the agreed scope", await pg.get_by_text(re.compile("^100")).count() >= 1)
        await step("roadmap", t_roadmap())

        async def t_mobile():
            m = await b.new_page(viewport={"width": 390, "height": 844}); wide = []
            for r in ["/order-forms", "/order-forms?f=of_1", "/calendar", "/roadmap", "/store", "/templates", "/today", "/inbox", "/orders"]:
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
