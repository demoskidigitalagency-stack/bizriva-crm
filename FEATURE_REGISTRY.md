# Feature Registry

This file is the current source of truth for implementation status on `feature/foundation`.

| Capability | Milestone | Frontend | Data/Domain | Verification | Release |
|---|---:|---|---|---|---|
| App shell | 1 | Implemented | Shared application state | CI + E2E passed | Candidate |
| Authentication shell | 1 | Implemented | Supabase-ready + isolated local fallback | CI + E2E passed | Candidate |
| Dashboard | 1 | Implemented | Repository-backed data | CI + E2E passed | Candidate |
| Today | 1 | Implemented | Repository-backed data | CI passed | Candidate |
| CRM Overview | 1 | Implemented | Repository-backed data | CI + E2E passed | Candidate |
| Contacts | 1 | Implemented | Shared adapter | CI + E2E passed | Candidate |
| Leads | 1 | Implemented | Shared adapter | CI passed | Candidate |
| Customers | 1 | Implemented | Shared contact identity | CI passed | Candidate |
| Pipeline | 1 | Implemented | Shared adapter | CI passed | Candidate |
| Deals | 1 | Implemented | Opportunities model | CI passed | Candidate |
| Activities | 1 | Implemented | Activity timeline model | CI passed | Candidate |
| Follow-ups / Tasks | 1 | Implemented | Shared task model | CI passed | Candidate |
| Product Interests | 1 | Implemented | Product-interest model | CI passed | Candidate |
| Segments | 1 | Implemented | Segment model | CI passed | Candidate |
| Smart Lists | 1 | Implemented | Segment rules model | CI passed | Candidate |
| Duplicate Review | 1 | Implemented | Identity-resolution rules | CI passed | Candidate |
| CSV Imports | 1 | Implemented | Local import flow; backend job schema planned | CI passed | Candidate |
| Customer 360 | 1 | Implemented | Unified contact/order/activity model | CI + E2E passed | Candidate |
| Unified Inbox | 2 | Implemented UI | Conversation/message model + inbound webhook function | CI passed | Backend connection required |
| Orders | 3 | Implemented UI | Separate order/fulfilment/payment states | CI passed | Backend connection required |
| Products | 3 | Implemented UI | Product/variant schema | CI passed | Backend connection required |
| Inventory | 3 | Implemented UI | Warehouse inventory + reservation SQL | CI passed | Backend connection required |
| Storefront | 3 | Implemented | Public store + checkout + form builder shell | E2E passed | Backend/payment connection required |
| Delivery | 4 | Implemented UI | Delivery schema + status workflows | CI passed | Backend connection required |
| Delivery Agent Workspace | 4 | Implemented | Guarded agent route | CI passed | Role enforcement required |
| COD / Remittance | 4 | Implemented UI | COD liability + remittance transactions | CI passed | Backend verification required |
| Marketing | 5 | Implemented UI | Lifecycle campaign/segment model | CI passed | Channel providers required |
| Automation | 5 | Implemented UI | Workflow schema + run model | CI passed | Worker/runtime required |
| Ads | 6 | Implemented UI | Paid-ad entities + daily metrics schema | CI passed | Provider APIs required |
| Finance | 7 | Implemented UI | Payments/COD/expense/commission schema | CI passed | Provider/backend connection required |
| Analytics | 7 | Implemented UI | Shared metrics model | CI passed | Production data required |
| Team | 8 | Implemented UI | Role/permission schema | CI passed | Server enforcement required |
| Integrations | 8 | Implemented UI | Provider contracts + health architecture | CI passed | Credentials/provider adapters required |
| Platform Admin | 9 | Implemented shell | Platform-admin schema + owner guard | CI passed | Server-side admin enforcement required |
| SaaS Plans / Usage | 9 | Architected | Plans, subscriptions, usage, flags schema | CI passed | Billing provider not connected |

## Current verification

Latest verified branch head at the time of this update:

`a0f9d52f94c62aef6b4e8a50be524916d34eada8`

GitHub Actions:
- production build: passed
- Playwright E2E: passed

## Remaining release-critical work

1. Apply the Supabase migrations to a dedicated Bizriva CRM project.
2. Replace local development persistence with server persistence for production mode.
3. Complete server-authoritative tenant/role/permission enforcement.
4. Connect real messaging, payment, ads, commerce, logistics and AI providers using credentials.
5. Perform responsive/browser QA against a deployed preview.
6. Verify security, backup, monitoring and provider failure handling.
7. Record and certify the exact release commit before merging to `main`.

Update this registry whenever implementation or verification status changes.
