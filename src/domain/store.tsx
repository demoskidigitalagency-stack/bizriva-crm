/**
 * Client-side data store. Screens read the Database snapshot through
 * `useDb()` and mutate only through the typed actions exposed here, so the
 * in-memory adapter can later be replaced by server calls without touching
 * screen code.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createInitialDatabase, CURRENT_USER_ID, NOW, type Database } from "./database";
import { codRisk } from "./repositories";
import type {
  AgentConfig, Broadcast, BusinessSettings, Campaign, Channel, Contact, DeliveryStatus, FollowUpRule, ID, IntegrationState, KnowledgeEntry,
  LeadOutcome, LeadStage, Lifecycle, MediaAsset, MessageTemplate, OrderStatus, PaymentMethod, Product, Rider, StockMovement, Task,
  TeamMember, Workflow, WorkflowRun,
} from "./types";

/** Collections that the generic save/remove actions may touch. */
export interface Editable {
  riders: Rider;
  knowledge: KnowledgeEntry;
  templates: MessageTemplate;
  followUpRules: FollowUpRule;
  broadcasts: Broadcast;
  workflows: Workflow;
  media: MediaAsset;
  campaigns: Campaign;
  team: TeamMember;
}
type EditableKey = keyof Editable;

/**
 * Practice Mode persistence: the whole sample database is saved in this
 * browser so testers can work through flows across refreshes. Bump the
 * version when the seed or types change shape — old saves are then ignored.
 */
const PRACTICE_KEY = "bizriva.practice-db";
const PRACTICE_VERSION = 3; // v3: product details, staff alerts, chat options, contact address, detail messages

function loadPractice(): { db: Database; workspaceId: ID } | null {
  try {
    const raw = localStorage.getItem(PRACTICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: number; db: Database; workspaceId: ID };
    return parsed.v === PRACTICE_VERSION ? { db: parsed.db, workspaceId: parsed.workspaceId } : null;
  } catch {
    return null;
  }
}

function savePractice(db: Database, workspaceId: ID) {
  try {
    localStorage.setItem(PRACTICE_KEY, JSON.stringify({ v: PRACTICE_VERSION, db, workspaceId }));
  } catch {
    /* storage full or blocked: practice data lasts for this visit only */
  }
}

export interface CreateContactInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  countryCode: string;
  city: string;
  lifecycle: Lifecycle;
  source: Contact["source"];
  ownerId: ID;
}

export interface CreateOrderInput {
  contactId: ID;
  items: { productId: ID; qty: number }[];
  channel: Channel;
  method: PaymentMethod;
}

interface StoreActions {
  addContact: (input: CreateContactInput) => void;
  createOrder: (input: CreateOrderInput) => void;
  setLeadStage: (leadId: ID, stage: LeadStage) => void;
  setLeadOutcome: (leadId: ID, outcome: LeadOutcome | undefined) => void;
  assignOwner: (contactId: ID, ownerId: ID) => void;
  setLifecycle: (contactId: ID, lifecycle: Lifecycle) => void;
  completeTask: (taskId: ID) => void;
  snoozeTask: (taskId: ID, days: number) => void;
  addTask: (task: Omit<Task, "id" | "createdAt" | "status">) => void;
  addNote: (contactId: ID, text: string) => void;
  logCall: (contactId: ID, summary: string) => void;
  sendReply: (conversationId: ID, text: string) => void;
  markNotificationsRead: () => void;
  setWorkspace: (id: ID) => void;
  setOrderStatus: (orderId: ID, status: OrderStatus, note?: string) => void;
  recordCodCheck: (orderId: ID, result: "confirmed" | "unreachable" | "cancelled", note?: string) => void;
  setDeliveryStatus: (deliveryId: ID, status: DeliveryStatus, failureReason?: string) => void;
  markRemitted: (paymentId: ID) => void;
  saveProduct: (product: Omit<Product, "id"> & { id?: ID }) => void;
  adjustStock: (productId: ID, delta: number) => void;
  mergeContacts: (keepId: ID, mergeIds: ID[]) => void;
  startLead: (contactId: ID) => void;
  resetPracticeData: () => void;
  saveRecord: <K extends EditableKey>(collection: K, record: Omit<Editable[K], "id"> & { id?: ID }) => ID;
  removeRecord: (collection: EditableKey, id: ID) => void;
  updateSettings: (patch: Partial<BusinessSettings>) => void;
  updateAgent: (patch: Partial<AgentConfig>) => void;
  setIntegration: (id: IntegrationState["id"], status: IntegrationState["status"]) => void;
  assignRider: (deliveryId: ID, riderId: ID | undefined) => void;
  moveStock: (productId: ID, delta: number, reason: StockMovement["reason"], note?: string) => void;
  recordPayment: (orderId: ID, method: PaymentMethod) => void;
  logRun: (run: Omit<WorkflowRun, "id" | "at">) => void;
  retryRun: (runId: ID) => void;
  sendBroadcast: (broadcastId: ID) => void;
  addCampaignSpend: (campaignId: ID, amount: number, revenue?: number) => void;
  updateContactDetails: (contactId: ID, patch: Partial<Pick<Contact, "firstName" | "lastName" | "phone" | "city" | "address" | "landmark">>) => void;
  simulateIncoming: (conversationId: ID, text: string) => void;
  sendProductCard: (conversationId: ID, productId: ID) => void;
  updateWorkspace: (patch: Partial<Pick<Database["workspaces"][number], "name" | "currency">>) => void;
  submitLeadForm: (input: { name: string; phone: string; productId?: ID; message?: string }) => ID | null;
}

interface StoreValue {
  db: Database;
  workspaceId: ID;
  actions: StoreActions;
}

const StoreContext = createContext<StoreValue | null>(null);

let seq = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function DataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(createInitialDatabase);
  const [workspaceId, setWorkspaceId] = useState<ID>("ws_luxe");
  const workspaceIdRef = useRef<ID>("ws_luxe");
  useEffect(() => { workspaceIdRef.current = workspaceId; }, [workspaceId]);
  // Load the saved practice data after mount (not during render) so server and client markup match.
  const loaded = useRef(false);
  useEffect(() => {
    const saved = loadPractice();
    if (saved) {
      setDb(saved.db);
      setWorkspaceId(saved.workspaceId);
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current) savePractice(db, workspaceId);
  }, [db, workspaceId]);

  const logActivity = (d: Database, contactId: ID, title: string, kind: "lead" | "note" | "task" | "conversation" | "order" | "system" = "system", description?: string): Database => ({
    ...d,
    activities: [
      { id: newId("act"), contactId, kind, title, at: new Date().toISOString(), actorId: CURRENT_USER_ID, ...(description ? { description } : {}) },
      ...d.activities,
    ],
  });


  const notify = (d: Database, title: string, body: string, tone: "info" | "warning" | "success" = "info"): Database => ({
    ...d,
    notifications: [{ id: newId("n"), title, body, at: new Date().toISOString(), read: false, tone }, ...d.notifications],
  });

  const addContact = useCallback((input: CreateContactInput) => {
    setDb((d) => {
      const contact: Contact = {
        ...input,
        id: newId("ct"),
        leadScore: 0,
        tags: ["new"],
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        totalOrders: 0,
        lifetimeValue: 0,
        deliveredRevenue: 0,
        contributionProfit: 0,
        outstandingBalance: 0,
        consentMarketing: true,
        notesCount: 0,
      };
      const next = { ...d, contacts: [contact, ...d.contacts] };
      return logActivity(next, contact.id, "Contact created", "system", `${contact.firstName} ${contact.lastName} captured via ${contact.source.replace(/_/g, " ")}`);
    });
  }, []);

  const createOrder = useCallback((input: CreateOrderInput) => {
    setDb((d) => {
      const lines = input.items.filter((i) => i.qty > 0);
      if (!lines.length) return d;
      const products = lines.map((l) => ({ line: l, product: d.products.find((p) => p.id === l.productId) })).filter((x) => x.product);
      const subtotal = products.reduce((s, x) => s + x.product!.price * x.line.qty, 0);
      const fee = subtotal >= d.settings.freeDeliveryOver ? 0 : d.settings.deliveryFee;
      const total = subtotal + fee;
      const cogs = products.reduce((s, x) => s + x.product!.cost * x.line.qty, 0);
      const order = {
        id: newId("ord"),
        reference: `BZ-${1000 + d.orders.length + 1}`,
        contactId: input.contactId,
        placedAt: new Date().toISOString(),
        status: "pending_confirmation" as const,
        itemsCount: products.reduce((s, x) => s + x.line.qty, 0),
        total,
        cogs,
        shippingFee: fee,
        paymentStatus: input.method === "cash_on_delivery" ? ("cod_pending" as const) : ("unpaid" as const),
        paymentMethod: input.method,
        channel: input.channel,
        productNames: products.map((x) => `${x.line.qty}× ${x.product!.name}`),
      };
      const next = {
        ...d,
        orders: [order, ...d.orders],
        contacts: d.contacts.map((c) =>
          c.id === input.contactId
            ? { ...c, totalOrders: c.totalOrders + 1, lifetimeValue: c.lifetimeValue + total, lastActivityAt: new Date().toISOString() }
            : c,
        ),
      };
      let withLog = logActivity(next, input.contactId, `Order ${order.reference} placed`, "order", order.productNames.join(", "));
      if (order.paymentMethod === "cash_on_delivery" && withLog.settings.staffAlerts.dispatchRisk) {
        const risk = codRisk(withLog, order);
        if (risk.level === "high") {
          const who = withLog.contacts.find((c) => c.id === input.contactId);
          withLog = notify(withLog, `High-risk COD order ${order.reference}`, `${who ? `${who.firstName} ${who.lastName}` : "Customer"}: ${risk.reasons.join("; ")}. Confirm before dispatch.`, "warning");
        }
      }
      return withLog;
    });
  }, []);

  const setLeadStage = useCallback((leadId: ID, stage: LeadStage) => {
    setDb((d) => {
      const lead = d.leads.find((l) => l.id === leadId);
      if (!lead) return d;
      const next = { ...d, leads: d.leads.map((l) => (l.id === leadId ? { ...l, stage, updatedAt: new Date().toISOString() } : l)) };
      return logActivity(next, lead.contactId, `Lead moved to ${stage.replace(/_/g, " ")}`, "lead");
    });
  }, []);

  const setLeadOutcome = useCallback((leadId: ID, outcome: LeadOutcome | undefined) => {
    setDb((d) => ({
      ...d,
      leads: d.leads.map((l) => {
        if (l.id !== leadId) return l;
        const { outcome: _o, ...rest } = l;
        return outcome ? { ...rest, outcome } : rest;
      }),
    }));
  }, []);

  const assignOwner = useCallback((contactId: ID, ownerId: ID) => {
    setDb((d) => {
      const owner = d.team.find((t) => t.id === ownerId);
      const next = {
        ...d,
        contacts: d.contacts.map((c) => (c.id === contactId ? { ...c, ownerId } : c)),
        leads: d.leads.map((l) => (l.contactId === contactId ? { ...l, ownerId } : l)),
      };
      return logActivity(next, contactId, `Assigned to ${owner?.name ?? "teammate"}`);
    });
  }, []);

  const setLifecycle = useCallback((contactId: ID, lifecycle: Lifecycle) => {
    setDb((d) => logActivity({ ...d, contacts: d.contacts.map((c) => (c.id === contactId ? { ...c, lifecycle } : c)) }, contactId, `Lifecycle changed to ${lifecycle.replace(/_/g, " ")}`));
  }, []);

  const completeTask = useCallback((taskId: ID) => {
    setDb((d) => {
      const task = d.tasks.find((t) => t.id === taskId);
      const next = { ...d, tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, status: "done" as const } : t)) };
      return task?.contactId ? logActivity(next, task.contactId, `Completed: ${task.title}`, "task") : next;
    });
  }, []);

  const snoozeTask = useCallback((taskId: ID, days: number) => {
    setDb((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, dueAt: new Date(Math.max(Date.parse(t.dueAt), NOW.getTime()) + days * 86_400_000).toISOString() } : t)),
    }));
  }, []);

  const addTask = useCallback((task: Omit<Task, "id" | "createdAt" | "status">) => {
    setDb((d) => {
      const next = { ...d, tasks: [{ ...task, id: newId("t"), status: "open" as const, createdAt: new Date().toISOString() }, ...d.tasks] };
      return task.contactId ? logActivity(next, task.contactId, `Task created: ${task.title}`, "task") : next;
    });
  }, []);

  const addNote = useCallback((contactId: ID, text: string) => {
    setDb((d) =>
      logActivity({ ...d, contacts: d.contacts.map((c) => (c.id === contactId ? { ...c, notesCount: c.notesCount + 1, lastActivityAt: new Date().toISOString() } : c)) }, contactId, "Note added", "note", text),
    );
  }, []);

  const logCall = useCallback((contactId: ID, summary: string) => {
    setDb((d) =>
      logActivity({ ...d, contacts: d.contacts.map((c) => (c.id === contactId ? { ...c, lastActivityAt: new Date().toISOString() } : c)) }, contactId, "Call logged", "system", summary),
    );
  }, []);

  const sendReply = useCallback((conversationId: ID, text: string) => {
    setDb((d) => {
      const conv = d.conversations.find((c) => c.id === conversationId);
      if (!conv) return d;
      const trimmed = text.trim();
      if (!trimmed) return d;
      const now = new Date().toISOString();
      const next = {
        ...d,
        conversations: d.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                unread: false,
                awaitingReply: false,
                lastMessageAt: now,
                messages: [...c.messages, { id: newId("m"), conversationId, direction: "out" as const, body: trimmed, at: now, authorId: CURRENT_USER_ID }],
              }
            : c,
        ),
      };
      return logActivity(next, conv.contactId, `${conv.channel === "whatsapp" ? "WhatsApp" : conv.channel} reply sent`, "conversation", trimmed);
    });
  }, []);

  const markNotificationsRead = useCallback(() => {
    setDb((d) => ({ ...d, notifications: d.notifications.map((n) => ({ ...n, read: true })) }));
  }, []);


  const setOrderStatus = useCallback((orderId: ID, status: OrderStatus, note?: string) => {
    setDb((d) => {
      const order = d.orders.find((o) => o.id === orderId);
      if (!order || order.status === status) return d;
      const now = new Date().toISOString();
      let next: Database = { ...d, orders: d.orders.map((o) => (o.id === orderId ? { ...o, status } : o)) };
      // Delivered COD orders become realised revenue only now (master prompt rule).
      if (status === "delivered") {
        next = {
          ...next,
          orders: next.orders.map((o) => (o.id === orderId && o.paymentStatus === "cod_pending" ? { ...o, paymentStatus: "paid" as const } : o)),
          deliveries: next.deliveries.map((x) => (x.orderId === orderId ? { ...x, status: "delivered" as const, deliveredAt: now } : x)),
          contacts: next.contacts.map((c) => (c.id === order.contactId ? { ...c, deliveredRevenue: c.deliveredRevenue + order.total, lastPurchaseAt: now } : c)),
        };
        if (order.paymentMethod === "cash_on_delivery" && !next.payments.some((p) => p.orderId === orderId)) {
          next = {
            ...next,
            payments: [{ id: newId("pay"), orderId, contactId: order.contactId, amount: order.total, method: "cash_on_delivery", status: "paid", at: now, remittanceDueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), remitted: false }, ...next.payments],
          };
        }
      }
      if (status === "awaiting_dispatch" && !next.deliveries.some((x) => x.orderId === orderId)) {
        const city = d.contacts.find((c) => c.id === order.contactId)?.city ?? "";
        next = {
          ...next,
          deliveries: [{ id: newId("dl"), orderId, contactId: order.contactId, courier: "Unassigned", trackingRef: `TRK-${order.reference}`, status: "scheduled", scheduledFor: new Date(Date.now() + 86_400_000).toISOString(), attempts: 0, city }, ...next.deliveries],
        };
      }
      if (status === "in_transit") {
        next = { ...next, deliveries: next.deliveries.map((x) => (x.orderId === orderId ? { ...x, status: "in_transit" as const } : x)) };
      }
      return logActivity(next, order.contactId, `Order ${order.reference}: ${status.replace(/_/g, " ")}`, "order", note);
    });
  }, []);

  const recordCodCheck = useCallback((orderId: ID, result: "confirmed" | "unreachable" | "cancelled", note?: string) => {
    setDb((d) => {
      const order = d.orders.find((o) => o.id === orderId);
      if (!order) return d;
      const status: OrderStatus = result === "confirmed" ? "confirmed" : result === "cancelled" ? "cancelled" : order.status;
      const title = result === "confirmed" ? `COD confirmed by customer for ${order.reference}` : result === "cancelled" ? `COD order ${order.reference} cancelled` : `COD check: customer unreachable for ${order.reference}`;
      const next: Database = {
        ...d,
        orders: d.orders.map((o) => (o.id === orderId ? { ...o, status } : o)),
        contacts: d.contacts.map((c) => (c.id === order.contactId ? { ...c, lastActivityAt: new Date().toISOString() } : c)),
      };
      return logActivity(next, order.contactId, title, "order", note);
    });
  }, []);

  const setDeliveryStatus = useCallback((deliveryId: ID, status: DeliveryStatus, failureReason?: string) => {
    setDb((d) => {
      const del = d.deliveries.find((x) => x.id === deliveryId);
      if (!del) return d;
      const now = new Date().toISOString();
      const attempts = status === "failed" ? del.attempts + 1 : del.attempts;
      const next: Database = {
        ...d,
        deliveries: d.deliveries.map((x) => {
          if (x.id !== deliveryId) return x;
          const { failureReason: _f, ...rest } = x;
          return { ...rest, status, attempts, ...(status === "delivered" ? { deliveredAt: now } : {}), ...(failureReason ? { failureReason } : {}) };
        }),
      };
      return logActivity(next, del.contactId, `Delivery ${del.trackingRef}: ${status.replace(/_/g, " ")}`, "system", failureReason);
    });
    const del = db.deliveries.find((x) => x.id === deliveryId);
    if (del && status === "delivered") setOrderStatus(del.orderId, "delivered");
    if (del && status === "returned") setOrderStatus(del.orderId, "returned", failureReason);
  }, [db.deliveries, setOrderStatus]);

  const markRemitted = useCallback((paymentId: ID) => {
    setDb((d) => {
      const pay = d.payments.find((p) => p.id === paymentId);
      if (!pay) return d;
      return logActivity({ ...d, payments: d.payments.map((p) => (p.id === paymentId ? { ...p, remitted: true } : p)) }, pay.contactId, "COD cash remitted", "system");
    });
  }, []);

  const saveProduct = useCallback((product: Omit<Product, "id"> & { id?: ID }) => {
    setDb((d) => {
      if (product.id && d.products.some((p) => p.id === product.id)) {
        return { ...d, products: d.products.map((p) => (p.id === product.id ? { ...p, ...product, id: p.id } : p)) };
      }
      return { ...d, products: [{ ...product, id: newId("prd") }, ...d.products] };
    });
  }, []);

  const adjustStock = useCallback((productId: ID, delta: number) => {
    setDb((d) => ({ ...d, products: d.products.map((p) => (p.id === productId ? { ...p, stock: Math.max(0, p.stock + delta) } : p)) }));
  }, []);

  const mergeContacts = useCallback((keepId: ID, mergeIds: ID[]) => {
    setDb((d) => {
      const keep = d.contacts.find((c) => c.id === keepId);
      const merged = d.contacts.filter((c) => mergeIds.includes(c.id) && c.id !== keepId);
      if (!keep || !merged.length) return d;
      const ids = new Set(merged.map((c) => c.id));
      const move = <T extends { contactId?: ID }>(rows: T[]) => rows.map((r) => (r.contactId && ids.has(r.contactId) ? { ...r, contactId: keepId } : r));
      const sum = (k: "totalOrders" | "lifetimeValue" | "deliveredRevenue" | "contributionProfit" | "outstandingBalance" | "notesCount") => merged.reduce((s, c) => s + c[k], keep[k]);
      const next: Database = {
        ...d,
        contacts: d.contacts
          .filter((c) => !ids.has(c.id))
          .map((c) => (c.id === keepId ? {
            ...c,
            tags: [...new Set([...c.tags, ...merged.flatMap((m) => m.tags)])],
            totalOrders: sum("totalOrders"), lifetimeValue: sum("lifetimeValue"), deliveredRevenue: sum("deliveredRevenue"),
            contributionProfit: sum("contributionProfit"), outstandingBalance: sum("outstandingBalance"), notesCount: sum("notesCount"),
            leadScore: Math.max(c.leadScore, ...merged.map((m) => m.leadScore)),
          } : c)),
        channelIdentities: move(d.channelIdentities), attributions: move(d.attributions), leads: move(d.leads), opportunities: move(d.opportunities),
        activities: move(d.activities), tasks: move(d.tasks), conversations: move(d.conversations), productInterests: move(d.productInterests),
        orders: move(d.orders), deliveries: move(d.deliveries), payments: move(d.payments),
      };
      return logActivity(next, keepId, `Merged ${merged.length} duplicate record${merged.length > 1 ? "s" : ""}`, "system", merged.map((m) => `${m.firstName} ${m.lastName} (${m.phone})`).join(", "));
    });
  }, []);

  const startLead = useCallback((contactId: ID) => {
    setDb((d) => {
      const c = d.contacts.find((x) => x.id === contactId);
      if (!c || d.leads.some((l) => l.contactId === contactId && l.stage !== "won")) return d;
      const now = new Date().toISOString();
      const next: Database = {
        ...d,
        leads: [{ id: newId("ld"), contactId, stage: "new_lead", source: c.source, ownerId: c.ownerId, score: c.leadScore, value: 0, slaStatus: "on_track", createdAt: now, updatedAt: now }, ...d.leads],
        contacts: d.contacts.map((x) => (x.id === contactId && (x.lifecycle === "contact" || x.lifecycle === "prospect") ? { ...x, lifecycle: "lead" as const } : x)),
      };
      return logActivity(next, contactId, "Lead opened", "lead");
    });
  }, []);


  const saveRecord = useCallback(<K extends EditableKey>(collection: K, record: Omit<Editable[K], "id"> & { id?: ID }): ID => {
    const id = record.id ?? newId(collection.slice(0, 3));
    setDb((d) => {
      const list = d[collection] as unknown as { id: ID }[];
      const exists = list.some((r) => r.id === id);
      const next = exists ? list.map((r) => (r.id === id ? { ...r, ...record, id } : r)) : [{ ...record, id }, ...list];
      return { ...d, [collection]: next };
    });
    return id;
  }, []);

  const removeRecord = useCallback((collection: EditableKey, id: ID) => {
    setDb((d) => ({ ...d, [collection]: (d[collection] as unknown as { id: ID }[]).filter((r) => r.id !== id) }));
  }, []);

  const updateSettings = useCallback((patch: Partial<BusinessSettings>) => {
    setDb((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }, []);

  const updateAgent = useCallback((patch: Partial<AgentConfig>) => {
    setDb((d) => ({ ...d, agent: { ...d.agent, ...patch } }));
  }, []);

  const setIntegration = useCallback((id: IntegrationState["id"], status: IntegrationState["status"]) => {
    setDb((d) => ({
      ...d,
      integrations: d.integrations.map((x) => (x.id === id ? (status === "simulated" ? { id, status, connectedAt: new Date().toISOString() } : { id, status }) : x)),
    }));
  }, []);

  const assignRider = useCallback((deliveryId: ID, riderId: ID | undefined) => {
    setDb((d) => {
      const del = d.deliveries.find((x) => x.id === deliveryId);
      if (!del) return d;
      const rider = d.riders.find((r) => r.id === riderId);
      const next: Database = {
        ...d,
        deliveries: d.deliveries.map((x) => {
          if (x.id !== deliveryId) return x;
          const { riderId: _r, ...rest } = x;
          return rider ? { ...rest, riderId: rider.id, courier: "In-house Rider" } : rest;
        }),
      };
      return logActivity(next, del.contactId, rider ? `Delivery ${del.trackingRef} assigned to ${rider.name}` : `Rider removed from ${del.trackingRef}`);
    });
  }, []);

  const moveStock = useCallback((productId: ID, delta: number, reason: StockMovement["reason"], note?: string) => {
    setDb((d) => ({
      ...d,
      products: d.products.map((p) => (p.id === productId ? { ...p, stock: Math.max(0, p.stock + delta) } : p)),
      stockMovements: [{ id: newId("sm"), productId, delta, reason, ...(note ? { note } : {}), at: new Date().toISOString() }, ...d.stockMovements],
    }));
  }, []);

  const recordPayment = useCallback((orderId: ID, method: PaymentMethod) => {
    setDb((d) => {
      const order = d.orders.find((o) => o.id === orderId);
      if (!order || order.paymentStatus === "paid") return d;
      const now = new Date().toISOString();
      const next: Database = {
        ...d,
        orders: d.orders.map((o) => (o.id === orderId ? { ...o, paymentStatus: "paid" as const, paymentMethod: method } : o)),
        payments: [{ id: newId("pay"), orderId, contactId: order.contactId, amount: order.total, method, status: "paid", at: now }, ...d.payments],
        contacts: d.contacts.map((c) => (c.id === order.contactId ? { ...c, outstandingBalance: Math.max(0, c.outstandingBalance - order.total) } : c)),
      };
      return logActivity(next, order.contactId, `Payment recorded for ${order.reference}`, "system", method.replace(/_/g, " "));
    });
  }, []);

  const logRun = useCallback((run: Omit<WorkflowRun, "id" | "at">) => {
    setDb((d) => ({ ...d, workflowRuns: [{ ...run, id: newId("run"), at: new Date().toISOString() }, ...d.workflowRuns] }));
  }, []);

  const retryRun = useCallback((runId: ID) => {
    setDb((d) => ({
      ...d,
      workflowRuns: d.workflowRuns.map((r) => (r.id === runId && r.status === "failed" ? { ...r, status: "succeeded" as const, detail: `${r.detail} — retried and succeeded`, at: new Date().toISOString() } : r)),
    }));
  }, []);

  const sendBroadcast = useCallback((broadcastId: ID) => {
    setDb((d) => {
      const bc = d.broadcasts.find((b) => b.id === broadcastId);
      if (!bc || bc.status === "sent") return d;
      const seg = d.segments.find((s) => s.id === bc.segmentId);
      const size = seg?.memberCount ?? 0;
      // Practice estimate: consent share from the whole contact base.
      const consentShare = d.contacts.length ? d.contacts.filter((c) => c.consentMarketing).length / d.contacts.length : 0;
      const recipients = Math.round(size * consentShare);
      return {
        ...d,
        broadcasts: d.broadcasts.map((b) => (b.id === broadcastId ? { ...b, status: "sent" as const, sentAt: new Date().toISOString(), recipients, skippedNoConsent: size - recipients } : b)),
      };
    });
  }, []);

  const addCampaignSpend = useCallback((campaignId: ID, amount: number, revenue = 0) => {
    setDb((d) => ({ ...d, campaigns: d.campaigns.map((c) => (c.id === campaignId ? { ...c, spend: c.spend + amount, revenue: c.revenue + revenue } : c)) }));
  }, []);


  const updateContactDetails = useCallback((contactId: ID, patch: Partial<Pick<Contact, "firstName" | "lastName" | "phone" | "city" | "address" | "landmark">>) => {
    setDb((d) => {
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => typeof v === "string" && v.trim())) as typeof patch;
      if (!Object.keys(clean).length) return d;
      const next: Database = { ...d, contacts: d.contacts.map((c) => (c.id === contactId ? { ...c, ...clean, lastActivityAt: new Date().toISOString() } : c)) };
      return logActivity(next, contactId, "Details saved from chat", "system", Object.entries(clean).map(([k, v]) => `${k}: ${v}`).join(" · "));
    });
  }, []);

  const simulateIncoming = useCallback((conversationId: ID, text: string) => {
    setDb((d) => {
      const conv = d.conversations.find((c) => c.id === conversationId);
      const body = text.trim();
      if (!conv || !body) return d;
      const now = new Date().toISOString();
      let next: Database = {
        ...d,
        conversations: d.conversations.map((c) => (c.id === conversationId ? { ...c, unread: true, awaitingReply: true, lastMessageAt: now, messages: [...c.messages, { id: newId("m"), conversationId, direction: "in" as const, body, at: now }] } : c)),
        contacts: d.contacts.map((c) => (c.id === conv.contactId ? { ...c, lastActivityAt: now } : c)),
      };
      if (next.settings.staffAlerts.newMessage) {
        const who = next.contacts.find((c) => c.id === conv.contactId);
        next = notify(next, `New message from ${who ? `${who.firstName} ${who.lastName}` : "a customer"}`, body.slice(0, 90));
      }
      return logActivity(next, conv.contactId, "Message received (practice)", "conversation", body);
    });
  }, []);

  const sendProductCard = useCallback((conversationId: ID, productId: ID) => {
    setDb((d) => {
      const conv = d.conversations.find((c) => c.id === conversationId);
      const p = d.products.find((x) => x.id === productId);
      if (!conv || !p) return d;
      const currency = d.workspaces.find((w) => w.id === "ws_luxe")?.currency ?? d.workspaces[0]?.currency ?? "NGN";
      const price = new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(p.price);
      const photos = d.media.filter((m) => m.productId === p.id).length;
      const body = [`${p.name} — ${price}`, p.description, p.deposit ? `Deposit to book: ${new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(p.deposit)}` : "Pay on delivery available.", photos ? `[${Math.min(photos, d.agent.maxImages)} photo${Math.min(photos, d.agent.maxImages) > 1 ? "s" : ""} attached]` : "", "Reply YES to order."].filter(Boolean).join("\n");
      const now = new Date().toISOString();
      let next: Database = {
        ...d,
        conversations: d.conversations.map((c) => (c.id === conversationId ? { ...c, unread: false, awaitingReply: false, lastMessageAt: now, messages: [...c.messages, { id: newId("m"), conversationId, direction: "out" as const, body, at: now, authorId: CURRENT_USER_ID }] } : c)),
      };
      if (!next.productInterests.some((pi) => pi.contactId === conv.contactId && pi.productId === p.id)) {
        next = { ...next, productInterests: [{ id: newId("pi"), contactId: conv.contactId, productId: p.id, productName: p.name, category: p.category, intent: "asked_price", capturedAt: now }, ...next.productInterests] };
      }
      return logActivity(next, conv.contactId, `Product card sent: ${p.name}`, "conversation");
    });
  }, []);

  const updateWorkspace = useCallback((patch: Partial<Pick<Database["workspaces"][number], "name" | "currency">>) => {
    setDb((d) => ({ ...d, workspaces: d.workspaces.map((w) => (w.id === workspaceIdRef.current ? { ...w, ...patch } : w)) }));
  }, []);

  const submitLeadForm = useCallback((input: { name: string; phone: string; productId?: ID; message?: string }): ID | null => {
    const name = input.name.trim();
    const phone = input.phone.trim();
    if (!name || phone.replace(/\D/g, "").length < 10) return null;
    const contactId = newId("ct");
    setDb((d) => {
      const now = new Date().toISOString();
      const [firstName, ...rest] = name.split(/\s+/);
      const product = d.products.find((p) => p.id === input.productId);
      const owner = d.team.find((t) => t.role === "sales_rep" && t.active)?.id ?? d.team[0]!.id;
      const contact: Contact = {
        id: contactId, firstName: firstName!, lastName: rest.join(" ") || "—", phone, countryCode: "NG", city: "Lagos", lifecycle: "lead", source: "website",
        ownerId: owner, leadScore: 20, tags: ["web-form"], createdAt: now, lastActivityAt: now, totalOrders: 0, lifetimeValue: 0, deliveredRevenue: 0,
        contributionProfit: 0, outstandingBalance: 0, consentMarketing: false, notesCount: 0,
      };
      const convId = `cv_${contactId}`;
      const body = input.message?.trim() || (product ? `Interested in ${product.name}` : "Submitted the website form");
      let next: Database = {
        ...d,
        contacts: [contact, ...d.contacts],
        leads: [{ id: newId("ld"), contactId, stage: "new_lead", source: "website", ownerId: owner, score: 20, value: product?.price ?? 0, slaStatus: "on_track", createdAt: now, updatedAt: now }, ...d.leads],
        conversations: [{ id: convId, contactId, channel: "webchat", subject: body.slice(0, 48), unread: true, awaitingReply: true, assigneeId: owner, lastMessageAt: now, messages: [{ id: newId("m"), conversationId: convId, direction: "in", body, at: now }] }, ...d.conversations],
        ...(product ? { productInterests: [{ id: newId("pi"), contactId, productId: product.id, productName: product.name, category: product.category, intent: "browsing" as const, capturedAt: now }, ...d.productInterests] } : {}),
      };
      if (next.settings.staffAlerts.newMessage) next = notify(next, `New web form lead: ${name}`, body.slice(0, 90));
      return logActivity(next, contactId, "Lead captured from website form", "lead", body);
    });
    return contactId;
  }, []);

  const resetPracticeData = useCallback(() => {
    try {
      localStorage.removeItem(PRACTICE_KEY);
    } catch {
      /* nothing saved */
    }
    setDb(createInitialDatabase());
    setWorkspaceId("ws_luxe");
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      db,
      workspaceId,
      actions: {
        addContact, createOrder, setLeadStage, setLeadOutcome, assignOwner, setLifecycle, completeTask, snoozeTask, addTask, addNote, logCall,
        sendReply, markNotificationsRead, setWorkspace: setWorkspaceId, setOrderStatus, recordCodCheck, setDeliveryStatus, markRemitted,
        saveProduct, adjustStock, mergeContacts, startLead, resetPracticeData, saveRecord, removeRecord, updateSettings, updateAgent,
        setIntegration, assignRider, moveStock, recordPayment, logRun, retryRun, sendBroadcast, addCampaignSpend,
        updateContactDetails, simulateIncoming, sendProductCard, updateWorkspace, submitLeadForm,
      },
    }),
    [db, workspaceId, addContact, createOrder, setLeadStage, setLeadOutcome, assignOwner, setLifecycle, completeTask, snoozeTask, addTask, addNote, logCall, sendReply, markNotificationsRead, setOrderStatus, recordCodCheck, setDeliveryStatus, markRemitted, saveProduct, adjustStock, mergeContacts, startLead, resetPracticeData, saveRecord, removeRecord, updateSettings, updateAgent, setIntegration, assignRider, moveStock, recordPayment, logRun, retryRun, sendBroadcast, addCampaignSpend, updateContactDetails, simulateIncoming, sendProductCard, updateWorkspace, submitLeadForm],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <DataProvider>");
  return ctx;
}

export const useDb = () => useStore().db;
export const useActions = () => useStore().actions;
export function useWorkspace() {
  const { db, workspaceId } = useStore();
  return db.workspaces.find((w) => w.id === workspaceId) ?? db.workspaces[0]!;
}
