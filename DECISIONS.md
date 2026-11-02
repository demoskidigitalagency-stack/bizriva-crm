# Decisions

Agreed with the owner on 2026-11-02. These shape the database, so change them here first.

| # | Decision | Choice | Notes |
| --- | --- | --- | --- |
| 1 | Backend | **Own Supabase project** for database and logins, **Vercel** for hosting | Moving away from Lovable. Code and data stay in our GitHub and accounts. |
| 2 | Lead stages | Master prompt's **13**: New Lead, First Contact, Engaged, Qualified, High Purchase Intent, Negotiating, Checkout Started, Order Created, Order Confirmed, Follow-up Required, Unresponsive, Lost, Converted | Each business can rename them later. Replaces the prototype's 8 (ending at Won). |
| 3 | Order statuses | Master prompt's **10**: Pending Verification, Confirmed, Processing, Ready for Dispatch, Dispatched, In Transit, Delivered, Cancelled, Refused, Returned | Replaces the prototype's 7. |
| 4 | Roles | **Owner, Manager, Sales, Support, Dispatcher, Finance** | Riders use the rider phone view, not a full seat. |
| 5 | Menu | The 28-module unified menu in `src/app/modules.ts` | Super Admin is a separate platform area. |
| 6 | Appearance | Hybrid default; Bizriva, Sandala, Kobolink selectable | |

## Still to apply in code

The screens still use the prototype's 8 lead stages and 7 order statuses. They move to the agreed lists as the first backend step, together with the database enums in `supabase/migrations/`, so the data and screens change once, together.
