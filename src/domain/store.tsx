/**
 * Client-side data store. Screens read the Database snapshot through
 * `useDb()` and mutate only through the typed actions exposed here, so the
 * in-memory adapter can later be replaced by server calls without touching
 * screen code.
 */

import { acceptsPayment, canMove } from "./rules";
import { assignTo, deliveryLink, feeFor, newToken, OPEN_STATUSES, OUTCOME_LABEL, partnerFor, partnerMessage, payCommission as payOut, phoneDigits, recordAttempt, runAssignment, stateOf } from "./ops";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createInitialDatabase, CURRENT_USER_ID, NOW, setNow, type Database } from "./database";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { fetchRaw, toDatabase } from "@/data/live";
import { liveWriter } from "@/data/live-actions";
import { liveActions } from "@/data/live-bridge";
import { NOW as PRACTICE_NOW } from "./seed";
import { codRisk } from "./repositories";
import * as practiceSeed from "./practice-seed";
import { autoMap, flatten, normalise, PLATFORMS } from "./intake";
import { careGuideText, confirmedText, dispatchedText, receiptNo, receiptText } from "./receipt";
import type {
  AgentConfig, Broadcast, BusinessSettings, CalendarEvent, Campaign, Channel, OrderForm, OrderFormField, Contact, DeliveryStatus, FollowUpRule, ID, IntegrationState, KnowledgeEntry,
  LeadOutcome, LeadStage, Lifecycle, MediaAsset, MessageTemplate, OrderStatus, PaymentMethod, Product, Rider, StockMovement, Task,
  TeamMember, Workflow, WorkflowRun, FactKind, Connection, ConnectionEvent, AdDraft, MetaLink, PaymentProviderId, PaymentSetup, PaymentEvent,
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
  connections: Connection;
  adDrafts: AdDraft;
  orderForms: OrderForm;
  events: CalendarEvent;
}
type EditableKey = keyof Editable;

/**
 * Practice Mode persistence: the whole sample database is saved in this
 * browser so testers can work through flows across refreshes. Bump the
 * version when the seed or types change shape — old saves are then ignored.
 */
const PRACTICE_KEY = "bizriva.practice-db";
const MODE_KEY = "bizriva.mode";
/** Tables whose changes refresh the screens on live data. */
const LIVE_TABLES = ["orders", "order_items", "deliveries", "payments", "payment_events", "messages", "conversations", "contacts", "leads", "order_contact_attempts", "products", "complaints", "workspace_members", "workspaces"];
const PRACTICE_VERSION = 11; // v11: agents, call list, partners, commission, email campaigns

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

export interface StoreActions {
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
  submitOrderForm: (formId: ID, input: OrderFormInput) => ID | null;
  trackForm: (formId: ID, kind: "view" | "start" | "duplicate", field?: OrderFormField) => void;
  simulateFormTraffic: (formId: ID) => void;
  recordDeposit: (orderId: ID, amount: number, method: PaymentMethod) => void;
  requestBalance: (orderId: ID) => void;
  issueInvoice: (orderId: ID) => string;
  flagComplaint: (conversationId: ID, reason: string) => void;
  resolveComplaint: (conversationId: ID, resolution: string) => void;
  toggleSetupStep: (stepId: string) => void;
  importProducts: (rows: Omit<Product, "id">[]) => number;
  addPolicyStarters: () => number;
  importChatHistory: (input: ChatImportInput) => { contactId: ID; conversationId: ID; added: number; duplicates: number } | null;
  saveFacts: (contactId: ID, facts: { kind: FactKind; value: string; monthDay?: string }[], source: "chat" | "staff") => void;
  removeFact: (contactId: ID, factId: ID) => void;
  /** Sends a payment link for the customer's latest unpaid order into this chat. Returns the order reference, or null if nothing is owed. */
  sendPaymentLink: (conversationId: ID) => string | null;
  /** A website, form or store sends a submission. Returns what happened. */
  receiveIntake: (connectionId: ID, raw: unknown) => ConnectionEvent | null;
  connectMeta: (adAccountId: string) => void;
  disconnectMeta: () => void;
  syncMeta: () => void;
  setCapi: (capi: Partial<MetaLink["capi"]>) => void;
  /** Creates the ad in Meta (paused). Returns false when Meta isn't connected. */
  publishAd: (adId: ID) => boolean;
  setAdStatus: (adId: ID, status: "active" | "paused") => void;
  connectPayments: (provider: PaymentProviderId) => void;
  disconnectPayments: () => void;
  updatePayments: (patch: Partial<PaymentSetup>) => void;
  /** Sends the customer their ways to pay for their latest unpaid order. Returns the order reference, or an error. */
  requestPayment: (conversationId: ID, methods: ("transfer" | "link" | "cod")[]) => { reference?: string; error?: string };
  /** Practice: the provider's webhook reports money arriving. */
  simulatePayment: (input: { orderId?: ID; amount: number; method: PaymentEvent["method"]; payerName?: string; toMain?: boolean }) => PaymentEvent | null;
  matchPayment: (eventId: ID, orderId: ID) => void;
  /** Send the receipt and/or care guide for an order into the customer's chat. */
  sendOrderMessage: (orderId: ID, what: "receipt" | "care") => boolean;
  /** Give orders to an agent (or pick one by the sharing rule when memberId is missing). */
  assignOrders: (orderIds: ID[], memberId?: ID) => void;
  /** Share unassigned orders and move orders nobody called in time. */
  runAssignmentNow: () => { assigned: number; moved: number };
  /** One call or WhatsApp attempt on an order. */
  logAttempt: (orderId: ID, by: ID, via: "call" | "whatsapp", outcome: import("./types").AttemptOutcome, note?: string) => void;
  setOnDuty: (memberId: ID, onDuty: boolean) => void;
  /** Send a delivery to a rider or partner on WhatsApp. Returns the message and the WhatsApp link to open. */
  sendToPartner: (deliveryId: ID, riderId?: ID) => SendResult | Promise<SendResult>;
  /** What the rider/partner does from their private link. */
  partnerAction: (token: string, action: "accept" | "delivered" | "failed", opts?: { cash?: number; reason?: string }) => boolean;
  payCommission: (memberId: ID) => void;
  /** Message a customer in their chat, opening a WhatsApp chat if they don't have one. */
  messageContact: (contactId: ID, body: string) => void;
}

export type SendResult = { text: string; waUrl: string; link: string } | { error: string };

export interface ChatImportInput {
  /** Existing contact, or details for a new one. */
  contactId?: ID;
  newContact?: { name: string; phone: string; city?: string };
  businessSender: string;
  messages: { at: string; sender: string; body: string }[];
  fileName: string;
}

export interface OrderFormInput {
  packageId: ID;
  name: string;
  phone: string;
  address?: string;
  city?: string;
  landmark?: string;
  note?: string;
  adSource?: string;
}

interface StoreValue {
  db: Database;
  workspaceId: ID;
  actions: StoreActions;
  /** Whether screens show the real business data or Practice Mode samples. */
  live: LiveState;
}

export interface LiveState {
  /** Signed in with a business, so real data is available. */
  available: boolean;
  on: boolean;
  status: "off" | "loading" | "ready" | "error";
  error?: string;
  businessName?: string;
  setMode: (mode: "practice" | "live") => void;
  reload: () => Promise<void>;
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
  const dbRef = useRef(db);
  dbRef.current = db;
  useEffect(() => {
    const saved = loadPractice();
    if (saved) {
      setDb(saved.db);
      setWorkspaceId(saved.workspaceId);
    }
    loaded.current = true;
  }, []);
  // ─── live data (signed in with a business) ───
  const auth = useAuth();
  const [modePref, setModePref] = useState<"practice" | "live" | null>(null);
  useEffect(() => { try { const m = localStorage.getItem(MODE_KEY); if (m === "practice" || m === "live") setModePref(m); } catch { /* blocked */ } }, []);
  const wsId = auth.current?.workspaceId;
  const available = !!auth.session && !!wsId && !!supabase();
  const liveOn = available && modePref !== "practice";
  const [liveStatus, setLiveStatus] = useState<{ status: LiveState["status"]; error?: string }>({ status: "off" });
  const liveRef = useRef(false);
  liveRef.current = liveOn;
  const reload = useCallback(async () => {
    const sb = supabase();
    if (!sb || !wsId || !liveRef.current) return;
    try {
      const raw = await fetchRaw(sb, wsId);
      if (!liveRef.current) return;
      setNow(new Date());
      setDb(toDatabase(raw));
      setWorkspaceId(wsId);
      setLiveStatus({ status: "ready" });
    } catch (e) {
      setLiveStatus({ status: "error", error: e instanceof Error ? e.message : "Couldn't load your data" });
    }
  }, [wsId]);
  useEffect(() => {
    if (liveOn) {
      setLiveStatus({ status: "loading" });
      void reload();
      // Changes by teammates, customers, riders and payment providers show up by themselves.
      const sb = supabase()!;
      let t: ReturnType<typeof setTimeout> | undefined;
      const ch = sb.channel(`ws-${wsId}`);
      for (const table of LIVE_TABLES) ch.on("postgres_changes", { event: "*", schema: "public", table, filter: `workspace_id=eq.${wsId}` }, () => { clearTimeout(t); t = setTimeout(() => void reload(), 700); });
      ch.subscribe();
      return () => { clearTimeout(t); void sb.removeChannel(ch); };
    }
    if (liveStatus.status !== "off") {
      // Back to Practice Mode: the sample data exactly as it was left.
      setNow(PRACTICE_NOW);
      const saved = loadPractice();
      setDb(saved?.db ?? createInitialDatabase());
      setWorkspaceId(saved?.workspaceId ?? "ws_luxe");
      setLiveStatus({ status: "off" });
    }
    return undefined;
  }, [liveOn, wsId]); // eslint-disable-line react-hooks/exhaustive-deps
  const setMode = useCallback((m: "practice" | "live") => { setModePref(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* blocked */ } }, []);

  useEffect(() => {
    if (loaded.current && !liveRef.current && liveStatus.status === "off") savePractice(db, workspaceId);
  }, [db, workspaceId, liveStatus.status]);

  const logActivity = (d: Database, contactId: ID, title: string, kind: "lead" | "note" | "task" | "conversation" | "order" | "system" = "system", description?: string): Database => ({
    ...d,
    activities: [
      { id: newId("act"), contactId, kind, title, at: new Date().toISOString(), actorId: CURRENT_USER_ID, ...(description ? { description } : {}) },
      ...d.activities,
    ],
  });


  /** Orders move the customer's open lead along the agreed stages. */
  const advanceLead = (d: Database, contactId: ID, stage: LeadStage): Database => {
    const order = ["new_lead", "first_contact", "engaged", "qualified", "high_intent", "negotiating", "checkout_started", "order_created", "order_confirmed", "converted"];
    return {
      ...d,
      leads: d.leads.map((l) => (l.contactId === contactId && l.stage !== "lost" && order.indexOf(l.stage) < order.indexOf(stage) ? { ...l, stage, updatedAt: new Date().toISOString(), ...(stage === "converted" ? { slaStatus: "met" as const } : {}) } : l)),
    };
  };

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
        status: "pending_verification" as const,
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
      let withLog = logActivity(advanceLead(next, input.contactId, "order_created"), input.contactId, `Order ${order.reference} placed`, "order", order.productNames.join(", "));
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
      if (!order || !canMove(order.status, status)) return d;
      const now = new Date().toISOString();
      let next: Database = { ...d, orders: d.orders.map((o) => (o.id === orderId ? { ...o, status } : o)) };
      // A delivered order coming back is no longer revenue.
      if (status === "returned" && order.status === "delivered") {
        next = { ...next, contacts: next.contacts.map((c) => (c.id === order.contactId ? { ...c, deliveredRevenue: Math.max(0, c.deliveredRevenue - order.total) } : c)) };
      }
      if (status === "confirmed") next = advanceLead(next, order.contactId, "order_confirmed");
      // Conversions API: one Purchase event per order, at the moment the business chose.
      const capi = next.settings.meta.capi;
      if (next.settings.meta.status === "connected" && capi.enabled && status === capi.when && !next.capiEvents.some((e) => e.orderId === orderId)) {
        next = { ...next, capiEvents: [{ id: newId("capi"), orderId, reference: order.reference, value: order.total, at: new Date().toISOString(), eventId: `bz_${order.reference}` }, ...next.capiEvents].slice(0, 300) };
      }
      if (status === "delivered") next = advanceLead(next, order.contactId, "converted");
      // Delivered COD orders become realised revenue only now (master prompt rule).
      if (status === "delivered") {
        next = {
          ...next,
          orders: next.orders.map((o) => (o.id === orderId && o.paymentMethod === "cash_on_delivery" && (o.paymentStatus === "cod_pending" || o.paymentStatus === "part_paid") ? { ...o, paymentStatus: "paid" as const, amountPaid: o.total } : o)),
          deliveries: next.deliveries.map((x) => (x.orderId === orderId ? { ...x, status: "delivered" as const, deliveredAt: now } : x)),
          contacts: next.contacts.map((c) => (c.id === order.contactId ? { ...c, deliveredRevenue: c.deliveredRevenue + order.total, lastPurchaseAt: now } : c)),
        };
        const cashDue = order.total - (order.amountPaid ?? 0);
        if (order.paymentMethod === "cash_on_delivery" && cashDue > 0 && !next.payments.some((p) => p.orderId === orderId && p.method === "cash_on_delivery")) {
          next = {
            ...next,
            payments: [{ id: newId("pay"), orderId, contactId: order.contactId, amount: cashDue, method: "cash_on_delivery", status: "paid", at: now, remittanceDueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), remitted: false }, ...next.payments],
          };
        }
      }
      if (status === "ready_for_dispatch" && !next.deliveries.some((x) => x.orderId === orderId)) {
        const city = d.contacts.find((c) => c.id === order.contactId)?.city ?? "";
        next = {
          ...next,
          deliveries: [{ id: newId("dl"), orderId, contactId: order.contactId, courier: "Unassigned", trackingRef: `TRK-${order.reference}`, status: "scheduled", scheduledFor: new Date(Date.now() + 86_400_000).toISOString(), attempts: 0, city }, ...next.deliveries],
        };
      }
      if (status === "dispatched" || status === "in_transit") {
        next = { ...next, deliveries: next.deliveries.map((x) => (x.orderId === orderId ? { ...x, status: "in_transit" as const } : x)) };
      }
      if (status === "refused") {
        next = { ...next, deliveries: next.deliveries.map((x) => (x.orderId === orderId ? { ...x, status: "failed" as const, failureReason: "Refused at the door", attempts: x.attempts + 1 } : x)) };
      }
      if (status === "returned") {
        next = { ...next, deliveries: next.deliveries.map((x) => (x.orderId === orderId && x.status !== "delivered" ? { ...x, status: "returned" as const } : x)) };
      }
      // Customer updates, on the channel chosen in Settings (WhatsApp lands in the chat).
      next = customerUpdate(next, orderId, status);
      return logActivity(next, order.contactId, `Order ${order.reference}: ${status.replace(/_/g, " ")}`, "order", note);
    });
  }, []);

  const recordCodCheck = useCallback((orderId: ID, result: "confirmed" | "unreachable" | "cancelled", note?: string) => {
    setDb((d) => {
      const order = d.orders.find((o) => o.id === orderId);
      if (!order) return d;
      const status: OrderStatus = result === "confirmed" ? "confirmed" : result === "cancelled" ? "cancelled" : order.status;
      if (status !== order.status && !canMove(order.status, status)) return d;
      const title = result === "confirmed" ? `COD confirmed by customer for ${order.reference}` : result === "cancelled" ? `COD order ${order.reference} cancelled` : `COD check: customer unreachable for ${order.reference}`;
      const next: Database = {
        ...d,
        orders: d.orders.map((o) => (o.id === orderId ? { ...o, status } : o)),
        contacts: d.contacts.map((c) => (c.id === order.contactId ? { ...c, lastActivityAt: new Date().toISOString() } : c)),
      };
      return logActivity(result === "confirmed" ? advanceLead(next, order.contactId, "order_confirmed") : next, order.contactId, title, "order", note);
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
      if (!c || d.leads.some((l) => l.contactId === contactId && !["converted", "lost"].includes(l.stage))) return d;
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
        orders: d.orders.map((o) => (o.id === orderId ? { ...o, paymentStatus: "paid" as const, paymentMethod: method, amountPaid: o.total } : o)),
        payments: [{ id: newId("pay"), orderId, contactId: order.contactId, amount: order.total - (order.amountPaid ?? 0), method, status: "paid", at: now }, ...d.payments],
        contacts: d.contacts.map((c) => (c.id === order.contactId ? { ...c, outstandingBalance: Math.max(0, c.outstandingBalance - (order.total - (order.amountPaid ?? 0))) } : c)),
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
      // Email needs an email address as well as consent.
      const emailShare = d.contacts.length ? d.contacts.filter((c) => c.consentMarketing && c.email).length / d.contacts.length : 0;
      const recipients = Math.round(size * (bc.channel === "email" ? emailShare : consentShare));
      // Practice results: the live version counts real deliveries, opens, clicks and orders that came from the campaign link.
      const delivered = Math.round(recipients * 0.97);
      const orders = Math.max(recipients ? 1 : 0, Math.round(delivered * (bc.channel === "email" ? 0.025 : 0.045)));
      const avg = d.orders.length ? d.orders.reduce((n, o) => n + o.total, 0) / d.orders.length : 0;
      const stats = bc.channel === "email"
        ? { delivered, opened: Math.round(delivered * 0.42), clicked: Math.round(delivered * 0.11), orders, revenue: Math.round(orders * avg) }
        : { delivered, orders, revenue: Math.round(orders * avg) };
      return {
        ...d,
        broadcasts: d.broadcasts.map((b) => (b.id === broadcastId ? { ...b, status: "sent" as const, sentAt: new Date().toISOString(), recipients, skippedNoConsent: size - recipients, stats } : b)),
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


  /** Order updates to the customer: confirmed, dispatched, delivered (receipt + how-to-use guide). */
  const customerUpdate = (d: Database, orderId: ID, status: OrderStatus): Database => {
    const order = d.orders.find((o) => o.id === orderId);
    if (!order) return d;
    const key = status === "confirmed" ? "order_confirmed" : status === "dispatched" || status === "in_transit" ? "dispatched" : status === "delivered" ? "delivered" : null;
    if (!key) return d;
    const channel = d.settings.notify[key];
    if (channel === "off") return d;
    if (key === "dispatched" && status === "in_transit" && d.activities.some((a) => a.contactId === order.contactId && a.title === `Dispatch message sent for ${order.reference}`)) return d;
    const msgs: string[] = [];
    if (key === "order_confirmed") msgs.push(confirmedText(d, order));
    if (key === "dispatched") msgs.push(dispatchedText(d, order));
    if (key === "delivered") {
      if (d.settings.afterDelivery.receipt) msgs.push(receiptText(d, order));
      const guide = d.settings.afterDelivery.careGuide ? careGuideText(d, order) : null;
      if (guide) msgs.push(guide);
    }
    if (!msgs.length) return d;
    let next = d;
    if (channel === "whatsapp") msgs.forEach((m) => { next = postToCustomer(next, order.contactId, m); });
    const title = key === "order_confirmed" ? `Confirmation sent for ${order.reference}` : key === "dispatched" ? `Dispatch message sent for ${order.reference}` : `Receipt ${receiptNo(order)}${msgs.length > 1 ? " and care guide" : ""} sent`;
    return logActivity(next, order.contactId, title, "conversation", `by ${channel}${channel !== "whatsapp" ? " (practice — nothing sent)" : ""}`);
  };

  /** Find the contact's chat, or open a WhatsApp one, and post an outgoing message. */
  const postToCustomer = (d: Database, contactId: ID, body: string): Database => {
    const now = new Date().toISOString();
    const conv = d.conversations.find((c) => c.contactId === contactId);
    if (conv) {
      return { ...d, conversations: d.conversations.map((c) => (c.id === conv.id ? { ...c, awaitingReply: false, lastMessageAt: now, messages: [...c.messages, { id: newId("m"), conversationId: c.id, direction: "out" as const, body, at: now, authorId: CURRENT_USER_ID }] } : c)) };
    }
    const convId = newId("cv");
    return { ...d, conversations: [{ id: convId, contactId, channel: "whatsapp", subject: body.slice(0, 48), unread: false, awaitingReply: false, assigneeId: CURRENT_USER_ID, lastMessageAt: now, messages: [{ id: newId("m"), conversationId: convId, direction: "out", body, at: now, authorId: CURRENT_USER_ID }] }, ...d.conversations] };
  };
  const moneyIn = (d: Database, n: number) => {
    const currency = d.workspaces.find((w) => w.id === workspaceIdRef.current)?.currency ?? "NGN";
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  };

  const submitOrderForm = useCallback((formId: ID, input: OrderFormInput) => {
    const name = input.name.trim();
    const digits = input.phone.replace(/\D/g, "");
    if (!name || digits.length < 10) return null;
    const f0 = dbRef.current.orderForms.find((f) => f.id === formId);
    if (!f0 || !f0.packages.some((p) => p.id === input.packageId)) return null;
    const result = { orderId: newId("ord"), contactId: newId("ct") };
    setDb((d) => {
      const form = d.orderForms.find((f) => f.id === formId);
      // Price comes from the saved form, never from what the browser sends.
      const pkg = form?.packages.find((p) => p.id === input.packageId);
      const product = form && d.products.find((p) => p.id === form.productId);
      if (!form || !pkg || !product) return d;
      const now = new Date().toISOString();
      const existing = d.contacts.find((c) => c.phone.replace(/\D/g, "").slice(-10) === digits.slice(-10));
      const contactId = existing?.id ?? result.contactId;
      result.contactId = contactId;
      const [firstName, ...rest] = name.split(/\s+/);
      const owner = d.team.find((t) => t.role === "sales_rep" && t.active)?.id ?? d.team[0]!.id;
      const city = input.city?.trim() || existing?.city || "Lagos";
      let next: Database = d;
      if (!existing) {
        const contact: Contact = {
          id: contactId, firstName: firstName!, lastName: rest.join(" ") || "—", phone: input.phone.trim(), countryCode: "NG", city, lifecycle: "lead", source: "website",
          ownerId: owner, leadScore: 40, tags: ["order-form"], createdAt: now, lastActivityAt: now, totalOrders: 0, lifetimeValue: 0, deliveredRevenue: 0,
          contributionProfit: 0, outstandingBalance: 0, consentMarketing: false, notesCount: 0,
          ...(input.address?.trim() ? { address: input.address.trim() } : {}), ...(input.landmark?.trim() ? { landmark: input.landmark.trim() } : {}),
        };
        next = { ...next, contacts: [contact, ...next.contacts] };
      } else if (input.address?.trim()) {
        next = { ...next, contacts: next.contacts.map((c) => (c.id === contactId ? { ...c, address: input.address!.trim(), ...(input.landmark?.trim() ? { landmark: input.landmark.trim() } : {}) } : c)) };
      }
      const reference = `BZ-${1000 + next.orders.length + 1}`;
      const order = {
        id: result.orderId, reference, contactId, placedAt: now, status: "pending_verification" as const, itemsCount: pkg.qty, total: pkg.price,
        cogs: product.cost * pkg.qty, shippingFee: 0, paymentStatus: form.payOnDelivery ? ("cod_pending" as const) : ("unpaid" as const),
        paymentMethod: form.payOnDelivery ? ("cash_on_delivery" as const) : ("bank_transfer" as const), channel: "webchat" as const,
        productNames: [`${pkg.qty}× ${product.name}`, ...(pkg.gift ? [`Gift: ${pkg.gift}`] : [])], formId,
      };
      const adSource = input.adSource?.trim() || "Direct";
      next = {
        ...next,
        orders: [order, ...next.orders],
        contacts: next.contacts.map((c) => (c.id === contactId ? { ...c, totalOrders: c.totalOrders + 1, lifetimeValue: c.lifetimeValue + pkg.price, lastActivityAt: now } : c)),
        orderForms: next.orderForms.map((f) => (f.id === formId ? { ...f, stats: { ...f.stats, submits: f.stats.submits + 1 } } : f)),
        formSubmissions: [{ id: newId("fs"), formId, orderId: order.id, contactId, packageId: pkg.id, total: pkg.price, region: city, adSource, at: now, emailSent: next.integrations.some((i) => i.id === "email" && i.status === "simulated"), eventSent: form.pixels.meta || form.pixels.tiktok }, ...next.formSubmissions],
      };
      const summary = `New order ${reference} from "${form.name}": ${pkg.label} (${pkg.qty}× ${product.name})${pkg.gift ? ` + ${pkg.gift}` : ""}, ${moneyIn(next, pkg.price)}. ${[input.address, city, input.landmark].filter((x) => x?.trim()).join(", ")}`;
      const conv = next.conversations.find((c) => c.contactId === contactId);
      if (conv) {
        next = { ...next, conversations: next.conversations.map((c) => (c.id === conv.id ? { ...c, unread: true, awaitingReply: true, lastMessageAt: now, messages: [...c.messages, { id: newId("m"), conversationId: c.id, direction: "in" as const, body: summary, at: now }] } : c)) };
      } else {
        const convId = `cv_${contactId}`;
        next = { ...next, conversations: [{ id: convId, contactId, channel: "webchat", subject: `Order form: ${pkg.label}`, unread: true, awaitingReply: true, assigneeId: owner, lastMessageAt: now, messages: [{ id: newId("m"), conversationId: convId, direction: "in", body: summary, at: now }] }, ...next.conversations] };
      }
      next = advanceLead(next, contactId, "order_created");
      next = notify(next, `Order form: ${reference}`, `${name} · ${pkg.label} · ${moneyIn(next, pkg.price)} · ${adSource}`, "success");
      return logActivity(next, contactId, `Order ${reference} placed on order form`, "order", summary);
    });
    return result.orderId;
  }, []);

  const trackForm = useCallback((formId: ID, kind: "view" | "start" | "duplicate", field?: OrderFormField) => {
    setDb((d) => ({
      ...d,
      orderForms: d.orderForms.map((f) => {
        if (f.id !== formId) return f;
        const st = { ...f.stats, dropOff: { ...f.stats.dropOff } };
        if (kind === "view") st.views++;
        if (kind === "start") st.starts++;
        if (kind === "duplicate") st.duplicatesBlocked++;
        if (field) st.dropOff[field] = (st.dropOff[field] ?? 0) + 1;
        return { ...f, stats: st };
      }),
    }));
  }, []);

  const simulateFormTraffic = useCallback((formId: ID) => {
    setDb((d) => ({
      ...d,
      orderForms: d.orderForms.map((f) => {
        if (f.id !== formId) return f;
        const drop = { ...f.stats.dropOff };
        const spread: [OrderFormField, number][] = [["phone", 3], ["address", 6], ["city", 1], ["landmark", 2]];
        spread.forEach(([k, n]) => { if (f.fields.includes(k)) drop[k] = (drop[k] ?? 0) + n; });
        return { ...f, stats: { ...f.stats, views: f.stats.views + 60, starts: f.stats.starts + 18, dropOff: drop } };
      }),
    }));
  }, []);

  const recordDeposit = useCallback((orderId: ID, amount: number, method: PaymentMethod) => {
    setDb((d) => {
      const order = d.orders.find((o) => o.id === orderId);
      if (!order || !(amount > 0) || !acceptsPayment(order)) return d;
      const paid = Math.min(order.total, (order.amountPaid ?? 0) + amount);
      const status = paid >= order.total ? ("paid" as const) : ("part_paid" as const);
      const now = new Date().toISOString();
      const next: Database = {
        ...d,
        orders: d.orders.map((o) => (o.id === orderId ? { ...o, amountPaid: paid, paymentStatus: status } : o)),
        payments: [{ id: newId("pay"), orderId, contactId: order.contactId, amount: Math.min(amount, order.total - (order.amountPaid ?? 0)), method, status: "paid", at: now }, ...d.payments],
      };
      return logActivity(next, order.contactId, `${status === "paid" ? "Full payment" : "Deposit"} of ${moneyIn(d, amount)} for ${order.reference}`, "order", method.replace(/_/g, " "));
    });
  }, []);

  const requestBalance = useCallback((orderId: ID) => {
    setDb((d) => {
      const order = d.orders.find((o) => o.id === orderId);
      if (!order) return d;
      const balance = order.total - (order.amountPaid ?? 0);
      if (balance <= 0) return d;
      const who = d.contacts.find((c) => c.id === order.contactId);
      const link = d.settings.paymentLinkTemplate.replace("{{order}}", order.reference);
      const body = `Hi ${who?.firstName ?? "there"}, the balance on order ${order.reference} is ${moneyIn(d, balance)}.\nPay securely here: ${link}\nOr pay the rider on delivery.`;
      return logActivity(postToCustomer(d, order.contactId, body), order.contactId, `Balance request sent for ${order.reference}`, "conversation", moneyIn(d, balance));
    });
  }, []);

  const issueInvoice = useCallback((orderId: ID): string => {
    let no = "";
    setDb((d) => {
      const order = d.orders.find((o) => o.id === orderId);
      if (!order) return d;
      if (order.invoiceNo) { no = order.invoiceNo; return d; }
      no = `INV-${order.reference.replace(/\D/g, "")}`;
      const next: Database = { ...d, orders: d.orders.map((o) => (o.id === orderId ? { ...o, invoiceNo: no } : o)) };
      return logActivity(next, order.contactId, `Invoice ${no} issued`, "order");
    });
    return no;
  }, []);

  const flagComplaint = useCallback((conversationId: ID, reason: string) => {
    setDb((d) => {
      const conv = d.conversations.find((c) => c.id === conversationId);
      if (!conv || !reason.trim()) return d;
      const now = new Date().toISOString();
      const support = d.team.find((t) => t.role === "support" && t.active) ?? d.team.find((t) => t.role === "manager") ?? d.team[0]!;
      let next: Database = {
        ...d,
        conversations: d.conversations.map((c) => (c.id === conversationId ? { ...c, complaint: { status: "open" as const, reason: reason.trim(), openedAt: now } } : c)),
        tasks: [{ id: newId("t"), contactId: conv.contactId, title: `Resolve complaint: ${reason.trim().slice(0, 60)}`, dueAt: new Date(Date.now() + 4 * 3_600_000).toISOString(), status: "open", priority: "high", assigneeId: support.id, type: "general", createdAt: now }, ...d.tasks],
      };
      next = notify(next, "Complaint raised", reason.trim().slice(0, 90), "warning");
      return logActivity(next, conv.contactId, "Complaint raised", "conversation", reason.trim());
    });
  }, []);

  const resolveComplaint = useCallback((conversationId: ID, resolution: string) => {
    setDb((d) => {
      const conv = d.conversations.find((c) => c.id === conversationId);
      if (!conv?.complaint) return d;
      const now = new Date().toISOString();
      const next: Database = {
        ...d,
        conversations: d.conversations.map((c) => (c.id === conversationId && c.complaint ? { ...c, complaint: { ...c.complaint, status: "resolved" as const, resolvedAt: now, resolution: resolution.trim() || "Resolved" } } : c)),
        tasks: d.tasks.map((t) => (t.contactId === conv.contactId && t.status === "open" && t.title.startsWith("Resolve complaint") ? { ...t, status: "done" as const } : t)),
      };
      return logActivity(next, conv.contactId, "Complaint resolved", "conversation", resolution.trim());
    });
  }, []);

  const toggleSetupStep = useCallback((stepId: string) => {
    setDb((d) => {
      const done = d.settings.setupDone.includes(stepId) ? d.settings.setupDone.filter((s) => s !== stepId) : [...d.settings.setupDone, stepId];
      return { ...d, settings: { ...d.settings, setupDone: done } };
    });
  }, []);

  const importProducts = useCallback((rows: Omit<Product, "id">[]): number => {
    const clean = rows.filter((r) => r.name.trim() && r.price > 0);
    if (!clean.length) return 0;
    setDb((d) => ({ ...d, products: [...d.products, ...clean.map((r) => ({ ...r, id: newId("p"), active: r.active ?? true }))] }));
    return clean.length;
  }, []);

  const addPolicyStarters = useCallback((): number => {
    let added = 0;
    setDb((d) => {
      const have = new Set(d.knowledge.map((k) => k.question.toLowerCase()));
      const fresh = practiceSeed.policyStarters.filter((p) => !have.has(p.question.toLowerCase()));
      added = fresh.length;
      if (!fresh.length) return d;
      const now = new Date().toISOString();
      return { ...d, knowledge: [...d.knowledge, ...fresh.map((p) => ({ ...p, id: newId("kb"), updatedAt: now }))] };
    });
    return added;
  }, []);

  const importChatHistory = useCallback((input: ChatImportInput) => {
    const d0 = dbRef.current;
    if (!input.messages.length) return null;
    let contactId = input.contactId;
    if (!contactId) {
      const name = input.newContact?.name.trim() ?? "";
      const digits = input.newContact?.phone.replace(/\D/g, "") ?? "";
      if (!name || digits.length < 10) return null;
      const match = d0.contacts.find((c) => c.phone.replace(/\D/g, "").slice(-10) === digits.slice(-10));
      contactId = match?.id ?? newId("ct");
    }
    const existingConv = d0.conversations.find((c) => c.contactId === contactId && c.channel === "whatsapp");
    const conversationId = existingConv?.id ?? `cv_${contactId}`;
    const have = new Set((existingConv?.messages ?? []).map((m) => `${m.at}|${m.body}`));
    const fresh = input.messages.filter((m) => !have.has(`${m.at}|${m.body}`));
    const result = { contactId: contactId!, conversationId, added: fresh.length, duplicates: input.messages.length - fresh.length };
    const cid = contactId!;
    setDb((d) => {
      let next: Database = d;
      const now = new Date().toISOString();
      const last = input.messages[input.messages.length - 1]!.at;
      if (!d.contacts.some((c) => c.id === cid)) {
        const [firstName, ...rest] = input.newContact!.name.trim().split(/\s+/);
        const owner = d.team.find((t) => t.role === "sales_rep" && t.active)?.id ?? d.team[0]!.id;
        const contact: Contact = {
          id: cid, firstName: firstName!, lastName: rest.join(" ") || "—", phone: input.newContact!.phone.trim(), countryCode: "NG", city: input.newContact!.city?.trim() || "Lagos",
          lifecycle: "lead", source: "import", ownerId: owner, leadScore: 10, tags: ["imported-chat"], createdAt: input.messages[0]!.at, lastActivityAt: last,
          totalOrders: 0, lifetimeValue: 0, deliveredRevenue: 0, contributionProfit: 0, outstandingBalance: 0, consentMarketing: false, notesCount: 0,
        };
        next = { ...next, contacts: [contact, ...next.contacts] };
      }
      const msgs = fresh.map((m) => ({ id: newId("m"), conversationId, direction: (m.sender === input.businessSender ? "out" : "in") as "in" | "out", body: m.body, at: m.at, ...(m.sender === input.businessSender ? { authorId: CURRENT_USER_ID } : {}) }));
      const conv = next.conversations.find((c) => c.id === conversationId);
      if (conv) {
        const all = [...conv.messages, ...msgs].sort((a, b) => +new Date(a.at) - +new Date(b.at));
        next = { ...next, conversations: next.conversations.map((c) => (c.id === conversationId ? { ...c, messages: all, lastMessageAt: all[all.length - 1]!.at } : c)) };
      } else {
        const sorted = msgs.sort((a, b) => +new Date(a.at) - +new Date(b.at));
        const contact = next.contacts.find((c) => c.id === cid)!;
        next = { ...next, conversations: [{ id: conversationId, contactId: cid, channel: "whatsapp", subject: `Imported chat (${input.fileName})`.slice(0, 60), unread: false, awaitingReply: false, assigneeId: contact.ownerId, lastMessageAt: sorted[sorted.length - 1]!.at, messages: sorted }, ...next.conversations] };
      }
      next = { ...next, contacts: next.contacts.map((c) => (c.id === cid && +new Date(c.lastActivityAt) < +new Date(last) ? { ...c, lastActivityAt: last } : c)) };
      return logActivity(next, cid, "WhatsApp chat history imported", "conversation", `${fresh.length} messages from ${input.fileName}${result.duplicates ? `, ${result.duplicates} already here` : ""} · ${now.slice(0, 10)}`);
    });
    return result;
  }, []);

  const saveFacts = useCallback((contactId: ID, facts: { kind: FactKind; value: string; monthDay?: string }[], source: "chat" | "staff") => {
    setDb((d) => {
      const clean = facts.filter((f) => f.value.trim());
      if (!clean.length) return d;
      const now = new Date().toISOString();
      const next: Database = {
        ...d,
        contacts: d.contacts.map((c) => {
          if (c.id !== contactId) return c;
          const have = c.facts ?? [];
          const add = clean.filter((f) => !have.some((h) => h.kind === f.kind && h.value.toLowerCase() === f.value.trim().toLowerCase()))
            .map((f) => ({ id: newId("fact"), kind: f.kind, value: f.value.trim(), ...(f.monthDay ? { monthDay: f.monthDay } : {}), source, at: now }));
          // One birthday per person: a new one replaces the old.
          const kept = add.some((f) => f.kind === "birthday") ? have.filter((h) => h.kind !== "birthday") : have;
          return { ...c, facts: [...kept, ...add] };
        }),
      };
      return logActivity(next, contactId, "Customer memory updated", "note", clean.map((f) => `${f.kind.replace("_", " ")}: ${f.value}`).join(" · "));
    });
  }, []);

  const removeFact = useCallback((contactId: ID, factId: ID) => {
    setDb((d) => ({ ...d, contacts: d.contacts.map((c) => (c.id === contactId ? { ...c, facts: (c.facts ?? []).filter((f) => f.id !== factId) } : c)) }));
  }, []);

  const sendPaymentLink = useCallback((conversationId: ID): string | null => {
    const d0 = dbRef.current;
    const conv = d0.conversations.find((c) => c.id === conversationId);
    if (!conv) return null;
    const order = d0.orders
      .filter((o) => o.contactId === conv.contactId && !["cancelled", "returned", "refused"].includes(o.status) && o.total - (o.amountPaid ?? (o.paymentStatus === "paid" ? o.total : 0)) > 0)
      .sort((a, b) => +new Date(b.placedAt) - +new Date(a.placedAt))[0];
    if (!order) return null;
    setDb((d) => {
      const balance = order.total - (order.amountPaid ?? 0);
      const who = d.contacts.find((c) => c.id === order.contactId);
      const link = d.settings.paymentLinkTemplate.replace("{{order}}", order.reference);
      const body = `Hi ${who?.firstName ?? "there"}, here's your secure payment link for order ${order.reference} (${moneyIn(d, balance)}):\n${link}\nYou can also pay the rider on delivery.`;
      return logActivity(postToCustomer(d, order.contactId, body), order.contactId, `Payment link sent for ${order.reference}`, "conversation", moneyIn(d, balance));
    });
    return order.reference;
  }, []);

  const receiveIntake = useCallback((connectionId: ID, raw: unknown): ConnectionEvent | null => {
    const d0 = dbRef.current;
    const conn = d0.connections.find((c) => c.id === connectionId);
    if (!conn) return null;
    const now = new Date().toISOString();
    const rawText = JSON.stringify(raw, null, 2);
    const base = { id: newId("ce"), connectionId, at: now, raw: rawText };
    let event: ConnectionEvent;
    if (!conn.active) {
      event = { ...base, status: "failed", summary: "Connection is switched off — submission refused." };
    } else {
      const flat = flatten(raw, conn.platform);
      const map = { ...autoMap(flat), ...conn.fieldMap };
      const n = normalise(flat, map);
      const dupe = n.externalId && d0.connectionEvents.find((e) => e.connectionId === connectionId && e.externalId === n.externalId && e.status !== "failed");
      if (n.missing.length) {
        event = { ...base, status: "failed", summary: `Missing ${n.missing.join(" and ")}. Check the field matching.`, ...(n.externalId ? { externalId: n.externalId } : {}) };
      } else if (dupe) {
        event = { ...base, status: "duplicate", summary: `Already received (their reference ${n.externalId}). Skipped.`, externalId: n.externalId!, ...(dupe.contactId ? { contactId: dupe.contactId } : {}), ...(dupe.orderId ? { orderId: dupe.orderId } : {}) };
      } else {
        const lc = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
        const product = n.product ? d0.products.find((p) => lc(n.product!).includes(lc(p.name)) || lc(p.name).includes(lc(n.product!))) : undefined;
        const digits = n.phone.replace(/\D/g, "").slice(-10);
        const existing = d0.contacts.find((c) => c.phone.replace(/\D/g, "").slice(-10) === digits);
        const contactId = existing?.id ?? newId("ct");
        const asOrder = conn.createAs === "order" && !!product;
        const orderId = asOrder ? newId("ord") : undefined;
        const platformName = PLATFORMS.find((p) => p.id === conn.platform)?.name ?? conn.platform;
        event = {
          ...base, status: asOrder ? "created_order" : "created_lead", contactId, ...(orderId ? { orderId } : {}), ...(n.externalId ? { externalId: n.externalId } : {}),
          summary: asOrder ? `Order for ${n.quantity}× ${product!.name} from ${n.name}` : `Lead: ${n.name}${n.product ? ` — asked about ${n.product}${product ? "" : " (not matched to a product)"}` : ""}`,
        };
        setDb((d) => {
          const owner = d.team.find((t) => t.role === "sales_rep" && t.active)?.id ?? d.team[0]!.id;
          const [firstName, ...rest] = n.name.split(/\s+/);
          let next: Database = d;
          if (!d.contacts.some((c) => c.id === contactId)) {
            const contact: Contact = {
              id: contactId, firstName: firstName!, lastName: rest.join(" ") || "—", phone: n.phone, countryCode: "NG", city: n.city ?? "Lagos", lifecycle: "lead", source: "website",
              ownerId: owner, leadScore: asOrder ? 60 : 30, tags: [`from-${conn.platform}`], createdAt: now, lastActivityAt: now, totalOrders: 0, lifetimeValue: 0, deliveredRevenue: 0,
              contributionProfit: 0, outstandingBalance: 0, consentMarketing: false, notesCount: 0,
              ...(n.email ? { email: n.email } : {}), ...(n.address ? { address: n.address } : {}), ...(n.landmark ? { landmark: n.landmark } : {}),
            };
            next = { ...next, contacts: [contact, ...next.contacts] };
          }
          const lines = [`From ${platformName}${n.source ? ` (${n.source})` : ""}`, n.product ? `${n.quantity}× ${n.product}` : "", [n.address, n.city, n.landmark].filter(Boolean).join(", "), n.note ?? ""].filter(Boolean);
          const body = lines.join("\n");
          if (asOrder) {
            const total = n.total ?? product!.price * n.quantity;
            const reference = `BZ-${1000 + next.orders.length + 1}`;
            next = {
              ...next,
              orders: [{ id: orderId!, reference, contactId, placedAt: now, status: "pending_verification", itemsCount: n.quantity, total, cogs: product!.cost * n.quantity, shippingFee: 0,
                paymentStatus: "cod_pending", paymentMethod: "cash_on_delivery", channel: "webchat", productNames: [`${n.quantity}× ${product!.name}`] }, ...next.orders],
              contacts: next.contacts.map((c) => (c.id === contactId ? { ...c, totalOrders: c.totalOrders + 1, lifetimeValue: c.lifetimeValue + total, lastActivityAt: now } : c)),
            };
            next = advanceLead(next, contactId, "order_created");
          } else if (!next.leads.some((l) => l.contactId === contactId && !["converted", "lost"].includes(l.stage))) {
            next = { ...next, leads: [{ id: newId("ld"), contactId, stage: "new_lead", source: "website", ownerId: owner, score: 30, value: product?.price ?? 0, slaStatus: "on_track", createdAt: now, updatedAt: now }, ...next.leads] };
          }
          const conv = next.conversations.find((c) => c.contactId === contactId);
          if (conv) next = { ...next, conversations: next.conversations.map((c) => (c.id === conv.id ? { ...c, unread: true, awaitingReply: true, lastMessageAt: now, messages: [...c.messages, { id: newId("m"), conversationId: c.id, direction: "in" as const, body, at: now }] } : c)) };
          else {
            const convId = `cv_${contactId}`;
            next = { ...next, conversations: [{ id: convId, contactId, channel: "webchat", subject: `${platformName}: ${n.product ?? "enquiry"}`.slice(0, 60), unread: true, awaitingReply: true, assigneeId: owner, lastMessageAt: now, messages: [{ id: newId("m"), conversationId: convId, direction: "in", body, at: now }] }, ...next.conversations] };
          }
          next = notify(next, asOrder ? `New order from ${platformName}` : `New lead from ${platformName}`, event.summary, asOrder ? "success" : "info");
          return logActivity(next, contactId, asOrder ? `Order received from ${platformName}` : `Lead received from ${platformName}`, asOrder ? "order" : "lead", body);
        });
      }
    }
    setDb((d) => ({
      ...d,
      connectionEvents: [event, ...d.connectionEvents].slice(0, 200),
      connections: d.connections.map((c) => (c.id === connectionId ? { ...c, lastEventAt: now } : c)),
    }));
    return event;
  }, []);

  const connectMeta = useCallback((adAccountId: string) => {
    setDb((d) => {
      const acc = practiceSeed.metaAdAccounts.find((a) => a.id === adAccountId);
      if (!acc) return d;
      const now = new Date().toISOString();
      const next: Database = {
        ...d,
        settings: { ...d.settings, meta: { ...d.settings.meta, status: "connected", adAccount: acc, pixel: practiceSeed.metaPixels[0]!, connectedAt: now, lastSyncAt: now } },
        integrations: d.integrations.map((i) => (i.id === "meta_ads" ? { ...i, status: "simulated" as const, connectedAt: now } : i)),
      };
      return notify(next, "Meta Ads connected", `${acc.name} — campaigns and spend will sync every few hours.`, "success");
    });
  }, []);

  const disconnectMeta = useCallback(() => {
    setDb((d) => ({
      ...d,
      settings: { ...d.settings, meta: { status: "not_connected", capi: d.settings.meta.capi } },
      integrations: d.integrations.map((i) => (i.id === "meta_ads" ? { id: i.id, status: "not_connected" as const } : i)),
    }));
  }, []);

  const syncMeta = useCallback(() => {
    setDb((d) => {
      if (d.settings.meta.status !== "connected") return d;
      const now = new Date().toISOString();
      // Practice: active Meta campaigns pick up a day's spend and leads.
      return {
        ...d,
        settings: { ...d.settings, meta: { ...d.settings.meta, lastSyncAt: now } },
        campaigns: d.campaigns.map((c, i) => (c.platform === "meta" && c.status === "active" ? { ...c, spend: c.spend + 12000 + i * 3000, leads: c.leads + 3 + (i % 3) } : c)),
      };
    });
  }, []);

  const setCapi = useCallback((capi: Partial<MetaLink["capi"]>) => {
    setDb((d) => ({ ...d, settings: { ...d.settings, meta: { ...d.settings.meta, capi: { ...d.settings.meta.capi, ...capi } } } }));
  }, []);

  const publishAd = useCallback((adId: ID): boolean => {
    if (dbRef.current.settings.meta.status !== "connected") return false;
    setDb((d) => {
      const ad = d.adDrafts.find((a) => a.id === adId);
      if (!ad || ad.campaignId) return d;
      const campaignId = newId("cp");
      const next: Database = {
        ...d,
        campaigns: [{ id: campaignId, name: ad.name, platform: "meta", status: "paused", spend: 0, revenue: 0, leads: 0, issue: "Created from Bizriva — paused until you start it" }, ...d.campaigns],
        adDrafts: d.adDrafts.map((a) => (a.id === adId ? { ...a, status: "paused" as const, campaignId } : a)),
      };
      return notify(next, "Ad created in Meta (paused)", `${ad.name} — press Start when you're ready to spend.`, "success");
    });
    return true;
  }, []);

  const setAdStatus = useCallback((adId: ID, status: "active" | "paused") => {
    setDb((d) => {
      const ad = d.adDrafts.find((a) => a.id === adId);
      if (!ad?.campaignId) return d;
      return {
        ...d,
        adDrafts: d.adDrafts.map((a) => (a.id === adId ? { ...a, status } : a)),
        campaigns: d.campaigns.map((c) => (c.id === ad.campaignId ? { ...c, status, ...(status === "active" ? { issue: undefined } : {}) } : c)) as typeof d.campaigns,
      };
    });
  }, []);

  const connectPayments = useCallback((provider: PaymentProviderId) => {
    setDb((d) => {
      const now = new Date().toISOString();
      const next: Database = { ...d, settings: { ...d.settings, payments: { ...d.settings.payments, provider, status: "connected", connectedAt: now } }, integrations: d.integrations.map((i) => (i.id === "paystack" ? { ...i, status: "simulated" as const, connectedAt: now } : i)) };
      return notify(next, "Payments connected", `${provider[0]!.toUpperCase()}${provider.slice(1)} — customers can now pay inside the chat.`, "success");
    });
  }, []);

  const disconnectPayments = useCallback(() => {
    setDb((d) => ({ ...d, settings: { ...d.settings, payments: (({ provider: _p, connectedAt: _c, ...rest }) => ({ ...rest, status: "not_connected" as const }))(d.settings.payments) }, integrations: d.integrations.map((i) => (i.id === "paystack" ? { id: i.id, status: "not_connected" as const } : i)) }));
  }, []);

  const updatePayments = useCallback((patch: Partial<PaymentSetup>) => {
    setDb((d) => ({ ...d, settings: { ...d.settings, payments: { ...d.settings.payments, ...patch } } }));
  }, []);

  const balanceOf = (o: { total: number; amountPaid?: number; paymentStatus: string }) => o.total - (o.amountPaid ?? (o.paymentStatus === "paid" ? o.total : 0));
  const openOrderFor = (d: Database, contactId: ID) => d.orders
    .filter((o) => o.contactId === contactId && !["cancelled", "returned", "refused"].includes(o.status) && balanceOf(o) > 0)
    .sort((a, b) => +new Date(a.placedAt) - +new Date(b.placedAt))[0];

  /** Give the customer their own account number (practice: made up from their phone). */
  const ensureAccount = (d: Database, contactId: ID): Database => {
    const ps = d.settings.payments;
    const c = d.contacts.find((x) => x.id === contactId);
    if (!c || c.virtualAccount || ps.status !== "connected" || !ps.provider) return d;
    const digits = c.phone.replace(/\D/g, "").slice(-8).padStart(8, "0");
    const va = { bank: practiceSeed.providerBanks[ps.provider], number: `99${digits}`, name: `${d.settings.businessName.split(" ").slice(0, 2).join(" ")}/${c.firstName} ${c.lastName[0] ?? ""}`.trim(), provider: ps.provider };
    return { ...d, contacts: d.contacts.map((x) => (x.id === contactId ? { ...x, virtualAccount: va } : x)) };
  };

  const requestPayment = useCallback((conversationId: ID, methods: ("transfer" | "link" | "cod")[]) => {
    const d0 = dbRef.current;
    const conv = d0.conversations.find((c) => c.id === conversationId);
    if (!conv) return { error: "Chat not found." };
    const order = openOrderFor(d0, conv.contactId);
    if (!order) return { error: "Nothing is owed: this customer has no unpaid order. Create an order first." };
    const ps = d0.settings.payments;
    const live = ps.status === "connected";
    const use = methods.filter((m) => (m === "cod" ? order.paymentMethod === "cash_on_delivery" : live));
    if (!use.length) return { error: live ? "Pick at least one way to pay." : "Connect a payment provider on the Payments page first." };
    setDb((d) => {
      let next = ensureAccount(d, conv.contactId);
      const c = next.contacts.find((x) => x.id === conv.contactId)!;
      const amount = balanceOf(order);
      const lines = [`Hi ${c.firstName}, here's how to pay for order ${order.reference} (${moneyIn(next, amount)}):`];
      if (use.includes("transfer") && c.virtualAccount) lines.push("", `🏦 *Bank transfer* — confirmed instantly`, `${c.virtualAccount.bank}`, `Account: *${c.virtualAccount.number}*`, `Name: ${c.virtualAccount.name}`, `This account is just for you — use it any time you buy from us.`);
      if (use.includes("link")) lines.push("", `💳 *Card, USSD or bank app*`, next.settings.paymentLinkTemplate.replace("{{order}}", order.reference));
      if (use.includes("cod")) lines.push("", `🚚 Or pay the rider when it arrives.`);
      lines.push("", "You'll get a receipt here the moment it lands. ✅");
      next = postToCustomer(next, conv.contactId, lines.join("\n"));
      next = { ...next, paymentRequests: [{ id: newId("pr"), orderId: order.id, contactId: conv.contactId, amount, at: new Date().toISOString(), methods: use, status: "sent" as const }, ...next.paymentRequests] };
      return logActivity(next, conv.contactId, `Payment requested for ${order.reference}`, "order", use.join(", "));
    });
    return { reference: order.reference };
  }, []);

  /** Apply a payment to an order: balance, status, receipt, alert, settlement. */
  const applyPayment = (d: Database, ev: PaymentEvent, orderId: ID): { db: Database; ev: PaymentEvent } => {
    const order = d.orders.find((o) => o.id === orderId);
    if (!order || !acceptsPayment(order)) return { db: d, ev };
    const due = balanceOf(order);
    const paid = Math.min(order.total, (order.amountPaid ?? 0) + ev.amount);
    const full = paid >= order.total;
    const status: PaymentEvent["status"] = ev.amount > due ? "over" : full ? "matched" : "part";
    const ps = d.settings.payments;
    // Split by product category; the rest goes to the default account.
    const product = d.products.find((p) => order.productNames.some((n) => n.includes(p.name)));
    const accounts = ps.settlement;
    const defaultAcc = accounts.find((a) => a.id === ps.defaultAccountId) ?? accounts[0];
    const rules = ps.splits.filter((r) => r.category === "all" || r.category === product?.category);
    let left = ev.amount;
    const settledTo: PaymentEvent["settledTo"] = [];
    rules.forEach((r) => { const acc = accounts.find((a) => a.id === r.accountId); if (!acc || left <= 0) return; const amt = Math.round((ev.amount * r.percent) / 100); settledTo.push({ label: acc.label, amount: Math.min(amt, left) }); left -= Math.min(amt, left); });
    if (left > 0 && defaultAcc) settledTo.push({ label: defaultAcc.label, amount: left });
    const receiptNo = `RCPT-${order.reference.replace(/\D/g, "")}-${(d.paymentEvents.length + 1).toString().padStart(3, "0")}`;
    const out: PaymentEvent = { ...ev, orderId, contactId: order.contactId, status, settledTo, receiptNo };
    const method = ev.method === "transfer" ? "bank_transfer" as const : ev.method === "ussd" ? "ussd" as const : "card" as const;
    let next: Database = {
      ...d,
      orders: d.orders.map((o) => (o.id === orderId ? { ...o, amountPaid: paid, paymentStatus: full ? "paid" as const : "part_paid" as const, paymentMethod: full ? method : o.paymentMethod,
        status: full && ps.autoConfirm && o.status === "pending_verification" ? "confirmed" as const : o.status } : o)),
      payments: [{ id: newId("pay"), orderId, contactId: order.contactId, amount: Math.min(ev.amount, due), method, status: "paid", at: ev.at }, ...d.payments],
      paymentRequests: d.paymentRequests.map((r) => (r.orderId === orderId && r.status !== "paid" ? { ...r, status: full ? "paid" as const : "part_paid" as const } : r)),
      contacts: d.contacts.map((c) => (c.id === order.contactId ? { ...c, outstandingBalance: Math.max(0, c.outstandingBalance - Math.min(ev.amount, due)) } : c)),
    };
    if (full && ps.autoConfirm && order.status === "pending_verification") next = advanceLead(next, order.contactId, "order_confirmed");
    if (ps.autoReceipt) {
      const lines = [`✅ *Payment received — thank you!*`, `${moneyIn(next, ev.amount)} for order ${order.reference}`, `Receipt: ${receiptNo}`];
      if (!full) lines.push(`Balance left: ${moneyIn(next, order.total - paid)}`);
      if (status === "over") lines.push(`You paid ${moneyIn(next, ev.amount - due)} more than the balance — we'll refund or credit it. A team member will confirm.`);
      if (full) lines.push(order.status === "pending_verification" || order.status === "confirmed" ? "We're getting it ready for dispatch now." : "");
      next = postToCustomer(next, order.contactId, lines.filter(Boolean).join("\n"));
    }
    const who = next.contacts.find((c) => c.id === order.contactId);
    next = notify(next, `${moneyIn(next, ev.amount)} received`, `${who ? `${who.firstName} ${who.lastName}` : ev.payerName} · ${order.reference} · ${status === "matched" ? "paid in full" : status === "part" ? "part payment" : "overpaid — check"}`, status === "over" ? "warning" : "success");
    next = logActivity(next, order.contactId, `Payment of ${moneyIn(next, ev.amount)} received`, "order", `${ev.method} · ${receiptNo}`);
    return { db: next, ev: out };
  };

  const simulatePayment = useCallback((input: { orderId?: ID; amount: number; method: PaymentEvent["method"]; payerName?: string; toMain?: boolean }) => {
    const d0 = dbRef.current;
    const ps = d0.settings.payments;
    if (ps.status !== "connected" || !ps.provider || !(input.amount > 0)) return null;
    const order = input.orderId ? d0.orders.find((o) => o.id === input.orderId) : undefined;
    const contact = order ? d0.contacts.find((c) => c.id === order.contactId) : undefined;
    const main = ps.settlement.find((a) => a.id === ps.defaultAccountId) ?? ps.settlement[0];
    let result: PaymentEvent | null = null;
    setDb((d) => {
      let next = order && !input.toMain ? ensureAccount(d, order.contactId) : d;
      const c = contact ? next.contacts.find((x) => x.id === contact.id) : undefined;
      const ev: PaymentEvent = {
        id: newId("pe"), at: new Date().toISOString(), provider: ps.provider!, method: input.method, amount: input.amount,
        payerName: input.payerName ?? (c ? `${c.firstName} ${c.lastName}`.toUpperCase() : "UNKNOWN SENDER"), reference: `${ps.provider!.slice(0, 3).toUpperCase()}_${Math.random().toString(36).slice(2, 10)}`,
        paidInto: input.toMain || !c?.virtualAccount ? main?.accountNumber ?? "main" : c.virtualAccount.number, status: "unmatched", settledTo: [],
      };
      // A transfer into the customer's own account (or a link/card payment for an order) matches by itself.
      if (order && (!input.toMain || input.method !== "transfer")) {
        const r = applyPayment(next, ev, order.id);
        next = r.db; result = r.ev;
      } else {
        result = { ...ev, settledTo: main ? [{ label: main.label, amount: ev.amount }] : [] };
        next = notify(next, `${moneyIn(next, ev.amount)} arrived — not matched`, `${ev.payerName} paid into ${main?.label ?? "your main account"}. Match it to an order on Payments.`, "warning");
      }
      return { ...next, paymentEvents: [result!, ...next.paymentEvents].slice(0, 300) };
    });
    return result;
  }, []);

  const matchPayment = useCallback((eventId: ID, orderId: ID) => {
    setDb((d) => {
      const ev = d.paymentEvents.find((e) => e.id === eventId);
      const target = d.orders.find((o) => o.id === orderId);
      if (!ev || ev.status !== "unmatched" || !target || !acceptsPayment(target)) return d;
      const r = applyPayment(d, ev, orderId);
      return { ...r.db, paymentEvents: r.db.paymentEvents.map((e) => (e.id === eventId ? r.ev : e)) };
    });
  }, []);

  const sendOrderMessage = useCallback((orderId: ID, what: "receipt" | "care"): boolean => {
    const d0 = dbRef.current;
    const order = d0.orders.find((o) => o.id === orderId);
    if (!order) return false;
    const text = what === "receipt" ? receiptText(d0, order) : careGuideText(d0, order);
    if (!text) return false;
    setDb((d) => logActivity(postToCustomer(d, order.contactId, text), order.contactId, what === "receipt" ? `Receipt ${receiptNo(order)} sent` : `Care guide sent for ${order.reference}`, "conversation"));
    return true;
  }, []);

  const assignOrders = useCallback((orderIds: ID[], memberId?: ID) => {
    setDb((d) => {
      let next = d;
      for (const id of orderIds) {
        const o = next.orders.find((x) => x.id === id);
        if (!o || !OPEN_STATUSES.includes(o.status)) continue;
        const who = memberId ?? runAssignment({ ...next, orders: next.orders.map((x) => (x.id === id ? (({ assignedTo: _a, ...r }) => r)(x) : x)) }).db.orders.find((x) => x.id === id)?.assignedTo;
        const m = next.team.find((t) => t.id === who);
        if (!m) continue;
        next = logActivity(assignTo(next, id, m.id), o.contactId, `Order ${o.reference} given to ${m.name}`, "order");
      }
      return next;
    });
  }, []);

  const runAssignmentNow = useCallback(() => {
    const r = runAssignment(dbRef.current);
    if (r.assigned || r.moved) {
      setDb((d) => {
        const again = runAssignment(d);
        return again.moved ? notify(again.db, `${again.moved} uncalled order${again.moved > 1 ? "s" : ""} moved`, `Not called within ${d.settings.assignment.callWithinMinutes} minutes, so given to another agent on duty.`, "warning") : again.db;
      });
    }
    return { assigned: r.assigned, moved: r.moved };
  }, []);

  const logAttempt = useCallback((orderId: ID, by: ID, via: "call" | "whatsapp", outcome: import("./types").AttemptOutcome, note?: string) => {
    setDb((d) => {
      const o = d.orders.find((x) => x.id === orderId);
      if (!o) return d;
      const who = d.team.find((t) => t.id === by)?.name ?? "Agent";
      return logActivity(recordAttempt(d, orderId, by, via, outcome, note), o.contactId, `${via === "call" ? "Call" : "WhatsApp"} about ${o.reference}: ${OUTCOME_LABEL[outcome]}`, "conversation", `${who}${note ? ` — ${note}` : ""}`);
    });
  }, []);

  const setOnDuty = useCallback((memberId: ID, onDuty: boolean) => {
    setDb((d) => ({ ...d, team: d.team.map((m) => (m.id === memberId ? { ...m, onDuty } : m)) }));
  }, []);

  const sendToPartner = useCallback((deliveryId: ID, riderId?: ID) => {
    const d0 = dbRef.current;
    const del = d0.deliveries.find((x) => x.id === deliveryId);
    if (!del) return { error: "Delivery not found" };
    const order = d0.orders.find((o) => o.id === del.orderId);
    if (order && !["ready_for_dispatch", "dispatched", "in_transit", "processing", "confirmed"].includes(order.status)) return { error: `Order ${order.reference} isn't confirmed yet — confirm it before sending to logistics.` };
    const st = stateOf(del.city);
    const rider = d0.riders.find((r) => r.id === (riderId ?? del.riderId)) ?? partnerFor(d0, st);
    if (!rider) return { error: `No rider or partner covers ${st}. Add the state to one on the Riders page.` };
    const token = newToken();
    const updated = { ...del, riderId: rider.id, courier: rider.kind === "partner" ? rider.name : "In-house Rider", fee: feeFor(rider, st), linkToken: token, sentAt: new Date().toISOString(), status: del.status === "not_scheduled" ? ("scheduled" as const) : del.status };
    const { acceptedAt: _a, ...clean } = updated;
    const text = partnerMessage({ ...d0, deliveries: d0.deliveries.map((x) => (x.id === deliveryId ? clean : x)) }, clean, token, d0.workspaces[0]?.currency ?? "NGN");
    setDb((d) => logActivity({ ...d, deliveries: d.deliveries.map((x) => (x.id === deliveryId ? clean : x)) }, del.contactId, `Sent to ${rider.name} on WhatsApp`, "system", `${st} · fee ${feeFor(rider, st)}`));
    const waUrl = rider.whatsappGroup ? `https://wa.me/?text=${encodeURIComponent(text)}` : `https://wa.me/${phoneDigits(rider.phone)}?text=${encodeURIComponent(text)}`;
    return { text, waUrl, link: deliveryLink(token) };
  }, []);

  const partnerAction = useCallback((token: string, action: "accept" | "delivered" | "failed", opts?: { cash?: number; reason?: string }) => {
    const del = dbRef.current.deliveries.find((x) => x.linkToken === token);
    if (!del || ["delivered", "returned"].includes(del.status)) return false;
    const now = new Date().toISOString();
    setDb((d) => ({ ...d, deliveries: d.deliveries.map((x) => (x.id === del.id ? { ...x, acceptedAt: x.acceptedAt ?? now, ...(action === "delivered" && opts?.cash !== undefined ? { cashCollected: opts.cash } : {}) } : x)) }));
    if (action === "accept") {
      const order = dbRef.current.orders.find((o) => o.id === del.orderId);
      if (order && ["ready_for_dispatch", "confirmed", "processing"].includes(order.status) && canMove(order.status, "dispatched")) setOrderStatus(order.id, "dispatched");
    }
    if (action === "delivered") setDeliveryStatus(del.id, "delivered");
    if (action === "failed") setDeliveryStatus(del.id, "failed", opts?.reason || "Customer unreachable");
    return true;
  }, [setDeliveryStatus, setOrderStatus]);

  const messageContact = useCallback((contactId: ID, body: string) => {
    setDb((d) => logActivity(postToCustomer(d, contactId, body), contactId, "Follow-up sent", "conversation", body.slice(0, 80)));
  }, []);

  const payCommission = useCallback((memberId: ID) => {
    setDb((d) => notify(payOut(d, memberId), "Commission paid", `${d.team.find((m) => m.id === memberId)?.name ?? "Agent"}'s earned commission marked as paid.`, "success"));
  }, []);

  // New orders from any source (chat, forms, websites, imports) go to an agent straight away.
  useEffect(() => {
    if (!loaded.current || liveRef.current) return; // on live data the server shares orders
    if (db.orders.some((o) => OPEN_STATUSES.includes(o.status) && !o.assignedTo)) setDb((d) => runAssignment(d, new Date(), { move: false }).db);
  }, [db.orders]);
  // Every minute, orders left uncalled for twice the allowed time move to another agent on duty.
  useEffect(() => {
    const t = setInterval(() => { if (loaded.current && !liveRef.current) runAssignmentNow(); }, 60_000);
    return () => clearInterval(t);
  }, [runAssignmentNow]);

  const resetPracticeData = useCallback(() => {
    try {
      localStorage.removeItem(PRACTICE_KEY);
    } catch {
      /* nothing saved */
    }
    setDb(createInitialDatabase());
    setWorkspaceId("ws_luxe");
  }, []);

  const practiceActions: StoreActions = useMemo(() => ({
        addContact, createOrder, setLeadStage, setLeadOutcome, assignOwner, setLifecycle, completeTask, snoozeTask, addTask, addNote, logCall,
        sendReply, markNotificationsRead, setWorkspace: setWorkspaceId, setOrderStatus, recordCodCheck, setDeliveryStatus, markRemitted,
        saveProduct, adjustStock, mergeContacts, startLead, resetPracticeData, saveRecord, removeRecord, updateSettings, updateAgent,
        setIntegration, assignRider, moveStock, recordPayment, logRun, retryRun, sendBroadcast, addCampaignSpend,
        updateContactDetails, simulateIncoming, sendProductCard, updateWorkspace, submitLeadForm,
        submitOrderForm, trackForm, simulateFormTraffic, recordDeposit, requestBalance, issueInvoice, flagComplaint, resolveComplaint,
        toggleSetupStep, importProducts, addPolicyStarters, importChatHistory, saveFacts, removeFact, sendPaymentLink, receiveIntake, connectMeta, disconnectMeta, syncMeta, setCapi, publishAd, setAdStatus, connectPayments, disconnectPayments, updatePayments, requestPayment, simulatePayment, matchPayment, sendOrderMessage,
        assignOrders, runAssignmentNow, logAttempt, setOnDuty, sendToPartner, partnerAction, payCommission, messageContact,
  }), [addContact, createOrder, setLeadStage, setLeadOutcome, assignOwner, setLifecycle, completeTask, snoozeTask, addTask, addNote, logCall, sendReply, markNotificationsRead, setOrderStatus, recordCodCheck, setDeliveryStatus, markRemitted, saveProduct, adjustStock, mergeContacts, startLead, resetPracticeData, saveRecord, removeRecord, updateSettings, updateAgent, setIntegration, assignRider, moveStock, recordPayment, logRun, retryRun, sendBroadcast, addCampaignSpend, updateContactDetails, simulateIncoming, sendProductCard, updateWorkspace, submitLeadForm, submitOrderForm, trackForm, simulateFormTraffic, recordDeposit, requestBalance, issueInvoice, flagComplaint, resolveComplaint, toggleSetupStep, importProducts, addPolicyStarters, importChatHistory, saveFacts, removeFact, sendPaymentLink, receiveIntake, connectMeta, disconnectMeta, syncMeta, setCapi, publishAd, setAdStatus, connectPayments, disconnectPayments, updatePayments, requestPayment, simulatePayment, matchPayment, sendOrderMessage, assignOrders, runAssignmentNow, logAttempt, setOnDuty, sendToPartner, partnerAction, payCommission, messageContact]);

  const liveLayer = useMemo(() => {
    const sb = supabase();
    if (!liveOn || !sb || !wsId) return null;
    return liveActions(liveWriter(sb, wsId, () => dbRef.current), () => dbRef.current, reload, auth.session?.user.id ?? "");
  }, [liveOn, wsId, reload, auth.session?.user.id]);

  const value = useMemo<StoreValue>(() => ({
    db,
    workspaceId,
    actions: liveLayer ? { ...practiceActions, setWorkspace: (id: ID) => auth.selectWorkspace(id), ...liveLayer } : practiceActions,
    live: { available, on: liveOn, status: liveOn ? (liveStatus.status === "off" ? "loading" : liveStatus.status) : "off", ...(liveStatus.error ? { error: liveStatus.error } : {}), ...(auth.current ? { businessName: auth.current.name } : {}), setMode, reload },
  }), [db, workspaceId, practiceActions, liveLayer, available, liveOn, liveStatus, auth, setMode, reload]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <DataProvider>");
  return ctx;
}

export const useDb = () => useStore().db;
export const useLive = () => useStore().live;
export const useActions = () => useStore().actions;
export function useWorkspace() {
  const { db, workspaceId } = useStore();
  return db.workspaces.find((w) => w.id === workspaceId) ?? db.workspaces[0]!;
}
