# Practice Mode click-through test

Clicks through every page and the main flows (Customer 360, orders, COD verification, pipeline, tasks, merge, products, CSV import, search, persistence, reset), then checks phones for sideways scrolling and the console for errors.

```bash
bunx vite dev --host 127.0.0.1 --port 5173   # in one terminal
pip install playwright && playwright install chromium
python3 tests/practice_qa.py
```

Last run 2026-11-02: 46/46 passed. The merge check reports a false failure when more than 8 duplicate groups exist (the page shows 8 at a time); merging was confirmed separately by the contact count dropping by one.
