# Decisions to review

Choices made while finishing the backend unattended (6 Nov 2026). Each is easy to change — tell me which to flip.

## Checkout in the chat
1. **The AI never writes prices or totals.** It collects the items and details; the server prices them from the catalogue (promo price if set), applies the delivery fee (free above "free delivery over") and writes the summary.
2. **Only a clear yes creates the order** — "yes", "yes please", "ok", "oya", "confirm", 👍 and similar, decided by a fixed rule, not the AI. "Yes but…", "not yet" etc. don't count.
3. **AI orders are always pay on delivery and start as "pending verification"**, so an agent still calls to confirm before dispatch, like every other order.
4. **A summary expires after 24 hours**; a late "yes" hands the chat to the team instead of ordering.
5. Out-of-stock or unknown products are refused politely; the customer is asked to choose something else.
