# Architecture

## Principles
- multi-tenant from day one;
- one Contact identity;
- domain logic separated from UI;
- provider adapters for external services;
- event-driven side effects;
- server-authoritative permissions and financial state.

## Hierarchy
Platform → Workspace → Business/Brand → Branch → Warehouse.

## Layers
1. Presentation: React UI.
2. Application: use-cases/actions.
3. Domain: CRM, orders, inventory, delivery, finance rules.
4. Data: repositories/adapters.
5. Integrations: messaging, ads, payments, commerce, logistics, telephony.
6. Async/event processing: automations, imports, broadcasts, sync, AI jobs.

## Current foundation
Milestone 1 uses an in-memory adapter behind typed repository functions. This is intentionally replaceable by a real API/backend.
