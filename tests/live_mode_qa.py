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
        {**W, "id": O3, "ref": "BZ-1003", "total": 8500.00, "status": "pending_verification", "channel": "whatsapp", "discount": 0, "subtotal": 6000, "contact_id": C3, "created_at": AGO(3), "moved_from": [], "amount_paid": 0, "assigned_at": AGO(3), "assigned_to": CHIDI, "delivery_fee": 2500, "payment_method": "cod", "risk_score": 55, "risk_level": "high", "risk_reasons": ["Phone number looks incomplete", "No delivery address", "First order"]},
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
    "message_templates": [{**W, "id": str(uuid.uuid4()), "body": "Hi {{1}}, your order is confirmed.", "name": "order_confirm", "status": "approved", "purpose": "order", "category": "utility", "language": "en", "updated_at": AGO(48)},
        {**W, "id": "8d2b8c32-4e5f-4a71-8c1d-2e3f4a5b6c72", "body": "Hi {{1}}, big sale this week! Reply STOP to opt out.", "name": "promo_sale", "status": "rejected", "rejected_reason": "Meta: the text doesn't match the chosen type (utility/marketing)", "purpose": "reactivation", "category": "utility", "language": "en", "updated_at": AGO(2)}],
    "knowledge_entries": [{**W, "id": str(uuid.uuid4()), "topic": "delivery", "answer": "Lagos 1–2 days, other states 3–5 days.", "keywords": ["delivery", "how long"], "question": "How long is delivery?", "updated_at": AGO(48)}],
    "followup_rules": [{**W, "id": str(uuid.uuid4()), "name": "Delivery failed — rebook", "enabled": True, "message": "Hi {{name}}, when can we deliver?", "trigger": "delivery_failed", "delay_hours": 2, "max_attempts": 2, "template_name": "order_confirm"}],
    "tasks": [{**W, "id": "7a5c0c1e-0b5e-4c38-9a4e-0d3b8f1a2c01", "contact_id": C2, "title": "Confirm Abuja delivery day", "type": "delivery_check", "priority": "high", "status": "open", "due_at": AGO(1), "assigned_to": OWNER, "created_by": OWNER, "created_at": AGO(5)}],
    "activity_log": [{**W, "id": str(uuid.uuid4()), "actor": CHIDI, "entity": "contact", "entity_id": C1, "action": "note", "detail": {"text": "Prefers evening deliveries"}, "created_at": AGO(10)},
        {**W, "id": str(uuid.uuid4()), "actor": None, "entity": "order", "entity_id": O2, "action": "created", "detail": {"ref": "BZ-1002"}, "created_at": AGO(30)},
        {**W, "id": str(uuid.uuid4()), "actor": CHIDI, "entity": "order", "entity_id": O2, "action": "status:confirmed", "detail": {"ref": "BZ-1002", "from": "pending_verification", "to": "confirmed"}, "created_at": AGO(29)}],
    "email_outbox": [{"id": str(uuid.uuid4()), "kind": "order", "to_email": "ada@example.com", "subject": "Your order BZ-1001 is confirmed", "status": "failed", "error": "401 Key not found", "created_at": AGO(1)}],
    "followup_jobs": [
        {"id": str(uuid.uuid4()), "state": "scheduled", "cancel_reason": None, "run_at": AGO(-2), "sent_at": None, "attempt": 1, "rule_id": "__RULE__", "conversation_id": V2},
        {"id": str(uuid.uuid4()), "state": "sent", "cancel_reason": None, "run_at": AGO(3), "sent_at": AGO(3), "attempt": 1, "rule_id": "__RULE__", "conversation_id": V1},
        {"id": str(uuid.uuid4()), "state": "cancelled", "cancel_reason": "replied", "run_at": AGO(1), "sent_at": None, "attempt": 2, "rule_id": "__RULE__", "conversation_id": V3}],
    "product_variants": [{**W, "id": "5b0f6a10-2c3d-4e5f-8a9b-0c1d2e3f4a50", "product_id": P1, "name": "500ml", "price": 18000.00, "stock": 6}],
    "media_assets": [{**W, "id": "6c1a7b21-3d4e-4f60-9b0c-1d2e3f4a5b61", "product_id": P1, "kind": "image", "storage_path": f"{WS}/out/media/abc-glow.jpg", "bytes": 120000, "name": "glow.jpg", "created_at": AGO(5)}],
    "plans": [{"id": "trial", "name": "Trial", "price_ngn": 0, "contacts": 500, "seats": 3, "messages_month": 1000, "storage_mb": 200, "sort": 0},
              {"id": "starter", "name": "Starter", "price_ngn": 25000, "contacts": 2000, "seats": 3, "messages_month": 5000, "storage_mb": 1000, "sort": 1},
              {"id": "growth", "name": "Growth", "price_ngn": 60000, "contacts": 10000, "seats": 10, "messages_month": 25000, "storage_mb": 5000, "sort": 2}],
    "plan_payments": [],
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
    if path.startswith("/functions/v1/webchat"):
        b = json.loads(req.post_data or "{}")
        writes.append(("webchat", b.get("action"), b, ""))
        if b.get("action") == "info":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"business": "Glow Naturals", "greeting": "Hi! Ask us anything.", "color": "#16a34a", "askPhone": True}))
        if b.get("action") == "poll":
            msgs = [{"id": "w1", "from": "you", "text": "Do you have shea butter?", "at": AGO(0.2)}, {"id": "w2", "from": "us", "text": "Yes! It's ₦6,000.", "at": AGO(0.1), "media": None}]
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"ok": True, "messages": msgs if any(w[0] == "webchat" and w[1] == "send" for w in writes) else []}))
        return await route.fulfill(status=200, headers=hdr, body=json.dumps({"ok": True}))
    if path.startswith("/functions/v1/ai-planner"):
        writes.append(("fn", "ai-planner", json.loads(req.post_data or "{}"), req.headers.get("authorization", "")))
        step = {"title": "Message lapsed buyers", "description": "Send the win-back template to the 12 customers.", "timing": "Day 1", "channel": "whatsapp", "ownerRole": "sales_rep", "target": "12 customers", "messageDraft": "Hi {{name}}, we miss you."}
        return await route.fulfill(status=200, headers=hdr, body=json.dumps({"id": "p1", "plan": {"title": "Win back old buyers", "summary": "Two steps.", "trigger": "Every Monday", "steps": [step, {**step, "title": "Call the rest", "channel": "phone", "messageDraft": None}], "successMetrics": ["5 repeat orders"], "risks": ["Template not approved"]}}))
    if path.startswith("/functions/v1/whatsapp-onboard"):
        b = json.loads(req.post_data or "{}")
        writes.append(("fn", "whatsapp-onboard", b, req.headers.get("authorization", "")))
        FIX["whatsapp_numbers"] = [{**W, "phone_number_id": "555000111", "waba_id": b.get("waba_id"), "display_phone": "+234 803 000 0000", "verify_token": "vt-x", "active": True, "connected_at": NOW,
            "last_inbound_at": None, "last_sent_at": None, "last_error": None, "via": "partner", "on_app": True, "history_status": "syncing", "history_progress": 40,
            "history_messages": 1200, "history_chats": 85, "contacts_synced": 310, "history_error": None}]
        return await route.fulfill(status=200, headers=hdr, body=json.dumps({"ok": True, "display_phone": "+234 803 000 0000", "on_app": True, "history": "syncing", "sync_error": None}))
    if path.startswith("/functions/v1/billing"):
        writes.append(("fn", "billing", json.loads(req.post_data or "{}"), req.headers.get("authorization", "")))
        return await route.fulfill(status=200, headers=hdr, body=json.dumps({"url": B + "/paid", "reference": "BZP-ABC"}))
    if path.startswith("/functions/v1/payment-link"):
        if req.method == "OPTIONS":
            return await route.fulfill(status=204, headers=hdr)
        writes.append(("fn", "payment-link", json.loads(req.post_data or "{}"), req.headers.get("authorization", "")))
        return await route.fulfill(status=200, headers=hdr, body=json.dumps({"url": "https://checkout.paystack.com/abc123", "reference": "BZ-1002-x", "amount": 16000, "queued": True}))
    if path.startswith("/storage/v1/"):
        if "/object/sign/" in path and req.method == "POST" and "paths" in json.loads(req.post_data or "{}"):
            ps = json.loads(req.post_data)["paths"]
            return await route.fulfill(status=200, headers=hdr, body=json.dumps([{"path": x, "signedURL": f"/object/sign/chat-media/{x}?token=t", "error": None} for x in ps]))
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
        if fn == "save_meta_page":
            FIX["meta_pages"] = [{"page_id": body.get("p_page_id"), "page_name": body.get("p_page_name"), "ig_account_id": body.get("p_ig_id") or None, "verify_token": "mv-abcdef123456", "active": True, "connected_at": NOW, "last_event_at": None, "last_sent_at": None, "last_error": None}]
            FIX["meta_leads"] = [{"id": str(uuid.uuid4()), "fields": {"full_name": "Tolu Ade", "phone_number": "+2348031112222"}, "platform": "ig", "error": None, "received_at": AGO(0.5)}]
            return await route.fulfill(status=200, headers=hdr, body=json.dumps("mv-abcdef123456"))
        if fn == "plan_usage":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"plan": "trial", "name": "Trial", "price": 0, "trialEndsAt": AGO(-24 * 5), "renewsAt": None, "active": True, "suspended": False, "suspendedReason": None,
                "limits": {"contacts": 500, "seats": 3, "messages": 1000, "storageMb": 200}, "used": {"contacts": 3, "seats": 2, "messages": 40, "storageMb": 0.1}}))
        if fn == "ad_performance":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"currency": "NGN", "lastSync": AGO(2), "unattributed": {"orders": 1, "delivered": 0},
                "ads": [{"adId": "120200001", "ad": "Glow cream CTWA", "campaign": "November promo", "people": 2, "orders": 2, "delivered": 1, "lost": 0, "revenue": 20000, "spend": 5000, "clicks": 80, "roas": 4.0, "costPerDelivered": 5000}]}))
        if fn == "response_times":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"callWithin": 120, "customerTurns": 3, "unanswered": 1, "overall": {"median": 5.5, "within5": 1, "answered": 2}, "ai": {"replies": 1, "median": 1.0}, "automatic": 0,
                "people": [{"userId": CHIDI, "name": "Chidi Okafor", "role": "sales", "replies": 1, "median": 10.0, "average": 10.0, "within5": 0, "confirmed": 1, "confirmMedian": 45.0, "confirmOnTime": 1}]}))
        if fn == "import_chat":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"contact": str(uuid.uuid4()), "conversation": str(uuid.uuid4()), "added": len(body.get("p_messages") or []), "duplicates": 0}))
        if fn == "admin_meta_settings":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"appId": None, "configId": None, "hasSecret": False, "verifyToken": "pv-0123456789abcdef", "updatedAt": NOW, "numbers": 0, "onApp": 0}))
        if fn == "platform_meta":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps(FIX.get("platform")))
        if fn == "activity_status":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"checkedAt": NOW,
                "channels": [{"key": "wa_link", "name": "WhatsApp (linked number)", "state": "ok", "detail": "+2347069511984 · Life Care · linked", "at": NOW},
                             {"key": "ai", "name": "AI assistant", "state": "off", "detail": "No AI key — the free Basic assistant answers", "at": None}],
                "running": [{"key": "wa_history", "title": "Bringing in old WhatsApp chats", "state": "running", "done": 5797, "total": None, "unit": "messages", "detail": "256 chats so far · keep WhatsApp open on the phone", "at": NOW, "link": "/whatsapp"},
                            {"key": "campaign:1", "title": "Sending campaign: Black Friday", "state": "running", "done": 40, "total": 160, "unit": "people", "detail": "Whatsapp", "at": NOW, "link": "/broadcasts"}],
                "problems": [{"key": "failed:x", "title": "3 messages didn't send", "detail": "This person has never messaged your WhatsApp", "at": NOW, "link": "/inbox"}],
                "today": {"messagesIn": 12, "messagesOut": 9, "newContacts": 256, "orders": 2, "followupsSent": 1},
                "recent": [{"action": "whatsapp_history_imported", "entity": "workspace", "detail": {"messages": 5797, "chats": 256, "tagged": 40}, "at": NOW, "by": None},
                           {"action": "whatsapp_device_link_started", "entity": "workspace", "detail": {"method": "qr"}, "at": AGO(0.2), "by": "Ademola Adeniran"}]}))
        if fn == "wa_link_overview":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"workerOnline": FIX.get("wa_worker", False), "cloudNumber": False, "whatsappContacts": 2, "withoutOrder": 1}))
        if fn == "link_whatsapp_device":
            FIX["wa_links"] = [{"phone": body.get("p_phone"), "method": body.get("p_method"), "status": "waiting", "pairing_code": "ABCD1234", "qr": None, "code_at": NOW, "wa_name": None,
                                "history_status": None, "history_messages": 0, "history_chats": 0, "tagged": 0, "last_seen_at": NOW, "last_error": None, "connected_at": None}]
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"phone": body.get("p_phone"), "workerOnline": False}))
        if fn == "unlink_whatsapp_device":
            FIX["wa_links"] = []
            return await route.fulfill(status=200, headers=hdr, body=json.dumps("removed_check_phone"))
        if fn == "tag_chats_by_product":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"tagged": 2, "products": 2}))
        if fn == "admin_is":
            return await route.fulfill(status=200, headers=hdr, body="true")
        if fn == "admin_overview":
            return await route.fulfill(status=200, headers=hdr, body=json.dumps({"totals": {"businesses": 2, "paying": 1, "trialsActive": 1, "suspended": 0, "mrr": 60000, "orders30d": 12, "messages24h": 30},
                "businesses": [{"id": WS, "name": "Glow Naturals", "plan": "trial", "createdAt": AGO(48), "trialEndsAt": AGO(-120), "renewsAt": None, "active": True, "suspended": False, "suspendedReason": None, "owner": "ademola@shop.ng", "members": 2, "contacts": 3, "orders30d": 3, "lastActivity": AGO(1), "whatsapp": True, "ai": True},
                               {"id": str(uuid.uuid4()), "name": "Kano Fabrics", "plan": "growth", "createdAt": AGO(400), "trialEndsAt": None, "renewsAt": AGO(-200), "active": True, "suspended": False, "suspendedReason": None, "owner": "musa@kano.ng", "members": 4, "contacts": 900, "orders30d": 9, "lastActivity": AGO(3), "whatsapp": True, "ai": False}]}))
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
        qid = (q.get("id") or [""])[0]
        out = {"id": qid[3:] if req.method == "PATCH" and qid.startswith("eq.") else str(uuid.uuid4())}
        return await route.fulfill(status=201 if req.method == "POST" else 200, headers=hdr, body=json.dumps(out if accept_one else [out]))
    return await route.fulfill(status=404, headers=hdr, body="{}")


# Meta's sign-up window, faked: it reports the WhatsApp account to the opener, then returns to Bizriva's page with a code.
META_DIALOG = []
FAKE_DIALOG = """<script>const q=new URLSearchParams(location.search);
window.opener&&window.opener.postMessage(JSON.stringify({type:'WA_EMBEDDED_SIGNUP',event:'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',version:3,data:{waba_id:'666000111'}}),'*');
setTimeout(()=>{location.href=q.get('redirect_uri')+'?code=AQD-fake-code-123456&state='+q.get('state')},150);</script>"""

async def fake_dialog(route):
    META_DIALOG.append(route.request.url)
    await route.fulfill(status=200, headers={"Content-Type": "text/html"}, body=FAKE_DIALOG)

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
        await ctx.route(re.compile(r"https://www\.facebook\.com/v21\.0/dialog/oauth.*"), fake_dialog)
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
        await pg.get_by_text("BZ-1002").first.click(); await pg.wait_for_timeout(500)
        h = await pg.get_by_role("dialog").inner_text()
        ok("an order's history comes from the server's log, with who did it", "Order BZ-1002 placed" in h and "Order BZ-1002: Confirmed — Chidi" in h, h[-300:])
        await pg.get_by_role("button", name="Change order").click()
        ed = pg.get_by_role("dialog", name=re.compile("Change order BZ-1002"))
        await ed.get_by_label("Item 1 quantity").fill("2"); await ed.get_by_label("Delivery fee").fill("3000")
        await ed.get_by_role("button", name="Save changes").click(); await pg.wait_for_timeout(300)
        ok("a product with options needs the option chosen", "Choose which option of Glow Body Cream" in await ed.inner_text())
        await ed.get_by_label("Item 1 option").click(); await pg.get_by_role("option", name=re.compile("500ml")).click()
        ok("changing an order shows the new total from catalogue prices", "₦39,000" in await ed.inner_text())
        await ed.get_by_role("button", name="Save changes").click(); await pg.wait_for_timeout(1000)
        eo = [w for w in writes if w[0] == "rpc" and w[1] == "edit_order"]
        ok("and the server re-prices it (only product, option and quantity are sent)", len(eo) == 1 and eo[0][2]["p_order"] == O2 and eo[0][2]["p_items"] == [{"product_id": P1, "variant_id": "5b0f6a10-2c3d-4e5f-8a9b-0c1d2e3f4a50", "quantity": 2}] and eo[0][2]["p_delivery_fee"] == 3000, eo)
        await pg.get_by_role("button", name="Cancel", exact=True).click()
        cd = pg.get_by_role("dialog", name=re.compile("Cancel order BZ-1002"))
        ok("cancelling needs a reason", await cd.get_by_role("button", name="Cancel order").is_disabled())
        await cd.get_by_role("button", name="Out of stock").click(); await cd.get_by_role("button", name="Cancel order").click(); await pg.wait_for_timeout(1000)
        ok("and sends it to the server to keep in the history", any(w[0] == "rpc" and w[1] == "cancel_order" and w[2] == {"p_order": O2, "p_reason": "Out of stock"} for w in writes))
        await pg.keyboard.press("Escape")

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
        await pg.get_by_role("row", name=re.compile("Glow Body Cream")).get_by_role("button", name="Edit").click()
        dlg = pg.get_by_role("dialog")
        ok("a product's options load from the server", await dlg.get_by_label("Option 1 name").input_value() == "500ml" and await dlg.get_by_label("Option 1 price").input_value() == "18000")
        await dlg.get_by_role("button", name="Add option").click()
        await dlg.get_by_label("Option 2 name").fill("1 litre"); await dlg.get_by_label("Option 2 price").fill("30000"); await dlg.get_by_label("Option 2 stock").fill("4")
        await dlg.get_by_role("button", name="Save changes").click(); await pg.wait_for_timeout(1200)
        ok("saving keeps the old option and adds the new one with its own price and stock",
           wrote("PATCH", "product_variants", lambda b: b.get("name") == "500ml" and b.get("price") == 18000)
           and wrote("POST", "product_variants", lambda b: b.get("name") == "1 litre" and b.get("price") == 30000 and b.get("stock") == 4 and b.get("product_id") == P1))

        await ready("/media")
        ok("the media library shows the real photo, linked to its product", await pg.locator("main img[alt='glow.jpg']").count() == 1)
        await pg.locator("main input[type=file]").set_input_files({"name": "shea jar.png", "mimeType": "image/png", "buffer": base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")})
        await pg.wait_for_timeout(1500)
        upm = [w for w in writes if w[0] == "upload" and "/out/media/" in w[1]]
        ok("uploading puts the file in the business's private media folder", len(upm) == 1 and upm[0][1].startswith(f"chat-media/{WS}/out/media/"), upm)
        ok("and records it in the library", wrote("POST", "media_assets", lambda b: b.get("kind") == "image" and str(b.get("storage_path", "")).startswith(f"{WS}/out/media/") and b.get("name") == "shea jar.png"))

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

        # Bizriva's Meta app is switched on: one-click connect that keeps the phone app.
        FIX["platform"] = {"appId": "123456789012", "configId": "987654321098", "ready": True}
        FIX["whatsapp_numbers"] = []
        await ready("/integrations")
        keep = pg.get_by_role("button", name="Connect the WhatsApp Business app I already use")
        ok("owner sees the two ways to connect with Meta, own-app keys tucked away", await keep.count() == 1 and await pg.get_by_role("button", name="Connect a new number").count() == 1
           and await pg.get_by_role("form", name="Connect WhatsApp").count() == 0)
        await keep.click(); await pg.wait_for_timeout(3000)
        from urllib.parse import urlparse, parse_qs
        dq = parse_qs(urlparse(META_DIALOG[0]).query) if META_DIALOG else {}
        ok("Meta's window opens for the phone-app number, with Bizriva's app, sign-up configuration and return page",
           dq.get("client_id") == ["123456789012"] and dq.get("config_id") == ["987654321098"] and dq.get("response_type") == ["code"]
           and json.loads(dq["extras"][0])["featureType"] == "whatsapp_business_app_onboarding" and dq["redirect_uri"][0].endswith("/meta/callback"), dq)
        ob = [w for w in writes if w[0] == "fn" and w[1] == "whatsapp-onboard"]
        ok("the one-time code, the same return page and the account go to the server, signed in", len(ob) == 1 and ob[0][2] == {"workspace": WS, "code": "AQD-fake-code-123456", "redirect_uri": dq["redirect_uri"][0], "waba_id": "666000111"} and ob[0][3].startswith("Bearer "), ob[:1])
        t = await pg.locator("main").inner_text()
        ok("then it shows the number stays on the phone and the chats coming in", "still works on your phone" in t and "Also on your phone" in t and "Bringing in your chats from the phone… 40%" in t
           and "1,200 messages from 85 chats · 310 contacts" in t and "functions/v1/whatsapp-webhook" not in t)

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
        await ready(f"/inbox?c={V3}")
        await pg.get_by_label("Assign this chat to").select_option(label="Nkechi Eze"); await pg.wait_for_timeout(800)
        ok("transfer a chat to a teammate", wrote("PATCH", "conversations", lambda b: b.get("assigned_to") == NKECHI))
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
        up = [w for w in writes if w[0] == "upload" and "/out/media/" not in w[1]]
        ok("attaching uploads into this business's out/ folder", len(up) == 1 and up[0][1].startswith(f"chat-media/{WS}/out/") and up[0][1].endswith("-glow-cream.png"), up[-1:] )
        ok("and queues it with the typed caption", wrote("POST", "messages", lambda b: b.get("media_kind") == "image" and b.get("body") == "Here is the cream" and str(b.get("media_path", "")).startswith(f"{WS}/out/")))
        await pg.get_by_role("button", name="Send product").click()
        await pg.get_by_role("button", name=re.compile("Glow Body Cream")).click(); await pg.wait_for_timeout(1000)
        ok("a product card goes out with its photo, price and options", wrote("POST", "messages", lambda b: b.get("media_path") == f"{WS}/out/media/abc-glow.jpg" and "Glow Body Cream" in (b.get("body") or "") and "500ml" in (b.get("body") or "")))
        ok("AI-written messages are labelled", "ai reply" in (await pg.locator("main").inner_text()).lower())

        await ready("/analytics")
        t = await pg.locator("main").inner_text()
        rt = pg.get_by_role("table", name="Response times by person")
        ok("analytics shows real response times: AI, each agent, and time to confirm orders", await rt.count() == 1 and "10 min" in await rt.inner_text() and "45 min · 100% on time" in await rt.inner_text() and "6 min" in t + await pg.locator("main").inner_text())
        ok("analytics counts the real orders", "Luxe" not in t and ("26,500" in t or "₦26.5K" in t or "26.5K" in t), t[:400])
        await ready("/team")
        t = await pg.locator("main").inner_text()
        ok("team shows the real agents", "Chidi" in t and "Musa Abdullahi" not in t)

        await ready("/ads")
        t = await pg.locator("main").inner_text()
        ok("ads show results per ad: delivered revenue, spend, ROAS and cost per delivered order", "Glow cream CTWA" in t and "4.00×" in t and "₦20,000" in t and "₦5,000" in t and "Not from an ad: 1 orders" in t)
        laf = pg.get_by_role("form", name="Link Meta ad account")
        await laf.get_by_label("Ad account ID").fill("1234567890"); await laf.get_by_label(re.compile("Access token")).fill("EAAB" + "t" * 40)
        await laf.get_by_role("button", name="Link").click(); await pg.wait_for_timeout(800)
        ok("linking the ad account sends act_ id and token to the server", any(w[0] == "rpc" and w[1] == "save_meta_token" and w[2].get("p_ad_account") == "act_1234567890" for w in writes) and ("t" * 40) not in await pg.locator("main").inner_text())

        await ready("/automation")
        apf = pg.get_by_role("form", name="AI planner")
        await apf.get_by_role("textbox").fill("Win back customers who haven't ordered in 60 days")
        await apf.get_by_role("button", name="Make a plan").click(); await pg.wait_for_timeout(1200)
        ap = [w for w in writes if w[0] == "fn" and w[1] == "ai-planner"]
        t = await pg.get_by_role("article", name="Plan").inner_text()
        ok("the AI planner asks the server with the goal, signed in, and shows the plan with drafts", len(ap) == 1 and ap[0][2].get("workspace_id") == WS and ap[0][3].startswith("Bearer ") and "Win back old buyers" in t and "Hi {{name}}, we miss you." in t and "Call the rest" in t)

        await ready("/billing")
        t = await pg.locator("main").inner_text()
        ok("billing shows the real plan, days left and usage against the limits", "Current plan: Trial" in t and "days left" in t and "3 of 500" in t and "40 of 1,000" in t)
        await pg.get_by_role("button", name="Choose Growth").click(); await pg.wait_for_timeout(1500)
        bl = [w for w in writes if w[0] == "fn" and w[1] == "billing"]
        ok("choosing a plan asks the server for a Paystack checkout, signed in", len(bl) == 1 and bl[0][2] == {"workspace_id": WS, "plan": "growth"} and bl[0][3].startswith("Bearer "))
        await ready("/admin")
        t = await pg.locator("main").inner_text()
        ok("Super Admin sees every business with plan and health", "Kano Fabrics" in t and "Glow Naturals" in t and "₦60,000" in t)
        kano = pg.get_by_role("listitem", name="Kano Fabrics")
        await kano.get_by_label("Reason to suspend Kano Fabrics").fill("Chargeback fraud"); await kano.get_by_role("button", name="Suspend").click(); await pg.wait_for_timeout(800)
        ok("suspending needs a reason and goes to the server", any(w[0] == "rpc" and w[1] == "admin_suspend" and w[2].get("p_suspend") is True and w[2].get("p_reason") == "Chargeback fraud" for w in writes))
        mf = pg.get_by_role("form", name="Bizriva Meta app")
        ok("Super Admin can switch on WhatsApp for every business, with the webhook to paste into Meta", await mf.count() == 1 and "pv-0123456789abcdef" in await pg.locator("main").inner_text() and "Not switched on" in await pg.locator("main").inner_text())
        await mf.get_by_label("Meta App ID").fill("123456789012"); await mf.get_by_label("Configuration ID").fill("987654321098"); await mf.get_by_label("Meta app secret").fill("z" * 32)
        await mf.get_by_role("button", name="Save").click(); await pg.wait_for_timeout(800)
        ok("the Meta app is saved through the server, secret not shown back", any(w[0] == "rpc" and w[1] == "admin_set_meta" and w[2] == {"p_app_id": "123456789012", "p_config_id": "987654321098", "p_app_secret": "z" * 32} for w in writes) and ("z" * 32) not in await pg.locator("main").inner_text())

        await ready("/templates")
        t = await pg.locator("main").inner_text()
        ok("templates show Meta's reason for a rejection", "doesn't match the chosen type" in t)
        await pg.get_by_role("button", name="Submit to Meta").click(); await pg.wait_for_timeout(1000)
        ok("Submit to Meta asks the server to send it for review", wrote("PATCH", "message_templates", lambda b: b.get("status") == "submitted" and b.get("name") == "promo_sale"))
        await pg.get_by_role("button", name="Edit order_confirm").click()
        ok("on real data nobody can mark a template approved by hand", await pg.get_by_role("dialog").get_by_role("combobox", name="Approval").count() == 0)
        await pg.keyboard.press("Escape")

        await ready("/cod")
        t = await pg.locator("main").inner_text()
        ok("COD check shows the server's risk and reasons", "Phone number looks incomplete" in t and "No delivery address" in t)

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

        wc = pg.get_by_role("form", name="Website chat")
        ok("owner sees website chat on real data, off to start", await wc.count() == 1 and "Turn on website chat" in await wc.inner_text())
        await wc.get_by_role("switch", name="Website chat on").click(); await pg.wait_for_timeout(800)
        ok("turning it on asks the server for a key", any(w[0] == "rpc" and w[1] == "set_webchat" and w[2].get("p_on") is True for w in writes))
        FIX["workspaces"]["webchat_key"] = "k" * 32
        await ready("/integrations")
        ok("then shows the script to paste and the chat link", "/webchat.js" in await pg.get_by_label("Website script").inner_text() and "/chat/" + "k" * 32 in await pg.get_by_label("Chat link").inner_text())

        smf = pg.get_by_role("form", name="Connect SMS")
        ok("owner sees Connect SMS on real data", await smf.count() == 1)
        await smf.get_by_label(re.compile("Termii API key")).fill("TL" + "s" * 30); await smf.get_by_label("Sender ID").fill("GlowNG")
        await smf.get_by_role("button", name="Connect SMS").click(); await pg.wait_for_timeout(1200)
        sk = [w for w in writes if w[0] == "rpc" and w[1] == "save_sms_key"]
        ok("the Termii key and sender go to the server, with SMS backup on", len(sk) == 1 and sk[0][2].get("p_sender") == "GlowNG" and sk[0][2].get("p_fallback") is True and ("s" * 30) not in await pg.locator("main").inner_text())

        mpf = pg.get_by_role("form", name="Connect Facebook Page")
        ok("owner sees Connect Facebook Page on real data (one card for Messenger and Instagram)", await mpf.count() == 1 and await pg.get_by_text("Instagram Direct").count() == 0)
        await mpf.get_by_label("Page ID").fill("1029384756"); await mpf.get_by_label("Page name").fill("Glow Naturals")
        await mpf.get_by_label(re.compile("Instagram account ID")).fill("17841400000000")
        await mpf.get_by_label(re.compile("Page access token")).fill("EAA" + "p" * 60); await mpf.get_by_label(re.compile("App secret")).fill("a" * 32)
        await mpf.get_by_role("button", name="Connect Page").click(); await pg.wait_for_timeout(1500)
        sp = [w for w in writes if w[0] == "rpc" and w[1] == "save_meta_page"]
        t = await pg.locator("main").inner_text()
        ok("Page keys go to the server once, then it shows the callback and verify token", len(sp) == 1 and sp[0][2].get("p_ig_id") == "17841400000000" and "meta-webhook" in t and "mv-abcdef123456" in t and ("p" * 60) not in t)
        ok("and the latest leads from ads", "Tolu Ade" in await pg.get_by_role("list", name="Latest leads from ads").inner_text())

        vis = await ctx.new_page()
        await vis.goto(B + "/chat/" + "k" * 32)
        try: await vis.get_by_text("Hi! Ask us anything.").wait_for(timeout=15000)
        except Exception: pass
        ok("a visitor sees the business and its greeting", "Glow Naturals" in await vis.locator("body").inner_text() and "Hi! Ask us anything." in await vis.locator("body").inner_text())
        await vis.get_by_label("Your name").fill("Bisi"); await vis.get_by_role("button", name="Start chat").click(); await vis.wait_for_timeout(300)
        ok("a phone number is asked for before chatting", "phone number" in (await vis.locator("body").inner_text()).lower())
        await vis.get_by_label("Phone number").fill("0803 123 4567"); await vis.get_by_role("button", name="Start chat").click(); await vis.wait_for_timeout(800)
        st = [w for w in writes if w[0] == "webchat" and w[1] == "start"]
        ok("starting makes a secret token in the visitor's browser", len(st) == 1 and len(st[0][2].get("token", "")) >= 32 and st[0][2].get("name") == "Bisi")
        await vis.get_by_role("textbox", name="Message").fill("Do you have shea butter?"); await vis.get_by_role("button", name="Send").click(); await vis.wait_for_timeout(4000)
        t = await vis.locator("body").inner_text()
        ok("the visitor's message goes in and the reply comes back", any(w[0] == "webchat" and w[1] == "send" and w[2].get("text") == "Do you have shea butter?" for w in writes) and "Yes! It's ₦6,000." in t)
        ok("the visitor page has no app menus", await vis.get_by_role("navigation").count() == 0)
        await vis.close()

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

        await ready("/crm/imports?t=chats")
        ok("chat import says it saves to the real customer list", await pg.get_by_text(re.compile("Saved to your real customer list")).count() == 1)
        await pg.get_by_text("Or paste the chat text").click()
        await pg.get_by_role("button", name="Try a sample chat").click(); await pg.wait_for_timeout(400)
        nc = pg.get_by_role("button", name="New contact")
        if await nc.count(): await nc.first.click()
        await pg.get_by_role("button", name="Import chat").click(); await pg.wait_for_timeout(1500)
        ic = [w for w in writes if w[0] == "rpc" and w[1] == "import_chat"]
        ok("importing a chat on real data goes to the server, with who sent each message", len(ic) == 1 and ic[0][2].get("p_workspace") == WS and len(ic[0][2]["p_messages"]) > 3
           and any(m["out"] for m in ic[0][2]["p_messages"]) and any(not m["out"] for m in ic[0][2]["p_messages"]) and ic[0][2].get("p_file") == "WhatsApp Chat with Chioma Eze.txt", ic[:1])
        ok("and shows how many messages came in", "messages imported from WhatsApp Chat with Chioma Eze.txt" in await pg.locator("main").inner_text())

        # Live status: everything running, waiting and broken, in one place, plus the top-bar pill.
        await ready("/activity")
        t = await pg.locator("main").inner_text()
        ok("live status lists problems, work in progress with counts, connections, today and recent activity",
           "3 messages didn't send" in t and "Bringing in old WhatsApp chats" in t and "5,797 messages" in t and "40 of 160 people" in t
           and "Life Care" in t and "Old WhatsApp chats brought in: 5,797 messages from 256 chats" in t and "Ademola Adeniran" in t, t[:300])
        ok("the campaign shows a real progress bar", await pg.get_by_role("progressbar", name="Sending campaign: Black Friday").get_attribute("aria-valuenow") == "25")
        pill = pg.get_by_role("link", name=re.compile("^Live status: "))
        ok("the top bar says there's a problem and opens live status", await pill.count() == 1 and "1 problem" in await pill.inner_text())

        # WhatsApp Growth: link the number already in use with a pairing code (no Meta), then save every customer.
        FIX["wa_links"] = []
        FIX["contact_identities"] = [{"external_id": "2348031234567", "contacts": {"name": "Ada Obi", "tags": ["Asked about: Glow Body Cream", "No order yet"]}},
                                     {"external_id": "2348051112222", "contacts": {"name": None, "tags": []}}]
        await ready("/whatsapp")
        t = await pg.locator("main").inner_text()
        ok("WhatsApp Growth says honestly when Bizriva's WhatsApp server is off", "server isn't switched on yet" in t)
        lf = pg.get_by_role("form", name="Link my WhatsApp")
        await lf.get_by_label("Your WhatsApp number").fill("0803 123 4567")
        await lf.get_by_role("button", name="Link my WhatsApp").click(); await pg.wait_for_timeout(500)
        ok("linking needs the risk box ticked first", not any(w[0] == "rpc" and w[1] == "link_whatsapp_device" for w in writes) and "understand the risk" in await pg.locator("main").inner_text())
        await lf.get_by_label("I understand the risk").click()
        await lf.get_by_role("button", name="Link my WhatsApp").click(); await pg.wait_for_timeout(1500)
        lk = [w for w in writes if w[0] == "rpc" and w[1] == "link_whatsapp_device"]
        ok("the number goes to the server in international form, with the method and the risk accepted", len(lk) == 1 and lk[0][2] == {"p_workspace": WS, "p_phone": "2348031234567", "p_method": "code", "p_risk_ack": True}, lk[:1])
        ok("then the pairing code shows with the steps in WhatsApp", await pg.get_by_label("Pairing code").inner_text() == "ABCD-1234" and "Link with phone number instead" in await pg.locator("main").inner_text())
        await pg.get_by_role("button", name="Tag chats by product").click(); await pg.wait_for_timeout(800)
        ok("tag chats by product runs on the server and says how many", any(w[0] == "rpc" and w[1] == "tag_chats_by_product" for w in writes) and "2 customers tagged" in await pg.locator("main").inner_text())
        async with pg.expect_download() as dl:
            await pg.get_by_role("button", name="Download contacts (.vcf)").click()
        vcf = open(await (await dl.value).path(), encoding="utf-8").read()
        ok("contacts download as a .vcf, named with the product, nameless ones as Customer 1234",
           "FN:Ada Obi - Glow Body Cream" in vcf and "TEL;TYPE=CELL:+2348031234567" in vcf and "FN:Customer 2222" in vcf, vcf[:200])
        await pg.get_by_role("button", name="Cancel").click(); await pg.wait_for_timeout(1000)
        ok("cancel unlinks and says how to finish on the phone", any(w[0] == "rpc" and w[1] == "unlink_whatsapp_device" for w in writes) and "Linked devices" in await pg.locator("main").inner_text())

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
