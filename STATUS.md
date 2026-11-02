# Bizriva CRM — build status

Generated from `src/app/status.ts` by `bun run status`. Edit that file, not this one.

**Overall: 9%**  `██░░░░░░░░░░░░░░░░░░`

An item is ticked only when it works for real, not when its screen exists.

| Phase | Share | Done | Progress |
| --- | ---: | ---: | --- |
| Phase 0 — Foundation | 10% | 5/6 | 90% |
| Phase 1 — Core communication | 25% | 0/9 | 0% |
| Phase 2 — AI and automation | 20% | 0/8 | 0% |
| Phase 3 — Sales and commerce | 20% | 0/7 | 0% |
| Phase 4 — More channels | 10% | 0/5 | 0% |
| Phase 5 — Intelligence and monetisation | 15% | 0/7 | 0% |

## Phase 0 — Foundation — 90%

_One repo, one design system, one menu, one plan._ Worth 10% of the build.

- [x] bizriva-crm set up from repo 3 (Bizriva) shell, design system and data types _(2026-11-02)_
- [x] Appearance: Hybrid default, with Sandala, Kobolink and Bizriva as options _(2026-11-02)_
- [x] Unified navigation: every agreed menu present, unbuilt ones shown as planned _(2026-11-02)_
- [x] Build Progress page and STATUS.md (this checklist) _(2026-11-02)_
- [x] Multi-workspace database schema drafted (not yet applied) _(2026-11-02)_
- [ ] Crosswalk decisions agreed (menus, lead stages, order statuses, roles) — Use the 'Your decision' column in repo-comparison.xlsx

## Phase 1 — Core communication — 0%

_Real WhatsApp messages land in a shared, saved inbox for several agents._ Worth 25% of the build.

- [ ] Backend chosen and connected (Supabase project, environment) — Decision pending: Lovable Cloud or own Supabase
- [ ] Sign-up, sign-in, invitations
- [ ] Workspaces with row-level isolation applied and tested
- [ ] Roles and permissions enforced on the server
- [ ] Contacts, leads and conversations saved for real (no sample data)
- [ ] WhatsApp Cloud API number connected — Needs Meta Business verification
- [ ] Inbound webhook: signature checked, duplicates ignored
- [ ] Send replies, media and templates from the inbox
- [ ] Inbox updates live; assignment and transfer

## Phase 2 — AI and automation — 0%

_Instant first replies from real catalogue data, and follow-ups that respect the rules._ Worth 20% of the build.

- [ ] Products with variants, prices and stock
- [ ] Media library in cloud storage
- [ ] Knowledge base
- [ ] AI agent answers only from catalogue and knowledge base
- [ ] Human takeover pauses AI; hand back to AI
- [ ] Template management (WhatsApp-approved)
- [ ] Follow-up engine: 24-hour window, caps, quiet hours, stop on reply
- [ ] Consent records, opt-out keywords, suppression list

## Phase 3 — Sales and commerce — 0%

_Chats become confirmed, delivered, paid orders._ Worth 20% of the build.

- [ ] Lead pipeline with agreed stages
- [ ] Lead scoring from real buying actions
- [ ] Conversational checkout with order summary and explicit confirmation
- [ ] Orders: edit, cancel, history, receipts
- [ ] COD verification and risk flags
- [ ] Dispatch board and delivery outcomes
- [ ] Order, dispatch and delivery notifications

## Phase 4 — More channels — 0%

_The same inbox for Messenger, Instagram, SMS, email and web chat._ Worth 10% of the build.

- [ ] Messenger and Instagram DMs
- [ ] SMS
- [ ] Email
- [ ] Website chat
- [ ] Meta lead forms and ad referral data

## Phase 5 — Intelligence and monetisation — 0%

_Know which ad made the money; charge for the product._ Worth 15% of the build.

- [ ] Analytics: created vs confirmed vs delivered
- [ ] Ad attribution, ROAS, cost per delivered order
- [ ] Agent performance and response times
- [ ] Riders, COD cash ledger, settlements
- [ ] Plans, billing and usage limits
- [ ] Super Admin console
- [ ] All 15 acceptance tests pass end to end

## Acceptance tests — 0/15

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

## Modules

| Group | Module | Phase | Status | From |
| --- | --- | --- | --- | --- |
| Overview | Dashboard | MVP | Screen only — sample data | Bizriva, Sandala, Prompt |
| Overview | Today | MVP | Screen only — sample data | Bizriva |
| Customers | Inbox | MVP | Screen only — sample data | Sandala, Kobolink, Prompt |
| Customers | CRM | MVP | Planned | Bizriva, Sandala, Prompt |
| Sales | Orders | MVP | Planned | Kobolink, Prompt |
| Sales | COD Verification | MVP | Planned | Sandala, Prompt |
| Commerce | Products | MVP | Planned | Sandala, Kobolink, Prompt |
| Commerce | Media Library | MVP | Planned | Prompt |
| Commerce | Inventory | Later | Planned | Kobolink |
| Commerce | Store | Later | Planned | Bizriva |
| Delivery | Delivery | MVP | Planned | Kobolink, Prompt |
| Delivery | Riders | Later | Planned | Kobolink |
| Automation | AI Sales Agent | MVP | Planned | Kobolink, Prompt |
| Automation | Knowledge Base | MVP | Planned | Prompt |
| Automation | Follow-ups | MVP | Planned | Sandala, Prompt |
| Automation | Templates | MVP | Planned | Prompt |
| Automation | Broadcasts | Later | Planned | Sandala |
| Automation | Automation Builder | Later | Planned | Bizriva, Prompt |
| Automation | Workflow History | Later | Planned | Sandala, Prompt |
| Growth | Ads and Attribution | Later | Planned | Kobolink, Prompt |
| Money | Payments | Later | Planned | Kobolink, Prompt |
| Insights | Analytics | MVP | Planned | Kobolink, Prompt |
| Workspace | Team and Roles | MVP | Planned | Kobolink, Prompt |
| Workspace | Integrations | MVP | Planned | Kobolink, Prompt |
| Workspace | Settings | Foundation | Screen only — sample data | Sandala, Kobolink, Prompt |
| Workspace | Billing | Later | Planned | Prompt |
| Workspace | Build Progress | Foundation | Screen only — sample data | Kobolink, Prompt |
| Workspace | Help | Later | Planned | Bizriva |
