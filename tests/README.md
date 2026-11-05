# Practice Mode click-through tests

Two suites drive a real browser through every page and the main flows, then check phones for sideways scrolling, dark mode, and the console for errors.

| File | Covers | Last run |
| --- | --- | --- |
| `practice_qa.py` | Dashboard, Today, Inbox, CRM (Customer 360, pipeline, tasks, duplicates, imports), Orders, COD, Products, search, persistence, reset | 2026-11-02 · 46/46 |
| `practice_qa_gaps.py` | The 14 items carried over from Sandala and Kobolink: inbox filters, details from chat, ad source, product card, alerts, product fields, contact filters, currency, chat display, couriers, lead form, New menu | 2026-11-04 · 25/25 |
| `practice_qa_review.py` | The 4 Nov review: Order Forms (packages, live total, saved orders, duplicate events, report, export), deposits, balance request, invoice, complaints, quick replies, reply library filters, Calendar, share kit QR, product CSV import, policy starters, setup checklist, ready-made workflows, Coming Later, WhatsApp chat history import, public landing page | 2026-11-05 · 48/48 |
| `practice_qa_brief.py` | Money Brief page, Dashboard card and in-app switch, WhatsApp text; customer memory (saved facts, birthday notice, remember from chat, add and forget); birthdays on the calendar; AI agent greets known customers and uses what they like; payment link in chat; TikTok card; birthday replies; landing sections | 2026-11-05 · 31/31 (incl. Website & Forms) |
| `practice_qa_modules.py` | Delivery, Riders, Payments, Inventory, Media, Store, AI agent (acceptance tests 2, 3, 4, 7, 15 in practice), Knowledge Base, Templates, Follow-ups, Broadcasts, Automation, History, Ads, Team, Integrations, Billing, Settings | 2026-11-02 · 61/61 |

```bash
bunx vite dev --host 127.0.0.1 --port 5173   # in one terminal
pip install playwright && playwright install chromium
python3 tests/practice_qa.py
python3 tests/practice_qa_modules.py
python3 tests/practice_qa_gaps.py
python3 tests/practice_qa_review.py
python3 tests/practice_qa_brief.py
```

The first run after installing can fail on timing while the dev server prepares packages; run it again. Both suites reset the practice data before or after they run.
