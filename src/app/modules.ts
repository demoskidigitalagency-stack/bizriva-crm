/**
 * Unified Bizriva navigation — the single source of truth for every menu.
 *
 * Built from the "Unified result" tab of repo-comparison.xlsx: three Lovable
 * prototypes (Sandala, Kobolink, Bizriva) plus the master build prompt.
 * Nothing here is final until agreed; `decision` records that.
 *
 * The sidebar, the planned-module pages and the Build Progress page all read
 * from this file, so a menu can never exist in one place and not the others.
 */
import type { LucideIcon } from "lucide-react";
import {
  BarChart3, BookOpen, Boxes, Bot, CalendarCheck, CreditCard, FileText, HelpCircle, Images, LayoutDashboard,
  Megaphone, MessageSquare, Package, Plug, Send, Settings, ShieldCheck, ShoppingBag, Store, Truck, Users,
  UsersRound, Wallet, Workflow, History, ListChecks, Bike, Building2, ClipboardList, CalendarDays, Telescope, Sunrise,
} from "lucide-react";

/** How real a module is today. Shown honestly in the UI — never overstated. */
export type BuildState =
  | "live" // works against the real backend
  | "practice" // every page opens and every control works, on sample data saved in this browser
  | "partial" // screen exists but some controls are not wired yet
  | "planned"; // scoped, not built yet

export type Phase = "Foundation" | "MVP" | "Later";

export type Source = "Sandala" | "Kobolink" | "Bizriva" | "Prompt" | "Review 2026-11-04" | "Review 2026-11-05";

export interface ModuleDef {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  group: string;
  phase: Phase;
  state: BuildState;
  sources: Source[];
  submenus: string[];
  summary: string;
  /** Agreement status from the crosswalk discussion. */
  decision: "Agreed" | "Agreed";
}

export const GROUPS = [
  "Overview", "Customers", "Sales", "Commerce", "Delivery", "Automation", "Growth", "Money", "Insights", "Workspace",
] as const;

export const MODULES: ModuleDef[] = [
  // Overview
  { id: "dashboard", label: "Dashboard", path: "/", icon: LayoutDashboard, group: "Overview", phase: "MVP", state: "practice", sources: ["Bizriva", "Sandala", "Prompt"], decision: "Agreed",
    submenus: ["Revenue and delivered revenue", "Acquisition funnel", "Ad performance", "Fulfilment summary", "Recent activity"],
    summary: "Owner and manager view of revenue, leads, conversion, COD outstanding and ad return." },
  { id: "today", label: "Today", path: "/today", icon: CalendarCheck, group: "Overview", phase: "MVP", state: "practice", sources: ["Bizriva"], decision: "Agreed",
    submenus: ["New leads", "Needs reply", "Follow-ups due", "Orders to confirm", "Awaiting dispatch", "Failed deliveries", "COD outstanding", "Low stock", "7-day setup checklist"],
    summary: "The action queue staff work through each day." },
  { id: "brief", label: "Money Brief", path: "/brief", icon: Sunrise, group: "Overview", phase: "MVP", state: "practice", sources: ["Review 2026-11-04"], decision: "Agreed",
    submenus: ["Yesterday's delivered revenue vs average", "Cash with riders and overdue", "Orders to confirm and high-risk COD", "Ad return, best and weakest ad", "Birthdays this week", "Today's list", "Copy as WhatsApp message", "Send time and channels (WhatsApp and email with backend)"],
    summary: "A plain-words morning summary of the money and what needs you today. Revenue counts only delivered orders." },
  { id: "calendar", label: "Calendar", path: "/calendar", icon: CalendarDays, group: "Overview", phase: "MVP", state: "practice", sources: ["Review 2026-11-04"], decision: "Agreed",
    submenus: ["Month, week and list views", "Deliveries, call-backs, tasks and follow-ups", "Busy days", "Add an event"],
    summary: "Every delivery date, call-back and reminder on one calendar, so nothing is promised twice." },

  // Customers
  { id: "inbox", label: "Inbox", path: "/inbox", icon: MessageSquare, group: "Customers", phase: "MVP", state: "practice", sources: ["Sandala", "Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["WhatsApp, Instagram, Messenger, TikTok and website chat in one list", "Send payment link", "Customer memory beside the chat", "Import old WhatsApp chats", "Complaints filter and resolve", "Quick replies from the reply library", "All", "Unread", "New enquiries", "Assigned", "Unassigned", "Priority", "Waiting on customer", "Waiting on us", "AI-handled", "Human-handled", "Closed", "Channel filter"],
    summary: "One shared inbox for every channel, so no conversation depends on a single phone." },
  { id: "crm", label: "CRM", path: "/crm", icon: Users, group: "Customers", phase: "MVP", state: "practice", sources: ["Bizriva", "Sandala", "Prompt"], decision: "Agreed",
    submenus: ["Overview", "Contacts", "Customer 360", "Customers", "Leads", "Pipeline", "Tasks", "Segments (view only until backend)", "Duplicates and merge", "CSV imports", "Import old WhatsApp chats (Export chat .txt or .zip)", "Customer memory: birthday, size, likes, budget, who they buy for"],
    summary: "One identity per person: a Contact can become a Lead and later a Customer without duplicate records." },

  // Sales
  { id: "orders", label: "Orders", path: "/orders", icon: ShoppingBag, group: "Sales", phase: "MVP", state: "practice", sources: ["Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["All orders by status", "Order detail and next step", "New order for any contact", "Cancellations and returns", "Conversational checkout (with AI agent)", "Deposits and balances", "Request balance in chat", "Invoices (print or PDF)"],
    summary: "Orders captured from conversations, linked to the original lead and chat." },
  { id: "cod", label: "COD Verification", path: "/cod", icon: ShieldCheck, group: "Sales", phase: "MVP", state: "practice", sources: ["Sandala", "Prompt"], decision: "Agreed",
    submenus: ["Pending verification", "Risk flags", "Human review", "Confirmation log"],
    summary: "Confirm name, phone, address, amount and COD terms before any courier run." },
  { id: "order-forms", label: "Order Forms", path: "/order-forms", icon: ClipboardList, group: "Sales", phase: "MVP", state: "practice", sources: ["Review 2026-11-04"], decision: "Agreed",
    submenus: ["Form builder with Buy 1 / 2 / 3 packages and gifts", "Live total, price locked to the saved form", "Every order saved first", "Form report: views, starts, drop-off by field", "Orders by region and ad source", "One purchase event per order (Meta, TikTok)", "Embed on any website", "Export to spreadsheet"],
    summary: "Landing-page order forms that never lose an order and show which ad and region it came from." },

  // Commerce
  { id: "products", label: "Products", path: "/products", icon: Package, group: "Commerce", phase: "MVP", state: "practice", sources: ["Sandala", "Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["Catalogue", "Add and edit", "Stock and low-stock alerts", "Margins", "Variants and send product card (with Media Library)", "Import products from CSV"],
    summary: "The catalogue the AI agent and sales staff both answer from." },
  { id: "media", label: "Media Library", path: "/media", icon: Images, group: "Commerce", phase: "MVP", state: "practice", sources: ["Prompt"], decision: "Agreed",
    submenus: ["Upload images and videos", "Link to products", "Duplicate check", "Storage usage"],
    summary: "Upload product media once and send it from the cloud, not from a phone." },
  { id: "inventory", label: "Inventory", path: "/inventory", icon: Boxes, group: "Commerce", phase: "Later", state: "practice", sources: ["Kobolink"], decision: "Agreed",
    submenus: ["Reorder list", "Stock movements", "Adjust with reason", "Stock value"], summary: "Stock levels and alerts." },
  { id: "store", label: "Store", path: "/store", icon: Store, group: "Commerce", phase: "Later", state: "practice", sources: ["Bizriva"], decision: "Agreed",
    submenus: ["Store on/off and address", "Shop preview from catalogue", "Share kit: WhatsApp link, QR code, store and form links"], summary: "Online storefront." },

  // Delivery
  { id: "delivery", label: "Delivery", path: "/delivery", icon: Truck, group: "Delivery", phase: "MVP", state: "practice", sources: ["Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["Dispatch board", "Assign riders", "Failed attempts with reason", "Reschedule and return", "Delivery success"], summary: "Dispatch, track and record every delivery outcome." },
  { id: "riders", label: "Riders", path: "/riders", icon: Bike, group: "Delivery", phase: "Later", state: "practice", sources: ["Kobolink"], decision: "Agreed",
    submenus: ["Roster and zones", "Cash held per rider", "Rider phone view with one-tap collected"], summary: "Riders, zones and the one-tap rider phone view." },

  // Automation
  { id: "ai-agent", label: "AI Sales Agent", path: "/ai-agent", icon: Bot, group: "Automation", phase: "MVP", state: "practice", sources: ["Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["Agent setup", "Greeting and tone", "Handover keywords", "Test chat with sources shown"],
    summary: "First-line sales replies that only use facts from the catalogue and knowledge base." },
  { id: "knowledge", label: "Knowledge Base", path: "/knowledge", icon: BookOpen, group: "Automation", phase: "MVP", state: "practice", sources: ["Prompt"], decision: "Agreed",
    submenus: ["Company info", "FAQs", "Delivery and fees", "Policies", "Policy starters", "Sales scripts"], summary: "The AI agent's source of truth." },
  { id: "follow-ups", label: "Follow-ups", path: "/follow-ups", icon: ListChecks, group: "Automation", phase: "MVP", state: "practice", sources: ["Sandala", "Prompt"], decision: "Agreed",
    submenus: ["Due now", "Scheduled", "Rules", "24-hour window, consent, quiet hours, attempt limits"], summary: "Recover people who stop replying, within channel rules." },
  { id: "templates", label: "Templates", path: "/templates", icon: FileText, group: "Automation", phase: "MVP", state: "practice", sources: ["Prompt"], decision: "Agreed",
    submenus: ["Reply library: enquiries, payments, delivery, complaints, objections, win-back, referrals", "English and Pidgin", "Utility and marketing templates", "Approval status", "Opt-out check for marketing"], summary: "Required to message outside WhatsApp's 24-hour window." },
  { id: "broadcasts", label: "Broadcasts", path: "/broadcasts", icon: Send, group: "Automation", phase: "Later", state: "practice", sources: ["Sandala"], decision: "Agreed",
    submenus: ["Segment and template", "Schedule or send", "Consent skip count"], summary: "Segmented sends to consenting contacts." },
  { id: "builder", label: "Automation Builder", path: "/automation", icon: Workflow, group: "Automation", phase: "Later", state: "practice", sources: ["Bizriva", "Prompt"], decision: "Agreed",
    submenus: ["Step editor: when, if, wait, do", "On/off, copy, delete", "Ready-made: win back, referral, complaint handling", "AI workflow planner from repo 3 (needs our own AI key — backend)"], summary: "Triggers, conditions, delays and actions." },
  { id: "history", label: "Workflow History", path: "/workflow-history", icon: History, group: "Automation", phase: "Later", state: "practice", sources: ["Sandala", "Prompt"], decision: "Agreed",
    submenus: ["Runs by status", "Retry safe failures", "Filter by workflow"], summary: "Every automated action and human intervention." },

  // Growth
  { id: "ads", label: "Ads and Attribution", path: "/ads", icon: Megaphone, group: "Growth", phase: "Later", state: "practice", sources: ["Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["Connect Meta Ads (Facebook login, ad account)", "Sync campaigns and daily spend", "Create an ad: product, picture, words in English or Pidgin, WhatsApp or order form, audience, budget, previews", "Meta policy pre-check", "Created paused; start and pause from Bizriva", "Scale or fix advice from delivered sales", "Send delivered sales to Meta (Conversions API)", "Campaigns with return on delivered sales", "Lead sources"], summary: "Trace revenue back to the ad that started the chat." },

  // Money
  { id: "payments", label: "Payments", path: "/payments", icon: Wallet, group: "Money", phase: "Later", state: "practice", sources: ["Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["COD cash ledger", "Unpaid orders", "Payment links", "All payments"], summary: "Cash held versus remitted, and online payments." },

  // Insights
  { id: "analytics", label: "Analytics", path: "/analytics", icon: BarChart3, group: "Insights", phase: "MVP", state: "practice", sources: ["Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["Order funnel", "Top products", "Delivery by city", "Sales by channel", "Sales team"],
    summary: "Created, confirmed and delivered are tracked separately; COD is not revenue until delivered." },

  // Workspace
  { id: "team", label: "Team and Roles", path: "/team", icon: UsersRound, group: "Workspace", phase: "MVP", state: "practice", sources: ["Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["Members and roles", "Invite", "Permission matrix"], summary: "Who can see and do what." },
  { id: "integrations", label: "Integrations", path: "/integrations", icon: Plug, group: "Workspace", phase: "MVP", state: "practice", sources: ["Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["What each needs to connect", "Simulate for testing (labelled)"], summary: "Connected channels, shown as connected only when they really are." },
  { id: "settings", label: "Settings", path: "/settings", icon: Settings, group: "Workspace", phase: "Foundation", state: "practice", sources: ["Sandala", "Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["Appearance", "Business and delivery", "Notifications", "Consent and limits", "Reset sample data"], summary: "Workspace settings, including the appearance options." },
  { id: "billing", label: "Billing", path: "/billing", icon: CreditCard, group: "Workspace", phase: "Later", state: "practice", sources: ["Prompt"], decision: "Agreed",
    submenus: ["Usage meters", "Plans (example prices)", "Invoices (with backend)"], summary: "Subscription and usage." },
  { id: "progress", label: "Build Progress", path: "/progress", icon: ListChecks, group: "Workspace", phase: "Foundation", state: "practice", sources: ["Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["Overall 0–100%", "By phase", "Acceptance tests"], summary: "Where the build stands, ticked box by box." },
  { id: "connections", label: "Website & Forms", path: "/connections", icon: Plug, group: "Workspace", phase: "MVP", state: "practice", sources: ["Review 2026-11-05"], decision: "Agreed",
    submenus: ["WordPress: Elementor, Gravity Forms, WPForms, Contact Form 7, Fluent Forms", "Stores: WooCommerce, Shopify", "Google Forms, Typeform, Jotform, Tally", "Zapier, Make, Pabbly", "Any website (HTTP POST)", "Setup steps, intake address and secret key", "Test with a sample and match fields", "Activity log with duplicates skipped", "Orders or leads, with a chat in the Inbox"],
    summary: "Connect the website, forms and store a business already uses. Every submission becomes a lead or a COD order to confirm." },
  { id: "roadmap", label: "Coming Later", path: "/roadmap", icon: Telescope, group: "Workspace", phase: "Later", state: "practice", sources: ["Review 2026-11-04"], decision: "Agreed",
    submenus: ["Needs the backend", "Parked for later", "Where each idea came from"],
    summary: "Ideas we agreed to keep for later, so nothing is lost. Not counted in the progress score until scheduled." },
  { id: "help", label: "Help", path: "/help", icon: HelpCircle, group: "Workspace", phase: "Later", state: "practice", sources: ["Bizriva"], decision: "Agreed",
    submenus: ["Guides", "Shortcuts", "Common questions"], summary: "Guides and support." },
];

/** Platform-level area, kept out of the business menu on purpose. */
export const SUPER_ADMIN: Omit<ModuleDef, "group"> = {
  id: "super-admin", label: "Super Admin", path: "/super-admin", icon: Building2, phase: "Later", state: "planned",
  sources: ["Prompt"], decision: "Agreed", submenus: ["Tenants", "Plans", "Usage", "Platform activity"],
  summary: "Bizriva operator console. Separate from any business workspace.",
};

export function findModule(pathname: string): ModuleDef | undefined {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const hit =
    MODULES.find((m) => m.path === clean) ??
    MODULES.find((m) => m.path !== "/" && clean.startsWith(`${m.path}/`));
  if (hit) return hit;
  return clean === SUPER_ADMIN.path ? { ...SUPER_ADMIN, group: "Platform" } : undefined;
}

export const STATE_LABEL: Record<BuildState, string> = {
  live: "Live",
  practice: "Practice ready",
  partial: "Partly working",
  planned: "Planned",
};

export const STATE_TONE: Record<BuildState, "success" | "info" | "warning" | "neutral"> = {
  live: "success",
  practice: "info",
  partial: "warning",
  planned: "neutral",
};

/* ------------------------------------------------------------------
 * Future ideas (agreed 2026-11-04). Kept out of MODULES on purpose so they
 * don't change the progress score until they are scheduled.
 * ------------------------------------------------------------------ */
export interface FutureIdea {
  id: string;
  title: string;
  bucket: "Needs the backend" | "Parked for later";
  from: string;
  summary: string;
  /** Which module it would extend when built. */
  goesInto: string;
  /** What has to be true first. */
  needs: string;
}

export const FUTURE: FutureIdea[] = [
  // Needs the backend
  { id: "fx-photo-product", bucket: "Needs the backend", title: "Photo to product", from: "WaContacts", goesInto: "Products", needs: "AI model with image input", summary: "Snap a product photo and AI fills in name, description and category for you to check." },
  { id: "fx-voice-languages", bucket: "Needs the backend", title: "Voice notes and local languages", from: "Xara", goesInto: "AI Sales Agent, Inbox", needs: "WhatsApp Cloud API media and an AI model", summary: "The AI agent understands voice notes and replies in Pidgin, Yoruba, Hausa or Igbo." },
  { id: "fx-message-to-order", bucket: "Needs the backend", title: "Message to order", from: "StitchBook", goesInto: "Inbox, Orders", needs: "AI model", summary: "Turn a message like \"2 frontals for Tola, deposit 30k\" into a draft order to confirm." },
  { id: "fx-capi", bucket: "Needs the backend", title: "Accurate ad numbers", from: "FabianForms", goesInto: "Order Forms, Ads", needs: "Meta Conversions API and TikTok Events API keys", summary: "Practice version built (Ads → Send sales back to Meta). Going live needs the dataset token; TikTok Events API follows." },
  { id: "fx-paylinks", bucket: "Needs the backend", title: "Real payment links", from: "StitchBook, Xara", goesInto: "Orders, Payments", needs: "Paystack or Flutterwave account and webhooks", summary: "Deposit and balance links that mark the order paid by themselves." },
  { id: "fx-ad-copy", bucket: "Needs the backend", title: "AI ad copy and weekly WhatsApp report", from: "Adflow", goesInto: "Ads", needs: "AI model and WhatsApp templates", summary: "Draft ad text for Nigerian buyers and send the owner a plain weekly report on WhatsApp." },
  { id: "fx-ad-launch", bucket: "Needs the backend", title: "Launch and auto-tune ads", from: "Adflow", goesInto: "Ads", needs: "Meta Marketing API app review", summary: "Creating ads is built (practice). Going live needs ads_management; automatic budget moves by delivered orders come after." },
  { id: "fx-brief-send", bucket: "Needs the backend", title: "Money Brief on WhatsApp and email", from: "Review 2026-11-05", goesInto: "Money Brief", needs: "WhatsApp Cloud API template and email sending", summary: "The brief arrives on your phone at the time you choose, every morning." },
  { id: "fx-ai-memory", bucket: "Needs the backend", title: "AI customer memory", from: "Review 2026-11-05", goesInto: "Customer 360, AI Sales Agent", needs: "AI model", summary: "An AI reads every chat (including voice notes) and suggests what to remember, beyond the patterns used today." },
  { id: "fx-wp-plugin", bucket: "Needs the backend", title: "Bizriva WordPress plugin", from: "Review 2026-11-05", goesInto: "Website & Forms", needs: "Live intake endpoint; WordPress.org listing", summary: "One install catches every form plugin and WooCommerce order on the site — no webhook setup per form." },
  { id: "fx-fb-leads", bucket: "Needs the backend", title: "Facebook and Instagram Lead Ads", from: "Review 2026-11-05", goesInto: "Website & Forms, Ads", needs: "Meta app review (leads_retrieval)", summary: "Instant-form leads arrive directly with their campaign, no Zapier needed." },
  { id: "fx-store-import", bucket: "Needs the backend", title: "Import from Shopify and WooCommerce", from: "WaContacts", goesInto: "Products", needs: "Store API keys", summary: "Bring a whole catalogue across with photos." },
  { id: "fx-owner-assistant", bucket: "Needs the backend", title: "Owner assistant on WhatsApp", from: "Xara", goesInto: "Analytics, Payments", needs: "WhatsApp Cloud API and an AI model", summary: "Ask \"how much cash is with riders today?\" in WhatsApp and get the answer." },
  { id: "fx-invoice-pdf", bucket: "Needs the backend", title: "Invoice and receipt PDFs by email or WhatsApp", from: "WaContacts, StitchBook", goesInto: "Orders", needs: "Server-side PDF and email sending", summary: "Send the invoice as a file instead of printing it." },
  // Parked for later
  { id: "fx-escrow", bucket: "Parked for later", title: "Buyer protection (escrow)", from: "WaContacts", goesInto: "Payments", needs: "A licensed payments partner", summary: "Hold the buyer's payment until delivery is confirmed, with automatic release timers." },
  { id: "fx-financing", bucket: "Parked for later", title: "Financing readiness score", from: "StitchBook", goesInto: "Analytics", needs: "A lending partner", summary: "A score from real delivered orders and payments that a lender could use." },
  { id: "fx-marketplace", bucket: "Parked for later", title: "Public marketplace and seller directory", from: "WaContacts, StitchBook", goesInto: "Store", needs: "A decision to run a marketplace", summary: "Browse sellers by category and state, with SEO pages." },
  { id: "fx-digital", bucket: "Parked for later", title: "Digital downloads", from: "WaContacts", goesInto: "Products, Store", needs: "Payments and file storage", summary: "Sell ebooks and courses with automatic delivery after payment." },
  { id: "fx-tailor-pack", bucket: "Parked for later", title: "Tailor and fashion industry pack", from: "StitchBook", goesInto: "CRM, Orders, Inventory", needs: "Core Bizriva live first", summary: "Measurements per client, garment stages from cutting to delivery, fabric stock and group orders, switched on per business." },
  { id: "fx-banking", bucket: "Parked for later", title: "Transfers and bill payments", from: "Xara", goesInto: "Payments", needs: "A financial licence or licensed partner", summary: "Money movement inside the chat. Out of scope unless a partner provides it." },
  { id: "fx-reviews", bucket: "Parked for later", title: "Google reviews on the store", from: "WaContacts", goesInto: "Store", needs: "Google Business Profile access", summary: "Show real reviews on the store page." },
  { id: "fx-popups", bucket: "Parked for later", title: "Recent order pop-ups", from: "FabianForms", goesInto: "Store, Order Forms", needs: "Real order data only", summary: "\"Someone in Ikeja just ordered\" notices, only ever from real orders." },
];
