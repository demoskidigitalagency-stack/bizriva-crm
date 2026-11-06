# COD risk, lead scoring and stages — live-database tests (6 Nov 2026, rolled back)

Run 1 (setup as the server):
- incomplete phone + no address → high (55): "Phone number looks incomplete; No delivery address; First order" ✓
- complete details, first order → low, score 0 (never flagged just for being new) ✓
- an earlier refused delivery → next order 40 with "1 earlier delivery failed or returned" ✓
- "How much is the cream?" → lead created, stage high_intent, score 65 (with an open order) ✓

Run 2 (as real team members):
- sales agent cannot confirm the high-risk COD order — "High-risk order (…): an owner or manager must confirm it" ✓
- sales agent confirms a low-risk order ✓
- editing the risk by hand doesn't stick (recomputed on every change) ✓ — and the agent is still blocked ✓
- manager confirms the high-risk order ✓

Regression after the change: loopholes_and_rules.sql 68/68, pod_ops.sql 45/45.
