import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import type { BusinessSettings } from "@/domain/types";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing · Bizriva CRM" }] }),
  component: Billing,
});

type Plan = BusinessSettings["plan"];
// Example prices for planning only — not final pricing.
const PLANS: { id: Plan; name: string; price: number; contacts: number; seats: number; messages: number; storageMb: number; perks: string[] }[] = [
  { id: "trial", name: "Trial", price: 0, contacts: 500, seats: 3, messages: 1000, storageMb: 200, perks: ["14 days", "All MVP modules"] },
  { id: "starter", name: "Starter", price: 25000, contacts: 2000, seats: 3, messages: 5000, storageMb: 1000, perks: ["WhatsApp inbox", "AI agent", "COD verification"] },
  { id: "growth", name: "Growth", price: 60000, contacts: 10000, seats: 10, messages: 25000, storageMb: 5000, perks: ["Everything in Starter", "Automations and broadcasts", "Ads attribution"] },
  { id: "scale", name: "Scale", price: 150000, contacts: 50000, seats: 30, messages: 100000, storageMb: 20000, perks: ["Everything in Growth", "Multiple numbers", "Priority support"] },
];

function Meter({ label, used, limit, unit = "" }: { label: string; used: number; limit: number; unit?: string }) {
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div className="text-sm">
      <div className="flex justify-between"><span>{label}</span><span className="num text-muted-foreground">{used.toLocaleString()}{unit} of {limit.toLocaleString()}{unit}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Billing() {
  const db = useDb();
  const ws = useWorkspace();
  const { updateSettings } = useActions();
  const current = PLANS.find((p) => p.id === db.settings.plan)!;
  const messages = db.conversations.reduce((s, c) => s + c.messages.length, 0);
  const storageMb = Math.round(db.media.reduce((s, m) => s + m.bytes, 0) / 1024 / 1024);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Workspace</p>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Plan and usage. Prices are examples for planning; real billing and invoices arrive with the backend.</p>
      </div>
      <Section title={`Current plan: ${current.name}`} action={<StatusBadge tone="info">Practice</StatusBadge>}>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Meter label="Contacts" used={db.contacts.length} limit={current.contacts} />
          <Meter label="Team seats" used={db.team.filter((t) => t.active).length} limit={current.seats} />
          <Meter label="Messages this month" used={messages} limit={current.messages} />
          <Meter label="Media storage" used={storageMb} limit={current.storageMb} unit=" MB" />
        </div>
      </Section>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => {
          const active = p.id === current.id;
          return (
            <div key={p.id} className={cn("rounded-lg border bg-card p-4", active && "border-primary ring-2 ring-primary/30")}>
              <p className="font-semibold">{p.name}</p>
              <p className="num mt-1 text-2xl font-bold">{p.price ? formatCurrency(p.price, ws.currency) : "Free"}<span className="text-xs font-normal text-muted-foreground">{p.price ? " / month" : ""}</span></p>
              <ul className="mt-3 space-y-1 text-sm">
                {[`${p.contacts.toLocaleString()} contacts`, `${p.seats} seats`, `${p.messages.toLocaleString()} messages / month`, ...p.perks].map((x) => <li key={x} className="flex gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />{x}</li>)}
              </ul>
              <Button size="sm" className="mt-4 w-full" variant={active ? "outline" : "default"} disabled={active} onClick={() => updateSettings({ plan: p.id })}>{active ? "Current plan" : `Switch to ${p.name}`}</Button>
            </div>
          );
        })}
      </div>
      <Section title="Invoices"><p className="p-4 text-sm text-muted-foreground">No invoices in Practice Mode.</p></Section>
    </div>
  );
}
