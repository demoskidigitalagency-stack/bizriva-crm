# Bizriva CRM

Bizriva CRM is a multi-tenant commerce CRM for ecommerce, dropshipping, social commerce, and globally extensible customer operations.

## Build strategy

This repository is the production source of truth.

We are using a hybrid migration approach:
- reuse proven UI/domain ideas from the Lovable prototype,
- audit and refactor anything Lovable-specific,
- continue all product development directly in GitHub,
- keep KIOSK as a reference only.

Core lifecycle:

**Acquire → Capture → Converse → Qualify → Sell → Fulfil → Collect → Retain → Reactivate → Analyze**

See `MASTER_BUILD_PROMPT.md` and the architecture documents for the governing specification.
