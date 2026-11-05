import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import { NOW } from "@/domain/database";
import { fullName } from "@/domain/repositories";
import { followUpQueue } from "@/domain/followups";
import type { BadgeTone, CalendarEvent } from "@/domain/types";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Calendar · Bizriva CRM" }] }),
  component: CalendarPage,
});

type Kind = "delivery" | "task" | "follow_up" | CalendarEvent["kind"];
interface Item { id: string; title: string; at: Date; kind: Kind; contactId?: string | undefined; ownEvent?: boolean }

const KIND: Record<Kind, { label: string; tone: BadgeTone }> = {
  delivery: { label: "Delivery", tone: "info" },
  task: { label: "Task", tone: "warning" },
  follow_up: { label: "Follow-up", tone: "purple" },
  callback: { label: "Call-back", tone: "brand" },
  meeting: { label: "Meeting", tone: "neutral" },
  reminder: { label: "Reminder", tone: "neutral" },
  birthday: { label: "Birthday", tone: "success" },
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const time = (d: Date) => d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
const longDay = (d: Date) => d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });

function AddEvent({ open, onClose, day }: { open: boolean; onClose: () => void; day: Date }) {
  const db = useDb();
  const { saveRecord } = useActions();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CalendarEvent["kind"]>("callback");
  const [date, setDate] = useState(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`);
  const [at, setAt] = useState("10:00");
  const [contactId, setContactId] = useState("");
  const [error, setError] = useState("");
  const save = () => {
    if (!title.trim()) return setError("Add a title.");
    saveRecord("events", { title: title.trim(), kind, at: new Date(`${date}T${at}:00`).toISOString(), ...(contactId ? { contactId } : {}) });
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add to calendar</DialogTitle><DialogDescription>Deliveries, tasks and follow-ups appear on their own.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="ev-title">Title</Label><Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call back about colour" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="ev-date">Date</Label><Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="ev-time">Time</Label><Input id="ev-time" type="time" value={at} onChange={(e) => setAt(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as CalendarEvent["kind"])}>
              <SelectTrigger aria-label="Event type"><SelectValue>{KIND[kind].label}</SelectValue></SelectTrigger>
              <SelectContent>{(["callback", "delivery", "meeting", "reminder"] as const).map((k) => <SelectItem key={k} value={k}>{KIND[k].label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Customer (optional)</Label>
            <Select value={contactId || "none"} onValueChange={(v) => setContactId(v === "none" ? "" : v)}>
              <SelectTrigger aria-label="Event customer"><SelectValue>{contactId ? fullName(db.contacts.find((c) => c.id === contactId)!) : "None"}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="none">None</SelectItem>{db.contacts.slice(0, 60).map((c) => <SelectItem key={c.id} value={c.id}>{fullName(c)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemRow({ item }: { item: Item }) {
  const db = useDb();
  const { removeRecord } = useActions();
  const c = item.contactId ? db.contacts.find((x) => x.id === item.contactId) : undefined;
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      <span className="num w-12 shrink-0 text-xs text-muted-foreground">{time(item.at)}</span>
      <StatusBadge tone={KIND[item.kind].tone}>{KIND[item.kind].label}</StatusBadge>
      <span className="min-w-0 flex-1 truncate">{item.title}{c && <> · <Link to="/crm/contacts/$contactId" params={{ contactId: c.id }} className="text-primary hover:underline">{fullName(c)}</Link></>}</span>
      {item.ownEvent && <Button size="icon" variant="ghost" className="size-7" aria-label={`Remove ${item.title}`} onClick={() => removeRecord("events", item.id)}><Trash2 className="size-3.5" /></Button>}
    </li>
  );
}

function CalendarPage() {
  const db = useDb();
  const [view, setView] = useState<"month" | "week" | "list">("month");
  const [cursor, setCursor] = useState(startOfDay(NOW));
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Date>(startOfDay(NOW));

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    db.deliveries.filter((d) => d.status !== "delivered" && d.status !== "returned").forEach((d) => {
      const o = db.orders.find((x) => x.id === d.orderId);
      out.push({ id: `d_${d.id}`, title: `${o?.reference ?? "Order"} · ${d.city} · ${d.courier}`, at: new Date(d.scheduledFor), kind: "delivery", contactId: d.contactId });
    });
    db.tasks.filter((t) => t.status === "open" || t.status === "snoozed").forEach((t) => out.push({ id: `t_${t.id}`, title: t.title, at: new Date(t.dueAt), kind: "task", contactId: t.contactId }));
    followUpQueue(db, NOW).forEach((f) => out.push({ id: `f_${f.conversation.id}`, title: `${f.rule.name}`, at: new Date(NOW.getTime() + Math.max(0, f.dueInHours) * 3_600_000), kind: "follow_up", contactId: f.contact.id }));
    db.events.forEach((e) => out.push({ id: e.id, title: e.title, at: new Date(e.at), kind: e.kind, contactId: e.contactId, ownEvent: true }));
    // Birthdays from customer memory, this year and next.
    db.contacts.forEach((c) => c.facts?.filter((f) => f.kind === "birthday" && f.monthDay).forEach((f) => {
      const [m, d] = f.monthDay!.split("-").map(Number) as [number, number];
      [NOW.getFullYear(), NOW.getFullYear() + 1].forEach((y) => out.push({ id: `b_${c.id}_${y}`, title: `${fullName(c)}'s birthday`, at: new Date(y, m - 1, d, 9), kind: "birthday", contactId: c.id }));
    }));
    return out.sort((a, b) => +a.at - +b.at);
  }, [db]);

  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    items.forEach((i) => { const k = dayKey(i.at); m.set(k, [...(m.get(k) ?? []), i]); });
    return m;
  }, [items]);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(monthStart); gridStart.setDate(1 - ((monthStart.getDay() + 6) % 7));
  const weekStart = new Date(cursor); weekStart.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
  const days = (start: Date, n: number) => Array.from({ length: n }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const move = (dir: number) => {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir); else d.setDate(d.getDate() + dir * 7);
    setCursor(d);
  };
  const busy = (n: number) => (n >= 6 ? "bg-destructive/15" : n >= 3 ? "bg-warning/15" : "");
  const upcoming = items.filter((i) => i.at >= startOfDay(NOW) && +i.at < +startOfDay(NOW) + 14 * 86_400_000);
  const pickedItems = byDay.get(dayKey(picked)) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Overview</p>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Deliveries, call-backs, tasks and follow-ups in one place. Busy days are shaded so you don't promise more than the team can deliver.</p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" /> Add event</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList><TabsTrigger value="month">Month</TabsTrigger><TabsTrigger value="week">Week</TabsTrigger><TabsTrigger value="list">List</TabsTrigger></TabsList>
        </Tabs>
        {view !== "list" && (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" aria-label="Previous" onClick={() => move(-1)}><ChevronLeft className="size-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => { setCursor(startOfDay(NOW)); setPicked(startOfDay(NOW)); }}>Today</Button>
            <Button size="icon" variant="outline" aria-label="Next" onClick={() => move(1)}><ChevronRight className="size-4" /></Button>
            <span className="ml-2 text-sm font-semibold">{view === "month" ? cursor.toLocaleDateString("en-NG", { month: "long", year: "numeric" }) : `Week of ${longDay(weekStart)}`}</span>
          </div>
        )}
      </div>

      {view === "month" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Section bodyClassName="p-2">
            <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Month">
              {days(gridStart, 42).map((d) => {
                const list = byDay.get(dayKey(d)) ?? [];
                const out = d.getMonth() !== cursor.getMonth();
                const isToday = dayKey(d) === dayKey(NOW);
                const sel = dayKey(d) === dayKey(picked);
                return (
                  <button key={d.toISOString()} type="button" onClick={() => setPicked(d)} aria-label={`${longDay(d)}: ${list.length} item${list.length === 1 ? "" : "s"}`}
                    className={`min-h-16 rounded-md border p-1 text-left text-xs ${busy(list.length)} ${out ? "opacity-40" : ""} ${sel ? "ring-2 ring-primary" : ""}`}>
                    <span className={`num inline-grid size-5 place-items-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : ""}`}>{d.getDate()}</span>
                    {list.length > 0 && <span className="mt-1 block truncate text-[10px] text-muted-foreground">{list.length} item{list.length > 1 ? "s" : ""}</span>}
                  </button>
                );
              })}
            </div>
            <p className="px-1 pt-2 text-xs text-muted-foreground">Shading: amber 3–5 items, red 6 or more.</p>
          </Section>
          <Section title={longDay(picked)} description={`${pickedItems.length} item${pickedItems.length === 1 ? "" : "s"}`}>
            {pickedItems.length === 0 ? <EmptyState title="Nothing planned" /> : <ul className="divide-y px-3">{pickedItems.map((i) => <ItemRow key={i.id} item={i} />)}</ul>}
          </Section>
        </div>
      )}

      {view === "week" && (
        <div className="grid gap-2 md:grid-cols-7">
          {days(weekStart, 7).map((d) => {
            const list = byDay.get(dayKey(d)) ?? [];
            return (
              <Section key={d.toISOString()} title={longDay(d)} description={`${list.length} item${list.length === 1 ? "" : "s"}`} className={busy(list.length)}>
                {list.length === 0 ? <p className="p-3 text-xs text-muted-foreground">Free</p> : <ul className="divide-y px-2">{list.map((i) => <ItemRow key={i.id} item={i} />)}</ul>}
              </Section>
            );
          })}
        </div>
      )}

      {view === "list" && (
        <Section title="Next 14 days">
          {upcoming.length === 0 ? <EmptyState title="Nothing coming up" /> : (
            <ul className="divide-y px-4">
              {upcoming.map((i, idx) => (
                <li key={i.id}>
                  {(idx === 0 || dayKey(upcoming[idx - 1]!.at) !== dayKey(i.at)) && <p className="pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{longDay(i.at)}</p>}
                  <ul><ItemRow item={i} /></ul>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <AddEvent key={String(adding)} open={adding} onClose={() => setAdding(false)} day={picked} />
    </div>
  );
}
