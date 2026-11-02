import { createFileRoute } from "@tanstack/react-router";
import { Check, Moon, RotateCcw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActions, useDb } from "@/domain/store";
import type { BusinessSettings } from "@/domain/types";
import { PageHeader, Section, StatusBadge } from "@/components/app/primitives";
import { THEMES, useAppearance } from "@/app/appearance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Bizriva CRM" }] }),
  component: Settings,
});

function Settings() {
  const { theme, mode, setTheme, setMode } = useAppearance();
  const { resetPracticeData } = useActions();
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Workspace" title="Settings" description="Everything here is saved in Practice Mode. With the backend, the same settings apply to every teammate." />

      <Section title="Appearance" description="Hybrid is the default. The other three are the original looks from each prototype. Your choice is saved on this device.">
        <div className="grid gap-3 p-4 sm:grid-cols-2" role="radiogroup" aria-label="Appearance">
          {THEMES.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(t.id)}
                className={cn(
                  "rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50",
                  active && "border-primary ring-2 ring-primary/30",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="flex gap-1" aria-hidden="true">
                    {t.swatches.map((c) => <span key={c} className="size-5 rounded border" style={{ background: c }} />)}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {t.recommended && <StatusBadge tone="brand">Default</StatusBadge>}
                    {active && <Check className="size-4 text-primary" aria-hidden="true" />}
                  </span>
                </span>
                <span className="mt-3 block font-semibold">{t.name}</span>
                <span className="block text-xs text-muted-foreground">{t.origin}</span>
                <span className="mt-2 block text-sm text-muted-foreground">{t.description}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
          <span className="text-sm font-medium">Mode</span>
          {(["light", "dark"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm capitalize", mode === m ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted")}
            >
              {m === "light" ? <Sun className="size-3.5" aria-hidden="true" /> : <Moon className="size-3.5" aria-hidden="true" />}
              {m}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Practice data" description="Everything you change is saved in this browser only, so you can test flows across refreshes. Nothing reaches real customers.">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted-foreground">Start again with the original sample contacts, orders and conversations.</p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm"><RotateCcw className="size-4" /> Reset sample data</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset sample data?</AlertDialogTitle>
                <AlertDialogDescription>Contacts, orders, tasks and messages you added or changed in this browser are replaced with the original sample data. Appearance stays as it is.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={resetPracticeData}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Section>

      <BusinessForm />
    </div>
  );
}

const EVENTS: { id: keyof BusinessSettings["notify"]; label: string }[] = [
  { id: "cod_request", label: "Ask customer to confirm a COD order" },
  { id: "order_confirmed", label: "Order confirmed" },
  { id: "dispatched", label: "Out for delivery" },
  { id: "delivered", label: "Delivered" },
  { id: "feedback", label: "Ask for feedback" },
];
const CHANNELS = { whatsapp: "WhatsApp", sms: "SMS", email: "Email", off: "Don't send" } as const;

function BusinessForm() {
  const db = useDb();
  const { updateSettings } = useActions();
  const [d, setD] = useState(db.settings);
  const [kw, setKw] = useState(db.settings.optOutKeywords.join(", "));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setD(db.settings); setKw(db.settings.optOutKeywords.join(", ")); }, [db.settings]);
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;

  const save = () => {
    if (!d.businessName.trim()) return setError("Enter the business name.");
    if (!(d.deliveryFee >= 0) || !(d.freeDeliveryOver >= 0)) return setError("Delivery amounts can't be negative.");
    if (!d.paymentLinkTemplate.includes("{{order}}")) return setError("The payment link must include {{order}} where the order number goes.");
    if (!time.test(d.quietStart) || !time.test(d.quietEnd)) return setError("Quiet hours use 24-hour time, like 21:00.");
    const optOutKeywords = kw.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
    if (!optOutKeywords.length) return setError("Keep at least one opt-out keyword, such as STOP.");
    updateSettings({ ...d, businessName: d.businessName.trim(), optOutKeywords });
    setError("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  const num = (k: "deliveryFee" | "freeDeliveryOver" | "maxFollowUpsPerDay") => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: Number(e.target.value.replace(/,/g, "")) || 0 });

  return (
    <>
      <Section title="Business and delivery">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="bn">Business name</Label><Input id="bn" value={d.businessName} onChange={(e) => setD({ ...d, businessName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Time zone</Label>
            <Select value={d.timezone} onValueChange={(v) => setD({ ...d, timezone: v })}>
              <SelectTrigger aria-label="Time zone"><SelectValue>{d.timezone}</SelectValue></SelectTrigger>
              <SelectContent>{["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Europe/London"].map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="df">Delivery fee</Label><Input id="df" inputMode="numeric" value={d.deliveryFee} onChange={num("deliveryFee")} /></div>
          <div className="space-y-1.5"><Label htmlFor="fo">Free delivery on orders over</Label><Input id="fo" inputMode="numeric" value={d.freeDeliveryOver} onChange={num("freeDeliveryOver")} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pl">Payment link ({"{{order}}"} is replaced by the order number)</Label><Input id="pl" value={d.paymentLinkTemplate} onChange={(e) => setD({ ...d, paymentLinkTemplate: e.target.value })} /></div>
        </div>
      </Section>
      <Section title="Customer notifications" description="Which channel each update goes out on">
        <ul className="divide-y">
          {EVENTS.map((ev) => (
            <li key={ev.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span>{ev.label}</span>
              <Select value={d.notify[ev.id]} onValueChange={(v) => setD({ ...d, notify: { ...d.notify, [ev.id]: v as keyof typeof CHANNELS } })}>
                <SelectTrigger className="h-8 w-36" aria-label={ev.label}><SelectValue>{CHANNELS[d.notify[ev.id]]}</SelectValue></SelectTrigger>
                <SelectContent>{(Object.keys(CHANNELS) as (keyof typeof CHANNELS)[]).map((c) => <SelectItem key={c} value={c}>{CHANNELS[c]}</SelectItem>)}</SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Consent and limits" description="Protects customers and your WhatsApp number's quality rating">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ok">Opt-out keywords, separated by commas</Label><Input id="ok" value={kw} onChange={(e) => setKw(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="qs">Quiet hours start</Label><Input id="qs" value={d.quietStart} onChange={(e) => setD({ ...d, quietStart: e.target.value })} placeholder="21:00" /></div>
          <div className="space-y-1.5"><Label htmlFor="qe">Quiet hours end</Label><Input id="qe" value={d.quietEnd} onChange={(e) => setD({ ...d, quietEnd: e.target.value })} placeholder="08:00" /></div>
          <div className="space-y-1.5"><Label htmlFor="mf">Most follow-ups per person per day</Label><Input id="mf" inputMode="numeric" value={d.maxFollowUpsPerDay} onChange={num("maxFollowUpsPerDay")} /></div>
        </div>
      </Section>
      <div className="flex items-center gap-3">
        <Button onClick={save}>Save settings</Button>
        {saved && <span className="text-sm text-success" role="status">Saved</span>}
        {error && <span className="text-sm text-destructive" role="alert">{error}</span>}
      </div>
    </>
  );
}
