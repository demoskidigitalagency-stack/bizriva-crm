# Bizriva CRM

Bizriva CRM is a multi-tenant commerce CRM for ecommerce, dropshipping, social commerce, and globally extensible customer operations. Its first job is conversational commerce: turning ad conversations into confirmed, delivered cash-on-delivery orders.

**Build status: see [STATUS.md](STATUS.md)** (also in the app at `/progress`).

## Build strategy

This repository is the production source of truth.

We are using a hybrid migration approach:
- reuse proven UI/domain ideas from the Lovable prototypes,
- audit and refactor anything Lovable-specific,
- continue all product development directly in GitHub,
- keep KIOSK as a reference only.

Core lifecycle:

**Acquire → Capture → Converse → Qualify → Sell → Fulfil → Collect → Retain → Reactivate → Analyze**

### Where things came from

| Source | What we took |
| --- | --- |
| `commerce-customer-compass` (Bizriva prototype) | App shell, design system, domain model (Contact ≠ Lead ≠ Customer), Dashboard, Today, Inbox, AI planner |
| `chat-to-checkout-hub` (Sandala) | Warm chat look; to port: saved inbox, follow-up rules, COD dispatch verification, contact scraping |
| `ecommmb` (Kobolink) | Look option; to port: orders, deliveries, riders, COD cash ledger, team roles |
| Master build prompt | Module list, lead stages, order statuses, consent rules, 15 acceptance tests |

## Where to look

| Path | What it is |
| --- | --- |
| `src/app/modules.ts` | Every menu in the unified navigation, with phase, status and source. The sidebar reads from here. |
| `src/app/status.ts` | The 0–100 checklist and acceptance tests. Edit, then run `bun run status`. |
| `src/app/appearance.tsx` | Appearance options: Hybrid (default), Bizriva, Sandala, Kobolink. |
| `supabase/migrations/` | Database schema. The foundation migration is a draft, not yet applied. |
| `supabase/tests/` | Database tests, starting with tenant isolation. |

Screens currently run on sample data from `src/domain/`. Nothing is marked done in STATUS.md until it works against the real backend.

## Develop

```bash
bun install
bun run dev        # local app
bun run typecheck  # TypeScript
bun run build      # production build
bun run status     # regenerate STATUS.md
```
