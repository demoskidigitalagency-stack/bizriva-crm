/**
 * Store → Booking: services (name, length, price), opening days and hours, the booking page link, and
 * upcoming bookings. Customers book at /b/<store address>; each booking goes into Calendar and the
 * customer gets a WhatsApp confirmation from the linked number.
 */
import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { useWorkspace } from "@/domain/store";
import { supabase } from "@/lib/supabase";
import { formatCurrency, type CurrencyCode } from "@/lib/format";

interface Service { id: string; name: string; minutes: number; price: number | null; active: boolean }
interface Booking { id: string; starts_at: string; status: string; name: string | null; phone: string | null; note: string | null; service_id: string | null }
interface Hours { days: number[]; start: string; end: string; notice_hours: number; days_ahead: number }
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function BookingSettings() {
  const { current } = useAuth();
  const ws = current?.workspaceId;
  const wsx = useWorkspace();
  const [page, setPage] = useState<{ slug: string; booking_on: boolean; booking_hours: Hours } | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [s, setS] = useState({ name: "", minutes: "60", price: "" });
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const [p, sv, bk] = await Promise.all([
      sb.from("store_pages").select("slug, booking_on, booking_hours").eq("workspace_id", ws).maybeSingle(),
      sb.from("booking_services").select("id, name, minutes, price, active").eq("workspace_id", ws).order("name"),
      sb.from("bookings").select("id, starts_at, status, name, phone, note, service_id").eq("workspace_id", ws).gte("starts_at", new Date(Date.now() - 86400000).toISOString()).order("starts_at").limit(50),
    ]);
    setPage((p.data as typeof page) ?? null); setServices((sv.data ?? []) as Service[]); setBookings((bk.data ?? []) as Booking[]);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);

  if (!page) return (
    <Section title="Booking" description="Let customers book a time with you (fittings, installs, consultations)">
      <p className="p-4 text-sm text-muted-foreground">Save your public store above first — the booking page uses the same web address.</p>
    </Section>
  );
  const h: Hours = { ...{ days: [1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00", notice_hours: 2, days_ahead: 14 }, ...(page.booking_hours as Partial<Hours>) };
  const savePage = async (patch: Partial<{ booking_on: boolean; booking_hours: Hours }>) => {
    const { error } = await supabase()!.from("store_pages").update(patch).eq("workspace_id", ws);
    if (error) setMsg(error.message); else { setMsg("Saved."); await load(); }
  };
  const addService = async () => {
    if (!s.name.trim()) return setMsg("Name the service, e.g. “Table installation”.");
    const { error } = await supabase()!.from("booking_services").insert({ workspace_id: ws, name: s.name.trim(), minutes: Math.max(10, Number(s.minutes) || 60), price: s.price ? Number(s.price) : null });
    if (error) return setMsg(error.message);
    setS({ name: "", minutes: "60", price: "" }); setMsg(""); await load();
  };
  const setStatus = async (id: string, status: string) => { await supabase()!.from("bookings").update({ status }).eq("id", id); await load(); };
  const url = `${typeof window === "undefined" ? "" : window.location.origin}/b/${page.slug}`;
  const tz = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <Section title="Booking" description="Customers pick a service and a free time; it goes into your Calendar and they get a WhatsApp confirmation"
      action={<StatusBadge tone={page.booking_on ? "success" : "neutral"}>{page.booking_on ? "Open" : "Off"}</StatusBadge>}>
      <div className="space-y-4 p-4 text-sm">
        <label className="flex items-center gap-3"><Switch checked={page.booking_on} onCheckedChange={(v) => void savePage({ booking_on: v })} aria-label="Take bookings" /> Take bookings at
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">{url}</a></label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Open on</span>
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={h.days.includes(i + 1)} onChange={(e) => void savePage({ booking_hours: { ...h, days: e.target.checked ? [...h.days, i + 1].sort() : h.days.filter((x) => x !== i + 1) } })} />{d}</label>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label htmlFor="bh-s">From</Label><Input id="bh-s" type="time" className="w-28" defaultValue={h.start} onBlur={(e) => void savePage({ booking_hours: { ...h, start: e.target.value } })} /></div>
          <div className="space-y-1"><Label htmlFor="bh-e">To</Label><Input id="bh-e" type="time" className="w-28" defaultValue={h.end} onBlur={(e) => void savePage({ booking_hours: { ...h, end: e.target.value } })} /></div>
          <div className="space-y-1"><Label htmlFor="bh-n">Notice (hours)</Label><Input id="bh-n" type="number" min={0} className="w-24" defaultValue={h.notice_hours} onBlur={(e) => void savePage({ booking_hours: { ...h, notice_hours: Number(e.target.value) || 0 } })} /></div>
          <div className="space-y-1"><Label htmlFor="bh-a">Days ahead</Label><Input id="bh-a" type="number" min={1} className="w-24" defaultValue={h.days_ahead} onBlur={(e) => void savePage({ booking_hours: { ...h, days_ahead: Math.max(1, Number(e.target.value) || 14) } })} /></div>
        </div>
        <div>
          <p className="mb-1 font-medium">Services</p>
          <ul className="divide-y rounded-md border">
            {services.map((x) => (
              <li key={x.id} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1">{x.name} · {x.minutes} min{x.price != null ? ` · ${formatCurrency(x.price, wsx.currency as CurrencyCode)}` : ""}</span>
                <Switch checked={x.active} onCheckedChange={async (v) => { await supabase()!.from("booking_services").update({ active: v }).eq("id", x.id); await load(); }} aria-label={`Offer ${x.name}`} />
                <Button size="icon" variant="ghost" className="size-7" aria-label={`Delete ${x.name}`} onClick={async () => { await supabase()!.from("booking_services").delete().eq("id", x.id); await load(); }}><Trash2 className="size-4" /></Button>
              </li>
            ))}
            {!services.length && <li className="px-3 py-2 text-muted-foreground">No services yet.</li>}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input className="min-w-40 flex-1" aria-label="Service name" placeholder="Table installation" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
            <Input className="w-24" aria-label="Minutes" type="number" min={10} value={s.minutes} onChange={(e) => setS({ ...s, minutes: e.target.value })} />
            <Input className="w-28" aria-label="Price (optional)" inputMode="decimal" placeholder="Price" value={s.price} onChange={(e) => setS({ ...s, price: e.target.value })} />
            <Button size="sm" onClick={() => void addService()}>Add service</Button>
          </div>
        </div>
        <div>
          <p className="mb-1 font-medium">Upcoming bookings</p>
          <ul className="divide-y rounded-md border">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1"><b>{tz.format(new Date(b.starts_at))}</b> · {services.find((x) => x.id === b.service_id)?.name ?? "Service"} · {b.name} {b.phone}{b.note ? ` — ${b.note}` : ""}</span>
                <StatusBadge tone={b.status === "booked" ? "info" : b.status === "done" ? "success" : "neutral"}>{b.status.replace("_", " ")}</StatusBadge>
                {b.status === "booked" && <>
                  <Button size="sm" variant="ghost" onClick={() => void setStatus(b.id, "done")}>Done</Button>
                  <Button size="sm" variant="ghost" onClick={() => void setStatus(b.id, "no_show")}>No-show</Button>
                  <Button size="sm" variant="ghost" onClick={() => void setStatus(b.id, "cancelled")}>Cancel</Button>
                </>}
              </li>
            ))}
            {!bookings.length && <li className="px-3 py-2 text-muted-foreground">No bookings yet.</li>}
          </ul>
        </div>
        {msg && <p role="status" className="text-xs text-muted-foreground">{msg}</p>}
      </div>
    </Section>
  );
}
