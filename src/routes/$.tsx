import { createFileRoute, notFound } from "@tanstack/react-router";
import { PlannedModule } from "@/components/app/PlannedModule";
import { findModule } from "@/app/modules";

/**
 * Catch-all for agreed menu items that don't have their own page yet.
 * Anything not in the module list is a real 404.
 */
export const Route = createFileRoute("/$")({
  loader: ({ params }) => {
    const m = findModule(`/${params._splat ?? ""}`);
    if (!m) throw notFound();
    return { id: m.id };
  },
  head: ({ params }) => {
    const m = findModule(`/${params._splat ?? ""}`);
    return { meta: [{ title: `${m?.label ?? "Not found"} · Bizriva CRM` }] };
  },
  component: Planned,
});

function Planned() {
  const { _splat } = Route.useParams();
  const m = findModule(`/${_splat ?? ""}`);
  if (!m) return null;
  return <PlannedModule module={m} />;
}
