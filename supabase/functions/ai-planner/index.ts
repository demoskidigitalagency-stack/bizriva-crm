// AI workflow planner — POST /functions/v1/ai-planner { workspace_id, goal } (signed-in team members).
//
// Plans with this business's real numbers (counts only, from svc_planner_start) using the
// business's own Anthropic key when set, otherwise Bizriva's ANTHROPIC_API_KEY. Every plan is saved.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { checkPlan, PLAN_TOOL, prompt, SYSTEM } from "./plan.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const MODEL = Deno.env.get("AI_PLANNER_MODEL") ?? "claude-sonnet-5-5";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const { data: u } = await db.auth.getUser((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!u?.user) return json(401, { error: "Please sign in again" });
  const b = await req.json().catch(() => ({}));
  const goal = String(b.goal ?? "").trim().slice(0, 2000);
  const ws = String(b.workspace_id ?? "");
  if (goal.length < 10) return json(400, { error: "Describe the goal in at least a sentence." });
  const { data: start } = await db.rpc("svc_planner_start", { p_user: u.user.id, p_workspace: ws });
  if (!start || start.error) return json(400, { error: start?.error ?? "Couldn't start the planner" });
  const key = start.api_key ?? Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!key) return json(503, { error: "The AI planner isn't switched on yet — add your Anthropic key under AI Agent." });

  let err: string | null = null, plan = null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: start.model ?? MODEL, max_tokens: 3000, system: SYSTEM, messages: [{ role: "user", content: prompt(start.snapshot, goal) }], tools: [PLAN_TOOL], tool_choice: { type: "tool", name: "workflow_plan" } }),
      signal: AbortSignal.timeout(60_000),
    });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 429 ? "The AI is busy right now — try again in a minute." : r.status === 401 ? "The AI key was refused — check it under AI Agent." : `${r.status} ${res?.error?.message ?? "The AI service refused the request"}`);
    // deno-lint-ignore no-explicit-any
    const out = checkPlan((res.content ?? []).find((c: any) => c.type === "tool_use")?.input);
    if ("error" in out) throw new Error(out.error);
    plan = out.plan;
  } catch (e) { err = (e instanceof Error ? e.message : String(e)).slice(0, 300); }
  const { data: id } = await db.rpc("svc_planner_save", { p_user: u.user.id, p_workspace: ws, p_goal: goal, p_plan: plan, p_error: err });
  return err ? json(502, { error: err }) : json(200, { id, plan });
});
