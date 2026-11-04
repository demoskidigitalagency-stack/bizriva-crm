import asyncio, re
from playwright.async_api import async_playwright

B = "http://127.0.0.1:5173"
S = __import__("os").path.dirname(__file__)
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
        ok(name, False, f"error: {str(e).splitlines()[0][:160]}")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1360, "height": 900})
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "ERR_TUNNEL" not in m.text and "fonts.g" not in m.text else None)

        routes = ["/", "/today", "/inbox", "/crm", "/crm/contacts", "/crm/customers", "/crm/leads", "/crm/pipeline", "/crm/tasks",
                  "/crm/segments", "/crm/duplicates", "/crm/imports", "/orders", "/cod", "/products", "/settings", "/progress",
                  "/delivery", "/media", "/ai-agent", "/super-admin"]

        async def t_routes():
            for r in routes:
                await ready(pg, r)
                h1 = await pg.locator("main h1").first.inner_text() if await pg.locator("main h1").count() else ""
                ok(f"route {r}", h1 and "404" not in h1 and "didn't load" not in h1, h1)
        await step("routes", t_routes())

        ref = None
        async def t_360():
            nonlocal ref
            await ready(pg, "/crm/contacts")
            first = pg.locator("tbody tr a").first
            name = [x for x in (await first.inner_text()).split("\n") if len(x) > 3][0]
            await first.click()
            await pg.wait_for_url(re.compile(r"/crm/contacts/.+"))
            await pg.wait_for_timeout(600)
            ok("contact opens Customer 360", name in await pg.locator("main h1").inner_text(), name)

            await pg.get_by_role("button", name="Task", exact=True).click()
            dlg = pg.get_by_role("dialog"); await dlg.wait_for()
            await dlg.locator("button").filter(has_text=re.compile("Create|Add|Save", re.I)).last.click()
            await pg.wait_for_timeout(300)
            ok("task created from 360", await pg.get_by_text(re.compile(r"Task created")).count() > 0)

            await pg.get_by_role("button", name="Note", exact=True).click()
            dlg = pg.get_by_role("dialog"); await dlg.locator("textarea").fill("QA note: prefers evening delivery")
            await dlg.get_by_role("button", name="Save note").click(); await pg.wait_for_timeout(300)
            ok("note shows on timeline", await pg.get_by_text("QA note: prefers evening delivery").count() > 0)

            await pg.get_by_role("button", name="New order").first.click()
            dlg = pg.get_by_role("dialog"); await dlg.wait_for()
            html = await dlg.inner_html()
            nums = dlg.locator("input[type=number]")
            if await nums.count():
                await nums.first.fill("1")
            else:
                await dlg.locator("button").filter(has_text=re.compile(r"^\+$")).first.click()
            await dlg.locator("button").filter(has_text=re.compile("order", re.I)).last.click()
            await pg.wait_for_timeout(400)
            placed = pg.get_by_text(re.compile(r"Order BZ-\d+ placed"))
            ok("order created from 360", await placed.count() > 0)
            if await placed.count():
                ref = re.search(r"BZ-\d+", await placed.first.inner_text()).group(0)

            await pg.get_by_label("Lifecycle").click(); await pg.get_by_role("option", name="VIP").click(); await pg.wait_for_timeout(300)
            ok("lifecycle change logged", await pg.get_by_text("Lifecycle changed to vip").count() > 0)
        await step("Customer 360 flows", t_360())

        async def t_cod():
            await ready(pg, "/cod")
            card = pg.locator("section", has_text=ref)
            await card.first.wait_for(timeout=5000)
            ok("new COD order in verification queue", ref and await card.count() > 0, ref)
            card = card.first
            confirm = card.get_by_role("button", name="Customer confirmed")
            ok("confirm disabled until all checks ticked", await confirm.is_disabled())
            for cb in await card.get_by_role("checkbox").all():
                await cb.click()
            await confirm.click(); await pg.wait_for_timeout(400)
            ok("confirmed order leaves queue", await pg.locator("section", has_text=ref).count() == 0)
        if ref:
            await step("COD", t_cod())

        async def t_orders():
            await ready(pg, "/orders")
            await pg.get_by_label("Search orders").fill(ref)
            await pg.locator("tbody tr").first.click(); await pg.wait_for_timeout(500)
            sheet = pg.get_by_role("dialog")
            ok("order panel opens, status Confirmed", await sheet.get_by_text("Confirmed", exact=True).count() > 0)
            for label in ["Ready for dispatch", "Dispatched", "Delivered"]:
                await sheet.get_by_role("button", name=label).click(); await pg.wait_for_timeout(300)
            ok("order walks to Delivered, payment Paid", await sheet.get_by_text("Delivered", exact=True).count() > 0 and await sheet.get_by_text("Paid", exact=True).count() > 0)
            await pg.keyboard.press("Escape")
        if ref:
            await step("Orders", t_orders())

        async def t_pipeline():
            await ready(pg, "/crm/pipeline")
            col = pg.locator("section[aria-label='New Lead']")
            before = await col.locator("li[draggable]").count()
            await col.locator("li[draggable]").first.get_by_role("button", name=re.compile("forward")).click(); await pg.wait_for_timeout(300)
            ok("pipeline arrow moves a lead", await col.locator("li[draggable]").count() == before - 1, f"{before}")
        await step("pipeline", t_pipeline())

        async def t_tasks():
            await ready(pg, "/crm/tasks")
            tab = pg.get_by_role("tab", name=re.compile("Overdue"))
            n = int(re.search(r"\((\d+)\)", await tab.inner_text()).group(1))
            await pg.get_by_role("button", name="Done", exact=True).first.click(); await pg.wait_for_timeout(300)
            ok("completing a task updates count", int(re.search(r"\((\d+)\)", await tab.inner_text()).group(1)) == n - 1, n)
        await step("tasks", t_tasks())

        async def t_dupes():
            async def people():
                await ready(pg, "/crm/contacts")
                return int(re.search(r"(\d+) people", await pg.locator("main").inner_text()).group(1))
            before = await people()
            await ready(pg, "/crm/duplicates")
            if not await pg.get_by_role("button", name="Merge").count():
                return ok("duplicates page (no groups to merge)", True)
            await pg.get_by_role("button", name="Merge").first.click()
            await pg.get_by_role("alertdialog").get_by_role("button", name="Merge").click(); await pg.wait_for_timeout(400)
            after = await people()
            ok("merge folds a duplicate into the kept record", after == before - 1, f"{before} -> {after}")
        await step("duplicates", t_dupes())

        async def t_products():
            await ready(pg, "/products")
            await pg.get_by_role("button", name="New product").click()
            dlg = pg.get_by_role("dialog")
            await dlg.get_by_role("button", name="Add product").click()
            ok("product form validates", await dlg.get_by_role("alert").count() > 0)
            await dlg.get_by_label("Name").fill("QA Test Wig 14 inch"); await dlg.get_by_label("Selling price").fill("52000")
            await dlg.get_by_label("Cost").fill("30000"); await dlg.get_by_label("In stock").fill("3")
            await dlg.get_by_role("button", name="Add product").click(); await pg.wait_for_timeout(300)
            row = pg.locator("tr", has_text="QA Test Wig 14 inch")
            await row.get_by_role("button", name=re.compile("Add one")).click(); await pg.wait_for_timeout(200)
            ok("product added and stock +1", (await row.locator("span.num").inner_text()) == "4")
            await pg.reload(); await pg.wait_for_load_state("load"); await pg.wait_for_timeout(1400)
            ok("changes survive a refresh", await pg.locator("tr", has_text="QA Test Wig 14 inch").count() == 1)
        await step("products", t_products())

        async def t_import():
            await ready(pg, "/crm/imports")
            await pg.locator("input[type=file]").set_input_files(S + "/import-sample.csv"); await pg.wait_for_timeout(500)
            btn = pg.get_by_role("button", name=re.compile(r"Import \d+"))
            ok("CSV parsed: 2 ready, 1 skipped", (await btn.inner_text()).strip() == "Import 2", await btn.inner_text())
            await btn.click(); await pg.wait_for_timeout(300)
            await ready(pg, "/crm/contacts"); await pg.get_by_label("Search").fill("Chiamaka"); await pg.wait_for_timeout(300)
            ok("imported contact appears", await pg.get_by_text("Chiamaka Obi").count() > 0)
        await step("imports", t_import())

        async def t_search():
            await ready(pg, "/")
            await pg.keyboard.press("Control+k"); await pg.keyboard.type(ref or "BZ-10"); await pg.wait_for_timeout(400)
            await pg.keyboard.press("Enter"); await pg.wait_for_timeout(800)
            ok("search result opens the order", "/orders" in pg.url and "o=" in pg.url, pg.url)
        await step("search", t_search())

        async def t_today():
            await ready(pg, "/today")
            items = pg.locator("main li").locator("button, a")
            await items.first.click(); await pg.wait_for_timeout(800)
            ok("Today item opens a real page", any(x in pg.url for x in ["/crm/contacts/", "/inbox", "/orders", "/cod", "/products"]), pg.url)
        await step("today", t_today())

        async def t_links():
            await ready(pg, "/inbox")
            await pg.get_by_role("link", name="Customer 360", exact=True).first.click(); await pg.wait_for_timeout(800)
            ok("Inbox → Customer 360", "/crm/contacts/" in pg.url, pg.url)
            msg = pg.get_by_role("link", name="Message")
            if await msg.count():
                await msg.click(); await pg.wait_for_timeout(800)
                ok("Customer 360 Message → that chat in Inbox", "/inbox?c=" in pg.url, pg.url)
        await step("cross links", t_links())

        async def t_reset():
            await ready(pg, "/settings")
            await pg.get_by_role("button", name="Reset sample data").click()
            await pg.get_by_role("alertdialog").get_by_role("button", name="Reset").click(); await pg.wait_for_timeout(400)
            await ready(pg, "/products")
            ok("Reset clears practice changes", await pg.locator("tr", has_text="QA Test Wig 14 inch").count() == 0)
        await step("reset", t_reset())

        async def t_mobile():
            m = await b.new_page(viewport={"width": 390, "height": 844}); wide = []
            for r in routes + ["/crm/contacts/ct_1"]:
                await m.goto(B + r); await m.wait_for_load_state("load"); await m.wait_for_timeout(1500)
                sw = await m.evaluate("document.documentElement.scrollWidth")
                if sw > 392: wide.append(f"{r}={sw}")
            ok("no sideways scroll on a phone", not wide, ", ".join(wide))
        await step("mobile", t_mobile())

        ok("no console errors", not errs, " | ".join(errs[:4]))
        await b.close()
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")


asyncio.run(main())
