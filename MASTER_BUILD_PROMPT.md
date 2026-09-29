# Bizriva CRM Master Build Contract

Bizriva CRM is a fresh, multi-tenant commerce CRM for ecommerce, dropshipping and social commerce, globally extensible to other industries.

## Product loop
Acquire → Capture → Converse → Qualify → Sell → Fulfil → Collect → Retain → Reactivate → Analyze.

## Non-negotiable rules
1. GitHub is the production source of truth. Lovable is reference/prototype only.
2. One Contact identity across all connected channels. Contact, Lead and Customer are lifecycle/business states, not duplicate person records.
3. Keep the main sidebar compact. Internal capabilities stay inside their parent module.
4. Do not put critical business logic in React components.
5. Server/domain rules own tenant isolation, permissions, money, stock, workflow state, audit and integrations.
6. Mock data must sit behind adapters/repositories so a real backend can replace it without screen rewrites.
7. No dead controls in completed scope.
8. Responsive behavior is part of completion.
9. A feature is not complete until build/tests/acceptance checks pass.
10. Do not merge incomplete work into main.

## Primary navigation
Dashboard, Today, Inbox, CRM, Orders, Products, Inventory, Store, Delivery, Marketing, Ads, Automation, Finance, Analytics, Team, Integrations, Settings, Help.

## Milestone 1
Foundation + app shell + Dashboard + Today + CRM + Customer 360.

## Release principle
One business event, one source of truth, many views.
