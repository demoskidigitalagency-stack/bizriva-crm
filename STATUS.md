# Bizriva CRM — build status

Generated from `src/app/status.ts` and `src/app/modules.ts` by `bun run status`. Edit those, not this file.

| Track | Progress | |
| --- | ---: | --- |
| **Frontend — Practice Mode** (every page and button works on sample data) | **100%** | `████████████████████` |
| **Backend — Live** (works for real: auth, database, WhatsApp, AI) | **12%** | `██░░░░░░░░░░░░░░░░░░` |

Modules: 33 of 33 practice ready · 0 partly working · 0 planned.

## Frontend track

### Modules — 100% (85% of the frontend)

✅ practice ready · 🟡 partly working · ⬜ planned

| | Group | Module | Phase | Status | From |
| --- | --- | --- | --- | --- | --- |
| ✅ | Overview | Dashboard | MVP | Practice ready | Bizriva, Sandala, Prompt |
| ✅ | Overview | Today | MVP | Practice ready | Bizriva |
| ✅ | Overview | Money Brief | MVP | Practice ready | Review 2026-11-04 |
| ✅ | Overview | Calendar | MVP | Practice ready | Review 2026-11-04 |
| ✅ | Customers | Inbox | MVP | Practice ready | Sandala, Kobolink, Prompt |
| ✅ | Customers | CRM | MVP | Practice ready | Bizriva, Sandala, Prompt |
| ✅ | Sales | Orders | MVP | Practice ready | Kobolink, Prompt |
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
- [x] Competitor and playbook review added (order forms, deposits, invoices, calendar, complaints, reply library, share kit, imports) _(2026-11-04)_ — tests/practice_qa_review.py 43/43. Backend-dependent and parked ideas are listed on Coming Later

## Backend track

| Phase | Share | Done | Progress |
| --- | ---: | ---: | --- |
| Phase 1 — Core communication | 30% | 4/10 | 41% |
| Phase 2 — AI and automation | 22% | 0/9 | 0% |
| Phase 3 — Sales and commerce | 22% | 0/7 | 0% |
| Phase 4 — More channels | 11% | 0/5 | 0% |
| Phase 5 — Intelligence and monetisation | 15% | 0/7 | 0% |

### Phase 1 — Core communication — 41%

_Real WhatsApp messages land in a shared, saved inbox for several agents._

- [x] Backend chosen and connected (Supabase project, environment) _(2026-11-05)_ — Supabase project 'Bizriva CRM' in London; keys in Vercel; app server moved to London
- [x] Database plan for every module, with row-level isolation tested on a local Postgres _(2026-11-04)_ — supabase/migrations: foundation (21 tables) + review features (8 tables). Screens now use the agreed 13 lead stages and 10 order statuses
- [x] Sign-up, sign-in, invitations _(2026-11-05)_ — Account page, business setup, invite links with roles; invite rules tested on the live database
- [x] Workspaces with row-level isolation applied and tested _(2026-11-05)_ — 31 tables applied; isolation tested on the live database; security advisor clean except the two intended sign-up functions
- [ ] Roles and permissions enforced on the server — Done for team, invites and payments; the rest arrives with real data
- [ ] Contacts, leads and conversations saved for real (no sample data)
- [ ] WhatsApp Cloud API number connected — Needs Meta Business verification
- [ ] Inbound webhook: signature checked, duplicates ignored
- [ ] Send replies, media and templates from the inbox
- [ ] Inbox updates live; assignment and transfer

### Phase 2 — AI and automation — 0%

_Instant first replies from real catalogue data, and follow-ups that respect the rules._

- [ ] Products with variants, prices and stock
- [ ] Media library in cloud storage
- [ ] Knowledge base
- [ ] AI agent answers only from catalogue and knowledge base
- [ ] Human takeover pauses AI; hand back to AI
- [ ] Template management (WhatsApp-approved)
- [ ] Follow-up engine: 24-hour window, caps, quiet hours, stop on reply
- [ ] Consent records, opt-out keywords, suppression list
- [ ] AI workflow planner (from repo 3) moved off Lovable's AI service onto our own AI key, with a screen in Automation Builder — Code is in src/server/ai; it only runs with a Lovable key today

### Phase 3 — Sales and commerce — 0%

_Chats become confirmed, delivered, paid orders._

- [ ] Lead pipeline with agreed stages
- [ ] Lead scoring from real buying actions
- [ ] Conversational checkout with order summary and explicit confirmation
- [ ] Orders: edit, cancel, history, receipts
- [ ] COD verification and risk flags
- [ ] Dispatch board and delivery outcomes
- [ ] Order, dispatch and delivery notifications

### Phase 4 — More channels — 0%

_The same inbox for Messenger, Instagram, SMS, email and web chat._

- [ ] Messenger and Instagram DMs
- [ ] SMS
- [ ] Email
- [ ] Website chat
- [ ] Meta lead forms and ad referral data

### Phase 5 — Intelligence and monetisation — 0%

_Know which ad made the money; charge for the product._

- [ ] Analytics: created vs confirmed vs delivered
- [ ] Ad attribution, ROAS, cost per delivered order
- [ ] Agent performance and response times
- [ ] Riders, COD cash ledger, settlements
- [ ] Plans, billing and usage limits
- [ ] Super Admin console
- [ ] All 15 acceptance tests pass end to end

### Acceptance tests — 0/15

- [ ] 1. Ad click starts a WhatsApp chat; contact and ad source recorded
- [ ] 2. 'Hello' gets an immediate correct greeting
- [ ] 3. Price question answered from the catalogue
- [ ] 4. Photo request sends the right media from cloud storage
- [ ] 5. Interested-then-silent customer gets an eligible reminder scheduled
- [ ] 6. Reply before the reminder cancels or re-evaluates it
- [ ] 7. Asking for a human pauses AI and assigns the chat
- [ ] 8. Order placed in chat is created with the right details
- [ ] 9. COD order triggers verification and records confirmation
- [ ] 10. Dispatched order notifies the customer
- [ ] 11. Delivered order updates revenue and conversion analytics
- [ ] 12. Closed 24-hour window blocks free text; template used instead
- [ ] 13. Integration failure retries without duplicate messages or orders
- [ ] 14. One business cannot read another business's data
- [ ] 15. Opt-out stops marketing automation
