import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createInitialDatabase, type Database } from "@/domain/database";
import type { Contact, LeadStage } from "@/domain/types";

type NewContact = Pick<Contact, "firstName" | "lastName" | "phone" | "city" | "countryCode"> & {
  email?: string;
};

interface AppDataContextValue {
  db: Database;
  addContact: (input: NewContact) => Contact;
  updateLeadStage: (leadId: string, stage: LeadStage) => void;
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
      setDb(current => ({
        ...current,
        leads: current.leads.map(l => l.id === leadId ? { ...l, stage, updatedAt: new Date().toISOString() } : l),
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
