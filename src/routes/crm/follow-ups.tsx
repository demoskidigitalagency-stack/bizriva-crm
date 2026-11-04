import { createFileRoute, redirect } from "@tanstack/react-router";

// Repo 3 put Follow-ups under CRM. It now lives in Automation; keep the old address working.
export const Route = createFileRoute("/crm/follow-ups")({
  beforeLoad: () => {
    throw redirect({ to: "/follow-ups", replace: true });
  },
});
