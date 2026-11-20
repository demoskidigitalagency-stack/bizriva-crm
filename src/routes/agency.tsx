/**
 * All businesses (agency mode) — every business you belong to on one screen with today's numbers, and
 * one tap to open it. Use one Bizriva business per WhatsApp number (or per country / per client).
 */
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Section, StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { CURRENCIES, formatCurrency, type CurrencyCode } from "@/lib/format";

export const Route = createFileRoute("/agency")({
  head: () => ({ meta: [{ title: "All businesses · Bizriva" }] }),
  component: Agency,
});

interface Biz { id: string; name: string; currency: string; role: string; whatsapp: string | null; whatsappNumber: string | null; ordersToday: number; toConfirm: number; waiting: number; chatsToday: number; deliveredMonth: number; customers: number }

function Agency() {
  const { session, current, selectWorkspace, createWorkspace } = useAuth();
  const nav = useNavigate();
  const [list, setList] = useState<Biz[] | null>(null);
  const [n, setN] = useState({ name: "", currency: "NGN" });
  const [msg, setMsg] = useState("");
  const load = () => void supabase()?.rpc("agency_overview").then(({ data, error }) => { if (error) setMsg(error.message); setList((data ?? []) as Biz[]); });
  useEffect(load, [session]);
  if (!session) return <EmptyState title="Sign in to see your businesses" description="Agency view lists every business you belong to." />;
  const open = (id: string) => { selectWorkspace(id); void nav({ to: "/" }); };
  const add = async () => {
    if (!n.name.trim()) return setMsg("Name the business, e.g. “Dxmart Nigeria”.");
    const r = await createWorkspace(n.name.trim(), n.currency);
    if (r.error) return setMsg(r.error);
    setN({ ...n, name: "" }); setMsg("Created — open it to link its WhatsApp number."); load();
  };
  return (
    <>
      <PageHeader title="All businesses" description="Every business you run in Bizriva, side by side. Use one business per WhatsApp number, country or client." />
      {!list ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((b) => (
            <article key={b.id} className={`flex flex-col gap-2 rounded-lg border p-4 ${current?.workspaceId === b.id ? "border-primary" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div><h2 className="font-semibold">{b.name}</h2><p className="text-xs text-muted-foreground">{b.currency} · {b.role}{current?.workspaceId === b.id ? " · open now" : ""}</p></div>
                <StatusBadge tone={b.whatsapp === "connected" ? "success" : "neutral"}>{b.whatsapp === "connected" ? `WhatsApp ${b.whatsappNumber ? `+${b.whatsappNumber}` : "linked"}` : "WhatsApp not linked"}</StatusBadge>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Chats (24 h)</dt><dd className="num text-right">{b.chatsToday}</dd>
                <dt className="text-muted-foreground">Waiting for reply</dt><dd className={`num text-right ${b.waiting ? "font-semibold text-amber-600" : ""}`}>{b.waiting}</dd>
                <dt className="text-muted-foreground">Orders today</dt><dd className="num text-right">{b.ordersToday}</dd>
                <dt className="text-muted-foreground">To confirm</dt><dd className={`num text-right ${b.toConfirm ? "font-semibold text-amber-600" : ""}`}>{b.toConfirm}</dd>
                <dt className="text-muted-foreground">Delivered this month</dt><dd className="num text-right">{formatCurrency(b.deliveredMonth, b.currency as CurrencyCode, { compact: true })}</dd>
                <dt className="text-muted-foreground">Customers</dt><dd className="num text-right">{b.customers}</dd>
              </dl>
              <Button className="mt-auto" variant={current?.workspaceId === b.id ? "outline" : "default"} onClick={() => open(b.id)}>Open</Button>
            </article>
          ))}
        </div>
      )}
      <Section title="Add a business" description="For a second WhatsApp number, another country, or a client you manage. Link its WhatsApp after opening it.">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <Input className="min-w-48 flex-1" aria-label="Business name" placeholder="Dxmart Nigeria" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
          <select aria-label="Currency" className="h-9 rounded-md border bg-background px-2 text-sm" value={n.currency} onChange={(e) => setN({ ...n, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
          <Button onClick={() => void add()}><Plus className="size-4" /> Add business</Button>
        </div>
        {msg && <p role="status" className="px-4 pb-3 text-xs text-muted-foreground">{msg}</p>}
      </Section>
    </>
  );
}
