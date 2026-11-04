import { createFileRoute, redirect } from "@tanstack/react-router";

// Repo 3's "AI Workflows" menu link. Workflows now live in the Automation Builder.
export const Route = createFileRoute("/crm/workflows")({
  beforeLoad: () => {
    throw redirect({ to: "/automation", replace: true });
  },
});
