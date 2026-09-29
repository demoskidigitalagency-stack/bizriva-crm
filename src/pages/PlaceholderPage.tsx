import { useParams } from "react-router-dom";
import { Layers3 } from "lucide-react";
import { PageHeader } from "@/components/Common";

export function PlaceholderPage() {
  const { module } = useParams();
  const name = (module || "Module").split("-").map((x) => (x[0] || "").toUpperCase() + x.slice(1)).join(" ");

  return <div>
    <PageHeader eyebrow="Bizriva CRM" title={name} />
    <div className="p-6">
      <div className="rounded-xl border bg-card p-10 text-center">
        <Layers3 className="mx-auto h-10 w-10 text-primary" />
        <h2 className="mt-4 text-xl font-bold">{name} is reserved in the approved architecture</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          The navigation contract is already in place. This module will be implemented in its dedicated phase rather than filled with fake controls or disconnected business logic.
        </p>
      </div>
    </div>
  </div>;
}
