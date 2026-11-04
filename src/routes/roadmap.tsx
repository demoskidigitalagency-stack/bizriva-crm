import { createFileRoute } from "@tanstack/react-router";
import { Section, StatusBadge } from "@/components/app/primitives";
import { FUTURE, type FutureIdea } from "@/app/modules";

export const Route = createFileRoute("/roadmap")({
  head: () => ({ meta: [{ title: "Coming Later · Bizriva CRM" }] }),
  component: Roadmap,
});

const BUCKETS: { id: FutureIdea["bucket"]; blurb: string }[] = [
  { id: "Needs the backend", blurb: "Agreed. These need real accounts, an AI model or provider keys, so they're built once the backend is connected." },
  { id: "Parked for later", blurb: "Kept on file, not scheduled. Most need a licensed partner or a separate business decision first." },
];

function Roadmap() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Workspace</p>
        <h1 className="text-2xl font-bold">Coming Later</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Ideas from the 4 November review of WaContacts, StitchBook, FabianForms, Adflow, Xara and the two WhatsApp playbooks that aren't built yet. Nothing here is lost, and none of it changes the progress score until it's scheduled.</p>
      </div>
      {BUCKETS.map((b) => {
        const list = FUTURE.filter((f) => f.bucket === b.id);
        return (
          <Section key={b.id} title={`${b.id} (${list.length})`} description={b.blurb}>
            <ul className="divide-y">
              {list.map((f) => (
                <li key={f.id} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[1fr_220px]">
                  <div className="min-w-0">
                    <p className="font-semibold">{f.title}</p>
                    <p className="text-muted-foreground">{f.summary}</p>
                  </div>
                  <dl className="space-y-0.5 text-xs">
                    <div className="flex gap-1"><dt className="text-muted-foreground">Goes into:</dt><dd>{f.goesInto}</dd></div>
                    <div className="flex gap-1"><dt className="text-muted-foreground">Needs:</dt><dd>{f.needs}</dd></div>
                    <div><StatusBadge>From {f.from}</StatusBadge></div>
                  </dl>
                </li>
              ))}
            </ul>
          </Section>
        );
      })}
    </div>
  );
}
