# Decisions to review

Choices made while finishing the backend unattended (6 Nov 2026). Each is easy to change — tell me which to flip.

## Checkout in the chat
1. **The AI never writes prices or totals.** It collects the items and details; the server prices them from the catalogue (promo price if set), applies the delivery fee (free above "free delivery over") and writes the summary.
2. **Only a clear yes creates the order** — "yes", "yes please", "ok", "oya", "confirm", 👍 and similar, decided by a fixed rule, not the AI. "Yes but…", "not yet" etc. don't count.
3. **AI orders are always pay on delivery and start as "pending verification"**, so an agent still calls to confirm before dispatch, like every other order.
4. **A summary expires after 24 hours**; a late "yes" hands the chat to the team instead of ordering.
5. Out-of-stock or unknown products are refused politely; the customer is asked to choose something else.

## Follow-ups
6. **STOP blocks every follow-up**, including service ones (failed delivery, couldn't reach you) — safer than guessing. Order emails and confirmations still go out.
7. **One follow-up per customer per day**, across all rules (`followUpDailyCap` in settings, default 1).
8. **When a teammate takes over a chat, chat follow-ups stop**; order follow-ups (rebook delivery, couldn't reach you) still run.
9. **Over 24 hours with no approved template = not sent**, recorded as "held back" with the reason, so you can see which rules need a template.
10. The reminder clock starts at our first message after the customer's last one, so our own reminders never restart it.

## Broadcasts
11. WhatsApp broadcasts go to customers whose **latest** marketing choice is yes (a later STOP wins). Customers inside 24 hours get the text; everyone else gets the campaign's template.

## COD risk and leads
12. **A high-risk cash-on-delivery order (score 50+) needs an owner or manager to confirm it**; sales agents see the reasons and escalate. The threshold for "high value" is ₦150,000 (`riskHighValue` in settings).
13. Risk never counts "new customer" on its own — first orders only add 5 points alongside another reason.
14. Lead stages only move forward automatically (and back up from "unresponsive" when the customer writes again). Staff can still move a lead by hand.

## Chats
15. **Handed-over chats go to on-duty sales or support first**, the one with the fewest open team chats; owners and managers only when no agent is on duty.

## Catalogue and media
16. **Product options (variants) have their own price and stock.** When a product has options the AI must ask which one; an out-of-stock option is refused. An option already on past orders can't be deleted — set its stock to 0.
17. **Library photos sit in the private chat-media storage** (`<business>/out/media/…`), never public. WhatsApp gets a one-hour link when sending. Removing a file from the library removes the record; the stored file stays (deleting stored files needs its own permission, added later with plan storage limits).
18. **The AI sends at most 3 photos per reply, and only of products that really have one** — it can't claim to send a picture that doesn't exist. It sends the product's first image.

## WhatsApp templates
19. **Only Meta can approve a template on real data.** Staff press "Submit to Meta"; the server sends it and checks back every 5 minutes. Editing a submitted or approved template sends it back to draft (Meta reviews every change).
20. **Template variables are fixed:** {{1}} = customer's first name, {{2}} = their latest order number, {{3}} = the product on it. The server fills them when sending.
21. **Pidgin templates go to WhatsApp as English** (WhatsApp has no Pidgin language code); the words stay in Pidgin. So an English and a Pidgin template can't share a name.

## Orders
22. **An order can be changed until it's dispatched** (items, options, quantities, delivery fee, address) by the owner, a manager or the agent it's assigned to. Prices always come from the catalogue — the screen only sends product, option and quantity. The old version is kept in the history.
23. **Only owners and managers can give a discount**, and a change can never bring the total below what the customer already paid.
24. **Cancelling needs a reason**, kept in the order's history and notes.

## Website chat
25. **Visitors give their name (and phone, unless you switch it off) before chatting**, so every web chat is a real customer record — matched to an existing customer by phone.
26. **A visitor only ever sees their own chat**, through a secret kept in their browser; clearing the browser starts a new chat. Limits: 20 messages a minute per visitor, 300 new visitors an hour per business.
27. **The AI answers website chats exactly like WhatsApp** (same rules, prices check, checkout). There's no 24-hour window on the website.
