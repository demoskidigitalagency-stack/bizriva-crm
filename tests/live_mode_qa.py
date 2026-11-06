"""Live mode in a real browser, with Supabase answered by a local fake.

The sandbox can't reach Supabase, so this signs in with a fake session and
answers every database call with rows shaped exactly like the real tables
(columns and trigger results checked against the live database on 6 Nov).
It checks that every screen loads real data, shows "Live", and that actions
send the right writes.

Run with the dev server on 127.0.0.1:5173 (see tests/README.md).
"""
import asyncio, base64, json, re, time, uuid
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright

B = "http://127.0.0.1:5173"
REF = "xjhzkciowmklxrtwsikm"
WS = "98ce35db-16c7-415f-8337-b0f6265c008a"
OWNER, CHIDI, NKECHI = "11111111-0000-0000-0000-000000000001", "11111111-0000-0000-0000-000000000002", "11111111-0000-0000-0000-000000000003"
NOW = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
AGO = lambda h: time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(time.time() - h * 3600))
C1, C2, C3 = "23d0017f-4e13-44e9-9172-58e7fad038fc", "39f052c0-10ed-49af-b6b1-e2361c1e3f8e", "598fea91-6b5b-466c-88fe-65fd0f5dd5d6"
P1, P2 = "10aef5be-d5a3-4ac7-9396-0f2c622a8900", "817a7f6f-2f42-41cf-9b54-bd542aac28c8"
O1, O2, O3 = "fdbc3374-1de3-4d94-a4a0-16356d07b8fb", "6c9edcbd-0983-4cdf-9506-8dbbd0cf327f", "206f1c93-8295-4aca-936a-33d4294383d9"
K1, K2 = "05c91dad-fdb0-474e-b451-a5c9dad0e9c2", "15c91dad-fdb0-474e-b451-a5c9dad0e9c3"
D1, D2 = "d134fdab-70e7-434b-b6c9-3a6b06421b8c", "123e5581-561b-4e3e-b077-fdf4f33041e4"
V1, V2, V3 = "234c945d-f409-4858-8ea1-c502a9e8efe6", "5143dd9b-453d-49b8-a242-dc6b624571ec", "11f7b487-515b-48af-b246-aa3c14bfc122"
W = {"workspace_id": WS}

FIX = {
    "workspaces": {"id": WS, "name": "Glow Naturals", "plan": "trial", "currency": "NGN", "timezone": "Africa/Lagos",
                   "settings": {"deliveryFee": 2500, "freeDeliveryOver": 50000, "whatsappNumber": "+2348030000000"},
                   "assignment": {"mode": "least_busy", "last_assigned": CHIDI, "move_uncalled": True, "call_within_minutes": 120},
                   "brief_time": "07:30:00", "created_at": AGO(48), "after_delivery": {"receipt": True, "careGuide": True}, "brief_channels": ["app"],
                   "email_settings": {"provider": "none"}, "commission_per_order": 300.00, "partner_accept_minutes": 60},
    "team": [
        {"user_id": OWNER, "role": "owner", "email": "ademola@shop.ng", "full_name": "Ademola Adeniran", "on_duty": True, "states": [], "monthly_target": 0},
        {"user_id": CHIDI, "role": "sales", "email": "chidi@shop.ng", "full_name": "Chidi Okeke", "on_duty": True, "states": ["Lagos"], "monthly_target": 30},
        {"user_id": NKECHI, "role": "finance", "email": "nkechi@shop.ng", "full_name": "Nkechi Eze", "on_duty": True, "states": [], "monthly_target": 0}],
    "contacts": [
        {**W, "id": C1, "name": "Ada Obi", "tags": [], "phone": "+2348031234567", "address": "12 Allen Avenue", "location": "Ikeja", "created_at": AGO(40), "updated_at": AGO(40)},
        {**W, "id": C2, "name": "Musa Bello", "tags": [], "phone": "+2348051112222", "address": "4 Gana Street", "location": "Abuja", "created_at": AGO(30), "updated_at": AGO(30)},
        {**W, "id": C3, "name": "Tolu Ade", "tags": [], "phone": "+2348069998888", "location": "Lagos", "created_at": AGO(3), "updated_at": AGO(3)}],
    "leads": [
        {**W, "id": str(uuid.uuid4()), "score": 0, "stage": "converted", "contact_id": C1, "source_channel": "whatsapp", "ad_campaign_name": "Oct glow promo", "created_at": AGO(40), "last_activity_at": AGO(20)},
        {**W, "id": str(uuid.uuid4()), "score": 0, "stage": "order_confirmed", "contact_id": C2, "source_channel": "whatsapp", "created_at": AGO(30), "last_activity_at": AGO(10)},
        {**W, "id": str(uuid.uuid4()), "score": 0, "stage": "order_created", "contact_id": C3, "source_channel": "whatsapp", "created_at": AGO(3), "last_activity_at": AGO(3)}],
    "conversations": [
        {**W, "id": V1, "status": "open", "channel": "whatsapp", "priority": False, "contact_id": C1, "handled_by": "ai", "created_at": AGO(40)},
        {**W, "id": V2, "status": "open", "channel": "whatsapp", "priority": True, "contact_id": C2, "handled_by": "human", "created_at": AGO(30)},
        {**W, "id": V3, "status": "open", "channel": "whatsapp", "priority": False, "contact_id": C3, "handled_by": "ai", "ai_error": "401 invalid x-api-key", "created_at": AGO(3)}],
    "messages": [
        {**W, "id": str(uuid.uuid4()), "conversation_id": V3, "direction": "in", "body": "Hi, how much is the body cream?", "status": "received", "created_at": AGO(3)},
        {**W, "id": str(uuid.uuid4()), "conversation_id": V1, "direction": "in", "body": "Hi, how much is the body cream?", "status": "received", "created_at": AGO(40)},
        {**W, "id": str(uuid.uuid4()), "conversation_id": V1, "direction": "out", "body": "🧾 *Receipt RCPT-BZ-1001* — Glow Naturals", "status": "queued", "by_ai": True, "created_at": AGO(20)},
        {**W, "id": str(uuid.uuid4()), "conversation_id": V1, "direction": "in", "body": "[image] My payment proof", "status": "received", "media_kind": "image", "media_path": f"{WS}/in/proof.jpg", "created_at": AGO(19)},
        {**W, "id": str(uuid.uuid4()), "conversation_id": V1, "direction": "in", "body": "[audio]", "status": "received", "media_kind": "audio", "media_error": "190 Malformed access token", "created_at": AGO(18)},
        {**W, "id": str(uuid.uuid4()), "conversation_id": V1, "direction": "out", "body": "We miss you, Ada!", "status": "failed", "error": "Outside the 24-hour window — needs an approved template", "created_at": AGO(1)}],
    "complaints": [], "consents": [{**W, "id": str(uuid.uuid4()), "source": "order form", "channel": "whatsapp", "granted": True, "category": "marketing", "contact_id": C1, "recorded_at": AGO(40)}],
    "contact_facts": [], "customer_accounts": [],
    "products": [
        {**W, "id": P1, "name": "Glow Body Cream", "category": "Skincare", "price": 12000.00, "cost": 5000.00, "stock": 40, "reorder_level": 10, "active": True, "deposit": 0, "care_guide": "Apply twice daily on damp skin.", "reorder_days": 30, "created_at": AGO(48)},
        {**W, "id": P2, "name": "Shea Butter Jar", "category": "Skincare", "price": 6000.00, "cost": 2500.00, "stock": 8, "reorder_level": 10, "active": True, "deposit": 0, "reorder_days": 45, "created_at": AGO(48)}],
    "orders": [
        {**W, "id": O3, "ref": "BZ-1003", "total": 8500.00, "status": "pending_verification", "channel": "whatsapp", "discount": 0, "subtotal": 6000, "contact_id": C3, "created_at": AGO(3), "moved_from": [], "amount_paid": 0, "assigned_at": AGO(3), "assigned_to": CHIDI, "delivery_fee": 2500, "payment_method": "cod"},
        {**W, "id": O2, "ref": "BZ-1002", "total": 16000.00, "status": "confirmed", "channel": "whatsapp", "discount": 0, "subtotal": 12000, "contact_id": C2, "created_at": AGO(30), "moved_from": [], "amount_paid": 0, "assigned_at": AGO(30), "assigned_to": CHIDI, "delivery_fee": 4000, "payment_method": "cod", "customer_confirmed_at": AGO(29)},
        {**W, "id": O1, "ref": "BZ-1001", "total": 26500.00, "status": "delivered", "channel": "whatsapp", "discount": 0, "subtotal": 24000, "contact_id": C1, "created_at": AGO(40), "moved_from": [], "amount_paid": 26500, "receipt_no": "RCPT-BZ-1001", "assigned_at": AGO(40), "assigned_to": CHIDI, "delivery_fee": 2500, "payment_method": "cod", "customer_confirmed_at": AGO(39)}],
    "order_items": [
        {**W, "id": str(uuid.uuid4()), "order_id": O1, "product_id": P1, "quantity": 2, "unit_price": 12000},
        {**W, "id": str(uuid.uuid4()), "order_id": O2, "product_id": P1, "quantity": 1, "unit_price": 12000},
        {**W, "id": str(uuid.uuid4()), "order_id": O3, "product_id": P2, "quantity": 1, "unit_price": 6000}],
    "order_contact_attempts": [{**W, "id": str(uuid.uuid4()), "order_id": O3, "by_user": CHIDI, "via": "call", "outcome": "no_answer", "at": AGO(2)}],
    "deliveries": [
        {**W, "id": D1, "fee": 2500, "outcome": "delivered", "attempts": 0, "order_id": O1, "partner_id": K1, "delivered_at": AGO(20), "dispatched_at": AGO(22), "cash_collected": 26500},
        {**W, "id": D2, "attempts": 0, "order_id": O2}],
    "payments": [{**W, "id": str(uuid.uuid4()), "kind": "cod_cash", "amount": 26500, "method": "cash", "paid_at": AGO(20), "order_id": O1, "contact_id": C1}],
    "logistics_partners": [
        {**W, "id": K1, "name": "Kunle Rider", "phone": "+2348065521180", "kind": "rider", "states": ["Lagos"], "fees": {"Lagos": 2500}, "failed_fee": 1000, "vehicle": "bike", "active": True},
        {**W, "id": K2, "name": "Arewa Express", "phone": "+2348169001122", "kind": "partner", "states": ["FCT", "Kano"], "fees": {"FCT": 4000}, "failed_fee": 2000, "vehicle": "van", "active": True}],
    "message_templates": [{**W, "id": str(uuid.uuid4()), "body": "Hi {{1}}, your order is confirmed.", "name": "order_confirm", "status": "approved", "purpose": "order", "category": "utility", "language": "en", "updated_at": AGO(48)}],
    "knowledge_entries": [{**W, "id": str(uuid.uuid4()), "topic": "delivery", "answer": "Lagos 1–2 days, other states 3–5 days.", "keywords": ["delivery", "how long"], "question": "How long is delivery?", "updated_at": AGO(48)}],
    "followup_rules": [{**W, "id": str(uuid.uuid4()), "name": "Delivery failed — rebook", "enabled": True, "message": "Hi {{name}}, when can we deliver?", "trigger": "delivery_failed", "delay_hours": 2, "max_attempts": 2, "template_name": "order_confirm"}],
    "tasks": [{**W, "id": "7a5c0c1e-0b5e-4c38-9a4e-0d3b8f1a2c01", "contact_id": C2, "title": "Confirm Abuja delivery day", "type": "delivery_check", "priority": "high", "status": "open", "due_at": AGO(1), "assigned_to": OWNER, "created_by": OWNER, "created_at": AGO(5)}],
    "activity_log": [{**W, "id": str(uuid.uuid4()), "actor": CHIDI, "entity": "contact", "entity_id": C1, "action": "note", "detail": {"text": "Prefers evening deliveries"}, "created_at": AGO(10)}],
    "email_outbox": [{"id": str(uuid.uuid4()), "kind": "order", "to_email": "ada@example.com", "subject": "Your order BZ-1001 is confirmed", "status": "failed", "error": "401 Key not found", "created_at": AGO(1)}],
    "followup_jobs": [
        {"id": str(uuid.uuid4()), "state": "scheduled", "cancel_reason": None, "run_at": AGO(-2), "sent_at": None, "attempt": 1, "rule_id": "__RULE__", "conversation_id": V2},
        {"id": str(uuid.uuid4()), "state": "sent", "cancel_reason": None, "run_at": AGO(3), "sent_at": AGO(3), "attempt": 1, "rule_id": "__RULE__", "conversation_id": V1},
        {"id": str(uuid.uuid4()), "state": "cancelled", "cancel_reason": "replied", "run_at": AGO(1), "sent_at": None, "attempt": 2, "rule_id": "__RULE__", "conversation_id": V3}],
    "order_forms": [], "connections": [], "calendar_events": [], "payment_events": [], "campaigns": [], "campaign_results": [], "payment_providers": [], "meta_links": [],
}

FIX["followup_jobs"] = [{**j, "rule_id": FIX["followup_rules"][0]["id"]} for j in FIX["followup_jobs"]]
writes = []


def b64(d):
    return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")


def session():
    exp = int(time.time()) + 3600 * 24
    jwt = f'{b64({"alg": "HS256", "typ": "JWT"})}.{b64({"sub": OWNER, "role": "authenticated", "exp": exp, "aud": "authenticated", "email": "ademola@shop.ng"})}.sig'
    return {"access_token": jwt, "token_type": "bearer", "expires_in": 86400, "expires_at": exp, "refresh_token": "fake-refresh",
            "user": {"id": OWNER, "aud": "authenticated", "role": "authenticated", "email": "ademola@shop.ng", "app_metadata": {}, "user_metadata": {"full_name": "Ademola Adeniran"}, "created_at": AGO(48)}}


async def handle(route):
    req = route.request
    u = urlparse(req.url)
    path = u.path
    accept_one = "vnd.pgrst.object" in (req.headers.get("accept") or "")
    hdr = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*"}
    if req.method == "OPTIONS":
        return await route.fulfill(status=204, headers=hdr)
    if path.startswith("/functions/v1/payment-link"):
        if req.method == "OPTIONS":
            return await route.fulfill(status=204, headers=hdr)
        writes.append(("fn", "payment-link", json.loads(req.post_data or "{}"), req.headers.get("authorization", "")))
        return await route.fulfill(status=200, headers=hdr, body=json.dumps({"url": "https://checkout.paystack.com/abc123", "reference": "BZ-1002-x", "amount": 16000, "queued": True}))
    if path.startswith("/storage/v1/"):
        if "/object/sign/" in path and req.method == "POST":
            obj = path.split("/object/sign/", 1)[1]
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"signedURL": f"/object/sign/{obj}?token=t"}))
        if "/object/sign/" in path:
            png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
            return await route.fulfill(status=200, headers={**hdr, "Content-Type": "image/png"}, body=png)
        if req.method == "POST" and "/object/chat-media/" in path:
            writes.append(("upload", path.split("/object/", 1)[1], None, ""))
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"Key": path.split("/object/", 1)[1]}))
        return await route.fulfill(status=404, headers=hdr, body="{}")
    if path.startswith("/auth/v1/"):
        if path.endswith("/user"):
            return await route.fulfill(status=200, headers=hdr, body=json.dumps(session()["user"]))
        return await route.fulfill(status=200, headers=hdr, body=json.dumps(session()))
    if path.startswith("/rest/v1/rpc/"):
        fn = path.rsplit("/", 1)[1]
        body = json.loads(req.post_data or "{}")
        if fn == "workspace_team":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps(FIX["team"]))
        writes.append(("rpc", fn, body))
        if fn == "save_whatsapp":
            FIX["whatsapp_numbers"] = [{**W, "phone_number_id": body.get("p_phone_number_id"), "waba_id": None, "display_phone": body.get("p_display_phone"), "verify_token": "vt-0123456789abcdef", "active": True, "connected_at": NOW, "last_inbound_at": None, "last_sent_at": None, "last_error": None}]
            return await route.fulfill(status=200, headers=hdr, body=json.dumps("vt-0123456789abcdef"))
        if fn == "payment_connection":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps(FIX.get("payconn")))
        if fn == "save_payment_key":
            FIX["payconn"] = {"provider": body.get("p_provider"), "connected_at": NOW, "has_key": True, "has_hash": False}
            return await route.fulfill(status=200, headers=hdr, body="null")
        if fn == "save_payment_hash":
            FIX["payconn"]["has_hash"] = True
            return await route.fulfill(status=200, headers=hdr, body="null")
        if fn == "save_email_key":
            FIX["workspaces"]["email_settings"] = {"provider": body.get("p_provider"), "from": body.get("p_from")}
            return await route.fulfill(status=200, headers=hdr, body="null")
        if fn == "send_test_email":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps("ademola@shop.ng"))
        if fn == "save_ai_key":
            FIX["ai_keys"] = [{**W, "active": True, "model": None, "saved_at": NOW, "last_used_at": None, "last_error": None}]
            return await route.fulfill(status=200, headers=hdr, body="null")
        if fn == "send_to_partner":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"token": "a1b2c3d4e5f60718293a4b5c6d7e8f90", "partner": "Arewa Express", "phone": "+2348169001122", "group": None, "fee": 4000, "state": "FCT"}))
        return await route.fulfill(status=200, headers=hdr, body=json.dumps(1 if fn == "pay_commission" else None))
    if path.startswith("/rest/v1/"):
        table = path.rsplit("/", 1)[1]
        q = parse_qs(u.query)
        if req.method == "GET":
            if table == "workspace_members":  # memberships for auth
                return await route.fulfill(status=200, headers=hdr, body=json.dumps([{"role": "owner", "workspace_id": WS, "workspaces": {"name": "Glow Naturals", "currency": "NGN"}}]))
            rows = FIX.get(table, [])
            if accept_one:
                return await route.fulfill(status=200, headers=hdr, body=json.dumps(rows if isinstance(rows, dict) else (rows[0] if rows else {})))
            return await route.fulfill(status=200, headers=hdr, body=json.dumps(rows if isinstance(rows, list) else [rows]))
        body = json.loads(req.post_data or "null")
        writes.append((req.method, table, body, u.query))
        out = {"id": str(uuid.uuid4())}
        return await route.fulfill(status=201 if req.method == "POST" else 200, headers=hdr, body=json.dumps(out if accept_one else [out]))
    return await route.fulfill(status=404, headers=hdr, body="{}")


results = []


def ok(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f" — {extra}" if extra != "" else ""))


def wrote(method, table, pred=lambda b: True):
    return any(w[0] == method and w[1] == table and pred(w[2]) for w in writes)


async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={"width": 1280, "height": 900})
        await ctx.route(re.compile(rf"https://{REF}\.supabase\.co/.*"), handle)
        await ctx.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(session()))}); if (!sessionStorage.getItem('qa.init')) {{ localStorage.removeItem('bizriva.mode'); sessionStorage.setItem('qa.init', '1'); }}")
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))

        async def ready(path):
            await pg.goto(B + path)
            await pg.wait_for_load_state("load")
            for _ in range(30):
                if await pg.get_by_role("button", name=re.compile("Showing your real data")).count():
                    break
                await pg.wait_for_timeout(300)
            await pg.wait_for_timeout(900)

        await ready("/")
        ok("signed in, the app shows Live", await pg.get_by_role("button", name=re.compile("Showing your real data")).count() == 1)
        ok("no loading error", await pg.get_by_role("alert").filter(has_text="Couldn't load").count() == 0)
        body = await pg.locator("main").inner_text()
        ok("dashboard is on real data (no sample business)", "Luxe" not in body and "Glow Naturals" in (await pg.locator("body").inner_text()))

        await ready("/orders")
        t = await pg.locator("main").inner_text()
        ok("orders are the real ones", all(r in t for r in ["BZ-1001", "BZ-1002", "BZ-1003"]) and "BZ-1250" not in t)
        ok("real customers and agent show", "Ada Obi" in t and "Chidi" in t)

        await ready("/calls")
        t = await pg.locator("main").inner_text()
        ok("call list has the real order to call", "BZ-1003" in t and "Tolu Ade" in t)
        card = pg.locator("li[aria-label='Order BZ-1003']")
        await card.get_by_role("button", name="Confirmed ✓").click()
        await pg.wait_for_timeout(800)
        ok("confirming writes the call and the status to the database", wrote("POST", "order_contact_attempts", lambda b: b.get("outcome") == "reached") and wrote("PATCH", "orders", lambda b: b.get("status") == "confirmed"))

        await ready("/delivery")
        t = await pg.locator("main").inner_text()
        ok("dispatch board shows the confirmed order", "BZ-1002" in t)
        await pg.get_by_role("button", name=re.compile("^Send to ")).first.click()
        await pg.wait_for_timeout(800)
        dlg = pg.get_by_role("dialog")
        msg = await dlg.get_by_label("Message to the rider").inner_text() if await dlg.count() else ""
        ok("send-to-partner asks the server for a private link", any(w[0] == "rpc" and w[1] == "send_to_partner" for w in writes) and "/d/a1b2c3d4e5f60718293a4b5c6d7e8f90" in msg, msg[:80])
        await pg.keyboard.press("Escape")

        await ready("/riders")
        t = await pg.locator("main").inner_text()
        ok("riders and partners are the real ones", "Kunle Rider" in t and "Arewa Express" in t and "Musa Abdullahi" not in t)

        await ready("/products")
        t = await pg.locator("main").inner_text()
        ok("products are the real ones", "Glow Body Cream" in t and "Shea Butter Jar" in t)

        await ready("/crm/contacts")
        t = await pg.locator("main").inner_text()
        ok("customers are the real ones", "Ada Obi" in t and "Musa Bello" in t)

        await ready(f"/crm/contacts/{C1}")
        t = await pg.locator("main").inner_text()
        ok("customer page shows the saved note", "Prefers evening deliveries" in t)
        await pg.get_by_role("button", name="Note").first.click()
        await pg.get_by_role("dialog").get_by_role("textbox").fill("Wants the 2-pack next time")
        await pg.get_by_role("dialog").get_by_role("button", name="Save note").click(); await pg.wait_for_timeout(800)
        ok("adding a note writes it to the activity log", wrote("POST", "activity_log", lambda b: b.get("action") == "note" and b.get("detail", {}).get("text") == "Wants the 2-pack next time"))

        await ready("/crm/tasks")
        t = await pg.locator("main").inner_text()
        ok("tasks are the real ones", "Confirm Abuja delivery day" in t)
        await pg.get_by_role("button", name="Done").first.click(); await pg.wait_for_timeout(800)
        ok("completing a task saves it", wrote("PATCH", "tasks", lambda b: b.get("status") == "done"))

        await ready("/inbox")
        t = await pg.locator("main").inner_text()
        ok("inbox has the real chats", "Tolu Ade" in t)
        await ready(f"/inbox?c={V1}")
        t = await pg.locator("main").inner_text()
        ok("a message WhatsApp couldn't take shows why", "Not delivered: Outside the 24-hour window" in t and "Waiting to send" in t, t[-300:])

        await ready("/calls?v=board")
        t = await pg.locator("main").inner_text()
        ok("leaderboard: commission from the real delivered, paid order", "₦300" in t and "Chidi Okeke" in t, t[t.find("Leaderboard"):][:200])
        btn = pg.locator("tr[aria-label='Leaderboard Chidi Okeke']").get_by_role("button", name="Mark paid")
        if await btn.is_enabled():
            await btn.click(); await pg.wait_for_timeout(600)
        ok("marking commission paid calls the server", any(w[0] == "rpc" and w[1] == "pay_commission" for w in writes))

        for r in ["/analytics", "/brief", "/payments", "/follow-ups", "/broadcasts", "/settings", "/team", "/today", "/knowledge", "/templates", "/order-forms"]:
            await ready(r)
        ok("every other screen opens on real data without errors", not errors, errors[:2])

        await ready("/settings")
        before = len(writes)
        sw = pg.get_by_role("switch").first
        if await sw.count():
            await sw.click()
        await pg.get_by_role("button", name="Save settings").click(); await pg.wait_for_timeout(800)
        ok("changing a setting saves to the business", any(w[0] == "PATCH" and w[1] == "workspaces" for w in writes[before:]))

        await ready("/integrations")
        wa = pg.get_by_role("form", name="Connect WhatsApp")
        ok("owner sees Connect WhatsApp on real data", await wa.count() == 1)
        await wa.get_by_label("Phone number ID").fill("106540352242922")
        await wa.get_by_label("WhatsApp number").fill("+234 803 000 0000")
        await wa.get_by_label("Access token").fill("EAAG" + "x" * 40)
        await wa.get_by_label("App secret").fill("s" * 32)
        await wa.get_by_role("button", name="Connect WhatsApp").click(); await pg.wait_for_timeout(1200)
        sent = [w for w in writes if w[0] == "rpc" and w[1] == "save_whatsapp"]
        ok("keys go to the server once, through save_whatsapp", len(sent) == 1 and sent[0][2].get("p_phone_number_id") == "106540352242922")
        t = await pg.locator("main").inner_text()
        ok("then it shows the callback address and verify token for Meta", "functions/v1/whatsapp-webhook" in t and "vt-0123456789abcdef" in t and "Waiting for Meta" in t)
        ok("the secret isn't shown back", ("x" * 40) not in t and ("s" * 32) not in t)

        await ready("/ai-agent")
        aif = pg.get_by_role("form", name="Connect the AI")
        ok("owner sees Connect the AI on real data", await aif.count() == 1)
        await aif.get_by_label("Anthropic API key").fill("sk-ant-api03-" + "k" * 30)
        await aif.get_by_role("button", name="Connect the AI").click(); await pg.wait_for_timeout(1000)
        ok("the AI key goes to the server once, through save_ai_key", sum(1 for w in writes if w[0] == "rpc" and w[1] == "save_ai_key") == 1)
        t = await pg.locator("main").inner_text()
        ok("then it shows Connected and never the key", "Connected" in t and ("k" * 30) not in t)
        before = len(writes)
        await pg.get_by_label("Name customers see").fill("Adaeze")
        await pg.get_by_role("button", name="Save", exact=True).click(); await pg.wait_for_timeout(800)
        ok("agent setup saves to the business for the AI to read", any(w[0] == "PATCH" and w[1] == "workspaces" and (w[2].get("settings") or {}).get("agent", {}).get("name") == "Adaeze" for w in writes[before:]))

        await ready(f"/inbox?c={V3}")
        bar = pg.get_by_role("status", name="Who answers this chat")
        ok("chat shows the AI is answering and why it couldn't", "AI is answering" in await bar.inner_text() and "401 invalid x-api-key" in await bar.inner_text())
        await bar.get_by_role("button", name="Take over").click(); await pg.wait_for_timeout(800)
        ok("Take over hands the chat to the team", wrote("PATCH", "conversations", lambda b: b.get("handled_by") == "human"))
        await ready(f"/inbox?c={V2}")
        ok("a handed-over chat says it needs a reply", "Handed to the team" in await pg.get_by_role("status", name="Who answers this chat").inner_text())
        await ready(f"/inbox?c={V1}")
        await pg.wait_for_timeout(800)
        ok("a customer's photo shows in the chat", await pg.locator("main img[alt='Photo']").count() == 1)
        ok("a file that couldn't be saved says why", "Voice note couldn't be saved: 190 Malformed access token" in await pg.locator("main").inner_text())
        await pg.get_by_label("Reply").fill("Here is the cream")
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
        await pg.get_by_label("Choose a file to send").set_input_files({"name": "glow cream.png", "mimeType": "image/png", "buffer": png})
        await pg.wait_for_timeout(1200)
        up = [w for w in writes if w[0] == "upload"]
        ok("attaching uploads into this business's out/ folder", len(up) == 1 and up[0][1].startswith(f"chat-media/{WS}/out/") and up[0][1].endswith("-glow-cream.png"), up[-1:] )
        ok("and queues it with the typed caption", wrote("POST", "messages", lambda b: b.get("media_kind") == "image" and b.get("body") == "Here is the cream" and str(b.get("media_path", "")).startswith(f"{WS}/out/")))
        ok("AI-written messages are labelled", "ai reply" in (await pg.locator("main").inner_text()).lower())

        await ready("/follow-ups")
        fu = pg.get_by_role("tablist", name="Follow-ups from the server")
        ok("Follow-ups shows what the server scheduled", await fu.count() == 1 and "Musa" in await pg.get_by_role("list", name="Follow-ups scheduled").inner_text())
        await fu.get_by_role("tab", name=re.compile("Held back")).click()
        ok("and what it held back, with the reason", "Customer replied" in await pg.get_by_role("list", name="Follow-ups held").inner_text())

        await ready("/integrations")
        emf = pg.get_by_role("form", name="Connect email")
        ok("owner sees Connect email on real data", await emf.count() == 1)
        await emf.get_by_role("radio", name=re.compile("Resend")).click()
        await emf.get_by_label("Send from").fill("hello@glow.ng")
        await emf.get_by_label("API key").fill("re_" + "e" * 30)
        await emf.get_by_role("button", name="Connect email").click(); await pg.wait_for_timeout(1500)
        sk = [w for w in writes if w[0] == "rpc" and w[1] == "save_email_key"]
        ok("the email key goes to the server once, with the service chosen", len(sk) == 1 and sk[0][2].get("p_provider") == "resend" and sk[0][2].get("p_from") == "hello@glow.ng")
        t = await pg.locator("main").inner_text()
        ok("then it shows Connected, the latest emails and why one failed, never the key", "Connected" in t and "401 Key not found" in t and ("e" * 30) not in t)
        await pg.get_by_role("button", name="Send me a test email").click(); await pg.wait_for_timeout(800)
        ok("test email asks the server to send one", any(w[0] == "rpc" and w[1] == "send_test_email" for w in writes) and "Test email queued to ademola@shop.ng" in await pg.locator("main").inner_text())

        await ready("/payments")
        pf = pg.get_by_role("form", name="Connect payments")
        ok("owner sees Connect payments on real data", await pf.count() == 1)
        await pf.get_by_role("radio", name=re.compile("Flutterwave")).click()
        await pf.get_by_label(re.compile("Secret key")).fill("FLWSECK-" + "f" * 30)
        await pf.get_by_label(re.compile("Secret hash")).fill("my-secret-hash-123")
        await pf.get_by_role("button", name="Connect Flutterwave").click(); await pg.wait_for_timeout(1200)
        ok("key and hash go to the server, never shown again", any(w[0] == "rpc" and w[1] == "save_payment_key" and w[2].get("p_provider") == "flutterwave" for w in writes)
           and any(w[0] == "rpc" and w[1] == "save_payment_hash" for w in writes) and ("f" * 30) not in await pg.locator("main").inner_text())
        ok("shows the notification address to paste into the provider", f"/payments-webhook/flutterwave/{WS}" in await pg.get_by_label("Notification address").inner_text())

        await ready(f"/inbox?c={V2}")
        await pg.get_by_role("button", name="Request payment").click()
        await pg.get_by_role("button", name="Send link in chat").click(); await pg.wait_for_timeout(1200)
        pl = [w for w in writes if w[0] == "fn" and w[1] == "payment-link"]
        ok("Send link asks the server for a link for the unpaid order, signed in", len(pl) == 1 and pl[0][2].get("order_id") == O2 and pl[0][3].startswith("Bearer "))
        ok("and shows it was sent in the chat", "Link sent in the chat: https://checkout.paystack.com/abc123" in await pg.locator("body").inner_text())
        await pg.keyboard.press("Escape")
        await pg.goto(B + "/paid"); await pg.wait_for_timeout(800)
        ok("customers land on a thank-you page after paying", "Your payment is being confirmed" in await pg.locator("body").inner_text())
        await pg.goto(B + "/")

        # Switch back to sample data.
        await pg.get_by_role("button", name=re.compile("Showing your real data")).click()
        await pg.wait_for_timeout(1200)
        await ready("/orders")
        t = await pg.locator("main").inner_text()
        ok("one tap back to Practice Mode with the sample data", "Practice" in await pg.locator("header").inner_text() and "BZ-1003" in t and len(re.findall(r"BZ-1\d{3}", t)) > 10)

        ok("no page errors", not errors, errors[:2])
        await br.close()
    print(f"\n{sum(1 for r in results if r[1])}/{len(results)} passed")


asyncio.run(main())
