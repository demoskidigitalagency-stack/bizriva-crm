# Backend Setup and Cutover

Bizriva CRM must use a **dedicated Supabase project**. Do not apply the CRM migrations to KIOSK, Bizflow ERP, or the existing Bizriva Release Test project because those databases already contain unrelated application schemas.

## Required sequence

1. Create a new Supabase project dedicated to Bizriva CRM.
2. Apply migrations in filename order from `supabase/migrations/`.
3. Deploy Edge Functions:
   - `inbound-channel`
   - `paystack-webhook`
4. Configure project secrets:
   - `INBOUND_CHANNEL_SECRET`
   - `PAYSTACK_SECRET_KEY`
   - provider secrets as each adapter is enabled
5. Configure frontend deployment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_PLATFORM_OWNER_EMAIL`
6. Create the initial owner account.
7. Create the first workspace using `create_workspace_for_current_user`.
8. Insert the owner into `platform_admins` only if platform administration access is required.
9. Verify RLS with at least two independent test users/workspaces before production cutover.

## Cutover rule

Local browser persistence is development-only. Once Supabase environment variables are configured for a deployment, production business data must be treated as server-authoritative.

## Migration coverage

Current migrations cover:
- tenant/workspace foundation;
- contacts and channel identities;
- leads and opportunities;
- conversations/messages;
- acquisition attribution;
- products, variants, market pricing;
- warehouses, inventory and reservations;
- orders and order items;
- delivery agents, delivery, POD metadata;
- payments, COD liability and remittance;
- forms and submissions;
- segments and lifecycle campaigns;
- workflow definitions/runs;
- paid-ad entities/metrics;
- expenses, commissions, refunds, credits and payouts;
- roles and permissions;
- plans, subscriptions, usage and feature flags;
- audit events and platform admins.

## Verification gate

Do not mark backend complete until:
- every migration applies cleanly;
- auth works;
- tenant isolation is demonstrated;
- inventory reservation is transactional;
- COD/remittance functions reconcile correctly;
- webhook replay does not duplicate records;
- platform-admin authorization is server-enforced;
- backup and recovery are configured.
