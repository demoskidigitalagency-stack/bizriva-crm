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

## SMS
28. **SMS uses each business's own Termii account and approved sender ID**, and is send-only (Nigerian sender IDs can't receive replies).
29. **SMS backup is on by default:** an order or delivery update that WhatsApp couldn't deliver — or that would wait because WhatsApp isn't connected (after 2 minutes) — goes once by SMS. Marketing is never sent by SMS backup.
30. **Order updates use Termii's DND route** so they reach numbers on Do-Not-Disturb (it costs more per SMS); other SMS use the normal route and never go to someone who opted out. Long texts are cut at 3 SMS pages.
31. Order updates now also reach customers who never chatted (e.g. from an order form): they go to WhatsApp first and fall back to SMS.

## Facebook Page: Messenger, Instagram and lead forms
32. **One connection for the Facebook Page covers Messenger, Instagram DMs (from the Instagram account linked to the Page) and ad lead forms.** It uses the business's own Meta app and a long-lived Page token, kept in the vault.
33. **A lead-form submission becomes a customer (matched by phone or email), a lead with the ad it came from, and a "Call this new lead" task** for the on-duty agent with the fewest open chats, due in 15 minutes. No automatic WhatsApp message — that would need an approved template and their consent.
34. **Messenger and Instagram replies only go out within 24 hours of the customer's last message** (Meta's rule); later ones are marked failed with the reason. The AI answers these chats like WhatsApp.
35. New Messenger/Instagram customers get their name from Meta once; customer photos and files are copied into the private storage.

## Plans, limits and Super Admin
36. **Plans and prices** (₦/month, changeable by a Super Admin): Trial free for 14 days · Starter ₦25,000 · Growth ₦60,000 · Scale ₦150,000, with customer, seat, broadcast-message and storage limits.
37. **Limits never lose a sale:** customers who message you are always saved, even over the customer limit; replies, order updates and the AI never count against the message allowance. Limits stop staff adding customers, inviting teammates, sending a broadcast that wouldn't fit, and uploading media.
38. **When a trial ends, or a paid plan is 3 days overdue, the AI assistant and broadcasts pause** until a plan is paid; inbox, orders and everything else keep working. Existing businesses got a 14-day trial counted from when they were created.
39. **Plans are paid through Bizriva's own Paystack account** (`BIZRIVA_PAYSTACK_SECRET` and `APP_URL` as Edge Function secrets; Paystack webhook → `/functions/v1/billing/paystack`). Each payment adds 30 days. Only the owner pays.
40. **Super Admins are added by hand** (`insert into platform_admins …` in the SQL editor). They see every business, set plans and trial days, and suspend (with a reason) or restore — each change is recorded in that business's history.

## AI planner
41. **The workflow planner runs on Claude** (moved off Lovable's AI service): the business's own Anthropic key when they've added one, otherwise Bizriva's (`ANTHROPIC_API_KEY` Edge Function secret). Model `claude-sonnet-5-5` unless `AI_PLANNER_MODEL` is set.
42. **It only sees counts** (customers, consent, orders, chats, stock, connected channels) — never names, phone numbers or message text. 20 plans a day per business; it pauses with the AI when the plan has ended. Every plan is saved for the team.

## Ad attribution
43. **A customer is credited to the first ad that brought them** (click-to-WhatsApp, click-to-Messenger/Instagram, or an instant form). Later ads don't steal the credit.
44. **ROAS and cost per order count delivered orders only** — with pay on delivery an order isn't money until it arrives. Cancelled, refused and returned orders are shown as "lost" for each ad.
45. **Spend comes from the business's own Meta ad account every 4 hours** (last 7 days, per ad), shown in the ad account's currency. The token needs `ads_read`.

## Response times
46. **Response times are clock minutes, nights and weekends included** — that's what the customer feels. A customer's burst of messages counts as one wait, from their first message to our next reply; order updates and receipts don't count as replies.
47. "On time" for confirming an order uses the business's own "call within" setting (default 2 hours).
