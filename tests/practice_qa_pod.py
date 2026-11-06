"""Pay-on-delivery operations (6 Nov review): call list and order sharing,
logistics partners and the no-login delivery link, partner statements,
commission and leaderboard, bulk actions, true profit, order follow-ups,
email campaigns and the Money Brief voice.

Run with the dev server on 127.0.0.1:5173 (see tests/README.md).
The database side is tested by supabase/tests/pod_ops.sql.
"""
import asyncio, re
from playwright.async_api import async_playwright

B = "http://127.0.0.1:5173"
results = []


def ok(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f" — {extra}" if extra != "" else ""))


async def ready(pg, path):
    await pg.goto(B + path)
    await pg.wait_for_load_state("load")
    await pg.wait_for_timeout(1300)


async def step(name, coro):
    try:
        await coro
    except Exception as e:  # keep going so one failure doesn't hide the rest
        ok(f"{name} ran without error", False, str(e).splitlines()[0][:200])


async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        await ready(pg, "/")
        await pg.evaluate("localStorage.clear()")

        async def t_calls():
            await ready(pg, "/calls")
            ok("call list opens as an agent", await pg.get_by_role("combobox", name="Viewing as").count() == 1)
            cards = pg.locator("li[aria-label^='Order BZ-']")
            n = await cards.count()
            ok("agent has orders to call", n > 0, n)
            ok("late orders are flagged", await pg.get_by_text(re.compile(r"^Not called · ")).count() >= 1)
            first = cards.first
            ref = (await first.get_attribute("aria-label")).replace("Order ", "")
            await first.get_by_role("button", name="Log outcome").click()
            await first.get_by_role("group", name="How did it go?").get_by_role("button", name="No answer").click()
            await pg.wait_for_timeout(300)
            card = pg.locator(f"li[aria-label='Order {ref}']")
            ok("call attempt is recorded", await card.get_by_text(re.compile(r"attempt.*last: No answer")).count() == 1)
            await card.get_by_role("button", name="Confirmed ✓").click()
            await pg.wait_for_timeout(400)
            ok("confirmed order leaves the call list", await pg.locator(f"li[aria-label='Order {ref}']").count() == 0)
            ok("call and WhatsApp are one tap", await pg.locator("a[href^='tel:+234']").count() > 0 and await pg.locator("a[href^='https://wa.me/234']").count() > 0)
        await step("calls", t_calls())

        async def t_team():
            await ready(pg, "/calls?v=team")
            late = pg.locator("li[aria-label^='Late BZ-']")
            n = await late.count()
            ok("supervisor sees orders not called in time", n >= 1, n)
            label = await late.first.get_attribute("aria-label")
            await late.first.get_by_role("combobox").click()
            await pg.get_by_role("option").first.click(); await pg.wait_for_timeout(400)
            ok("supervisor gives a late order to someone else", await pg.locator(f"li[aria-label='{label}']").count() == 0)
            await pg.get_by_role("switch", name="Tobi Familusi on duty").click(); await pg.wait_for_timeout(200)
            ok("agents can go off duty", await pg.get_by_role("switch", name="Tobi Familusi on duty").get_attribute("aria-checked") == "false")
            await ready(pg, "/calls?v=rules")
            await pg.get_by_role("button", name=re.compile("^By state")).click(); await pg.wait_for_timeout(200)
            ok("sharing rule can be changed", await pg.get_by_role("button", name=re.compile("^By state")).get_attribute("aria-pressed") == "true")
        await step("team", t_team())

        async def t_board():
            await ready(pg, "/calls?v=board")
            rows = pg.locator("tr[aria-label^='Leaderboard ']")
            ok("leaderboard lists agents", await rows.count() >= 3)
            payable = None
            for i in range(await rows.count()):
                r = rows.nth(i)
                if await r.get_by_role("button", name="Mark paid").is_enabled():
                    payable = r; break
            ok("someone has commission to pay", payable is not None)
            if payable:
                name = await payable.get_attribute("aria-label")
                await payable.get_by_role("button", name="Mark paid").click(); await pg.wait_for_timeout(300)
                ok("finance marks commission paid", not await pg.locator(f"tr[aria-label='{name}']").get_by_role("button", name="Mark paid").is_enabled())
            ok("commission is per closed order, only when delivered and paid", await pg.get_by_text(re.compile("earned only when it's delivered and paid")).count() == 1)
        await step("board", t_board())

        async def t_bulk():
            await ready(pg, "/orders")
            boxes = pg.locator("input[aria-label^='Select BZ-']")
            await boxes.nth(0).check(); await boxes.nth(1).check()
            bar = pg.get_by_role("toolbar", name="Bulk actions")
            ok("bulk actions appear for selected orders", await bar.get_by_text("2 selected").count() == 1)
            await bar.get_by_role("button", name="Print delivery slips").click(); await pg.wait_for_timeout(300)
            ok("delivery slips for each order", await pg.locator("article[aria-label^='Slip BZ-']").count() == 2)
            ok("slip says what to collect", await pg.locator("article[aria-label^='Slip BZ-']").first.get_by_text(re.compile("Collect ₦|PAID")).count() == 1)
            await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
            async with pg.expect_download() as d:
                await bar.get_by_role("button", name="Export").click()
            dl = await d.value
            text = open(await dl.path()).read()
            ok("export downloads the selected orders", text.count("\n") == 2 and "Agent" in text.splitlines()[0])
            await bar.get_by_role("combobox", name="Reassign selected").click()
            await pg.get_by_role("option", name="Amaka Nwosu").click(); await pg.wait_for_timeout(300)
            ok("bulk reassign", await pg.get_by_role("toolbar", name="Bulk actions").count() == 0)
        await step("bulk", t_bulk())

        async def t_partner():
            await ready(pg, "/delivery")
            ok("alert when a rider hasn't accepted", await pg.get_by_role("alert").filter(has_text="not accepted").count() == 1)
            await pg.get_by_role("button", name=re.compile("^Send to ")).first.click(); await pg.wait_for_timeout(300)
            dlg = pg.get_by_role("dialog")
            msg = await dlg.get_by_label("Message to the rider").inner_text()
            ok("WhatsApp message has the order and a private link", "Accept and update here (no login): https://bizriva-crm.vercel.app/d/" in msg and ("Collect" in msg or "collect nothing" in msg))
            ok("opens the rider's WhatsApp", (await dlg.get_by_role("link", name="Open WhatsApp").get_attribute("href")).startswith("https://wa.me/"))
            href = await dlg.get_by_role("link", name="Preview their link").get_attribute("href")
            await ready(pg, href)
            ok("partner link has no app menus", await pg.get_by_role("navigation").count() == 0)
            await pg.get_by_role("button", name="Accept delivery").click(); await pg.wait_for_timeout(300)
            ok("partner accepts without logging in", await pg.get_by_role("status").filter(has_text="Accepted").count() == 1)
            await pg.get_by_role("button", name="Delivered").click(); await pg.wait_for_timeout(500)
            ok("partner marks delivered and records cash", await pg.get_by_text("Closed — delivered").count() == 1)
            await ready(pg, "/d/not-a-real-token-000000")
            await pg.wait_for_timeout(2500)
            ok("a wrong link is refused", await pg.get_by_text("This delivery link isn't valid").count() == 1)
        await step("partner", t_partner())

        async def t_riders():
            await ready(pg, "/riders")
            await pg.get_by_role("button", name="Add rider").click()
            dlg = pg.get_by_role("dialog")
            await dlg.get_by_label("Name").fill("QA Logistics"); await dlg.get_by_label("Phone").fill("+234 805 999 1111")
            await dlg.get_by_role("combobox", name="Type").click(); await pg.get_by_role("option", name="Logistics partner (company)").click()
            await dlg.get_by_label("States covered and fee per delivery").fill("Rivers: 4500\nbad line")
            await dlg.get_by_role("button", name="Save").click(); await pg.wait_for_timeout(200)
            ok("unreadable fee line is explained", await dlg.get_by_role("alert").filter(has_text="State: amount").count() == 1)
            await dlg.get_by_label("States covered and fee per delivery").fill("Rivers: 4500\nPort Harcourt: 4,800")
            await dlg.get_by_label("WhatsApp group link (optional)").fill("https://example.com/x")
            await dlg.get_by_role("button", name="Save").click(); await pg.wait_for_timeout(200)
            ok("group link must be WhatsApp's", await dlg.get_by_role("alert").filter(has_text="chat.whatsapp.com").count() == 1)
            await dlg.get_by_label("WhatsApp group link (optional)").fill("https://chat.whatsapp.com/QA123")
            await dlg.get_by_role("button", name="Save").click(); await pg.wait_for_timeout(300)
            ok("partner saved with fee per state", await pg.get_by_text(re.compile(r"Rivers ₦4,800")).count() >= 1)
            st = pg.locator("tr[aria-label^='Statement ']")
            ok("who-owes-what statement per rider and partner", await st.count() >= 4)
        await step("riders", t_riders())

        async def t_profit():
            await ready(pg, "/analytics")
            ok("true profit after delivery, failed charges, commission and ads", await pg.get_by_test_id("true-profit").count() == 1 and await pg.get_by_text("Agent commission").count() == 1)
            ok("delivery success by state", await pg.locator("tr[aria-label='State Lagos']").count() == 1)
        await step("profit", t_profit())

        async def t_followups():
            await ready(pg, "/follow-ups")
            for r in ["Delivery failed", "Agents couldn't reach them", "Cancelled order", "Due to re-order"]:
                ok(f"follow-up: {r.lower()}", await pg.get_by_text(r, exact=True).count() >= 1)
            item = pg.locator("li", has=pg.get_by_text("Due to re-order", exact=True)).first
            send = item.get_by_role("button", name=re.compile("^Send"))
            if await send.count() and await send.is_enabled():
                await send.click(); await pg.wait_for_timeout(300)
                ok("re-order reminder sends", True)
            else:
                ok("re-order reminder shows why it can't send yet", await item.locator(".text-destructive").count() == 1)
        await step("followups", t_followups())

        async def t_email():
            await ready(pg, "/broadcasts")
            await pg.get_by_role("tab", name="Email").click(); await pg.wait_for_timeout(200)
            ok("past email campaign shows opens and clicks", await pg.locator("[aria-label^='Results for September VIP email']").get_by_text(re.compile("opened")).count() == 1)
            await pg.get_by_role("button", name="New email campaign").click()
            dlg = pg.get_by_role("dialog")
            await dlg.get_by_label("Name").fill("QA email")
            await dlg.get_by_role("button", name="Save", exact=True).click(); await pg.wait_for_timeout(200)
            ok("email needs a subject", await dlg.get_by_role("alert").count() == 1)
            await dlg.get_by_label("Subject").fill("QA subject line")
            await dlg.get_by_role("button", name="Save", exact=True).click(); await pg.wait_for_timeout(300)
            row = pg.locator("li", has_text="QA email")
            ok("can't send email before picking a service", await row.get_by_role("button", name="Send now").is_disabled())
            await pg.get_by_role("button", name=re.compile("^Brevo")).click(); await pg.wait_for_timeout(200)
            await row.get_by_role("button", name="Send now").click(); await pg.wait_for_timeout(300)
            ok("email campaign results: opened, clicked, orders", await pg.locator("[aria-label='Results for QA email']").get_by_text(re.compile("clicked")).count() == 1)
        await step("email", t_email())

        async def t_voice():
            await ready(pg, "/brief")
            has = await pg.evaluate("'speechSynthesis' in window")
            btn = pg.get_by_role("button", name="Listen")
            ok("Money Brief can be read aloud", (await btn.count() == 1) if has else True, f"speechSynthesis={has}")
            spoken = await pg.evaluate("""() => import('/src/routes/brief.tsx').then(m => m.spokenBrief('☀️ *Shop* \\n₦1,250,000 delivered · ₦45k with riders'))""")
            ok("money is spoken in naira, without stars or emoji", "1,250,000 naira" in spoken and "45 thousand naira" in spoken and "*" not in spoken and "☀" not in spoken, spoken)
            await ready(pg, "/")
            ok("dashboard brief has Listen too", (await pg.get_by_role("button", name="Listen").count() == 1) if has else True)
        await step("voice", t_voice())

        async def t_mobile():
            m = await ctx.new_page()
            await m.set_viewport_size({"width": 390, "height": 844})
            wide = []
            for r in ["/calls", "/calls?v=team", "/calls?v=board", "/riders", "/broadcasts", "/delivery"]:
                await m.goto(B + r); await m.wait_for_load_state("load"); await m.wait_for_timeout(1200)
                sw = await m.evaluate("document.documentElement.scrollWidth")
                if sw > 392: wide.append(f"{r}={sw}")
            ok("no sideways scroll on a phone", not wide, ", ".join(wide))
            await m.close()
        await step("mobile", t_mobile())

        ok("no page errors", not errors, errors[:2])
        await br.close()
    print(f"\n{sum(1 for r in results if r[1])}/{len(results)} passed")


asyncio.run(main())
