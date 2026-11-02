/**
 * Client-side data store. Screens read the Database snapshot through
 * `useDb()` and mutate only through the typed actions exposed here, so the
 * in-memory adapter can later be replaced by server calls without touching
 * screen code.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createInitialDatabase, CURRENT_USER_ID, NOW, type Database } from "./database";
import type { Channel, Contact, ID, LeadOutcome, LeadStage, Lifecycle, PaymentMethod, Task } from "./types";

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

  const logActivity = (d: Database, contactId: ID, title: string, kind: "lead" | "note" | "task" | "conversation" | "order" | "system" = "system", description?: string): Database => ({
    ...d,
    activities: [
      { id: newId("act"), contactId, kind, title, at: new Date().toISOString(), actorId: CURRENT_USER_ID, ...(description ? { description } : {}) },
      ...d.activities,
    ],
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
      const total = products.reduce((s, x) => s + x.product!.price * x.line.qty, 0) + 3500;
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
        shippingFee: 3500,
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
      return logActivity(next, input.contactId, `Order ${order.reference} placed`, "order", order.productNames.join(", "));
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

  const value = useMemo<StoreValue>(
    () => ({
      db,
      workspaceId,
      actions: { addContact, createOrder, setLeadStage, setLeadOutcome, assignOwner, setLifecycle, completeTask, snoozeTask, addTask, addNote, logCall, sendReply, markNotificationsRead, setWorkspace: setWorkspaceId },
    }),
    [db, workspaceId, addContact, createOrder, setLeadStage, setLeadOutcome, assignOwner, setLifecycle, completeTask, snoozeTask, addTask, addNote, logCall, sendReply, markNotificationsRead],
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
