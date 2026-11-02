/**
 * Client-importable server function for the AI workflow planner.
 * All gateway and secret handling stays in planner.server.ts.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WorkflowPlan } from "./planner.server";

export type PlanRequestResult = { ok: true; plan: WorkflowPlan } | { ok: false; message: string };

const goalInput = z.object({ goal: z.string().trim().min(10, "Describe the goal in at least a sentence.").max(2000) });

export const generateWorkflowPlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => goalInput.parse(data))
  .handler(async ({ data }) => {
    const { generateWorkflowPlan: generate } = await import("./planner.server");
    return generate(data.goal) satisfies Promise<PlanRequestResult>;
  });
