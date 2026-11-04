# Decisions

Agreed with the owner on 2026-11-02. These shape the database, so change them here first.

| # | Decision | Choice | Notes |
| --- | --- | --- | --- |
| 1 | Backend | **Own Supabase project** for database and logins, **Vercel** for hosting | Moving away from Lovable. Code and data stay in our GitHub and accounts. |
| 2 | Lead stages | Master prompt's **13**: New Lead, First Contact, Engaged, Qualified, High Purchase Intent, Negotiating, Checkout Started, Order Created, Order Confirmed, Follow-up Required, Unresponsive, Lost, Converted | Each business can rename them later. Replaces the prototype's 8 (ending at Won). |
| 3 | Order statuses | Master prompt's **10**: Pending Verification, Confirmed, Processing, Ready for Dispatch, Dispatched, In Transit, Delivered, Cancelled, Refused, Returned | Replaces the prototype's 7. |
| 4 | Roles | **Owner, Manager, Sales, Support, Dispatcher, Finance** | Riders use the rider phone view, not a full seat. |
| 5 | Menu | The unified menu (31 modules since 4 Nov) in `src/app/modules.ts` | Super Admin is a separate platform area. |
| 6 | Appearance | Hybrid default; Bizriva, Sandala, Kobolink selectable | |
| 7 | Review of 4 Nov 2026 | Add everything buildable now: **Order Forms** (first), Calendar, deposits and balances, invoices, complaints, reply library in English and Pidgin, share kit with QR, product CSV import, policy starters, 7-day setup checklist, win-back, referral and complaint workflows | From WaContacts, StitchBook, FabianForms, Adflow, Xara and two WhatsApp playbooks. Our own wording; nothing copied from the paid guides. |
| 8 | Later ideas | Kept on the **Coming Later** page (`FUTURE` in `src/app/modules.ts`): 10 that need the backend, 8 parked | Not counted in the progress score until scheduled. |
| 10 | Old WhatsApp chats | Import WhatsApp's own **Export chat** files (.txt or .zip) into CRM → Imports → WhatsApp chats, one customer per file | For +234 numbers where coexistence may not be offered. Don't move the main number until coexistence is tested; start Bizriva on a new number. |
| 9 | Tailor features | A future **industry pack** on the same base, not part of the core | Measurements, garment stages, fabric stock, group orders. |

## Still to apply in code

The screens still use the prototype's 8 lead stages and 7 order statuses. They move to the agreed lists as the first backend step, together with the database enums in `supabase/migrations/`, so the data and screens change once, together.
