import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/crm")({
  component: CrmLayout,
});

export const CRM_TABS = [
  { label: "Overview", to: "/crm", exact: true },
  { label: "Contacts", to: "/crm/contacts" },
  { label: "Customers", to: "/crm/customers" },
  { label: "Leads", to: "/crm/leads" },
  { label: "Pipeline", to: "/crm/pipeline" },
  { label: "Tasks", to: "/crm/tasks" },
  { label: "Segments", to: "/crm/segments" },
  { label: "Duplicates", to: "/crm/duplicates" },
  { label: "Imports", to: "/crm/imports" },
] as const;

function CrmLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div>
      <nav aria-label="CRM sections" className="scroll-thin -mx-1 mb-5 flex gap-1 overflow-x-auto border-b pb-px">
        {CRM_TABS.map((t) => {
          const active = "exact" in t && t.exact ? path === t.to || path === `${t.to}/` : path.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
