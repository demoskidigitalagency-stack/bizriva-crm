import { createFileRoute, Link } from "@tanstack/react-router";
import { Section } from "@/components/app/primitives";

export const Route = createFileRoute("/help")({
  head: () => ({ meta: [{ title: "Help · Bizriva CRM" }] }),
  component: Help,
});

const GUIDES: { title: string; steps: string[]; to: string }[] = [
  { title: "From ad chat to delivered order", to: "/inbox", steps: ["Reply in the Inbox, or let the AI agent answer first", "Open Customer 360 and create the order", "Confirm it in COD Verification", "Dispatch it on the Delivery board", "Mark it delivered — revenue updates and the rider's cash shows in Payments"] },
  { title: "Recover people who went quiet", to: "/follow-ups", steps: ["Check Follow-ups › Due now each morning", "Send what's allowed; blocked ones show why", "Approve templates so you can reach people after 24 hours"] },
  { title: "Teach the AI agent", to: "/knowledge", steps: ["Keep prices right in Products", "Add answers and keywords in the Knowledge Base", "Upload product photos in the Media Library", "Try it in AI Sales Agent › Test chat"] },
  { title: "Bring in contacts", to: "/crm/imports", steps: ["Export a CSV from your sheet or old CRM", "Upload it in CRM › Imports and match the columns", "Phone numbers already in Bizriva are skipped", "Review CRM › Duplicates afterwards"] },
];

const SHORTCUTS: [string, string][] = [["Ctrl or ⌘ + K", "Search contacts, orders, products"], ["Palette icon", "Switch appearance"], ["Moon icon", "Light or dark mode"]];

const FAQ: [string, string][] = [
  ["Is my data real?", "Not yet. This is Practice Mode: sample data saved in this browser only. Reset it any time from Settings."],
  ["Does it send WhatsApp messages?", "No. Sending starts once the backend and WhatsApp Cloud API are connected. Until then, Send buttons update the practice data only."],
  ["Why can't I message someone after 24 hours?", "WhatsApp rules: after 24 hours since the customer's last message, you may only use an approved template."],
  ["When is COD money counted as revenue?", "Only when the order is delivered, not when it's placed."],
];

function Help() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Workspace</p>
        <h1 className="text-2xl font-bold">Help</h1>
        <p className="mt-1 text-sm text-muted-foreground">Short guides for the main jobs. See <Link to="/progress" className="underline">Build progress</Link> for what's finished.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {GUIDES.map((g) => (
          <Section key={g.title} title={g.title} action={<Link to={g.to} className="text-xs text-primary hover:underline">Open</Link>}>
            <ol className="list-decimal space-y-1 p-4 pl-9 text-sm">{g.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </Section>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Shortcuts">
          <dl className="divide-y text-sm">{SHORTCUTS.map(([k, v]) => <div key={k} className="flex justify-between gap-3 px-4 py-2"><dt className="font-mono text-xs">{k}</dt><dd className="text-muted-foreground">{v}</dd></div>)}</dl>
        </Section>
        <Section title="Common questions">
          <dl className="divide-y text-sm">{FAQ.map(([q, a]) => <div key={q} className="px-4 py-2.5"><dt className="font-medium">{q}</dt><dd className="mt-0.5 text-muted-foreground">{a}</dd></div>)}</dl>
        </Section>
      </div>
    </div>
  );
}
