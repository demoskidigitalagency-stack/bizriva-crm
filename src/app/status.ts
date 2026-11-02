/**
 * Build status — the 0–100 checklist.
 *
 * Each phase carries a share of the 100%. Inside a phase, every item has a
 * weight; the phase's progress is (done weight / total weight) × phase share.
 * Tick an item by setting `done: true` and adding the date. STATUS.md is
 * generated from this file (`bun run status`), so the two never disagree.
 *
 * Rule from the master prompt: an item is only done when it works for real,
 * not when its screen exists.
 */

export interface StatusItem {
  id: string;
  label: string;
  weight: number;
  done: boolean;
  doneOn?: string;
  note?: string;
}

export interface StatusPhase {
  id: string;
  name: string;
  share: number; // percent of the whole build
  goal: string;
  items: StatusItem[];
}

export const PHASES: StatusPhase[] = [
  {
    id: "p0", name: "Phase 0 — Foundation", share: 10,
    goal: "One repo, one design system, one menu, one plan.",
    items: [
      { id: "p0-repo", label: "bizriva-crm set up from repo 3 (Bizriva) shell, design system and data types", weight: 2, done: true, doneOn: "2026-11-02" },
      { id: "p0-themes", label: "Appearance: Hybrid default, with Sandala, Kobolink and Bizriva as options", weight: 2, done: true, doneOn: "2026-11-02" },
      { id: "p0-nav", label: "Unified navigation: every agreed menu present, unbuilt ones shown as planned", weight: 2, done: true, doneOn: "2026-11-02" },
      { id: "p0-status", label: "Build Progress page and STATUS.md (this checklist)", weight: 1, done: true, doneOn: "2026-11-02" },
      { id: "p0-schema", label: "Multi-workspace database schema drafted (not yet applied)", weight: 2, done: true, doneOn: "2026-11-02" },
      { id: "p0-decisions", label: "Crosswalk decisions agreed (menus, lead stages, order statuses, roles)", weight: 1, done: false, note: "Use the 'Your decision' column in repo-comparison.xlsx" },
    ],
  },
  {
    id: "p1", name: "Phase 1 — Core communication", share: 25,
    goal: "Real WhatsApp messages land in a shared, saved inbox for several agents.",
    items: [
      { id: "p1-backend", label: "Backend chosen and connected (Supabase project, environment)", weight: 2, done: false, note: "Decision pending: Lovable Cloud or own Supabase" },
      { id: "p1-auth", label: "Sign-up, sign-in, invitations", weight: 2, done: false },
      { id: "p1-tenancy", label: "Workspaces with row-level isolation applied and tested", weight: 3, done: false },
      { id: "p1-roles", label: "Roles and permissions enforced on the server", weight: 2, done: false },
      { id: "p1-contacts", label: "Contacts, leads and conversations saved for real (no sample data)", weight: 2, done: false },
      { id: "p1-wa-connect", label: "WhatsApp Cloud API number connected", weight: 2, done: false, note: "Needs Meta Business verification" },
      { id: "p1-webhook", label: "Inbound webhook: signature checked, duplicates ignored", weight: 3, done: false },
      { id: "p1-send", label: "Send replies, media and templates from the inbox", weight: 2, done: false },
      { id: "p1-realtime", label: "Inbox updates live; assignment and transfer", weight: 2, done: false },
    ],
  },
  {
    id: "p2", name: "Phase 2 — AI and automation", share: 20,
    goal: "Instant first replies from real catalogue data, and follow-ups that respect the rules.",
    items: [
      { id: "p2-catalogue", label: "Products with variants, prices and stock", weight: 2, done: false },
      { id: "p2-media", label: "Media library in cloud storage", weight: 2, done: false },
      { id: "p2-kb", label: "Knowledge base", weight: 2, done: false },
      { id: "p2-agent", label: "AI agent answers only from catalogue and knowledge base", weight: 3, done: false },
      { id: "p2-takeover", label: "Human takeover pauses AI; hand back to AI", weight: 2, done: false },
      { id: "p2-templates", label: "Template management (WhatsApp-approved)", weight: 1, done: false },
      { id: "p2-followups", label: "Follow-up engine: 24-hour window, caps, quiet hours, stop on reply", weight: 3, done: false },
      { id: "p2-consent", label: "Consent records, opt-out keywords, suppression list", weight: 2, done: false },
    ],
  },
  {
    id: "p3", name: "Phase 3 — Sales and commerce", share: 20,
    goal: "Chats become confirmed, delivered, paid orders.",
    items: [
      { id: "p3-pipeline", label: "Lead pipeline with agreed stages", weight: 2, done: false },
      { id: "p3-scoring", label: "Lead scoring from real buying actions", weight: 2, done: false },
      { id: "p3-checkout", label: "Conversational checkout with order summary and explicit confirmation", weight: 3, done: false },
      { id: "p3-orders", label: "Orders: edit, cancel, history, receipts", weight: 2, done: false },
      { id: "p3-cod", label: "COD verification and risk flags", weight: 3, done: false },
      { id: "p3-delivery", label: "Dispatch board and delivery outcomes", weight: 2, done: false },
      { id: "p3-notify", label: "Order, dispatch and delivery notifications", weight: 2, done: false },
    ],
  },
  {
    id: "p4", name: "Phase 4 — More channels", share: 10,
    goal: "The same inbox for Messenger, Instagram, SMS, email and web chat.",
    items: [
      { id: "p4-meta", label: "Messenger and Instagram DMs", weight: 2, done: false },
      { id: "p4-sms", label: "SMS", weight: 1, done: false },
      { id: "p4-email", label: "Email", weight: 1, done: false },
      { id: "p4-webchat", label: "Website chat", weight: 1, done: false },
      { id: "p4-leadforms", label: "Meta lead forms and ad referral data", weight: 2, done: false },
    ],
  },
  {
    id: "p5", name: "Phase 5 — Intelligence and monetisation", share: 15,
    goal: "Know which ad made the money; charge for the product.",
    items: [
      { id: "p5-analytics", label: "Analytics: created vs confirmed vs delivered", weight: 2, done: false },
      { id: "p5-attribution", label: "Ad attribution, ROAS, cost per delivered order", weight: 2, done: false },
      { id: "p5-agents", label: "Agent performance and response times", weight: 1, done: false },
      { id: "p5-riders", label: "Riders, COD cash ledger, settlements", weight: 2, done: false },
      { id: "p5-billing", label: "Plans, billing and usage limits", weight: 2, done: false },
      { id: "p5-superadmin", label: "Super Admin console", weight: 2, done: false },
      { id: "p5-tests", label: "All 15 acceptance tests pass end to end", weight: 3, done: false },
    ],
  },
];

/** The 15 acceptance tests from the master prompt, tracked separately. */
export const ACCEPTANCE_TESTS: { n: number; label: string; passed: boolean }[] = [
  { n: 1, label: "Ad click starts a WhatsApp chat; contact and ad source recorded", passed: false },
  { n: 2, label: "'Hello' gets an immediate correct greeting", passed: false },
  { n: 3, label: "Price question answered from the catalogue", passed: false },
  { n: 4, label: "Photo request sends the right media from cloud storage", passed: false },
  { n: 5, label: "Interested-then-silent customer gets an eligible reminder scheduled", passed: false },
  { n: 6, label: "Reply before the reminder cancels or re-evaluates it", passed: false },
  { n: 7, label: "Asking for a human pauses AI and assigns the chat", passed: false },
  { n: 8, label: "Order placed in chat is created with the right details", passed: false },
  { n: 9, label: "COD order triggers verification and records confirmation", passed: false },
  { n: 10, label: "Dispatched order notifies the customer", passed: false },
  { n: 11, label: "Delivered order updates revenue and conversion analytics", passed: false },
  { n: 12, label: "Closed 24-hour window blocks free text; template used instead", passed: false },
  { n: 13, label: "Integration failure retries without duplicate messages or orders", passed: false },
  { n: 14, label: "One business cannot read another business's data", passed: false },
  { n: 15, label: "Opt-out stops marketing automation", passed: false },
];

export function phaseProgress(p: StatusPhase) {
  const total = p.items.reduce((s, i) => s + i.weight, 0);
  const done = p.items.filter((i) => i.done).reduce((s, i) => s + i.weight, 0);
  const pctOfPhase = total ? done / total : 0;
  return { pctOfPhase, contribution: pctOfPhase * p.share, doneCount: p.items.filter((i) => i.done).length, count: p.items.length };
}

export function overallProgress(phases: StatusPhase[] = PHASES) {
  const shareTotal = phases.reduce((s, p) => s + p.share, 0);
  const contribution = phases.reduce((s, p) => s + phaseProgress(p).contribution, 0);
  return shareTotal ? (contribution / shareTotal) * 100 : 0;
}
