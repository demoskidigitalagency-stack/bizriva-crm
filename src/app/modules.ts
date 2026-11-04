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
  UsersRound, Wallet, Workflow, History, ListChecks, Bike, Building2,
} from "lucide-react";

/** How real a module is today. Shown honestly in the UI — never overstated. */
export type BuildState =
  | "live" // works against the real backend
  | "practice" // every page opens and every control works, on sample data saved in this browser
  | "partial" // screen exists but some controls are not wired yet
  | "planned"; // scoped, not built yet

export type Phase = "Foundation" | "MVP" | "Later";

export type Source = "Sandala" | "Kobolink" | "Bizriva" | "Prompt";

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
    submenus: ["New leads", "Needs reply", "Follow-ups due", "Orders to confirm", "Awaiting dispatch", "Failed deliveries", "COD outstanding", "Low stock"],
    summary: "The action queue staff work through each day." },

  // Customers
  { id: "inbox", label: "Inbox", path: "/inbox", icon: MessageSquare, group: "Customers", phase: "MVP", state: "practice", sources: ["Sandala", "Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["All", "Unread", "New enquiries", "Assigned", "Unassigned", "Priority", "Waiting on customer", "Waiting on us", "AI-handled", "Human-handled", "Closed", "Channel filter"],
    summary: "One shared inbox for every channel, so no conversation depends on a single phone." },
  { id: "crm", label: "CRM", path: "/crm", icon: Users, group: "Customers", phase: "MVP", state: "practice", sources: ["Bizriva", "Sandala", "Prompt"], decision: "Agreed",
    submenus: ["Overview", "Contacts", "Customer 360", "Customers", "Leads", "Pipeline", "Tasks", "Segments (view only until backend)", "Duplicates and merge", "CSV imports"],
    summary: "One identity per person: a Contact can become a Lead and later a Customer without duplicate records." },

  // Sales
  { id: "orders", label: "Orders", path: "/orders", icon: ShoppingBag, group: "Sales", phase: "MVP", state: "practice", sources: ["Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["All orders by status", "Order detail and next step", "New order for any contact", "Cancellations and returns", "Conversational checkout (with AI agent)", "Receipts (with backend)"],
    summary: "Orders captured from conversations, linked to the original lead and chat." },
  { id: "cod", label: "COD Verification", path: "/cod", icon: ShieldCheck, group: "Sales", phase: "MVP", state: "practice", sources: ["Sandala", "Prompt"], decision: "Agreed",
    submenus: ["Pending verification", "Risk flags", "Human review", "Confirmation log"],
    summary: "Confirm name, phone, address, amount and COD terms before any courier run." },

  // Commerce
  { id: "products", label: "Products", path: "/products", icon: Package, group: "Commerce", phase: "MVP", state: "practice", sources: ["Sandala", "Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["Catalogue", "Add and edit", "Stock and low-stock alerts", "Margins", "Variants and send product card (with Media Library)"],
    summary: "The catalogue the AI agent and sales staff both answer from." },
  { id: "media", label: "Media Library", path: "/media", icon: Images, group: "Commerce", phase: "MVP", state: "practice", sources: ["Prompt"], decision: "Agreed",
    submenus: ["Upload images and videos", "Link to products", "Duplicate check", "Storage usage"],
    summary: "Upload product media once and send it from the cloud, not from a phone." },
  { id: "inventory", label: "Inventory", path: "/inventory", icon: Boxes, group: "Commerce", phase: "Later", state: "practice", sources: ["Kobolink"], decision: "Agreed",
    submenus: ["Reorder list", "Stock movements", "Adjust with reason", "Stock value"], summary: "Stock levels and alerts." },
  { id: "store", label: "Store", path: "/store", icon: Store, group: "Commerce", phase: "Later", state: "practice", sources: ["Bizriva"], decision: "Agreed",
    submenus: ["Store on/off and address", "Shop preview from catalogue"], summary: "Online storefront." },

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
    submenus: ["Company info", "FAQs", "Delivery and fees", "Policies", "Sales scripts"], summary: "The AI agent's source of truth." },
  { id: "follow-ups", label: "Follow-ups", path: "/follow-ups", icon: ListChecks, group: "Automation", phase: "MVP", state: "practice", sources: ["Sandala", "Prompt"], decision: "Agreed",
    submenus: ["Due now", "Scheduled", "Rules", "24-hour window, consent, quiet hours, attempt limits"], summary: "Recover people who stop replying, within channel rules." },
  { id: "templates", label: "Templates", path: "/templates", icon: FileText, group: "Automation", phase: "MVP", state: "practice", sources: ["Prompt"], decision: "Agreed",
    submenus: ["Utility and marketing templates", "Approval status", "Opt-out check for marketing"], summary: "Required to message outside WhatsApp's 24-hour window." },
  { id: "broadcasts", label: "Broadcasts", path: "/broadcasts", icon: Send, group: "Automation", phase: "Later", state: "practice", sources: ["Sandala"], decision: "Agreed",
    submenus: ["Segment and template", "Schedule or send", "Consent skip count"], summary: "Segmented sends to consenting contacts." },
  { id: "builder", label: "Automation Builder", path: "/automation", icon: Workflow, group: "Automation", phase: "Later", state: "practice", sources: ["Bizriva", "Prompt"], decision: "Agreed",
    submenus: ["Step editor: when, if, wait, do", "On/off, copy, delete", "AI workflow planner from repo 3 (needs our own AI key — backend)"], summary: "Triggers, conditions, delays and actions." },
  { id: "history", label: "Workflow History", path: "/workflow-history", icon: History, group: "Automation", phase: "Later", state: "practice", sources: ["Sandala", "Prompt"], decision: "Agreed",
    submenus: ["Runs by status", "Retry safe failures", "Filter by workflow"], summary: "Every automated action and human intervention." },

  // Growth
  { id: "ads", label: "Ads and Attribution", path: "/ads", icon: Megaphone, group: "Growth", phase: "Later", state: "practice", sources: ["Kobolink", "Prompt"], decision: "Agreed",
    submenus: ["Campaigns and ROAS", "Manual spend entry", "Cost per lead and per delivered order", "Lead sources"], summary: "Trace revenue back to the ad that started the chat." },

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
