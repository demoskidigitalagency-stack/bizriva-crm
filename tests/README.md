# Practice Mode click-through tests

Two suites drive a real browser through every page and the main flows, then check phones for sideways scrolling, dark mode, and the console for errors.

| File | Covers | Last run |
| --- | --- | --- |
| `practice_qa.py` | Dashboard, Today, Inbox, CRM (Customer 360, pipeline, tasks, duplicates, imports), Orders, COD, Products, search, persistence, reset | 2026-11-02 · 46/46 |
| `practice_qa_modules.py` | Delivery, Riders, Payments, Inventory, Media, Store, AI agent (acceptance tests 2, 3, 4, 7, 15 in practice), Knowledge Base, Templates, Follow-ups, Broadcasts, Automation, History, Ads, Team, Integrations, Billing, Settings | 2026-11-02 · 61/61 |

```bash
bunx vite dev --host 127.0.0.1 --port 5173   # in one terminal
pip install playwright && playwright install chromium
python3 tests/practice_qa.py
python3 tests/practice_qa_modules.py
```

The first run after installing can fail on timing while the dev server prepares packages; run it again. Both suites reset the practice data before or after they run.
