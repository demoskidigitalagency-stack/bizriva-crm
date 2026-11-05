"""Checks for the loophole fixes on 2026-11-06 (app side).

Run with the dev server on 127.0.0.1:5173 (see tests/README.md).
The database side is tested by supabase/tests/loopholes_and_rules.sql.
"""
import asyncio
from playwright.async_api import async_playwright

B = "http://127.0.0.1:5173"
results = []


def ok(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (" — " + str(extra) if extra else ""))


async def ready(pg, path):
    await pg.goto(B + path)
    await pg.wait_for_load_state("load")
    await pg.wait_for_timeout(1200)


async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        pg = await br.new_page(viewport={"width": 1280, "height": 900})
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))

        # Public order form page: no app chrome, and a form that isn't online says so.
        await ready(pg, "/f/00000000-0000-0000-0000-000000000000")
        await pg.wait_for_timeout(2500)
        body = await pg.locator("body").inner_text()
        ok("public form page has no sidebar", await pg.get_by_role("navigation").count() == 0)
        ok("unknown or offline form says it's closed", "order form is closed" in body, body[:120])

        # Order Forms share link points at the real page.
        await ready(pg, "/order-forms?f=of_1")
        await pg.get_by_role("tab", name="Link and embed").click()
        await pg.wait_for_timeout(400)
        txt = await pg.locator("main").inner_text()
        ok("form link is the live /f/ page", "bizriva-crm.vercel.app/f/" in txt)
        ok("embed code is an iframe of that page", "<iframe src=\"https://bizriva-crm.vercel.app/f/" in txt)

        # Website & Forms: live intake address and a strong key.
        await ready(pg, "/connections")
        await pg.get_by_role("button", name="Connect a platform").click()
        await pg.get_by_role("button", name="Gravity Forms").click()
        await pg.wait_for_timeout(600)
        txt = await pg.locator("main").inner_text()
        ok("intake address is the Edge Function", "/functions/v1/intake/" in txt)
        import re
        keys = re.findall(r"bzk_[0-9a-f]+", txt)
        ok("secret keys are long and random (48 hex)", keys and all(len(k) >= 52 for k in keys[-1:]), keys[-1:] if keys else "none shown")

        # Payments: the notification address to paste into the provider.
        await ready(pg, "/payments")
        connect = pg.get_by_role("button", name="Connect Paystack")
        if await connect.count():
            await connect.click()
            await pg.wait_for_timeout(600)
        addr = pg.get_by_label("Payment notification address")
        ok("payment notification address shown", await addr.count() == 1 and "/functions/v1/payments-webhook/paystack/" in await addr.inner_text())

        ok("no page errors", not errors, errors[:2])
        await br.close()
    passed = sum(1 for r in results if r[1])
    print(f"\n{passed}/{len(results)} passed")


asyncio.run(main())
