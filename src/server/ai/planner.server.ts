/**
 * AI workflow planner — server-only module.
 *
 * Turns an operator's described workflow goal into a concrete, tailored plan
 * using the Lovable AI Gateway (OpenAI Responses endpoint). The CRM snapshot
 * is summarised server-side so the model plans against real workspace data
 * without shipping private records to the browser.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { jsonSchema, Output, streamText } from "ai";
import { createInitialDatabase } from "@/domain/database";
import { SOURCE_LABELS } from "@/domain/types";
import { createLovableAiGatewayRunIdFetch } from "./run-id";

const GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

/* ------------------------------------------------------------ plan types */

export interface WorkflowPlanStep {
  title: string;
  description: string;
  timing: string;
  channel: string;
  ownerRole: string;
  target: string;
  messageDraft: string | null;
}

export interface WorkflowPlan {
  title: string;
  summary: string;
  trigger: string;
  steps: WorkflowPlanStep[];
  successMetrics: string[];
  risks: string[];
}

const planSchema = jsonSchema<WorkflowPlan>({
  type: "object",
  properties: {
    title: { type: "string", description: "Short plan name, max 8 words" },
    summary: { type: "string", description: "Two-sentence explanation of how the plan meets the goal" },
    trigger: { type: "string", description: "What starts the workflow, e.g. an event or schedule" },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string", description: "What the operator does in this step, 1-3 sentences" },
          timing: { type: "string", description: "When it runs, e.g. 'Immediately' or '24 hours after step 1'" },
          channel: { type: "string", description: " whatsapp | instagram | facebook | tiktok | email | sms | phone | webchat | internal" },
          ownerRole: { type: "string", description: "owner | manager | sales_rep | support | fulfilment | finance" },
          target: { type: "string", description: "Which customers this step applies to" },
          messageDraft: { type: ["string", "null"], description: "A ready-to-send message draft when the step is a customer message, otherwise null" },
        },
        required: ["title", "description", "timing", "channel", "ownerRole", "target", "messageDraft"],
        additionalProperties: false,
      },
    },
    successMetrics: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
  },
  required: ["title", "summary", "trigger", "steps", "successMetrics", "risks"],
  additionalProperties: false,
});

/* ------------------------------------------------------- CRM data context */

interface CrmSnapshot {
  text: string;
}

function buildCrmSnapshot(): CrmSnapshot {
  const db = createInitialDatabase();

  const lifecycleCounts = new Map<string, number>();
  for (const c of db.contacts) lifecycleCounts.set(c.lifecycle, (lifecycleCounts.get(c.lifecycle) ?? 0) + 1);

  const stageCounts = new Map<string, number>();
  for (const l of db.leads) stageCounts.set(l.stage, (stageCounts.get(l.stage) ?? 0) + 1);

  const awaitingReply = db.conversations.filter((c) => c.awaitingReply).length;
  const pendingConfirmation = db.orders.filter((o) => o.status === "pending_confirmation").length;
  const awaitingDispatch = db.orders.filter((o) => o.status === "awaiting_dispatch").length;
  const failedDeliveries = db.deliveries.filter((d) => d.status === "failed").length;
  const codOutstanding = db.payments
    .filter((p) => p.status === "cod_pending")
    .reduce((s, p) => s + p.amount, 0);
  const overdueRemittances = db.payments.filter((p) => p.remittanceDueAt && !p.remitted);
  const lowStock = db.products.filter((p) => p.stock <= p.reorderLevel);
  const overdueTasks = db.tasks.filter((t) => t.status === "open" && new Date(t.dueAt).getTime() < Date.now()).length;

  const sourceLines = [...new Set(db.contacts.map((c) => c.source))]
    .map((s) => `${SOURCE_LABELS[s]}: ${db.contacts.filter((c) => c.source === s).length}`)
    .join("; ");

  const topProducts = db.products
    .slice()
    .sort((a, b) => db.orders.filter((o) => o.productNames.includes(b.name)).length - db.orders.filter((o) => o.productNames.includes(a.name)).length)
    .slice(0, 5)
    .map((p) => `${p.name} (₦${p.price.toLocaleString("en-NG")}, stock ${p.stock})`)
    .join("; ");

  const text = [
    `Workspace: ${db.workspaces[0]?.name ?? "Bizriva"} — ecommerce, currency NGN, country Nigeria.`,
    `Team roles: ${db.team.map((t) => t.role).join(", ")}.`,
    `Contacts: ${db.contacts.length} total. Lifecycle split: ${[...lifecycleCounts.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    `Leads: ${db.leads.length}. Stage split: ${[...stageCounts.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    `Open follow-up tasks past due: ${overdueTasks}.`,
    `Conversations awaiting reply: ${awaitingReply} of ${db.conversations.length}.`,
    `Orders: ${db.orders.length} total; ${pendingConfirmation} pending confirmation; ${awaitingDispatch} awaiting dispatch.`,
    `Deliveries failed and awaiting recovery call: ${failedDeliveries}.`,
    `COD outstanding: NGN ${codOutstanding.toLocaleString("en-NG")} across ${db.payments.filter((p) => p.status === "cod_pending").length} orders.`,
    `Overdue courier remittances: ${overdueRemittances.length} totalling NGN ${overdueRemittances.reduce((s, p) => s + p.amount, 0).toLocaleString("en-NG")}.`,
    `Low-stock products: ${lowStock.map((p) => `${p.name} (${p.stock}/${p.reorderLevel})`).join("; ") || "none"}.`,
    `Acquisition sources (contacts): ${sourceLines}.`,
    `Top products: ${topProducts}.`,
  ].join("\n");

  return { text };
}

/* ---------------------------------------------------------------- prompt */

const SYSTEM_PROMPT = `You are Bizriva CRM's workflow planner for a small ecommerce operator. You turn a described goal into a concrete, actionable customer workflow the operator can execute this week with their small team and the channels they already use (WhatsApp, Instagram, TikTok, phone calls, SMS, email).

Rules:
- Ground every step in the CRM snapshot numbers you are given; reference real counts and segments, not hypotheticals.
- Steps must be specific actions a human can take today (message X segment, call these customers, chase Y courier cash), not abstract strategy.
- Include ready-to-send message drafts where the step contacts a customer. Warm, concise, plain language suitable for a Nigerian ecommerce audience; no emojis in drafts.
- Order steps chronologically and state timing relative to the previous step or an event.
- Keep the whole plan executable: 4-8 steps. Every property is required; use null for messageDraft when the step is internal.`;

function buildPrompt(goal: string, snapshot: CrmSnapshot): string {
  return `CRM SNAPSHOT
${snapshot.text}

OPERATOR GOAL
${goal}

Produce the workflow plan JSON now.`;
}

/* ---------------------------------------------------------------- gateway */

export type PlanResult = { ok: true; plan: WorkflowPlan } | { ok: false; message: string };

export async function generateWorkflowPlan(goal: string, signal?: AbortSignal): Promise<PlanResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    return { ok: false, message: "AI is not configured for this workspace yet. Ask an admin to enable Lovable AI." };
  }

  const snapshot = buildCrmSnapshot();
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY_BASE_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  try {
    const result = streamText({
      model: provider.responses(MODEL),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(goal, snapshot) },
      ],
      output: Output.object({ schema: planSchema, name: "workflow_plan" }),
      ...(signal ? { abortSignal: signal } : {}),
      providerOptions: {
        openai: {
          store: false,
          forceReasoning: true,
          reasoningEffort: "medium",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    const plan = await result.output;
    if (!plan) {
      return { ok: false, message: "The planner couldn't produce a plan for that goal. Try rephrasing it." };
    }
    return { ok: true, plan };
  } catch (error) {
    return { ok: false, message: describePlannerError(error) };
  }
}

function describePlannerError(error: unknown): string {
  const e = error as { statusCode?: number; status?: number; message?: string; text?: string; name?: string };
  const status = e?.statusCode ?? e?.status;
  const raw = e?.message ?? e?.text ?? "";
  if (status === 402) {
    return raw || "AI credits are used up for this workspace. Top up your plan to keep planning workflows.";
  }
  if (status === 403) {
    return raw || "AI access is restricted for this workspace. An admin needs to enable it in settings.";
  }
  if (status === 429) {
    return "The AI planner is busy right now. Wait a moment and try again.";
  }
  if (e?.name === "NoObjectGeneratedError") {
    return "The planner couldn't produce a valid plan for that goal. Try describing it a bit differently.";
  }
  if (status && status >= 500) {
    return "The AI planner hit a temporary problem. Please try again.";
  }
  return raw ? `The planner could not complete: ${raw.slice(0, 200)}` : "The planner could not complete. Please try again.";
}
