# Bizriva CRM Hybrid Migration

## Source of truth
GitHub is the permanent source of truth for Bizriva CRM.

## Lovable prototype
The Lovable project is retained as a prototype/reference. Its useful assets are selectively ported after review.

### Reused in the GitHub foundation
- domain types
- deterministic seed data
- repository/query layer
- currency/date formatting helpers
- Bizriva teal/turquoise design tokens

### Not inherited automatically
- Lovable-specific runtime configuration
- placeholder routing
- Lovable error-reporting code
- generated assumptions that conflict with the approved Bizriva architecture

## Rule
Future development happens in GitHub branches. Lovable is optional for visual experimentation only and is not required for the product to continue.
