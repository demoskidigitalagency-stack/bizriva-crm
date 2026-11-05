/**
 * Public order form page — what a customer opens from an ad, bio link or
 * WhatsApp status: bizriva-crm.vercel.app/f/<form id>. It talks only to the
 * order-form Edge Function, which reads prices from the database (never from
 * this page) and rate-limits by connection.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/f/$formId")({
  head: () => ({ meta: [{ title: "Order · Bizriva" }, { name: "robots", content: "noindex" }] }),
  component: PublicForm,
});

const FN = `${import.meta.env.VITE_SUPABASE_URL ?? "https://xjhzkciowmklxrtwsikm.supabase.co"}/functions/v1/order-form`;

interface FormData {
  headline: string; banner?: string | null; product: string; description?: string | null; business: string; currency: string;
  packages: { id: string; label: string; qty: number; price: number; gift?: string }[]; fields: string[]; pay_on_delivery: boolean; thank_you: string;
}

function visitorId(): string {
  try {
    const k = "bizriva.visitor"; const v = localStorage.getItem(k);
    if (v) return v;
    const n = crypto.randomUUID(); localStorage.setItem(k, n); return n;
  } catch { return "anon"; }
}

function PublicForm() {
  const { formId } = Route.useParams();
  const [form, setForm] = useState<FormData | null | "closed">(null);
  const [pkg, setPkg] = useState("");
  const [v, setV] = useState({ name: "", phone: "", address: "", city: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ ref: string | null; thanks: string } | null>(null);
  const visitor = useMemo(visitorId, []);
  const source = useMemo(() => { try { return new URLSearchParams(window.location.search).get("utm_source") ?? document.referrer ?? ""; } catch { return ""; } }, []);
  const event = (kind: string, field?: string) => { void fetch(`${FN}/${formId}/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, field, visitor }) }).catch(() => {}); };

  useEffect(() => {
    let live = true;
    fetch(`${FN}/${formId}`).then((r) => (r.ok ? r.json() : "closed")).then((d) => { if (!live) return; setForm(d); if (d !== "closed") { setPkg(d.packages[0]?.id ?? ""); event("view"); } }).catch(() => live && setForm("closed"));
    return () => { live = false; };
  }, [formId]); // eslint-disable-line react-hooks/exhaustive-deps

  const money = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: form && form !== "closed" ? form.currency : "NGN", maximumFractionDigits: 0 }).format(n);
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const r = await fetch(`${FN}/${formId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ package: pkg, ...v, region: v.city, source }) });
      const d = await r.json();
      if (!r.ok) setError(d.error ?? "Your order didn't go through — please try again.");
      else setDone({ ref: d.order_ref ?? null, thanks: d.thank_you ?? "Thank you!" });
    } catch { setError("No connection — check your data and try again."); }
    setBusy(false);
  };

  if (form === null) return <main className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" /></main>;
  if (form === "closed") return <main className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-xl font-semibold">This order form is closed</h1><p className="mt-1 text-sm text-muted-foreground">Message the business directly to order.</p></div></main>;
  if (done) return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div className="max-w-sm space-y-2"><CheckCircle2 className="mx-auto size-10 text-emerald-600" /><h1 className="text-xl font-semibold">Order received{done.ref ? ` — ${done.ref}` : ""}</h1><p className="text-sm text-muted-foreground">{done.thanks}</p></div>
    </main>
  );

  const need = (f: string) => form.fields.includes(f);
  const ready = v.name.trim() && v.phone.replace(/\D/g, "").length >= 10 && (!need("address") || v.address.trim()) && pkg;
  return (
    <main className="mx-auto max-w-md space-y-5 px-4 py-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{form.business}</p>
        <h1 className="text-2xl font-bold">{form.headline}</h1>
        {form.banner && <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{form.banner}</p>}
        {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
      </header>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Choose your package</legend>
        {form.packages.map((p) => (
          <label key={p.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 ${pkg === p.id ? "border-primary bg-primary/5" : ""}`}>
            <span className="flex items-center gap-2"><input type="radio" name="pkg" checked={pkg === p.id} onChange={() => setPkg(p.id)} />{p.label}{p.gift ? <span className="text-xs text-emerald-700"> + {p.gift}</span> : null}</span>
            <span className="font-semibold">{money(p.price)}</span>
          </label>
        ))}
      </fieldset>
      <div className="space-y-3">
        {([["name", "Full name", true], ["phone", "Phone / WhatsApp number", true], ["address", "Delivery address", need("address")], ["city", "City / State", need("city")]] as const).filter(([, , show]) => show).map(([k, label]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`f-${k}`}>{label}</Label>
            <Input id={`f-${k}`} inputMode={k === "phone" ? "tel" : undefined} value={v[k]} onFocus={() => event("start", k)} onBlur={(e) => !e.target.value && event("drop", k)} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </div>
        ))}
        {/* Honeypot: hidden from people, bots fill it. */}
        <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px]" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} name="website" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" size="lg" disabled={!ready || busy} onClick={submit}>{busy ? "Placing order…" : form.pay_on_delivery ? "Place order — pay on delivery" : "Place order"}</Button>
      <p className="text-center text-xs text-muted-foreground">Your details go only to {form.business}, to deliver your order.</p>
    </main>
  );
}
