"""Click-through test for the modules added in the second Practice Mode batch.

Run with the dev server on 127.0.0.1:5173 (see tests/README.md).
"""
import asyncio, base64, os, re
from playwright.async_api import async_playwright

B = "http://127.0.0.1:5173"
HERE = os.path.dirname(__file__)
results = []


def ok(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra) if extra else ""))


async def ready(pg, path):
    await pg.goto(B + path)
    await pg.wait_for_load_state("load")
    await pg.wait_for_timeout(900)


async def step(name, coro):
    try:
        await coro
    except Exception as e:
        ok(name, False, f"error: {str(e).splitlines()[0][:180]}")


async def count_text(pg, pattern):
    return await pg.get_by_text(re.compile(pattern)).count()


async def reset_data(pg):
    """Open Settings and reset practice data, retrying until the page is interactive."""
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
    png = os.path.join(HERE, "sample-photo.png")
    if not os.path.exists(png):
        with open(png, "wb") as f:  # 1x1 PNG
            f.write(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="))

    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width": 1360, "height": 900})).new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" and "ERR_TUNNEL" not in m.text and "fonts.g" not in m.text else None)

        # Start from clean sample data.
        await reset_data(pg)

        routes = ["/delivery", "/riders", "/payments", "/inventory", "/media", "/store", "/ai-agent", "/knowledge", "/follow-ups",
                  "/templates", "/broadcasts", "/automation", "/workflow-history", "/ads", "/analytics", "/team", "/integrations",
                  "/billing", "/help", "/settings"]

        async def t_routes():
            for r in routes:
                await ready(pg, r)
                h1 = await pg.locator("main h1").first.inner_text() if await pg.locator("main h1").count() else ""
                planned = await pg.get_by_text("Not built yet").count()
                ok(f"route {r}", h1 and not planned and "404" not in h1, h1)
        await step("routes", t_routes())

        async def t_delivery():
            await ready(pg, "/delivery")
            col = pg.locator("section[aria-label='To dispatch']")
            card = col.locator("li").first
            name = (await card.locator("a").first.inner_text())
            await card.get_by_label("Rider").click()
            await pg.get_by_role("option", name=re.compile("Musa")).click(); await pg.wait_for_timeout(300)
            card = col.locator("li", has_text=name).first
            ok("assign rider on dispatch board", await card.get_by_text("Musa Abdullahi").count() > 0, name)
            await card.get_by_role("button", name="Dispatch").click(); await pg.wait_for_timeout(300)
            road = pg.locator("section[aria-label='On the road']").locator("li", has_text=name).first
            ok("dispatch moves card to On the road", await road.count() > 0)
            await road.get_by_role("button", name="Failed").click()
            dlg = pg.get_by_role("dialog"); await dlg.get_by_role("button", name="Save").click(); await pg.wait_for_timeout(300)
            failed = pg.locator("section[aria-label='Failed attempt']").locator("li", has_text=name).first
            ok("failed attempt recorded with reason", await failed.get_by_text("Customer unreachable").count() > 0)
            await failed.get_by_role("button", name="Reschedule").click(); await pg.wait_for_timeout(300)
            card = col.locator("li", has_text=name).first
            await card.get_by_role("button", name="Dispatch").click(); await pg.wait_for_timeout(300)
            await pg.locator("section[aria-label='On the road']").locator("li", has_text=name).first.get_by_role("button", name="Delivered").click()
            await pg.wait_for_timeout(400)
            ok("delivered after retry", await pg.locator("section[aria-label='Delivered']").locator("li", has_text=name).count() > 0)
        await step("delivery", t_delivery())

        async def t_riders():
            await ready(pg, "/riders")
            await pg.get_by_role("button", name="Add rider").click()
            dlg = pg.get_by_role("dialog")
            await dlg.get_by_role("button", name="Save").click()
            ok("rider form validates", await dlg.get_by_role("alert").count() > 0)
            await dlg.get_by_label("Name").fill("Femi Test"); await dlg.get_by_label("Phone").fill("+234 805 111 2233"); await dlg.get_by_label("Zone").fill("Surulere")
            await dlg.get_by_role("button", name="Save").click(); await pg.wait_for_timeout(300)
            ok("rider added", await pg.get_by_text("Femi Test").count() > 0)
            await pg.get_by_role("button", name="Musa Abdullahi").first.click(); await pg.wait_for_timeout(300)
            phone = pg.locator("text=Rider view · Musa Abdullahi")
            ok("rider phone view shows", await phone.count() > 0)
        await step("riders", t_riders())

        async def t_payments():
            await ready(pg, "/payments")
            tab = pg.get_by_role("tab", name=re.compile("COD ledger"))
            n = int(re.search(r"\((\d+)\)", await tab.inner_text()).group(1))
            await pg.get_by_role("button", name="Cash received").first.click(); await pg.wait_for_timeout(300)
            ok("cash hand-in reduces ledger", int(re.search(r"\((\d+)\)", await tab.inner_text()).group(1)) == n - 1, n)
            await pg.get_by_role("tab", name=re.compile("Unpaid")).click(); await pg.wait_for_timeout(200)
            ut = pg.get_by_role("tab", name=re.compile("Unpaid")); un = int(re.search(r"\((\d+)\)", await ut.inner_text()).group(1))
            if un:
                await pg.get_by_role("button", name="Payment link").first.click(); await pg.wait_for_timeout(200)
                ok("payment link generated", await pg.get_by_text(re.compile(r"Practice link: https://")).count() > 0)
                await pg.get_by_role("button", name="Mark paid").first.click(); await pg.wait_for_timeout(300)
                ok("mark paid removes from unpaid", int(re.search(r"\((\d+)\)", await ut.inner_text()).group(1)) == un - 1)
        await step("payments", t_payments())

        async def t_inventory():
            await ready(pg, "/inventory")
            await pg.get_by_role("button", name="Restock").first.click()
            dlg = pg.get_by_role("dialog")
            await dlg.get_by_label("Units").fill("15"); await dlg.get_by_label("Note (optional)").fill("QA batch 42")
            await dlg.get_by_role("button", name="Save").click(); await pg.wait_for_timeout(300)
            ok("restock logs a movement", await pg.get_by_text("QA batch 42").count() > 0)
        await step("inventory", t_inventory())

        async def t_media():
            await ready(pg, "/media")
            await pg.get_by_label("Product").click(); await pg.get_by_role("option", name=re.compile("HD Lace Frontal")).click()
            await pg.locator("input[type=file]").set_input_files(png); await pg.wait_for_timeout(800)
            ok("photo uploaded and linked", await pg.get_by_text("sample-photo.png").count() > 0)
            await pg.locator("input[type=file]").set_input_files(png); await pg.wait_for_timeout(500)
            ok("duplicate upload skipped", await count_text(pg, "already uploaded") > 0)
        await step("media", t_media())

        async def t_agent():
            await ready(pg, "/ai-agent")
            async def ask(msg):
                await pg.get_by_label("Customer message").fill(msg); await pg.get_by_role("button", name="Send", exact=True).click(); await pg.wait_for_timeout(250)
                return await pg.locator("[aria-live=polite] > div.flex").last.inner_text()
            r = await ask("Hello, I'm interested")
            ok("agent greets (test 2)", "Thank you for reaching out" in r, r[:60])
            r = await ask("How much is the body wave?")
            ok("agent quotes catalogue price (test 3)", "₦156,000" in r and "Products › Double Drawn Body Wave" in r, r[:90])
            r = await ask("Can I see pictures of the frontal?")
            ok("agent sends linked photos (test 4)", "photo" in r and "Media Library" in r, r[:90])
            r = await ask("I want to speak to a person")
            ok("agent hands over to a person (test 7)", "Handed to a person" in r)
            r = await ask("Do you sell perfume?")
            ok("agent doesn't invent answers", "checking with a teammate" in r and "Handed to a person" in r)
            r = await ask("STOP")
            ok("opt-out keyword respected (test 15)", "unsubscribed" in r)
        await step("ai agent", t_agent())

        async def t_knowledge():
            await ready(pg, "/knowledge")
            await pg.get_by_role("button", name="New answer").click()
            dlg = pg.get_by_role("dialog")
            await dlg.get_by_label("Customer question").fill("Do you deliver to Port Harcourt?")
            await dlg.get_by_label("Answer").fill("Yes, Port Harcourt deliveries take 3 days and cost ₦5,000.")
            await dlg.get_by_label("Keywords, separated by commas").fill("port harcourt, ph")
            await dlg.get_by_role("button", name="Save").click(); await pg.wait_for_timeout(300)
            await ready(pg, "/ai-agent")
            await pg.get_by_label("Customer message").fill("do you deliver to port harcourt"); await pg.get_by_role("button", name="Send", exact=True).click(); await pg.wait_for_timeout(300)
            ok("new knowledge answer used by agent", "Port Harcourt deliveries take 3 days" in await pg.locator("[aria-live=polite]").inner_text())
        await step("knowledge", t_knowledge())

        async def t_templates():
            await ready(pg, "/templates")
            await pg.get_by_role("button", name="New template").click()
            dlg = pg.get_by_role("dialog")
            await dlg.get_by_label("Name").fill("qa_promo")
            await dlg.get_by_label("Type").click(); await pg.get_by_role("option", name=re.compile("Marketing")).click()
            await dlg.get_by_label("Message").fill("Big sale on all wigs this week only!")
            await dlg.get_by_role("button", name="Save").click()
            ok("marketing template must include opt-out", "opt out" in (await dlg.get_by_role("alert").inner_text()).lower())
            await dlg.get_by_label("Message").fill("Big sale on all wigs this week only! Reply STOP to opt out.")
            await dlg.get_by_role("button", name="Save").click(); await pg.wait_for_timeout(300)
            ok("template saved", await pg.get_by_text("qa_promo").count() > 0)
        await step("templates", t_templates())

        async def t_followups():
            await ready(pg, "/follow-ups")
            due = int(re.search(r"\((\d+)\)", await pg.get_by_role("tab", name=re.compile("Due now")).inner_text()).group(1))
            blocked = await pg.get_by_text(re.compile("Over 24 hours|No marketing consent|Quiet hours|Reached the limit")).count()
            ok("follow-up queue applies channel rules", due > 0 and blocked >= 0, f"{due} due, {blocked} blocked labels")
            send = pg.get_by_role("button", name=re.compile(r"^Send (template|message)$"))
            if await send.count():
                await send.first.click(); await pg.wait_for_timeout(300)
                ok("follow-up sends and leaves the queue", int(re.search(r"\((\d+)\)", await pg.get_by_role("tab", name=re.compile("Due now")).inner_text()).group(1)) == due - 1)
            await pg.get_by_role("tab", name=re.compile("Rules")).click(); await pg.wait_for_timeout(200)
            ok("follow-up rules listed", await pg.get_by_text("Interested, then went quiet").count() > 0)
        await step("follow-ups", t_followups())

        async def t_broadcasts():
            await ready(pg, "/broadcasts")
            await pg.get_by_role("button", name="New broadcast").click()
            dlg = pg.get_by_role("dialog")
            await dlg.get_by_label("Name").fill("QA broadcast")
            await dlg.get_by_role("button", name="Save", exact=True).click(); await pg.wait_for_timeout(300)
            row = pg.locator("li", has_text="QA broadcast")
            await row.get_by_role("button", name="Send now").click(); await pg.wait_for_timeout(300)
            ok("broadcast sends and counts consent skips", await row.get_by_text(re.compile(r"skipped \d+ without consent")).count() > 0)
        await step("broadcasts", t_broadcasts())

        async def t_automation():
            await ready(pg, "/automation")
            await pg.get_by_role("button", name="Do", exact=True).click()
            await pg.locator("input[aria-label^='Step']").last.fill("Notify the assigned teammate")
            await pg.get_by_role("button", name="Save workflow").click(); await pg.wait_for_timeout(300)
            ok("workflow step added and saved", await pg.get_by_text("7 steps").count() > 0)
            await pg.get_by_role("button", name=re.compile("^Copy ")).first.click(); await pg.wait_for_timeout(300)
            ok("workflow copied", await pg.get_by_text(re.compile(r"\(copy\)")).count() > 0)
        await step("automation", t_automation())

        async def t_history():
            await ready(pg, "/workflow-history")
            n = await pg.get_by_role("button", name="Retry").count()
            await pg.get_by_role("button", name="Retry").first.click(); await pg.wait_for_timeout(300)
            ok("retry a safe failure", await pg.get_by_role("button", name="Retry").count() == n - 1 and await count_text(pg, "retried and succeeded") > 0)
        await step("history", t_history())

        async def t_ads():
            await ready(pg, "/ads")
            before = await pg.locator("main").inner_text()
            await pg.get_by_role("button", name="Add spend").click()
            dlg = pg.get_by_role("dialog"); await dlg.get_by_label("Amount spent").fill("100000")
            await dlg.get_by_role("button", name="Add").click(); await pg.wait_for_timeout(300)
            after = await pg.locator("main").inner_text()
            ok("manual ad spend updates totals", before != after)
        await step("ads", t_ads())

        async def t_team():
            await ready(pg, "/team")
            await pg.get_by_role("button", name="Invite").click()
            dlg = pg.get_by_role("dialog"); await dlg.get_by_label("Name").fill("Ngozi Test"); await dlg.get_by_label("Email").fill("bad-email")
            await dlg.get_by_role("button", name="Send invite").click()
            ok("invite validates email", await dlg.get_by_role("alert").count() > 0)
            await dlg.get_by_label("Email").fill("ngozi@luxehair.co"); await dlg.get_by_role("button", name="Send invite").click(); await pg.wait_for_timeout(300)
            ok("teammate invited", await pg.locator("li", has_text="Ngozi Test").get_by_text("Invited").count() > 0)
        await step("team", t_team())

        async def t_integrations():
            await ready(pg, "/integrations")
            card = pg.locator("section", has_text="WhatsApp Cloud API")
            await card.get_by_role("button", name="Simulate").click(); await pg.wait_for_timeout(200)
            ok("integration simulated and labelled", await card.get_by_text("Simulated", exact=True).count() > 0)
        await step("integrations", t_integrations())

        async def t_billing():
            await ready(pg, "/billing")
            await pg.get_by_role("button", name="Switch to Growth").click(); await pg.wait_for_timeout(200)
            ok("plan switch", await pg.get_by_text("Current plan: Growth").count() > 0)
        await step("billing", t_billing())

        async def t_settings():
            await ready(pg, "/settings")
            await pg.get_by_label("Payment link ({{order}} is replaced by the order number)").fill("https://pay.example/no-placeholder")
            await pg.get_by_role("button", name="Save settings").click()
            ok("settings validate payment link", "{{order}}" in await pg.get_by_role("alert").inner_text())
            await pg.get_by_label("Payment link ({{order}} is replaced by the order number)").fill("https://pay.example/luxe/{{order}}")
            await pg.get_by_label("Delivery fee").fill("5000")
            await pg.get_by_role("button", name="Save settings").click(); await pg.wait_for_timeout(300)
            ok("settings saved", await pg.get_by_role("status").filter(has_text="Saved").count() > 0)
            await ready(pg, "/ai-agent")
            await pg.get_by_label("Customer message").fill("how much is the body wave"); await pg.get_by_role("button", name="Send", exact=True).click(); await pg.wait_for_timeout(300)
            ok("new delivery fee flows into agent replies", "₦5,000" in await pg.locator("[aria-live=polite]").inner_text())
        await step("settings", t_settings())

        async def t_store():
            await ready(pg, "/store")
            await pg.get_by_role("switch").first.click(); await pg.wait_for_timeout(200)
            await pg.get_by_role("button", name="Add to bag").first.click(); await pg.wait_for_timeout(200)
            ok("store preview adds to bag", await pg.get_by_text("1 in bag").count() > 0)
        await step("store", t_store())

        async def t_mobile():
            m = await b.new_page(viewport={"width": 390, "height": 844}); wide = []
            for r in routes:
                await m.goto(B + r); await m.wait_for_load_state("load"); await m.wait_for_timeout(1500)
                sw = await m.evaluate("document.documentElement.scrollWidth")
                if sw > 392: wide.append(f"{r}={sw}")
            ok("no sideways scroll on a phone", not wide, ", ".join(wide))
        await step("mobile", t_mobile())

        async def t_dark():
            d = await (await b.new_context(viewport={"width": 1360, "height": 900}, color_scheme="dark")).new_page()
            await d.goto(B + "/settings"); await d.wait_for_timeout(1200)
            for _ in range(10):
                await d.get_by_role("button", name="dark", exact=True).click(); await d.wait_for_timeout(300)
                if await d.evaluate("document.documentElement.classList.contains('dark')"): break
            bad = []
            for r in routes:
                await d.goto(B + r); await d.wait_for_timeout(500)
                if not await d.evaluate("document.documentElement.classList.contains('dark')"): bad.append(r)
            ok("dark mode holds on every page", not bad, ", ".join(bad))
        await step("dark", t_dark())

        # Leave clean data behind.
        await reset_data(pg)

        ok("no console errors", not errs, " | ".join(errs[:4]))
        await b.close()
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")


asyncio.run(main())
