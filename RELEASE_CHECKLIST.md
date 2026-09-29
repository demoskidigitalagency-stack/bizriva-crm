# Release Checklist

A milestone cannot be called complete until applicable checks pass.

## Build
- TypeScript passes
- production build passes
- no blocking console/runtime errors

## Product
- intended routes render
- visible controls in completed scope work
- empty/loading/error states handled
- responsive desktop/tablet/mobile behavior checked
- no duplicated routes or concepts

## Security/backend when connected
- authentication
- tenant isolation
- permission enforcement
- audit logs
- secrets handling
- webhook verification
- idempotency

## Operational
- critical E2E flows
- backups/monitoring before production
- exact release commit recorded
