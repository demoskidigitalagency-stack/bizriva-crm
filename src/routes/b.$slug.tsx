/**
 * Public booking page — /b/<store address>. Pick a service, a day and a free time, then name and
 * WhatsApp number. Reads public_booking / booking_slots and books with book_slot (checked again on
 * the server, so two people can't take the same time).
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/b/$slug")({
  head: () => ({ meta: [{ title: "Book a time" }] }),
  component: BookPage,
});

interface Info { name: string; currency: string; timezone: string; hours: { days: number[]; days_ahead: number }; services: { id: string; name: string; minutes: number; price: number | null; description: string | null }[] }

function BookPage() {
  const { slug } = Route.useParams();
  const [info, setInfo] = useState<Info | null | "closed">(null);
  const [svc, setSvc] = useState("");
  const [day, setDay] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState("");
  const [f, setF] = useState({ name: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ when: string; service: string } | null>(null);
  useEffect(() => { void supabase()?.rpc("public_booking", { p_slug: slug }).then(({ data }) => { const d = data as Info | null; setInfo(d ?? "closed"); if (d?.services[0]) setSvc(d.services[0].id); }); }, [slug]);
  const days = useMemo(() => {
    if (!info || info === "closed") return [];
    const out: { iso: string; label: string }[] = [];
    for (let i = 0; i <= (info.hours.days_ahead ?? 14) && out.length < 14; i++) {
      const d = new Date(Date.now() + i * 86400000);
      const dow = ((d.getDay() + 6) % 7) + 1;
      if ((info.hours.days ?? [1, 2, 3, 4, 5, 6]).includes(dow)) out.push({ iso: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) });
    }
    return out;
  }, [info]);
  useEffect(() => { if (!day && days[0]) setDay(days[0].iso); }, [days, day]);
  useEffect(() => {
    if (!svc || !day) return;
    setSlots(null); setTime("");
    void supabase()?.rpc("booking_slots", { p_slug: slug, p_service: svc, p_day: day }).then(({ data }) => setSlots((data as string[]) ?? []));
  }, [slug, svc, day]);
  const money = (n: number) => { try { return new Intl.NumberFormat("en", { style: "currency", currency: info && info !== "closed" ? info.currency : "NGN", maximumFractionDigits: 0 }).format(n); } catch { return String(n); } };
  const book = async () => {
    setError("");
    if (!time) return setError("Pick a time.");
    setBusy(true);
    const { data, error: e } = await supabase()!.rpc("book_slot", { p_slug: slug, p_service: svc, p_day: day, p_time: time, p_name: f.name, p_phone: f.phone, p_note: f.note });
    setBusy(false);
    const r = data as { ok: boolean; error?: string; when?: string; service?: string } | null;
    if (e || !r?.ok) { setError(e?.message ?? r?.error ?? "Couldn't book — try again."); if (r?.error?.includes("taken")) setDay((d) => d); return; }
    setDone({ when: r.when!, service: r.service! });
  };

  if (info === null) return <main className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" /></main>;
  if (info === "closed") return <main className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-xl font-semibold">Booking isn't open</h1><p className="mt-1 text-sm text-muted-foreground">Message the business on WhatsApp instead.</p></div></main>;
  if (done) return (
    <main className="grid min-h-screen place-items-center p-6 text-center"><div className="space-y-2">
      <CalendarCheck className="mx-auto size-10 text-emerald-600" aria-hidden />
      <h1 className="text-xl font-semibold">You're booked</h1>
      <p>{done.service} with {info.name}<br /><b>{done.when}</b></p>
      <p className="text-sm text-muted-foreground">A confirmation is on its way to your WhatsApp.</p>
    </div></main>
  );
  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 py-8">
      <header><h1 className="text-2xl font-bold">Book a time with {info.name}</h1></header>
      {!info.services.length ? <p className="text-sm text-muted-foreground">No services to book right now.</p> : (<>
        <section className="space-y-2" aria-label="Service">
          {info.services.map((s) => (
            <label key={s.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${svc === s.id ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
              <input type="radio" name="svc" className="mt-1" checked={svc === s.id} onChange={() => setSvc(s.id)} />
              <span className="flex-1"><span className="font-medium">{s.name}</span> <span className="text-sm text-muted-foreground">· {s.minutes} min{s.price != null ? ` · ${money(s.price)}` : ""}</span>
                {s.description && <span className="block text-sm text-muted-foreground">{s.description}</span>}</span>
            </label>
          ))}
        </section>
        <section aria-label="Day" className="flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => <button key={d.iso} type="button" onClick={() => setDay(d.iso)} className={`shrink-0 rounded-md border px-3 py-2 text-sm ${day === d.iso ? "border-emerald-600 bg-emerald-600 text-white" : ""}`}>{d.label}</button>)}
        </section>
        <section aria-label="Time" className="flex flex-wrap gap-2">
          {slots === null ? <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading times" />
            : !slots.length ? <p className="text-sm text-muted-foreground">No free times this day — try another.</p>
            : slots.map((t) => <button key={t} type="button" onClick={() => setTime(t)} className={`rounded-md border px-3 py-1.5 text-sm ${time === t ? "border-emerald-600 bg-emerald-600 text-white" : ""}`}>{t}</button>)}
        </section>
        <section className="space-y-2" aria-label="Your details">
          <input aria-label="Your name" placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
          <input aria-label="WhatsApp number" inputMode="tel" placeholder="WhatsApp number, e.g. +233 24 411 4567" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
          <textarea aria-label="Note" placeholder="Anything we should know? (optional)" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </section>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="button" disabled={busy} onClick={() => void book()} className="h-11 w-full rounded-md bg-emerald-600 font-semibold text-white disabled:opacity-60">{busy ? "Booking…" : time ? `Book ${time}` : "Book"}</button>
      </>)}
      <footer className="border-t pt-4 text-xs text-muted-foreground">Bookings by Bizriva</footer>
    </main>
  );
}
