/**
 * Sample records for the modules added after the first prototype:
 * riders, knowledge base, templates, follow-ups, broadcasts, workflows,
 * media, stock movements, integrations, AI agent and business settings.
 *
 * Deterministic (no Math.random) so server and browser render the same.
 */
import { NOW } from "./seed";
import type {
  AgentConfig, Broadcast, BusinessSettings, FollowUpRule, IntegrationState, KnowledgeEntry, MediaAsset, MessageTemplate,
  Rider, StockMovement, Workflow, WorkflowRun,
} from "./types";

const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

export const riders: Rider[] = [
  { id: "r_musa", name: "Musa Abdullahi", phone: "+234 803 410 2291", zone: "Lagos Island & Lekki", vehicle: "bike", active: true },
  { id: "r_kunle", name: "Kunle Adebayo", phone: "+234 806 552 1180", zone: "Ikeja & Mainland", vehicle: "bike", active: true },
  { id: "r_emeka", name: "Emeka Obi", phone: "+234 813 220 9934", zone: "Abuja", vehicle: "car", active: true },
  { id: "r_bisi", name: "Bisi Lawal", phone: "+234 902 771 4410", zone: "Ibadan", vehicle: "bike", active: false },
];

export const knowledge: KnowledgeEntry[] = [
  { id: "kb_1", topic: "company", question: "Who are we?", answer: "Luxe Hair Collective sells 100% human hair bundles, frontals and ready-to-wear wigs from Lagos, delivering nationwide.", keywords: ["about", "who", "company", "original", "real hair"], updatedAt: ago(400) },
  { id: "kb_2", topic: "delivery", question: "How much is delivery and how long does it take?", answer: "Delivery within Lagos is ₦3,500 and arrives in 1–2 days. Other states take 2–4 days through our courier partners. Orders above ₦250,000 ship free.", keywords: ["delivery", "deliver", "shipping", "how long", "when", "arrive", "lagos", "abuja"], updatedAt: ago(120) },
  { id: "kb_3", topic: "payment", question: "Can I pay on delivery?", answer: "Yes. Pay on delivery is available in Lagos, Abuja and Ibadan. We call to confirm your order first. You can also pay by bank transfer or card link.", keywords: ["pay on delivery", "cod", "cash", "payment", "transfer", "pay"], updatedAt: ago(96) },
  { id: "kb_4", topic: "returns", question: "What is the return policy?", answer: "Unused hair in its original packaging can be returned within 7 days for an exchange. Coloured or cut units can't be returned.", keywords: ["return", "refund", "exchange", "policy"], updatedAt: ago(300) },
  { id: "kb_5", topic: "faq", question: "Is the hair real human hair?", answer: "Every bundle and wig is 100% virgin human hair. It can be dyed, bleached and heat-styled.", keywords: ["real", "human hair", "virgin", "synthetic", "original", "dye"], updatedAt: ago(500) },
  { id: "kb_6", topic: "promotion", question: "Any discount running?", answer: "This month: buy 3 bundles and get a free Silk Press Care Kit.", keywords: ["discount", "promo", "promotion", "offer", "deal", "sale"], updatedAt: ago(48) },
  { id: "kb_7", topic: "script", question: "How do we answer 'is this available?'", answer: "Confirm the item and length, give the price from the catalogue, then ask which length and how many they want.", keywords: ["available", "in stock", "do you have"], updatedAt: ago(72) },
];

export const templates: MessageTemplate[] = [
  { id: "tp_1", name: "order_confirmation", category: "utility", language: "en", body: "Hi {{1}}, your order {{2}} for {{3}} is confirmed. Total: {{4}}, paid on delivery. We'll message you when it's on the way.", status: "approved", updatedAt: ago(700) },
  { id: "tp_2", name: "cod_confirmation_request", category: "utility", language: "en", body: "Hi {{1}}, please confirm your order {{2}} ({{3}}) for {{4}}, payable on delivery to {{5}}. Reply YES to confirm or NO to cancel.", status: "approved", updatedAt: ago(700) },
  { id: "tp_3", name: "dispatch_notice", category: "utility", language: "en", body: "Good news {{1}} — order {{2}} is out for delivery with {{3}}. Please keep {{4}} ready.", status: "approved", updatedAt: ago(650) },
  { id: "tp_4", name: "follow_up_interest", category: "marketing", language: "en", body: "Hi {{1}}, still thinking about the {{2}}? Reply here and we'll help you choose the right length. Reply STOP to opt out.", status: "approved", updatedAt: ago(200) },
  { id: "tp_5", name: "abandoned_checkout", category: "marketing", language: "en", body: "Hi {{1}}, your {{2}} is still waiting. Send your delivery address and we'll confirm today. Reply STOP to opt out.", status: "submitted", updatedAt: ago(30) },
  { id: "tp_6", name: "monthly_promo", category: "marketing", language: "en", body: "This month only: buy 3 bundles, get a free care kit. Reply ORDER to start. Reply STOP to opt out.", status: "draft", updatedAt: ago(10) },
];

export const followUpRules: FollowUpRule[] = [
  { id: "fu_1", name: "Interested, then went quiet", trigger: "no_reply_after_details", delayHours: 6, maxAttempts: 2, templateId: "tp_4", message: "Hi {{name}}, did you get a chance to look at the {{product}}? Happy to help you pick a length.", quietStart: "21:00", quietEnd: "08:00", enabled: true },
  { id: "fu_2", name: "Asked the price, no reply", trigger: "no_reply_after_price", delayHours: 12, maxAttempts: 2, templateId: "tp_4", message: "Hi {{name}}, any questions about the price? We can also deliver and you pay on delivery.", quietStart: "21:00", quietEnd: "08:00", enabled: true },
  { id: "fu_3", name: "Checkout not finished", trigger: "checkout_abandoned", delayHours: 3, maxAttempts: 3, templateId: "tp_5", message: "Hi {{name}}, just need your delivery address to confirm your {{product}}.", quietStart: "21:00", quietEnd: "08:00", enabled: true },
  { id: "fu_4", name: "Worried about delivery", trigger: "delivery_concern", delayHours: 24, maxAttempts: 1, message: "Hi {{name}}, we deliver in Lagos in 1–2 days and you can pay on delivery. Shall I book yours?", quietStart: "21:00", quietEnd: "08:00", enabled: false },
];

export const broadcasts: Broadcast[] = [
  { id: "bc_1", name: "October promo — 3 bundles free kit", segmentId: "sg_1", templateId: "tp_4", status: "sent", sentAt: ago(240), recipients: 312, skippedNoConsent: 41 },
  { id: "bc_2", name: "Restock: Body Wave 18\"", segmentId: "sg_2", templateId: "tp_4", status: "scheduled", scheduledFor: new Date(NOW.getTime() + 20 * 3_600_000).toISOString(), recipients: 0, skippedNoConsent: 0 },
];

export const workflows: Workflow[] = [
  { id: "wf_1", name: "Ad chat to qualified lead", description: "Greets new chats from ads, presents the advertised product and asks the buying question.", active: true, updatedAt: ago(90), steps: [
    { id: "s1", kind: "trigger", label: "New message from a click-to-WhatsApp ad" },
    { id: "s2", kind: "action", label: "AI agent greets and names the advertised product" },
    { id: "s3", kind: "action", label: "Send product card with one photo" },
    { id: "s4", kind: "wait", label: "Wait 6 hours for a reply" },
    { id: "s5", kind: "condition", label: "If no reply and inside the 24-hour window" },
    { id: "s6", kind: "action", label: "Send follow-up 'Interested, then went quiet'" },
  ] },
  { id: "wf_2", name: "COD order confirmation", description: "Asks the customer to confirm every cash-on-delivery order before dispatch.", active: true, updatedAt: ago(60), steps: [
    { id: "s1", kind: "trigger", label: "Order created with pay on delivery" },
    { id: "s2", kind: "action", label: "Send template cod_confirmation_request" },
    { id: "s3", kind: "wait", label: "Wait 2 hours" },
    { id: "s4", kind: "condition", label: "If not confirmed" },
    { id: "s5", kind: "action", label: "Add to COD Verification call queue" },
  ] },
  { id: "wf_3", name: "Dispatch and delivery updates", description: "Keeps the customer informed once the order leaves.", active: false, updatedAt: ago(30), steps: [
    { id: "s1", kind: "trigger", label: "Order marked Dispatched" },
    { id: "s2", kind: "action", label: "Send template dispatch_notice" },
    { id: "s3", kind: "trigger", label: "Order marked Delivered" },
    { id: "s4", kind: "action", label: "Ask for feedback after 1 day" },
  ] },
];

export const workflowRuns: WorkflowRun[] = [
  { id: "run_1", workflowId: "wf_1", contactId: "c_0003", status: "succeeded", detail: "Greeted and sent product card for Raw Vietnamese Bone Straight 20\"", at: ago(2) },
  { id: "run_2", workflowId: "wf_2", contactId: "c_0010", status: "succeeded", detail: "COD confirmation request sent", at: ago(3) },
  { id: "run_3", workflowId: "wf_1", contactId: "c_0021", status: "skipped", detail: "Customer replied before the follow-up was due", at: ago(5) },
  { id: "run_4", workflowId: "wf_2", contactId: "c_0034", status: "failed", detail: "Template send failed: phone number not on WhatsApp", at: ago(7) },
  { id: "run_5", workflowId: "wf_1", contactId: "c_0042", status: "skipped", detail: "Outside the 24-hour window and template not approved", at: ago(11) },
  { id: "run_6", workflowId: "wf_2", contactId: "c_0050", status: "failed", detail: "Provider timeout — safe to retry", at: ago(20) },
];

export const media: MediaAsset[] = [];

export const stockMovements: StockMovement[] = [
  { id: "sm_1", productId: "p_1", delta: 30, reason: "restock", note: "Supplier batch #118", at: ago(170) },
  { id: "sm_2", productId: "p_6", delta: -2, reason: "damaged", note: "Leaking bottles", at: ago(80) },
  { id: "sm_3", productId: "p_2", delta: 20, reason: "restock", at: ago(60) },
];

export const integrations: IntegrationState[] = [
  { id: "whatsapp", status: "not_connected" },
  { id: "messenger", status: "not_connected" },
  { id: "instagram", status: "not_connected" },
  { id: "meta_ads", status: "not_connected" },
  { id: "sms", status: "not_connected" },
  { id: "email", status: "not_connected" },
  { id: "paystack", status: "not_connected" },
  { id: "webchat", status: "not_connected" },
  { id: "couriers", status: "not_connected" },
  { id: "lead_form", status: "not_connected" },
];

export const agent: AgentConfig = {
  enabled: true,
  name: "Ada from Luxe Hair",
  greeting: "Hello! Thank you for reaching out to Luxe Hair. Are you interested in the item from our ad, or would you like to see other options first?",
  tone: "friendly",
  handoffKeywords: ["human", "agent", "person", "manager", "call me", "speak to someone"],
  maxImages: 2,
};

export const settings: BusinessSettings = {
  businessName: "Luxe Hair Collective",
  timezone: "Africa/Lagos",
  deliveryFee: 3500,
  freeDeliveryOver: 250000,
  paymentLinkTemplate: "https://pay.example/luxehair/{{order}}",
  optOutKeywords: ["STOP", "UNSUBSCRIBE", "OPT OUT"],
  quietStart: "21:00",
  quietEnd: "08:00",
  maxFollowUpsPerDay: 2,
  notify: { order_confirmed: "whatsapp", dispatched: "whatsapp", delivered: "whatsapp", cod_request: "whatsapp", feedback: "off" },
  storeEnabled: false,
  storeSlug: "luxehair",
  plan: "trial",
  staffAlerts: { newMessage: true, dispatchRisk: true },
  chat: { bubbleTails: true, flagMissingDetails: true },
};

/** Product descriptions for the catalogue (AI agent and store use them). */
export const productDescriptions: Record<string, string> = {
  p_1: "100% raw Vietnamese hair, bone straight, 20 inches. Can be dyed and heat-styled.",
  p_2: "Double drawn body wave, full from root to tip, 18 inches.",
  p_3: "HD lace frontal, 13x4, melts into all skin tones.",
  p_4: "Glueless pixie curl wig, ready to wear out of the box.",
  p_5: "Kinky straight clip-in set, blends with natural 4C texture.",
  p_6: "Shampoo, conditioner and serum for silk-pressed hair.",
  p_7: "Satin bonnet and scarf set to protect hair overnight.",
  p_8: "Burgundy deep wave, 22 inches, pre-coloured.",
};

/**
 * Customer messages that include delivery details, so "pull details from the chat"
 * has something to find in Practice Mode. Inserted into a few sample chats.
 */
export const detailMessages: string[] = [
  "My name is {first} {last}. Deliver to 14 Admiralty Way, Lekki Phase 1, Lagos. Landmark: opposite Mega Plaza. My number is 0803 412 7781.",
  "Please send it to No 5 Allen Avenue, Ikeja. Close to the Shoprite. You can call me on 0815 220 9034.",
  "This is {first}. Address: 22 Aminu Kano Crescent, Wuse 2, Abuja. Near Banex Plaza. 0902 771 4410",
];
