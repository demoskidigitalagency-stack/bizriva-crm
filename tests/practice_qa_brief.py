"""Checks for the Money Brief, customer memory, payment links in chat and TikTok (2026-11-05).

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

        async def t_brief():
            await ready(pg, "/brief")
            ok("sidebar has Money Brief", await pg.get_by_role("link", name="Money Brief", exact=True).count() == 1)
            head = await pg.get_by_test_id("brief-headline").inner_text()
            ok("brief headline talks about delivered money", "delivered" in head and "riders" in head, head[:90])
            ok("today's list has actions", await pg.get_by_role("list").filter(has=pg.get_by_text("Call 7 high-risk COD orders before dispatch")).count() >= 1)
            await pg.get_by_text("Preview the WhatsApp message").click()
            ok("WhatsApp version of the brief", "Money Brief" in await pg.get_by_test_id("brief-text").inner_text())
            await ready(pg, "/")
            ok("brief card on the Dashboard", await pg.get_by_text("☀️ Morning Money Brief").count() == 1)
            await ready(pg, "/brief")
            await pg.get_by_role("checkbox", name="Show in the app").click(); await pg.wait_for_timeout(300)
            await ready(pg, "/")
            ok("turning off in-app hides the Dashboard card", await pg.get_by_text("☀️ Morning Money Brief").count() == 0)
            await ready(pg, "/brief")
            await pg.get_by_role("checkbox", name="Show in the app").click(); await pg.wait_for_timeout(300)
        await step("brief", t_brief())

        async def t_memory():
            await ready(pg, "/crm/contacts/c_0003")
            mem = pg.get_by_role("group", name="Customer memory")
            ok("saved facts shown", await mem.get_by_text("Burgundy colour").count() == 1)
            ok("birthday today notice", await mem.get_by_text(re.compile("Birthday today")).count() == 1)
            before = await mem.locator("li button[aria-label^='Forget']").count()
            await mem.get_by_role("button", name=re.compile(r"^Remember \d")).click(); await pg.wait_for_timeout(300)
            after = await mem.locator("li button[aria-label^='Forget']").count()
            ok("facts from chat remembered", after > before, f"{before} -> {after}")
            await mem.get_by_role("button", name="Add something you know").click()
            await mem.get_by_label("Fact", exact=True).fill("Gold jewellery")
            await mem.get_by_role("button", name="Save").click(); await pg.wait_for_timeout(300)
            ok("staff can add a fact", await mem.get_by_text("Gold jewellery").count() == 1)
            await mem.get_by_role("button", name="Forget Likes Gold jewellery").click(); await pg.wait_for_timeout(300)
            ok("staff can remove a fact", await mem.get_by_text("Gold jewellery").count() == 0)
            await ready(pg, "/calendar")
            await pg.get_by_role("tab", name="List").click(); await pg.wait_for_timeout(300)
            ok("birthdays on the calendar", await pg.get_by_text(re.compile("'s birthday")).count() >= 2)
        await step("memory", t_memory())

        async def t_agent():
            await ready(pg, "/ai-agent")
            await pg.get_by_label("Customer", exact=True).click()
            await pg.get_by_role("option", name=re.compile("Burgundy colour")).click()
            await pg.get_by_label("Customer message").fill("hello"); await pg.get_by_role("button", name="Send", exact=True).click(); await pg.wait_for_timeout(300)
            await pg.get_by_label("Customer message").fill("how much is the bone straight 20"); await pg.get_by_role("button", name="Send", exact=True).click(); await pg.wait_for_timeout(300)
            chat = await pg.locator("[aria-live=polite]").inner_text()
            ok("AI agent greets a known customer by name", "Welcome back" in chat)
            ok("AI agent uses what they like", "Since you like burgundy" in chat, chat[-160:])
        await step("agent", t_agent())

        async def t_paylink():
            await ready(pg, "/inbox")
            await pg.get_by_role("tab", name=re.compile("^Unverified orders")).click(); await pg.wait_for_timeout(300)
            await pg.locator("main ul li button").first.click(); await pg.wait_for_timeout(300)
            await pg.get_by_role("button", name="Send payment link").click(); await pg.wait_for_timeout(300)
            ok("payment link sent into the chat", await pg.locator("main li", has_text="here's your secure payment link").count() >= 1)
        await step("paylink", t_paylink())

        async def t_more():
            await ready(pg, "/integrations")
            ok("TikTok card", await pg.get_by_text("TikTok Business Messaging").count() == 1)
            await ready(pg, "/templates")
            await pg.get_by_role("button", name=re.compile(r"^Birthdays \(")).click()
            ok("birthday greetings in the reply library", await pg.get_by_text("birthday_greeting", exact=True).count() == 1)
            await ready(pg, "/welcome")
            ok("landing page Money Brief section", await pg.locator("section#brief").get_by_text("Wake up to your Money Brief.").count() == 1)
            ok("landing page memory section", await pg.get_by_text("Speak to each buyer like you know them.", exact=False).count() == 1)
            await ready(pg, "/roadmap")
            ok("later items listed", await pg.get_by_text("Money Brief on WhatsApp and email").count() == 1)
        await step("more", t_more())

        async def t_connections():
            await ready(pg, "/connections")
            ok("sidebar has Website & Forms", await pg.get_by_role("link", name="Website & Forms", exact=True).count() == 1)
            await pg.get_by_role("button", name="Connect a platform").click()
            ok("13 platforms to pick from", await pg.locator("button", has_text="Sends:").count() == 13, await pg.locator("button", has_text="Sends:").count())
            await pg.get_by_role("button", name="Gravity Forms").click(); await pg.wait_for_timeout(500)
            ok("setup shows intake address and key", "/api/intake/" in await pg.get_by_label("Your intake address").inner_text())
            await pg.get_by_role("tab", name="Test and match fields").click()
            await pg.get_by_role("button", name="Send test").click(); await pg.wait_for_timeout(300)
            ok("Gravity Forms test creates an order", await pg.get_by_role("status").filter(has_text="Order created").count() == 1)
            await pg.get_by_role("button", name="Send test").click(); await pg.wait_for_timeout(300)
            ok("same entry twice is skipped", await pg.get_by_role("status").filter(has_text="Duplicate skipped").count() == 1)
            await pg.get_by_role("tab", name="Activity").click()
            ok("activity log lists both", await pg.get_by_text("Order created").count() >= 1 and await pg.get_by_text("Duplicate skipped").count() >= 1)
            await ready(pg, "/inbox")
            await pg.get_by_role("tab", name=re.compile("^All")).click()
            await pg.get_by_label("Search conversations").fill("Bayo"); await pg.wait_for_timeout(300)
            ok("submission has a chat in the Inbox", await pg.locator("main ul li button", has_text="Bayo Ogunleye").count() >= 1)
            await ready(pg, "/connections?c=cn_1")
            await pg.get_by_role("tab", name="Test and match fields").click()
            await pg.get_by_label("A submission, as Elementor Forms sends it").fill('{"fields": {"msg": {"id": "msg", "title": "Message", "value": "hi"}}}')
            await pg.get_by_role("button", name="Send test").click(); await pg.wait_for_timeout(300)
            ok("missing name and phone fails clearly", await pg.get_by_role("status").filter(has_text="Missing name and phone").count() == 1)
            await ready(pg, "/welcome")
            ok("landing lists connectable platforms", await pg.locator("section#connect").get_by_text("Gravity Forms").count() == 1)
        await step("connections", t_connections())

        async def t_mobile():
            m = await b.new_page(viewport={"width": 390, "height": 844}); wide = []
            for r in ["/brief", "/", "/crm/contacts/c_0003", "/ai-agent", "/inbox", "/welcome", "/connections", "/connections?c=cn_1"]:
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
