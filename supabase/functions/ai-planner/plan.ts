// AI workflow planner — prompt, tool and checks (pure; unit-tested in tests/ai_planner.test.ts).

export interface PlanStep { title: string; description: string; timing: string; channel: string; ownerRole: string; target: string; messageDraft: string | null }
export interface WorkflowPlan { title: string; summary: string; trigger: string; steps: PlanStep[]; successMetrics: string[]; risks: string[] }

const CHANNELS = ["whatsapp", "instagram", "facebook", "email", "sms", "phone", "webchat", "internal"];
const ROLES = ["owner", "manager", "sales_rep", "support", "fulfilment", "finance"];

export const SYSTEM = `You are Bizriva's workflow planner for a small Nigerian business that sells with pay on delivery. Turn the operator's goal into a concrete workflow their small team can run this week with the channels they have.

Rules:
- Ground every step in the business numbers given; use the real counts and segments. If a number is 0, don't plan around it as if it were large.
- Steps are specific actions a person can do today (message this group, call these customers, chase this rider's cash), not strategy.
- Only use channels the business has connected, plus phone calls and internal steps. WhatsApp messages to people who haven't written in 24 hours need an approved template — say so in the step when it applies.
- Never plan messages to customers who opted out, and never suggest buying contact lists.
- Message drafts: warm, short, plain English a Nigerian customer would expect; no emojis; {{name}} for the customer's first name.
- 4–8 steps in time order, timing relative to the previous step or an event.`;

export const PLAN_TOOL = {
  name: "workflow_plan",
  description: "Return the workflow plan.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short plan name, at most 8 words" },
      summary: { type: "string", description: "Two sentences on how the plan meets the goal" },
      trigger: { type: "string", description: "What starts it: an event or a schedule" },
      steps: { type: "array", minItems: 2, maxItems: 8, items: { type: "object", properties: {
        title: { type: "string" }, description: { type: "string" }, timing: { type: "string" },
        channel: { type: "string", enum: CHANNELS }, ownerRole: { type: "string", enum: ROLES }, target: { type: "string" },
        messageDraft: { type: ["string", "null"] },
      }, required: ["title", "description", "timing", "channel", "ownerRole", "target", "messageDraft"] } },
      successMetrics: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
    },
    required: ["title", "summary", "trigger", "steps", "successMetrics", "risks"],
  },
};

export const prompt = (snapshot: string, goal: string) => `BUSINESS NUMBERS\n${snapshot.replace("Channels connected: .", "Channels connected: none yet.")}\n\nGOAL\n${goal}\n\nReturn the plan with the workflow_plan tool.`;

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Clean the model's answer into a plan, or say why it can't be used. */
// deno-lint-ignore no-explicit-any
export function checkPlan(x: any): { plan: WorkflowPlan } | { error: string } {
  if (!x || typeof x !== "object") return { error: "The planner didn't return a plan" };
  const steps: PlanStep[] = (Array.isArray(x.steps) ? x.steps : []).slice(0, 8).map((st: Record<string, unknown>) => ({
    title: s(st?.title, 120), description: s(st?.description, 600), timing: s(st?.timing, 120),
    channel: CHANNELS.includes(String(st?.channel)) ? String(st.channel) : "internal",
    ownerRole: ROLES.includes(String(st?.ownerRole)) ? String(st.ownerRole) : "manager",
    target: s(st?.target, 200), messageDraft: s(st?.messageDraft, 1000) || null,
  })).filter((st: PlanStep) => st.title && st.description);
  if (steps.length < 2) return { error: "The planner's answer had too few usable steps — try describing the goal differently" };
  const list = (v: unknown) => (Array.isArray(v) ? v.map((i) => s(i, 200)).filter(Boolean).slice(0, 6) : []);
  return { plan: { title: s(x.title, 80) || "Workflow plan", summary: s(x.summary, 600), trigger: s(x.trigger, 200), steps, successMetrics: list(x.successMetrics), risks: list(x.risks) } };
}
