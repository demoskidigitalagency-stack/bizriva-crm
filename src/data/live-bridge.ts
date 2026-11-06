/**
 * Connects the screens' actions to live writes. Every action a screen calls
 * keeps its name and arguments; on live data it writes to the database
 * (src/data/live-actions.ts), then reloads. Actions that need a partner we
 * haven't connected yet (WhatsApp sending, Meta, a payment key, AI) or that
 * only make sense on sample data say so instead of pretending to save.
 */
import { toast } from "sonner";
import type { Database } from "@/domain/database";
import type { StoreActions } from "@/domain/store";
import { receiptText, careGuideText } from "@/domain/receipt";
import * as practice from "@/domain/practice-seed";
import type { LiveWriter, Result } from "./live-actions";

const NOT_YET: Partial<Record<keyof StoreActions, string>> = {
  simulateIncoming: "Simulated customer messages are for Practice Mode. Real ones arrive once WhatsApp is connected.",
  simulateFormTraffic: "Simulated traffic is for Practice Mode.",
  simulatePayment: "Simulated payments are for Practice Mode. Real ones arrive from your payment provider.",
  receiveIntake: "Test submissions run in Practice Mode. Your website sends real ones to your intake address.",
  submitLeadForm: "Lead forms arrive from Meta once it's connected.",
  submitOrderForm: "Customers place real orders on your order form's link.",
  trackForm: "",
  connectMeta: "Connecting Meta needs the Meta app keys first — see Account.",
  disconnectMeta: "Meta isn't connected.", syncMeta: "Meta isn't connected.", setCapi: "Meta isn't connected.", publishAd: "Meta isn't connected.", setAdStatus: "Meta isn't connected.",
  connectPayments: "Add your payment provider's secret key in Account to connect payments.",
  disconnectPayments: "Payments are managed from Account.", updatePayments: "Payment options are saved once your provider is connected.",
  requestPayment: "Payment requests in the chat need your payment provider's key.", sendPaymentLink: "Payment links need your payment provider's key.",
  importChatHistory: "Chat import on live data comes next.",
  setLifecycle: "On live data the stage follows the customer's orders.",
  updateAgent: "AI agent settings are saved once the AI is connected.", setIntegration: "Channels connect for real from Integrations once their keys are in place.",
  addCampaignSpend: "Ad spend comes from Meta once it's connected.", sendProductCard: "Product cards are sent once WhatsApp is connected.",
  saveRecord: "", removeRecord: "",
};

export function liveActions(w: LiveWriter, getDb: () => Database, reload: () => Promise<void>, me: string): Partial<StoreActions> {
  const run = (p: Promise<Result>, ok?: string) => {
    void p.then(async (r) => {
      if (r.error) toast.error(r.error);
      else if (ok) toast.success(ok);
      await reload();
    }).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't save — check your connection"));
  };
  const blocked = Object.fromEntries(Object.entries(NOT_YET).filter(([, m]) => m).map(([k, m]) => [k, (..._a: unknown[]) => { toast.info(m); return k === "addPolicyStarters" ? 0 : k === "sendPaymentLink" ? null : k === "requestPayment" ? { error: m } : k === "receiveIntake" || k === "simulatePayment" ? null : k === "publishAd" ? false : k === "submitOrderForm" ? "" : undefined; }])) as Partial<StoreActions>;

  return {
    ...blocked,
    trackForm: () => {},
    addContact: (input) => run(w.addContact(input), "Customer saved"),
    updateContactDetails: (id, patch) => run(w.updateContactDetails(id, patch)),
    createOrder: (input) => run(w.createOrder(input), "Order saved — numbered and given to an agent"),
    setOrderStatus: (id, status) => run(w.setOrderStatus(id, status)),
    recordCodCheck: (id, result) => run(w.recordCodCheck(id, result, me)),
    setDeliveryStatus: (id, status, reason) => run(w.setDeliveryStatus(id, status, reason)),
    assignRider: (id, riderId) => run(w.assignRider(id, riderId)),
    markRemitted: (id) => run(w.markRemitted(id), "Marked as handed in"),
    recordPayment: (orderId, method) => run(w.recordPayment(orderId, method), "Payment recorded"),
    recordDeposit: (orderId, amount, method) => run(w.recordPayment(orderId, method, amount), "Deposit recorded"),
    saveProduct: (p) => run(w.saveProduct(p), "Product saved"),
    adjustStock: (id, delta) => run(w.adjustStock(id, delta)),
    moveStock: (id, delta) => run(w.adjustStock(id, delta)),
    saveRecord: ((collection: string, record: Record<string, unknown>) => { run(w.saveRecord(collection, record), "Saved"); return String(record["id"] ?? ""); }) as StoreActions["saveRecord"],
    removeRecord: (collection, id) => run(w.removeRecord(collection, id), "Deleted"),
    updateSettings: (patch) => run(w.updateSettings(patch)),
    updateWorkspace: (patch) => run(w.updateSettings({ ...(patch.name ? { businessName: patch.name } : {}) })),
    toggleSetupStep: (step) => { const done = getDb().settings.setupDone; run(w.updateSettings({ setupDone: done.includes(step) ? done.filter((s) => s !== step) : [...done, step] })); },
    sendReply: (convId, text) => run(w.sendReply(convId, text)),
    messageContact: (contactId, body) => run(w.messageContact(contactId, body), "Message queued"),
    requestBalance: (orderId) => {
      const db = getDb(); const o = db.orders.find((x) => x.id === orderId); const c = db.contacts.find((x) => x.id === o?.contactId);
      if (!o || !c) return;
      const due = new Intl.NumberFormat("en-NG", { style: "currency", currency: db.workspaces[0]?.currency ?? "NGN", maximumFractionDigits: 0 }).format(o.total - (o.amountPaid ?? 0));
      run(w.messageContact(o.contactId, `Hi ${c.firstName}, the balance on your order ${o.reference} is ${due}. Reply here and we'll share how to pay.`), "Balance request queued");
    },
    sendOrderMessage: (orderId, what) => {
      const db = getDb(); const o = db.orders.find((x) => x.id === orderId);
      const text = o ? (what === "receipt" ? receiptText(db, o) : careGuideText(db, o)) : null;
      if (!o || !text) return false;
      run(w.messageContact(o.contactId, text), what === "receipt" ? "Receipt queued" : "Care guide queued");
      return true;
    },
    issueInvoice: (orderId) => {
      const o = getDb().orders.find((x) => x.id === orderId);
      const no = o?.invoiceNo ?? `INV-${(o?.reference ?? "").replace(/\D/g, "")}`;
      run(w.issueInvoice(orderId));
      return no;
    },
    flagComplaint: (convId, reason) => run(w.flagComplaint(convId, reason)),
    resolveComplaint: (convId, resolution) => run(w.resolveComplaint(convId, resolution)),
    saveFacts: (contactId, facts, source) => run(w.saveFacts(contactId, facts, source)),
    removeFact: (contactId, factId) => run(w.removeFact(contactId, factId)),
    addPolicyStarters: () => {
      const have = new Set(getDb().knowledge.map((k) => k.question.toLowerCase()));
      const fresh = practice.policyStarters.filter((e) => !have.has(e.question.toLowerCase()));
      run(w.addKnowledge(fresh), fresh.length ? `${fresh.length} policies added` : undefined);
      return fresh.length;
    },
    setLeadStage: (leadId, stage) => run(w.setLeadStage(leadId, stage)),
    assignOwner: (contactId, ownerId) => run(w.assignOwner(contactId, ownerId)),
    startLead: (contactId) => run(w.startLead(contactId), "Lead started"),
    assignOrders: (ids, memberId) => run(w.assignOrders(ids, memberId), "Reassigned"),
    runAssignmentNow: () => { toast.info("On live data the server shares new orders instantly and moves uncalled ones every 5 minutes."); return { assigned: 0, moved: 0 }; },
    logAttempt: (orderId, by, via, outcome, note) => run(w.logAttempt(orderId, by === "" ? me : by, via, outcome, note)),
    setOnDuty: (id, on) => run(w.setOnDuty(id, on)),
    sendToPartner: (deliveryId, riderId) => w.sendToPartner(deliveryId, riderId).then(async (r) => { await reload(); return r; }),
    payCommission: (id) => run(w.payCommission(id), "Commission marked paid"),
    matchPayment: (eventId, orderId) => run(w.matchPayment(eventId, orderId), "Payment matched"),
    sendBroadcast: (id) => run(w.sendBroadcast(id), "Queued — it sends once your WhatsApp or email sender is connected"),
    addTask: (t) => run(w.addTask(t), "Task added"),
    completeTask: (id) => run(w.completeTask(id), "Task done"),
    snoozeTask: (id, days) => run(w.snoozeTask(id, days), `Snoozed ${days} day${days === 1 ? "" : "s"}`),
    addNote: (contactId, text) => run(w.logContact(contactId, "note", text), "Note saved"),
    logCall: (contactId, summary) => run(w.logContact(contactId, "call", summary), "Call logged"),
    setLeadOutcome: (leadId, outcome) => run(w.setLeadOutcome(leadId, outcome)),
    mergeContacts: (keepId, ids) => run(w.mergeContacts(keepId, ids), "Customers merged"),
    importProducts: (rows) => { run(w.importProducts(rows), `${rows.length} product${rows.length === 1 ? "" : "s"} imported`); return rows.length; },
    resetPracticeData: () => toast.info("You're on your real data. Switch to Practice Mode from the account menu to use sample data."),
  };
}
