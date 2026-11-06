// bun test tests/ai_planner.test.ts — the AI planner's checks.
import { describe, expect, test } from "bun:test";
import { checkPlan, prompt } from "../supabase/functions/ai-planner/plan";

const step = { title: "Message lapsed buyers", description: "Send the win-back template.", timing: "Day 1", channel: "whatsapp", ownerRole: "sales_rep", target: "12 customers", messageDraft: "Hi {{name}}, we miss you." };
describe("AI planner", () => {
  test("a good plan passes through", () => { const r = checkPlan({ title: "Win back", summary: "x", trigger: "Weekly", steps: [step, { ...step, channel: "phone", messageDraft: null }], successMetrics: ["5 orders"], risks: [] }); expect("plan" in r && r.plan.steps.length).toBe(2); });
  test("unknown channels and roles are made safe", () => { const r = checkPlan({ title: "t", steps: [{ ...step, channel: "telegram", ownerRole: "ceo" }, step] }); expect("plan" in r && [r.plan.steps[0]!.channel, r.plan.steps[0]!.ownerRole]).toEqual(["internal", "manager"]); });
  test("too few steps is refused", () => expect(checkPlan({ title: "t", steps: [step] })).toMatchObject({ error: expect.stringContaining("too few") }));
  test("nothing is refused", () => expect(checkPlan(null)).toMatchObject({ error: expect.any(String) }));
  test("the prompt carries the numbers and the goal", () => { const p = prompt("Customers: 40.\nChannels connected: .", "Win back old buyers"); expect(p).toContain("Customers: 40."); expect(p).toContain("none yet"); expect(p).toContain("Win back old buyers"); });
});
