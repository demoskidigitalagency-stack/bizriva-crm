# Bizriva CRM — build status

Generated from `src/app/status.ts` and `src/app/modules.ts` by `bun run status`. Edit those, not this file.

| Track | Progress | |
| --- | ---: | --- |
| **Frontend — Practice Mode** (every page and button works on sample data) | **100%** | `████████████████████` |
| **Backend — Live** (works for real: auth, database, WhatsApp, AI) | **93%** | `███████████████████░` |

Modules: 36 of 36 practice ready · 0 partly working · 0 planned.

## Frontend track

### Modules — 100% (85% of the frontend)

✅ practice ready · 🟡 partly working · ⬜ planned

| | Group | Module | Phase | Status | From |
| --- | --- | --- | --- | --- | --- |
| ✅ | Overview | Dashboard | MVP | Practice ready | Bizriva, Sandala, Prompt |
| ✅ | Overview | Today | MVP | Practice ready | Bizriva |
| ✅ | Overview | Money Brief | MVP | Practice ready | Review 2026-11-04 |
| ✅ | Overview | Live status | MVP | Live | Review 2026-11-13 |
| ✅ | Overview | Calendar | MVP | Practice ready | Review 2026-11-04 |
| ✅ | Customers | Inbox | MVP | Practice ready | Sandala, Kobolink, Prompt |
| ✅ | Customers | CRM | MVP | Practice ready | Bizriva, Sandala, Prompt |
| ✅ | Sales | Orders | MVP | Practice ready | Kobolink, Prompt |
| ✅ | Sales | Call List | MVP | Practice ready | Review 2026-11-06 |
| ✅ | Sales | COD Verification | MVP | Practice ready | Sandala, Prompt |
| ✅ | Sales | Order Forms | MVP | Practice ready | Review 2026-11-04 |
| ✅ | Commerce | Products | MVP | Practice ready | Sandala, Kobolink, Prompt |
| ✅ | Commerce | Media Library | MVP | Practice ready | Prompt |
| ✅ | Commerce | Inventory | Later | Practice ready | Kobolink |
| ✅ | Commerce | Store | Later | Practice ready | Bizriva |
| ✅ | Delivery | Delivery | MVP | Practice ready | Kobolink, Prompt |
| ✅ | Delivery | Riders | Later | Practice ready | Kobolink |
| ✅ | Automation | AI Sales Agent | MVP | Practice ready | Kobolink, Prompt |
| ✅ | Automation | Knowledge Base | MVP | Practice ready | Prompt |
| ✅ | Automation | Follow-ups | MVP | Practice ready | Sandala, Prompt |
| ✅ | Automation | Templates | MVP | Practice ready | Prompt |
| ✅ | Automation | Broadcasts | Later | Practice ready | Sandala |
| ✅ | Automation | Automation Builder | Later | Practice ready | Bizriva, Prompt |
| ✅ | Automation | Workflow History | Later | Practice ready | Sandala, Prompt |
| ✅ | Growth | Ads and Attribution | Later | Practice ready | Kobolink, Prompt |
| ✅ | Growth | WhatsApp Growth | MVP | Live | Review 2026-11-13 |
| ✅ | Money | Payments | Later | Practice ready | Kobolink, Prompt |
| ✅ | Insights | Analytics | MVP | Practice ready | Kobolink, Prompt |
| ✅ | Workspace | Team and Roles | MVP | Practice ready | Kobolink, Prompt |
| ✅ | Workspace | Integrations | MVP | Practice ready | Kobolink, Prompt |
| ✅ | Workspace | Settings | Foundation | Practice ready | Sandala, Kobolink, Prompt |
| ✅ | Workspace | Billing | Later | Practice ready | Prompt |
| ✅ | Workspace | Build Progress | Foundation | Practice ready | Kobolink, Prompt |
| ✅ | Workspace | Website & Forms | MVP | Practice ready | Review 2026-11-05 |
| ✅ | Workspace | Coming Later | Later | Practice ready | Review 2026-11-04 |
| ✅ | Workspace | Help | Later | Practice ready | Bizriva |

### Cross-cutting — 100% (15% of the frontend)

- [x] bizriva-crm set up from repo 3 (Bizriva) shell, design system and data types _(2026-11-02)_
- [x] Appearance: Hybrid default, with Sandala, Kobolink and Bizriva as options _(2026-11-02)_
- [x] Unified navigation: every agreed menu present _(2026-11-02)_
- [x] Build Progress page and STATUS.md _(2026-11-02)_
- [x] Multi-workspace database schema drafted and isolation-tested _(2026-11-02)_
- [x] Practice data saved in the browser, with Reset sample data _(2026-11-02)_
- [x] Every link, search result and Today queue opens a real page _(2026-11-02)_
- [x] Crosswalk decisions agreed (menus, lead stages, order statuses, roles) _(2026-11-02)_ — See DECISIONS.md — prompt's 13 lead stages and 10 order statuses, 6 roles, own Supabase + Vercel
- [x] Click-through QA: every page on desktop and phone, light and dark, no console errors _(2026-11-02)_ — tests/practice_qa.py 46/46 and tests/practice_qa_modules.py 61/61
- [x] Money Brief, customer memory, payment links in chat, TikTok channel _(2026-11-05)_ — tests/practice_qa_brief.py 22/22; contact_facts table and brief settings applied to Supabase
- [x] Order messages: confirmation, dispatch with rider, receipt and how-to-use guide after delivery _(2026-11-05)_ — Follows Settings → Customer notifications; care guides per product with starters
- [x] Payments in the chat: customer account numbers, instant confirmation, receipts, matching, splits _(2026-11-05)_ — Practice with Paystack/Flutterwave/Monnify simulated; payment tables applied to Supabase
- [x] Meta Ads: connect, create ads (paused), start/pause, advice, sales back to Meta _(2026-11-05)_ — Practice flow; meta_links, ad_drafts and capi_events applied to Supabase. Live needs the Meta app keys in Vercel
- [x] Website & Forms: connect WordPress forms, WooCommerce, Shopify, Google Forms, Typeform, Jotform, Tally, Zapier _(2026-11-05)_ — Practice intake with field matching and duplicate skipping; connections tables applied to Supabase
- [x] Pay-on-delivery operations: agent call list and sharing, logistics partners with per-state fees and a no-login link, partner statements, commission and leaderboard, bulk actions, true profit, order follow-ups, email campaigns, Money Brief read aloud _(2026-11-06)_ — tests/practice_qa_pod.py 46/46; database rules: supabase/tests/pod_ops.sql 45/45 on the live database
- [x] Competitor and playbook review added (order forms, deposits, invoices, calendar, complaints, reply library, share kit, imports) _(2026-11-04)_ — tests/practice_qa_review.py 43/43. Backend-dependent and parked ideas are listed on Coming Later

## Backend track

| Phase | Share | Done | Progress |
| --- | ---: | ---: | --- |
| Phase 1 — Core communication | 30% | 9/10 | 91% |
| Phase 2 — AI and automation | 22% | 8/9 | 83% |
| Phase 3 — Sales and commerce | 22% | 9/9 | 100% |
| Phase 4 — More channels | 11% | 5/5 | 100% |
| Phase 5 — Intelligence and monetisation | 15% | 7/7 | 100% |
| Phase 6 — WhatsApp Growth (linked number) | 15% | 13/16 | 86% |

### Phase 1 — Core communication — 91%

_Real WhatsApp messages land in a shared, saved inbox for several agents._

- [x] Backend chosen and connected (Supabase project, environment) _(2026-11-05)_ — Supabase project 'Bizriva CRM' in London; keys in Vercel; app server moved to London
- [x] Database plan for every module, with row-level isolation tested on a local Postgres _(2026-11-04)_ — supabase/migrations: foundation (21 tables) + review features (8 tables). Screens now use the agreed 13 lead stages and 10 order statuses
- [x] Sign-up, sign-in, invitations _(2026-11-05)_ — Account page, business setup, invite links with roles; invite rules tested on the live database
- [x] Workspaces with row-level isolation applied and tested _(2026-11-05)_ — 31 tables applied; isolation tested on the live database; security advisor clean except the two intended sign-up functions
- [x] Roles and permissions enforced on the server _(2026-11-06)_ — Owners protected, owner-only owner invites, delete rights, append-only activity log, server-only money and webhook tables, same-business links. supabase/tests/loopholes_and_rules.sql 68/68 on the live database
- [x] Contacts, leads and conversations saved for real (no sample data) _(2026-11-06)_ — Signed in, every screen reads and writes your real business (customers, leads, chats, orders, tasks, notes, merges); one tap back to Practice Mode. tests/live_mode_qa.py 23/23, supabase/tests/tasks_notes_merge.sql 19/19
- [ ] WhatsApp Cloud API number connected — Meta business verified (14 Nov); Bizriva's App ID, configuration and app secret are saved and Meta's webhook reaches Bizriva. Left: connect a business number under Integrations → WhatsApp (best a separate number from your personal one)
- [x] Inbound webhook: signature checked, duplicates ignored _(2026-11-06)_ — whatsapp-webhook Edge Function: Meta verify check, HMAC-SHA256 with each business's app secret, one save per Meta message id, STOP opt-out, delivery ticks. Tested on the live project: supabase/tests/whatsapp_e2e.md
- [x] Send replies, media and templates from the inbox _(2026-11-06)_ — Replies, photos, videos, voice notes and documents (paperclip in the Inbox, private storage per business, 1-hour link for Meta) and approved templates outside 24 hours; customers' files are saved into the chat. Storage rules 9/9 on the live project; sending reached Meta in testing
- [x] Inbox updates live; assignment and transfer _(2026-11-06)_ — Inbox reloads the moment the database changes; handed-over chats go to the on-duty sales/support teammate with the fewest open chats; transfer from the chat; only team members; every hand-over and transfer logged. 7/7 on the live project

### Phase 2 — AI and automation — 83%

_Instant first replies from real catalogue data, and follow-ups that respect the rules._

- [x] Products with variants, prices and stock
- [x] Media library in cloud storage
- [x] Knowledge base _(2026-11-06)_ — Knowledge entries saved to the database with keywords; policy starters add in one tap
- [ ] AI agent answers only from catalogue and knowledge base — Built and deployed (ai-reply): this business's data only, price check, handover rules, owner's own key in Vault. Off until switched on (since 14 Nov), never answers personal contacts. Answers for real once you add your Anthropic key and switch it on
- [x] Human takeover pauses AI; hand back to AI _(2026-11-06)_ — Inbox: Take over / Let AI answer; the AI only answers chats it handles; asking for a person, complaints or doubt hand over and flag the chat. Tested on the live project
- [x] Template management (WhatsApp-approved)
- [x] Follow-up engine: 24-hour window, caps, quiet hours, stop on reply _(2026-11-06)_ — Server engine every 5 minutes (private.followups_tick): quiet chats, failed deliveries, unreachable customers, cancelled orders, re-order reminders; 24-hour window → template, one per customer a day, quiet hours, stops on reply/opt-out/takeover, never twice. supabase/tests/followups.sql 11/11 on the live project
- [x] Consent records, opt-out keywords, suppression list _(2026-11-06)_ — Consent records; STOP and your opt-out words record a marketing opt-out; opted-out customers are left out of follow-ups, WhatsApp and email broadcasts; email unsubscribe link. WhatsApp broadcasts 6/6 on the live project
- [x] AI workflow planner (from repo 3) moved off Lovable's AI service onto our own AI key, with a screen in Automation Builder

### Phase 3 — Sales and commerce — 100%

_Chats become confirmed, delivered, paid orders._

- [x] Lead pipeline with agreed stages _(2026-11-06)_ — Stages new → first contact → engaged → high intent → checkout → order created/confirmed → converted or lost, moved forward by the server from real events; staff can still move a lead
- [x] Lead scoring from real buying actions _(2026-11-06)_ — Score 0–100 from real buying actions (messages, asking the price, checkout, orders, deliveries; minus cancellations, refusals and opt-outs), kept up to date by the server
- [x] Conversational checkout with order summary and explicit confirmation
- [x] Orders: edit, cancel, history, receipts
- [x] Agents, partner delivery links and commission enforced on the server _(2026-11-06)_ — Orders shared on insert (least busy, round robin, by state), uncalled orders moved every 5 minutes, call records append-only, partner link (hashed token) via the delivery-link Edge Function, commission only on delivered and paid orders; tested end to end
- [x] Live intake: website/store forms, public order form, Paystack/Flutterwave/Monnify payment notifications _(2026-11-06)_ — Supabase Edge Functions intake, order-form, payments-webhook — keys checked, signatures verified, prices from the database, each event applied once; tested end to end Payment links from the chat (Paystack/Flutterwave, payment-link function): paid order and request marked automatically, tested live.
- [x] COD verification and risk flags _(2026-11-06)_ — Server refuses dispatch before COD verification, and works out each order's risk (earlier failed deliveries, another unconfirmed order, incomplete phone, no address, unpaid balance, high value); a high-risk COD order needs an owner or manager to confirm. Live tests: supabase/tests/risk_and_scoring.md
- [x] Dispatch board and delivery outcomes _(2026-11-06)_ — Dispatch board on real data: confirmed orders get a delivery record, send to rider or partner with a private link, outcomes and cash recorded by the server
- [x] Order, dispatch and delivery notifications _(2026-11-06)_ — Written by the server (confirmation, dispatch, receipt, care guide, payment links) and sent by WhatsApp every minute or by email per Notifications settings. Tested live up to Meta and the email service; real delivery needs your connected number and email key

### Phase 4 — More channels — 100%

_The same inbox for Messenger, Instagram, SMS, email and web chat._

- [x] Messenger and Instagram DMs
- [x] SMS
- [x] Email _(2026-11-06)_ — Own service (Brevo, Resend or Mailgun, key in Vault): order emails by Notifications, email campaigns to consenting customers with a working unsubscribe link, test email, latest-emails list. Tested on the live project up to the email service: supabase/tests/email_e2e.md
- [x] Website chat
- [x] Meta lead forms and ad referral data

### Phase 5 — Intelligence and monetisation — 100%

_Know which ad made the money; charge for the product._

- [x] Analytics: created vs confirmed vs delivered
- [x] Ad attribution, ROAS, cost per delivered order
- [x] Agent performance and response times
- [x] Riders, COD cash ledger, settlements
- [x] Plans, billing and usage limits
- [x] Super Admin console
- [x] All 15 acceptance tests pass end to end — On the live database with Meta and Claude simulated (supabase/tests/acceptance.sql)

### Phase 6 — WhatsApp Growth (linked number) — 86%

_The WhatsApp the business already uses works inside Bizriva: every chat saved, segmented and followed up; Status and groups run from here._

- [x] Link the WhatsApp you already use (pairing code or QR); old chats come in _(2026-11-13)_ — Bizriva's WhatsApp server on Render; chats WhatsApp shares with a new device are imported, each customer saved as a contact and a lead
- [x] Save customers to the phone's contacts (button) and download them as .vcf _(2026-11-13)_ — Name format {name} {product} {last4}; everyone, asked about a product, or no order yet
- [x] Photos, videos, voice notes and documents kept in the chat _(2026-11-15)_ — New files saved since 14 Nov (checked with a real video on 15 Nov). Files in old imported chats show "open WhatsApp to see it"
- [x] Chats tagged by product as they arrive; ad that started the chat recorded _(2026-11-14)_ — "Asked about: <product>" from product names and their other names; click-to-WhatsApp ad credited to the lead
- [x] Personal contacts kept apart: no assistant, follow-ups or marketing; own Inbox tab _(2026-11-15)_ — Mark as personal in the Inbox or Customer 360
- [x] Inbox order matches the phone (Status updates, groups and channels no longer saved as chats) _(2026-11-15)_
- [x] Customers' profile pictures _(2026-11-15)_ — Fetched when they write (weekly at most); hidden pictures stay as initials
- [x] Assistant off until switched on _(2026-11-14)_
- [x] Auto-save every new customer to the phone _(2026-11-15)_ — Live on the WhatsApp Growth page
- [x] Status posts: text, photo, video, now or scheduled, repeat; views and viewers by name _(2026-11-15)_ — Live on the WhatsApp Growth page
- [x] Post to many groups at once, now or later; group collections _(2026-11-15)_ — Live on the WhatsApp Growth page
- [x] Message customers who wrote first, by tag, paced, with STOP _(2026-11-15)_ — Live on the WhatsApp Growth page
- [x] Follow-up stage and source tags kept up to date on every message _(2026-11-15)_ — Sent details · Replied after price · Got price, went quiet · No price sent yet; Facebook ad / likely / unknown. Personal contacts and customers with an order are left alone
- [ ] Chat summaries, location and next step written automatically for every chat — Done once by hand for Dxmart's chats (14 Nov); automatic for new chats once the AI key is added
- [ ] Recover photos and videos from old imported chats — Not started — WhatsApp may resend recent ones from the phone
- [ ] WhatsApp server always on (paid host) — Runs on Render's free plan, which can sleep; needs a paid plan

### Acceptance tests — 15/15

- [x] 1. Ad click starts a WhatsApp chat; contact and ad source recorded
- [x] 2. 'Hello' gets an immediate correct greeting
- [x] 3. Price question answered from the catalogue
- [x] 4. Photo request sends the right media from cloud storage
- [x] 5. Interested-then-silent customer gets an eligible reminder scheduled
- [x] 6. Reply before the reminder cancels or re-evaluates it
- [x] 7. Asking for a human pauses AI and assigns the chat
- [x] 8. Order placed in chat is created with the right details
- [x] 9. COD order triggers verification and records confirmation
- [x] 10. Dispatched order notifies the customer
- [x] 11. Delivered order updates revenue and conversion analytics
- [x] 12. Closed 24-hour window blocks free text; template used instead
- [x] 13. Integration failure retries without duplicate messages or orders
- [x] 14. One business cannot read another business's data
- [x] 15. Opt-out stops marketing automation
