# Practice Mode click-through tests

Two suites drive a real browser through every page and the main flows, then check phones for sideways scrolling, dark mode, and the console for errors.

| File | Covers | Last run |
| --- | --- | --- |
| `practice_qa.py` | Dashboard, Today, Inbox, CRM (Customer 360, pipeline, tasks, duplicates, imports), Orders, COD, Products, search, persistence, reset | 2026-11-02 · 46/46 |
| `practice_qa_gaps.py` | The 14 items carried over from Sandala and Kobolink: inbox filters, details from chat, ad source, product card, alerts, product fields, contact filters, currency, chat display, couriers, lead form, New menu | 2026-11-04 · 25/25 |
| `practice_qa_review.py` | The 4 Nov review: Order Forms (packages, live total, saved orders, duplicate events, report, export), deposits, balance request, invoice, complaints, quick replies, reply library filters, Calendar, share kit QR, product CSV import, policy starters, setup checklist, ready-made workflows, Coming Later, WhatsApp chat history import, public landing page | 2026-11-05 · 48/48 |
| `practice_qa_brief.py` | Money Brief page, Dashboard card and in-app switch, WhatsApp text; customer memory (saved facts, birthday notice, remember from chat, add and forget); birthdays on the calendar; AI agent greets known customers and uses what they like; payment link in chat; TikTok card; birthday replies; landing sections | 2026-11-05 · 56/56 (incl. Website & Forms, Meta Ads, payments in chat, receipts and care guides) |
| `practice_qa_loopholes.py` | Public order form page (no app chrome, closed forms say so), real form link and iframe embed, Edge Function intake address, strong secret keys, payment notification address | 2026-11-06 · 8/8 |
| `rules.test.ts` (`bun test tests/rules.test.ts`) | Order status rules shared with the database, which orders can take money, CSV formula guard | 2026-11-06 · 8/8 |
| `check_functions.py` | The intake Edge Function's copy of the normaliser matches the app's | 2026-11-06 · 1/1 |
| `../supabase/tests/loopholes_and_rules.sql` | Live database: owner protection, invites, deletes, money integrity, order rules, COD before dispatch, same-business links, server-side receipts/messages/lead stages, payment webhooks applied once, website intake and public form pricing. Always rolls back | 2026-11-06 · 68/68 |
| `practice_qa_pod.py` | Pay-on-delivery operations: call list and order sharing, late-order alerts and reassigning, on duty, sharing rules, leaderboard and commission payout, bulk reassign / delivery slips / export, send to rider on WhatsApp, the no-login partner link, partners with fees per state, who-owes-what statements, true profit and success by state, order follow-ups, email campaigns, Money Brief voice, phone layout | 2026-11-06 · 46/46 |
| `../supabase/tests/pod_ops.sql` | Live database: order sharing (least busy, round robin, by state), reassign rights, append-only call records, uncalled orders moved, commission only on delivered and paid orders, partner routing and fees, hashed delivery-link tokens, partner accept/deliver/fail, statements, campaigns. Always rolls back | 2026-11-06 · 45/45 |
| `practice_qa_modules.py` | Delivery, Riders, Payments, Inventory, Media, Store, AI agent (acceptance tests 2, 3, 4, 7, 15 in practice), Knowledge Base, Templates, Follow-ups, Broadcasts, Automation, History, Ads, Team, Integrations, Billing, Settings | 2026-11-02 · 61/61 |

```bash
bunx vite dev --host 127.0.0.1 --port 5173   # in one terminal
pip install playwright && playwright install chromium
python3 tests/practice_qa.py
python3 tests/practice_qa_modules.py
python3 tests/practice_qa_gaps.py
python3 tests/practice_qa_review.py
python3 tests/practice_qa_brief.py
python3 tests/practice_qa_loopholes.py
python3 tests/practice_qa_pod.py
bun test tests/rules.test.ts
python3 tests/check_functions.py
```

The first run after installing can fail on timing while the dev server prepares packages; run it again. Both suites reset the practice data before or after they run.
