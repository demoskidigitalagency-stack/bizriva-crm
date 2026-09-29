import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createInitialDatabase, type Database } from "@/domain/database";
import type { Campaign, Contact, DeliveryStatus, FulfilmentStatus, LeadStage, OrderStatus, Task } from "@/domain/types";

type NewContact = Pick<Contact, "firstName" | "lastName" | "phone" | "city" | "countryCode"> & { email?: string };
type NewTask = Pick<Task, "title" | "dueAt" | "priority" | "type"> & { contactId?: string; assigneeId?: string };

interface AppDataContextValue {
  db: Database;
  addContact: (input: NewContact) => Contact;
  updateLeadStage: (leadId: string, stage: LeadStage) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  updateFulfilmentStatus: (orderId: string, status: FulfilmentStatus) => void;
  updateDeliveryStatus: (deliveryId: string, status: DeliveryStatus) => void;
  updateCampaignStatus: (campaignId: string, status: Campaign["status"]) => void;
  updateProductStock: (productId: string, stock: number) => void;
  toggleTask: (taskId: string) => void;
  addTask: (input: NewTask) => Task;
  markConversationRead: (conversationId: string) => void;
  sendMessage: (conversationId: string, body: string) => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(() => createInitialDatabase());

  const value = useMemo<AppDataContextValue>(() => ({
    db,
    addContact(input) {
      const now = new Date().toISOString();
      const contact: Contact = {
        id: `c_local_${Date.now()}`,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email,
        city: input.city,
        countryCode: input.countryCode,
        lifecycle: "contact",
        source: "website",
        ownerId: db.team[0]?.id ?? "u_ade",
        leadScore: 10,
        tags: [],
        createdAt: now,
        lastActivityAt: now,
        totalOrders: 0,
        lifetimeValue: 0,
        deliveredRevenue: 0,
        contributionProfit: 0,
        outstandingBalance: 0,
        consentMarketing: false,
        notesCount: 0,
      };
      setDb(current => ({ ...current, contacts: [contact, ...current.contacts] }));
      return contact;
    },
    updateLeadStage(leadId, stage) {
      setDb(current => ({ ...current, leads: current.leads.map(l => l.id === leadId ? { ...l, stage, updatedAt: new Date().toISOString() } : l) }));
    },
    updateOrderStatus(orderId, status) {
      setDb(current => ({ ...current, orders: current.orders.map(o => o.id === orderId ? { ...o, status } : o) }));
    },
    updateFulfilmentStatus(orderId, status) {
      setDb(current => ({ ...current, orders: current.orders.map(o => o.id === orderId ? { ...o, fulfilmentStatus: status } : o) }));
    },
    updateDeliveryStatus(deliveryId, status) {
      setDb(current => ({ ...current, deliveries: current.deliveries.map(d => d.id === deliveryId ? { ...d, status, deliveredAt: status === "delivered" ? new Date().toISOString() : d.deliveredAt } : d) }));
    },
    updateCampaignStatus(campaignId, status) {
      setDb(current => ({ ...current, campaigns: current.campaigns.map(c => c.id === campaignId ? { ...c, status } : c) }));
    },
    updateProductStock(productId, stock) {
      setDb(current => ({ ...current, products: current.products.map(p => p.id === productId ? { ...p, stock: Math.max(0, Math.floor(stock)) } : p) }));
    },
    toggleTask(taskId) {
      setDb(current => ({ ...current, tasks: current.tasks.map(t => t.id === taskId ? { ...t, status: t.status === "done" ? "open" : "done" } : t) }));
    },
    addTask(input) {
      const task: Task = {
        id: `task_local_${Date.now()}`,
        title: input.title,
        dueAt: input.dueAt,
        status: "open",
        priority: input.priority,
        assigneeId: input.assigneeId ?? db.team[0]?.id ?? "u_ade",
        type: input.type,
        contactId: input.contactId,
        createdAt: new Date().toISOString(),
      };
      setDb(current => ({ ...current, tasks: [task, ...current.tasks] }));
      return task;
    },
    markConversationRead(conversationId) {
      setDb(current => ({ ...current, conversations: current.conversations.map(c => c.id === conversationId ? { ...c, unread: false } : c) }));
    },
    sendMessage(conversationId, body) {
      const trimmed = body.trim();
      if (!trimmed) return;
      const now = new Date().toISOString();
      setDb(current => ({
        ...current,
        conversations: current.conversations.map(c => c.id === conversationId ? {
          ...c,
          unread: false,
          awaitingReply: false,
          lastMessageAt: now,
          messages: [...c.messages, { id: `msg_local_${Date.now()}`, conversationId, direction: "out", body: trimmed, at: now, authorId: c.assigneeId }],
        } : c),
      }));
    },
  }), [db]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
