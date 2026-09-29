# Data Model

## Identity
Contact → ChannelIdentity[]
Contact may have Lead, Opportunities, Conversations, Orders, Tasks, ProductInterests, Deliveries, Payments and Activities.

## Core entities
Workspace, Business, Branch, Warehouse, User, Team, Role, Permission, Contact, ChannelIdentity, Lead, Opportunity, Conversation, Message, Activity, Task, Product, Variant, Inventory, Order, OrderItem, Payment, Delivery, CODLiability, Remittance, Campaign, Segment, Workflow, Integration, AuditEvent.

## State separation
Order status, fulfilment status and payment status are independent.

## Money
Every monetary record must retain currency. Historical FX conversion must not be recomputed using current rates.
