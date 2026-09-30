# Release Checklist

A milestone or release cannot be called complete until the applicable checks are actually verified.

## Build

- [x] TypeScript passes on current branch head
- [x] production build passes in GitHub Actions
- [x] Playwright E2E suite passes on current branch head
- [ ] deployed preview has no blocking console/runtime errors

## Product

- [x] primary routes render in automated browser journeys
- [x] CRM navigation and Customer 360 core journey verified
- [x] public storefront checkout journey verified
- [x] major visible controls in implemented local scope perform meaningful actions
- [x] empty/loading/error handling exists for core implemented flows
- [ ] desktop browser QA completed on deployed preview
- [ ] tablet responsive QA completed on deployed preview
- [ ] mobile responsive QA completed on deployed preview
- [ ] cross-browser QA completed
- [ ] no duplicated route/module concepts after final UI audit

## Security / Backend

- [x] authentication architecture implemented
- [x] tenant-isolated database schema and RLS migrations prepared
- [x] role/permission schema prepared
- [x] audit-event schema prepared
- [x] webhook verification architecture prepared
- [x] idempotent provider-event architecture prepared
- [x] secrets are excluded from frontend source
- [ ] dedicated Bizriva CRM Supabase project selected/created
- [ ] migrations applied and verified on that project
- [ ] production authentication verified against real backend
- [ ] tenant isolation tested against real backend
- [ ] permission enforcement tested against real backend
- [ ] audit logging tested against real backend
- [ ] backup/recovery strategy verified

## Providers

- [ ] official WhatsApp Business Platform connected
- [ ] Instagram / Messenger integration connected
- [ ] email provider connected
- [ ] SMS provider connected
- [ ] Paystack credentials connected and live webhook verified
- [ ] Meta Ads connected
- [ ] TikTok Ads connected
- [ ] Google Ads connected
- [ ] Shopify / WooCommerce connectors verified where enabled
- [ ] logistics provider(s) connected where enabled
- [ ] AI provider connected with authority limits and escalation rules

## Operational Flows

- [ ] contact capture → identity resolution → CRM persistence
- [ ] conversation → lead qualification → human/AI assignment
- [ ] order creation → inventory reservation
- [ ] order confirmation → fulfilment
- [ ] delivery → POD
- [ ] COD collection → liability
- [ ] remittance submission → verification → reconciliation
- [ ] failed delivery → recovery workflow
- [ ] lifecycle campaign → attribution
- [ ] ad campaign → lead/order/delivered revenue attribution

## SaaS / Platform

- [ ] workspace onboarding verified
- [ ] multi-workspace switching verified
- [ ] subscription/entitlement enforcement verified
- [ ] usage metering verified
- [ ] platform-admin server authorization verified
- [ ] tenant suspension/support workflow verified

## Release Certification

- [ ] dedicated production deployment exists
- [ ] monitoring enabled
- [ ] error tracking enabled
- [ ] release notes prepared
- [ ] exact release commit recorded
- [ ] PR out of draft only after the above release-critical checks pass
