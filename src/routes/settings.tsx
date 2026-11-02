import { createFileRoute } from "@tanstack/react-router";
import { Check, Moon, RotateCcw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useActions } from "@/domain/store";
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
      <PageHeader eyebrow="Workspace" title="Settings" description="Appearance is live now. Business, payments, notifications and consent settings arrive with the backend." />

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

      <Section title="Coming with the backend" description="Listed so nothing from the three prototypes or the prompt gets lost.">
        <ul className="grid gap-2 p-4 text-sm text-muted-foreground sm:grid-cols-2">
          <li>Business profile, currency and time zone</li>
          <li>Delivery fees and payment link template</li>
          <li>Notification channels per event</li>
          <li>Consent, opt-out keywords and suppression list</li>
          <li>Quiet hours and follow-up limits</li>
          <li>Chat appearance (from Sandala)</li>
        </ul>
      </Section>
    </div>
  );
}
