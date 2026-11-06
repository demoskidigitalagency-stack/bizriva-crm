import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Cake, Copy, Square, Sunrise, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { NOW } from "@/domain/database";
import { buildBrief, briefText, type BriefAction } from "@/domain/brief";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/brief")({
  head: () => ({ meta: [{ title: "Money Brief · Bizriva CRM" }] }),
  component: Brief,
});

const TONE = { danger: "danger", warning: "warning", info: "info", success: "success" } as const;

/** Turn the WhatsApp text into something pleasant to hear: no stars or emoji, money said in naira. */
export function spokenBrief(text: string): string {
  return text
    .replace(/[*_~]/g, "")
    .replace(/₦\s?([\d,.]+)(\s?[kKmM])?/g, (_m, n: string, unit?: string) => `${n}${unit ? (/[mM]/.test(unit) ? " million" : " thousand") : ""} naira`)
    .replace(/\p{Extended_Pictographic}|\uFE0F/gu, "")
    .replace(/\n+/g, ". ")
    .replace(/(\.\s*){2,}/g, ". ")
    .trim();
}

/** Reads the Money Brief aloud with the phone or computer's own voice (no recording leaves the device). */
export function ListenButton({ text, size = "sm" }: { text: string; size?: "sm" | "default" }) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  useEffect(() => { setSupported(typeof window !== "undefined" && "speechSynthesis" in window); return () => { try { window.speechSynthesis?.cancel(); } catch { /* none */ } }; }, []);
  const play = () => {
    const synth = window.speechSynthesis;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(spokenBrief(text));
    const voices = synth.getVoices();
    const voice = voices.find((v) => v.lang === "en-NG") ?? voices.find((v) => v.lang === "en-GB") ?? voices.find((v) => v.lang.startsWith("en"));
    if (voice) u.voice = voice;
    u.rate = 0.98;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };
  if (!supported) return null;
  return (
    <Button size={size} variant="outline" onClick={play} aria-pressed={speaking}>
      {speaking ? <Square className="size-4" /> : <Volume2 className="size-4" />} {speaking ? "Stop" : "Listen"}
    </Button>
  );
}

export function BriefActions({ actions }: { actions: BriefAction[] }) {
  if (!actions.length) return <p className="p-4 text-sm text-muted-foreground">Nothing urgent. A good day to plan your next ad.</p>;
  return (
    <ol className="divide-y">
      {actions.map((a, i) => (
        <li key={a.label}>
          <Link to={a.to as never} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40">
            <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
            <span className="min-w-0 flex-1"><span className="block font-medium">{a.label}</span><span className="block truncate text-xs text-muted-foreground">{a.detail}</span></span>
            <StatusBadge tone={TONE[a.tone]}>{a.tone === "danger" ? "urgent" : a.tone === "success" ? "nice touch" : a.tone === "warning" ? "today" : "when you can"}</StatusBadge>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ol>
  );
}

function Brief() {
  const db = useDb();
  const ws = useWorkspace();
  const { updateSettings } = useActions();
  const b = useMemo(() => buildBrief(db, NOW), [db]);
  const money = (n: number) => formatCurrency(n, ws.currency);
  const [copied, setCopied] = useState(false);
  const [time, setTime] = useState(db.settings.brief.time);
  const channels = db.settings.brief.channels;
  const text = briefText(b, ws.name, money);
  const toggle = (c: "app" | "whatsapp" | "email") => updateSettings({ brief: { ...db.settings.brief, channels: channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c] } });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Overview</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Sunrise className="size-6 text-warning" aria-hidden="true" /> Morning Money Brief</h1>
          <p className="mt-1 text-sm text-muted-foreground">{NOW.toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · revenue counts only delivered orders</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ListenButton text={text} />
          <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(text); } catch { /* blocked */ } setCopied(true); }}><Copy className="size-4" /> {copied ? "Copied" : "Copy as WhatsApp message"}</Button>
        </div>
      </div>

      <Section>
        <p className="p-5 text-lg font-medium leading-relaxed" data-testid="brief-headline">{b.headline}</p>
      </Section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Delivered yesterday" value={money(b.yesterday.delivered)} hint={`${b.yesterday.deliveredCount} orders${b.yesterday.change !== null ? ` · ${b.yesterday.change >= 0 ? "+" : ""}${b.yesterday.change}% vs average` : ""}`} tone="success" />
        <KpiCard label="Cash with riders" value={money(b.cash.withRiders)} hint={b.cash.overdue ? `${money(b.cash.overdue)} overdue` : "nothing overdue"} tone={b.cash.overdue ? "danger" : "info"} />
        <KpiCard label="Waiting to confirm" value={String(b.pipeline.toConfirm)} hint={`${money(b.pipeline.toConfirmValue)} · ${b.pipeline.highRisk} high-risk`} tone="warning" />
        <KpiCard label="Ad return" value={b.ads.roas !== null ? `${b.ads.roas.toFixed(1)}×` : "—"} hint={`${money(b.ads.spend)} spent → ${money(b.ads.delivered)} delivered`} tone="brand" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Your list for today" description="Most money at stake first">
          <BriefActions actions={b.actions} />
        </Section>
        <div className="space-y-4">
          <Section title="Yesterday">
            <dl className="grid grid-cols-2 gap-y-2 p-4 text-sm">
              <dt className="text-muted-foreground">New orders</dt><dd className="num text-right">{b.yesterday.created}</dd>
              <dt className="text-muted-foreground">Confirmed</dt><dd className="num text-right">{b.yesterday.confirmed}</dd>
              <dt className="text-muted-foreground">Cancelled or refused</dt><dd className="num text-right">{b.yesterday.cancelled}</dd>
              <dt className="text-muted-foreground">Daily average delivered</dt><dd className="num text-right">{money(b.yesterday.avgDelivered)}</dd>
              {b.topProduct && <><dt className="text-muted-foreground">Best seller this week</dt><dd className="text-right">{b.topProduct.name} ({b.topProduct.units})</dd></>}
              {b.ads.best && <><dt className="text-muted-foreground">Best ad</dt><dd className="text-right">{b.ads.best.name} ({b.ads.best.roas.toFixed(1)}×)</dd></>}
              {b.ads.worst && <><dt className="text-muted-foreground">Weakest ad</dt><dd className="text-right">{b.ads.worst.name} ({b.ads.worst.roas.toFixed(1)}×)</dd></>}
            </dl>
          </Section>
          <Section title="Cash with riders" action={<Link to="/payments" className="text-xs font-medium text-primary hover:underline">Payments</Link>}>
            <ul className="divide-y text-sm">{b.cash.riders.slice(0, 5).map((r) => <li key={r.name} className="flex justify-between px-4 py-2"><span>{r.name}</span><span className="num font-medium">{money(r.amount)}</span></li>)}</ul>
            {b.cash.partPaidBalance > 0 && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Plus {money(b.cash.partPaidBalance)} in unpaid balances on part-paid orders.</p>}
          </Section>
          {b.birthdays.length > 0 && (
            <Section title="Birthdays this week" action={<Cake className="size-4 text-success" aria-hidden="true" />}>
              <ul className="divide-y text-sm">{b.birthdays.map((x) => <li key={x.contactId} className="flex justify-between px-4 py-2"><Link to="/crm/contacts/$contactId" params={{ contactId: x.contactId }} className="hover:underline">{x.name}</Link><span className="text-muted-foreground">{x.inDays === 0 ? "Today" : x.inDays === 1 ? "Tomorrow" : `In ${x.inDays} days`}</span></li>)}</ul>
            </Section>
          )}
        </div>
      </div>

      <Section title="Delivery" description="Where your brief arrives each morning">
        <div className="flex flex-wrap items-center gap-4 p-4 text-sm">
          <label className="flex items-center gap-2">Send at <Input type="time" className="h-8 w-28" value={time} aria-label="Brief time" onChange={(e) => setTime(e.target.value)} onBlur={() => updateSettings({ brief: { ...db.settings.brief, time } })} /></label>
          <label className="flex items-center gap-2"><Checkbox checked={channels.includes("app")} onCheckedChange={() => toggle("app")} aria-label="Show in the app" /> In the app</label>
          <label className="flex items-center gap-2"><Checkbox checked={channels.includes("whatsapp")} onCheckedChange={() => toggle("whatsapp")} aria-label="Send on WhatsApp" /> WhatsApp <StatusBadge>with backend</StatusBadge></label>
          <label className="flex items-center gap-2"><Checkbox checked={channels.includes("email")} onCheckedChange={() => toggle("email")} aria-label="Send by email" /> Email <StatusBadge>with backend</StatusBadge></label>
        </div>
      </Section>

      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Preview the WhatsApp message</summary>
        <pre className="whitespace-pre-wrap border-t bg-chat p-4 font-sans text-sm" data-testid="brief-text">{text}</pre>
      </details>
    </div>
  );
}
