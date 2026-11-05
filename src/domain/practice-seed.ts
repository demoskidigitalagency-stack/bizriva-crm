/**
 * Sample records for the modules added after the first prototype:
 * riders, knowledge base, templates, follow-ups, broadcasts, workflows,
 * media, stock movements, integrations, AI agent and business settings.
 *
 * Deterministic (no Math.random) so server and browser render the same.
 */
import { NOW } from "./seed";
import type {
  AdDraft, AgentConfig, Broadcast, Connection, BusinessSettings, CalendarEvent, FollowUpRule, FormSubmission, IntegrationState, KnowledgeEntry, MediaAsset,
  MessageTemplate, OrderForm, Rider, StockMovement, Workflow, WorkflowRun,
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
  { id: "tp_1", name: "order_confirmation", purpose: "order", category: "utility", language: "en", body: "Hi {{1}}, your order {{2}} for {{3}} is confirmed. Total: {{4}}, paid on delivery. We'll message you when it's on the way.", status: "approved", updatedAt: ago(700) },
  { id: "tp_2", name: "cod_confirmation_request", purpose: "order", category: "utility", language: "en", body: "Hi {{1}}, please confirm your order {{2}} ({{3}}) for {{4}}, payable on delivery to {{5}}. Reply YES to confirm or NO to cancel.", status: "approved", updatedAt: ago(700) },
  { id: "tp_3", name: "dispatch_notice", purpose: "delivery", category: "utility", language: "en", body: "Good news {{1}} — order {{2}} is out for delivery with {{3}}. Please keep {{4}} ready.", status: "approved", updatedAt: ago(650) },
  { id: "tp_4", name: "follow_up_interest", purpose: "follow_up", category: "marketing", language: "en", body: "Hi {{1}}, still thinking about the {{2}}? Reply here and we'll help you choose the right length. Reply STOP to opt out.", status: "approved", updatedAt: ago(200) },
  { id: "tp_5", name: "abandoned_checkout", purpose: "follow_up", category: "marketing", language: "en", body: "Hi {{1}}, your {{2}} is still waiting. Send your delivery address and we'll confirm today. Reply STOP to opt out.", status: "submitted", updatedAt: ago(30) },
  { id: "tp_6", name: "monthly_promo", purpose: "reactivation", category: "marketing", language: "en", body: "This month only: buy 3 bundles, get a free care kit. Reply ORDER to start. Reply STOP to opt out.", status: "draft", updatedAt: ago(10) },
];


/**
 * Reply library (added 2026-11-04). Written for Bizriva — not copied from any
 * paid guide. "pcm" is Nigerian Pidgin. Utility replies are for use inside the
 * 24-hour window or as approved templates; marketing ones carry an opt-out.
 */
const lib = (id: string, name: string, purpose: NonNullable<MessageTemplate["purpose"]>, language: "en" | "pcm", category: MessageTemplate["category"], body: string): MessageTemplate =>
  ({ id, name, purpose, language, category, body, status: category === "marketing" ? "submitted" : "approved", updatedAt: ago(24) });

export const replyLibrary: MessageTemplate[] = [
  // Enquiries
  lib("rl_1", "enquiry_price_and_options", "enquiry", "en", "utility", "Hi {{1}}, thanks for asking! The {{2}} is {{3}}. It comes in {{4}}. Which one would you like, and where should we deliver?"),
  lib("rl_2", "enquiry_availability", "enquiry", "en", "utility", "Yes {{1}}, the {{2}} is available today. Want me to reserve one for you while you decide?"),
  lib("rl_3", "enquiry_price_pidgin", "enquiry", "pcm", "utility", "{{1}}, thank you o! {{2}} na {{3}}. We get am for {{4}}. Which one you want make we send, and where we go deliver am?"),
  lib("rl_4", "enquiry_location", "enquiry", "en", "utility", "We're in {{1}} and we deliver nationwide. Lagos orders arrive in 1–2 days, other states 2–4 days."),
  // Orders and payment
  lib("rl_5", "order_details_request", "order", "en", "utility", "Great choice, {{1}}! To book it, please send: your full name, phone number, delivery address and a nearby landmark."),
  lib("rl_6", "order_details_pidgin", "order", "pcm", "utility", "Correct choice {{1}}! Abeg send your full name, phone number, address and landmark wey dey near you, make we book am."),
  lib("rl_7", "payment_received", "payment", "en", "utility", "Payment received, {{1}} — thank you! {{2}} for order {{3}}. We'll update you as soon as it's on the way."),
  lib("rl_8", "payment_received_pidgin", "payment", "pcm", "utility", "We don see your money {{1}}, thank you well well! {{2}} for order {{3}}. We go tell you once e don comot."),
  lib("rl_9", "deposit_request", "payment", "en", "utility", "Hi {{1}}, to book order {{2}} we take a {{3}} deposit. The balance of {{4}} is paid on delivery. Here's the link: {{5}}"),
  lib("rl_10", "balance_request", "payment", "en", "utility", "Hi {{1}}, your order {{2}} is ready. The balance is {{3}}. You can pay here: {{4}}, or pay the rider on delivery."),
  // Delivery
  lib("rl_11", "delivery_update_on_the_way", "delivery", "en", "utility", "Good news {{1}}! Order {{2}} is on its way with {{3}}. Expect a call from the rider today."),
  lib("rl_12", "delivery_update_pidgin", "delivery", "pcm", "utility", "{{1}}, your order {{2}} don dey road! Rider {{3}} go call you today. Abeg keep your phone near you."),
  lib("rl_13", "delivery_delay_apology", "delivery", "en", "utility", "Sorry {{1}}, order {{2}} is running late because of {{3}}. New arrival: {{4}}. Thank you for your patience."),
  lib("rl_14", "rider_could_not_reach", "delivery", "en", "utility", "Hi {{1}}, our rider tried to reach you for order {{2}} but couldn't get through. When is a good time to deliver today or tomorrow?"),
  // Complaints
  lib("rl_15", "complaint_acknowledge", "complaint", "en", "utility", "I'm sorry about this, {{1}}. Thank you for telling us. Please send a photo of the item so we can sort it out quickly. You'll hear from us within {{2}} hours."),
  lib("rl_16", "complaint_acknowledge_pidgin", "complaint", "pcm", "utility", "Sorry well well {{1}}, we hear you. Abeg snap the item send us make we fit solve am sharp sharp. We go get back to you before {{2}} hours."),
  lib("rl_17", "complaint_resolved", "complaint", "en", "utility", "Hi {{1}}, we've {{2}}. Thank you for your patience — is everything okay now?"),
  // Objections
  lib("rl_18", "objection_too_expensive", "objection", "en", "utility", "I understand, {{1}}. The {{2}} costs more because {{3}}. If you'd like something lighter on budget, the {{4}} is {{5}}."),
  lib("rl_19", "objection_trust_pay_on_delivery", "objection", "en", "utility", "No wahala, {{1}} — you can pay on delivery. You check the item when it arrives, then pay the rider."),
  lib("rl_20", "objection_trust_pidgin", "objection", "pcm", "utility", "No shaking {{1}}, you fit pay when e reach your hand. Check am well first, then pay the rider."),
  lib("rl_21", "objection_will_think", "objection", "en", "utility", "Of course, {{1}}. Can I check back with you tomorrow? Stock on the {{2}} is moving fast this week."),
  // Follow-up
  lib("rl_22", "follow_up_gentle", "follow_up", "en", "utility", "Hi {{1}}, just checking in about the {{2}}. Any questions I can answer for you?"),
  lib("rl_23", "follow_up_pidgin", "follow_up", "pcm", "utility", "{{1}}, how far? You still want the {{2}}? Make I hold one for you?"),
  // Reactivation and referral (marketing — consent and opt-out)
  lib("rl_24", "reactivation_new_stock", "reactivation", "en", "marketing", "Hi {{1}}, it's been a while! New {{2}} just arrived and past customers get first pick. Reply YES to see it. Reply STOP to opt out."),
  lib("rl_25", "reactivation_pidgin", "reactivation", "pcm", "marketing", "{{1}}, long time! New {{2}} don land and na our old customers we dey show first. Reply YES make we send am. Reply STOP if you no want message again."),
  lib("rl_26", "referral_ask", "referral", "en", "marketing", "Thanks for buying from us, {{1}}! Know someone who'd love the {{2}}? Share code {{3}} — they get {{4}} off and so do you. Reply STOP to opt out."),
  lib("rl_27", "review_request", "referral", "en", "utility", "Hi {{1}}, how are you finding the {{2}}? A short reply or a photo would really help us. Thank you!"),
  // Policies
  lib("rl_28", "policy_returns", "policy", "en", "utility", "Our returns policy: unused items in original packaging can be exchanged within {{1}} days. Please send a photo and your order number to start."),
  lib("rl_29", "policy_delivery_areas", "policy", "en", "utility", "We deliver pay-on-delivery in {{1}}. For other states we use a courier and ask for payment before dispatch."),
  // Birthdays (marketing — consent and opt-out)
  lib("rl_30", "birthday_greeting", "birthday", "en", "marketing", "Happy birthday, {{1}}! 🎉 Thank you for shopping with us. Here's {{2}} off anything this week as our gift. Reply STOP to opt out."),
  lib("rl_31", "birthday_greeting_pidgin", "birthday", "pcm", "marketing", "Happy birthday {{1}}! 🎉 We dey celebrate you. Take {{2}} off anything wey you like this week, na our gift. Reply STOP if you no want message again."),
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

export const extraWorkflows: Workflow[] = [
  { id: "wf_4", name: "Win back past buyers", description: "Reconnects with customers who haven't ordered in 60 days, only if they agreed to messages.", active: false, updatedAt: ago(4), steps: [
    { id: "s1", kind: "trigger", label: "Customer's last order is 60 days old" },
    { id: "s2", kind: "condition", label: "If they agreed to marketing messages" },
    { id: "s3", kind: "action", label: "Send template reactivation_new_stock" },
    { id: "s4", kind: "wait", label: "Wait 3 days" },
    { id: "s5", kind: "condition", label: "If no reply" },
    { id: "s6", kind: "action", label: "Add a call task for the owner of the contact" },
  ] },
  { id: "wf_5", name: "Ask for a referral after delivery", description: "Thanks happy customers and gives them a code to share.", active: false, updatedAt: ago(4), steps: [
    { id: "s1", kind: "trigger", label: "Order marked Delivered" },
    { id: "s2", kind: "wait", label: "Wait 3 days" },
    { id: "s3", kind: "condition", label: "If there is no open complaint" },
    { id: "s4", kind: "action", label: "Send template review_request" },
    { id: "s5", kind: "wait", label: "Wait 4 days" },
    { id: "s6", kind: "action", label: "Send template referral_ask" },
  ] },
  { id: "wf_6", name: "Complaint handling", description: "Makes sure every complaint gets an answer and a person.", active: true, updatedAt: ago(4), steps: [
    { id: "s1", kind: "trigger", label: "Chat marked as a complaint" },
    { id: "s2", kind: "action", label: "Send complaint_acknowledge" },
    { id: "s3", kind: "action", label: "Assign to support and add a task due in 4 hours" },
    { id: "s4", kind: "trigger", label: "Complaint resolved" },
    { id: "s5", kind: "action", label: "Send complaint_resolved and pause marketing for 14 days" },
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
  { id: "tiktok", status: "not_connected" },
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
  whatsappNumber: "+234 803 555 0142",
  setupDone: ["business", "products"],
  brief: { time: "07:30", channels: ["app"] },
  meta: { status: "not_connected", capi: { enabled: false, when: "delivered" } },
  payments: {
    status: "not_connected", methods: { transfer: true, link: true, cod: true }, autoReceipt: true, autoConfirm: true,
    settlement: [
      { id: "sa_1", label: "Main account", bank: "GTBank", accountNumber: "0123456789", accountName: "Luxe Hair Collective Ltd" },
      { id: "sa_2", label: "Lekki branch", bank: "Moniepoint MFB", accountNumber: "8034561290", accountName: "Luxe Hair Lekki" },
    ],
    defaultAccountId: "sa_1",
    splits: [],
  },
};

/** Policy starters a business can add to its Knowledge Base and edit. */
export const policyStarters: Omit<KnowledgeEntry, "id" | "updatedAt">[] = [
  { topic: "returns", question: "Can I return or exchange an item?", answer: "Unused items in their original packaging can be exchanged within 7 days of delivery. Send a photo and your order number to start. Opened, used or customised items can't be returned.", keywords: ["return", "exchange", "refund", "change"] },
  { topic: "delivery", question: "Which areas do you deliver to, and how do I pay?", answer: "Pay on delivery is available in Lagos, Abuja and Ibadan. Other states are sent by courier and paid before dispatch. Delivery fees are confirmed when you order.", keywords: ["deliver", "areas", "states", "courier", "outside"] },
  { topic: "payment", question: "When do I need to pay a deposit?", answer: "Items over ₦100,000 and custom orders need a deposit to book. The balance is paid on delivery or by payment link.", keywords: ["deposit", "part payment", "balance", "book"] },
  { topic: "terms", question: "What happens if I'm not available for delivery?", answer: "The rider will call before arriving. If we can't reach you after two attempts, we'll agree a new date. A third failed attempt may attract a delivery fee.", keywords: ["not around", "missed", "reschedule", "not available"] },
  { topic: "terms", question: "How do you use my details?", answer: "We use your name, phone and address only to process and deliver your order and, if you agree, to send offers. Reply STOP at any time to stop offers.", keywords: ["privacy", "data", "my details", "number"] },
];

export const orderForms: OrderForm[] = [
  { id: "of_1", name: "Bone Straight 20\" — ad landing page", productId: "p_1", headline: "Raw Vietnamese Bone Straight, 20 inches — pay on delivery", banner: "Buy 2, get a free Silk Press Care Kit", active: true, createdAt: ago(300), payOnDelivery: true,
    packages: [
      { id: "pk_1", label: "Buy 1", qty: 1, price: 185000 },
      { id: "pk_2", label: "Buy 2", qty: 2, price: 350000, gift: "Free Silk Press Care Kit" },
      { id: "pk_3", label: "Buy 3", qty: 3, price: 500000, gift: "Free care kit and satin bonnet" },
    ],
    fields: ["name", "phone", "address", "city", "landmark"],
    pixels: { meta: true, tiktok: false },
    thankYou: "Thank you! We'll call you within 2 hours to confirm your order.",
    stats: { views: 1240, starts: 410, submits: 96, duplicatesBlocked: 14, dropOff: { phone: 61, address: 148, city: 37, landmark: 68 } },
  },
];

export const formSubmissions: FormSubmission[] = [];

export const events: CalendarEvent[] = [
  { id: "ev_1", title: "Call back about frontal colour", kind: "callback", at: new Date(NOW.getTime() + 26 * 3_600_000).toISOString(), contactId: "c_0005" },
  { id: "ev_2", title: "Supplier delivery — Bone Straight batch", kind: "reminder", at: new Date(NOW.getTime() + 3 * 86_400_000).toISOString() },
  { id: "ev_3", title: "Weekly ad review", kind: "meeting", at: new Date(NOW.getTime() + 5 * 86_400_000).toISOString() },
];

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

/** Customer messages that reveal personal details, so customer memory has something to learn. */
export const factMessages: string[] = [
  "Abeg I need am before my birthday on 14 October. I like burgundy and it's for my sister too.",
  "My budget is 150k. I wear size 14 and I prefer 20 inches, I don't like curly ones.",
  "It's for my wife, her birthday is next week. I love natural black colour.",
];

/** A few customers already have saved facts, with birthdays around the practice date (29 Sept). */
export const savedFacts: Record<string, { kind: "birthday" | "likes" | "size" | "buys_for" | "budget"; value: string; monthDay?: string }[]> = {
  c_0003: [{ kind: "birthday", value: "29 September", monthDay: "09-29" }, { kind: "likes", value: "Burgundy colour" }, { kind: "size", value: "Size 12" }],
  c_0007: [{ kind: "birthday", value: "1 October", monthDay: "10-01" }, { kind: "buys_for", value: "Buys for their daughter" }],
  c_0012: [{ kind: "birthday", value: "4 October", monthDay: "10-04" }, { kind: "budget", value: "About ₦200k" }, { kind: "likes", value: "22-inch length" }],
  c_0020: [{ kind: "likes", value: "Natural black colour" }, { kind: "size", value: "Size 16" }],
};

/** One connection already set up, so the hub isn't empty. */
export const connections: Connection[] = [
  { id: "cn_1", platform: "elementor", name: "Bone straight landing page (Elementor)", secret: "bzk_7f3a9c21e4", fieldMap: {}, createAs: "order", active: true, createdAt: ago(120) },
];

/** Ad accounts the practice "Login with Facebook" offers. */
export const metaAdAccounts = [
  { id: "act_1029384756", name: "Luxe Hair Collective — Main" },
  { id: "act_5647382910", name: "Luxe Hair — Diaspora" },
];
export const metaPixels = [{ id: "px_88120931", name: "Luxe Hair website pixel" }];

/** One draft so the ads list isn't empty. */
export const adDrafts: AdDraft[] = [
  { id: "ad_1", name: "Bone Straight 20\" — Lagos & Abuja (WhatsApp)", productId: "p_1", mediaIds: [], language: "en",
    primaryText: "Raw Vietnamese Bone Straight, 20 inches — silky, full from top to tip. ₦185,000 and you pay on delivery in Lagos and Abuja. Tap to chat with us on WhatsApp 👇",
    headline: "Pay on delivery · Lagos & Abuja", cta: "send_whatsapp", destination: "whatsapp",
    audience: { locations: ["Lagos", "Abuja (FCT)"], ageMin: 22, ageMax: 45, gender: "women", interests: ["Wigs", "Hair care"] },
    dailyBudget: 15000, days: 7, placements: ["fb_feed", "ig_feed", "stories"], status: "draft", createdAt: ago(30) },
];

/** Banks the payment providers issue customer accounts from (practice). */
export const providerBanks: Record<"paystack" | "flutterwave" | "monnify", string> = { paystack: "Wema Bank", flutterwave: "Sterling Bank", monnify: "Moniepoint MFB" };
