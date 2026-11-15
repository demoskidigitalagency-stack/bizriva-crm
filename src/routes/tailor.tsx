/**
 * Tailoring — the tailor and fashion industry pack (StitchBook idea), switched on per business.
 * Jobs board (booked → cutting → sewing → fitting → finishing → ready → delivered), measurements
 * per client, fabric stock in yards (taken off by the database when cutting starts) and group
 * orders (aso-ebi, weddings). Real data only; tables tailor_* with members-only access.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useLive, useWorkspace } from "@/domain/store";
import { fullName } from "@/domain/repositories";
import type { Contact } from "@/domain/types";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/tailor")({
  head: () => ({ meta: [{ title: "Tailoring · Bizriva CRM" }] }),
  component: TailorPage,
});

const STAGES = ["booked", "cutting", "sewing", "fitting", "finishing", "ready", "delivered"] as const;
type Stage = (typeof STAGES)[number] | "cancelled";
const STAGE_LABEL: Record<Stage, string> = { booked: "Booked", cutting: "Cutting", sewing: "Sewing", fitting: "Fitting", finishing: "Finishing", ready: "Ready", delivered: "Delivered", cancelled: "Cancelled" };
const MEASURES = ["Neck", "Chest / Bust", "Waist", "Hips", "Shoulder", "Sleeve", "Round arm", "Top length", "Gown length", "Trouser length", "Thigh", "Knee", "Bottom / Ankle", "Cap / Head"];

interface Fabric { id: string; name: string; colour: string | null; yards: number; cost_per_yard: number }
interface Group { id: string; name: string; event_date: string | null; fabric_id: string | null; price_each: number; notes: string | null }
interface Measure { id: string; contact_id: string; label: string; unit: "in" | "cm"; vals: Record<string, string>; notes: string | null; taken_at: string }
interface Job { id: string; contact_id: string; group_id: string | null; garment: string; fabric_id: string | null; fabric_yards: number; stage: Stage; due_date: string | null; price: number; deposit: number; notes: string | null; measurement_id: string | null }

function useTailor() {
  const { current } = useAuth();
  const ws = current?.workspaceId ?? null;
  const [data, setData] = useState<{ fabrics: Fabric[]; groups: Group[]; measures: Measure[]; jobs: Job[] } | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    const sb = supabase();
    if (!sb || !ws) return;
    const [f, g, m, j] = await Promise.all([
      sb.from("tailor_fabrics").select("*").eq("workspace_id", ws).order("name"),
      sb.from("tailor_groups").select("*").eq("workspace_id", ws).order("event_date", { ascending: true, nullsFirst: false }),
      sb.from("tailor_measurements").select("*").eq("workspace_id", ws).order("taken_at", { ascending: false }),
      sb.from("tailor_jobs").select("*").eq("workspace_id", ws).neq("stage", "cancelled").order("due_date", { ascending: true, nullsFirst: false }).limit(1000),
    ]);
    const e = f.error ?? g.error ?? m.error ?? j.error;
    if (e) { setError(e.message); return; }
    setError("");
    setData({ fabrics: (f.data ?? []) as Fabric[], groups: (g.data ?? []) as Group[], measures: (m.data ?? []) as Measure[], jobs: (j.data ?? []) as Job[] });
  }, [ws]);
  useEffect(() => { void reload(); }, [reload]);
  return { ws, data, error, reload };
}

/** Search the business's contacts by name or phone. */
function ClientPicker({ value, onChange, label = "Client" }: { value: string; onChange: (id: string) => void; label?: string }) {
  const db = useDb();
  const [q, setQ] = useState("");
  const chosen = db.contacts.find((c) => c.id === value);
  const n = q.trim().toLowerCase();
  const hits = n.length < 2 ? [] : db.contacts.filter((c) => `${fullName(c)} ${c.phone}`.toLowerCase().includes(n)).slice(0, 8);
  if (chosen) return (
    <div className="space-y-1"><Label>{label}</Label>
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"><span className="truncate">{fullName(chosen)} · {chosen.phone}</span><button type="button" className="text-xs text-primary" onClick={() => onChange("")}>Change</button></div>
    </div>
  );
  return (
    <div className="relative space-y-1"><Label>{label}</Label>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or phone" aria-label={`${label}: search`} />
      {hits.length > 0 && <ul className="absolute z-20 mt-1 w-full rounded-md border bg-popover text-sm shadow">{hits.map((c) => <li key={c.id}><button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-muted" onClick={() => { onChange(c.id); setQ(""); }}>{fullName(c)} · {c.phone}</button></li>)}</ul>}
    </div>
  );
}

function TailorPage() {
  const live = useLive();
  const db = useDb();
  const { updateSettings } = useActions();
  const on = (db.settings.packs ?? []).includes("tailor");
  const toggle = () => updateSettings({ packs: on ? (db.settings.packs ?? []).filter((p) => p !== "tailor") : [...(db.settings.packs ?? []), "tailor"] });
  const [tab, setTab] = useState("jobs");
  const t = useTailor();
  const header = <PageHeader eyebrow="Industry pack" title="Tailoring" description="Measurements, garment jobs from cutting to delivery, fabric stock and group orders." actions={<Button size="sm" variant={on ? "outline" : "default"} onClick={toggle}>{on ? "Hide from the menu" : "Switch on the tailor pack"}</Button>} />;
  if (!live.on) return <div className="space-y-4">{header}<Section><p className="p-4 text-sm text-muted-foreground">You're in practice mode. The tailor pack keeps real measurements and jobs, so it works once you sign in to your business.</p></Section></div>;
  return (
    <div className="space-y-4">
      {header}
      {t.error && <p role="alert" className="text-sm text-destructive">{t.error}</p>}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="jobs">Jobs</TabsTrigger><TabsTrigger value="measure">Measurements</TabsTrigger><TabsTrigger value="fabric">Fabric</TabsTrigger><TabsTrigger value="groups">Group orders</TabsTrigger></TabsList>
      </Tabs>
      {!t.data ? <p className="text-sm text-muted-foreground">Loading…</p>
        : tab === "jobs" ? <Jobs t={t} />
        : tab === "measure" ? <Measurements t={t} />
        : tab === "fabric" ? <Fabrics t={t} />
        : <Groups t={t} />}
    </div>
  );
}

type T = ReturnType<typeof useTailor>;
const today = () => new Date().toISOString().slice(0, 10);

function Jobs({ t }: { t: T }) {
  const db = useDb();
  const ws = useWorkspace();
  const { messageContact } = useActions();
  const money = (n: number) => formatCurrency(n, ws.currency);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");
  const d = t.data!;
  const name = (id: string) => { const c = db.contacts.find((x) => x.id === id); return c ? fullName(c) : "Client"; };
  const move = async (j: Job, stage: Stage) => {
    const { error } = await supabase()!.from("tailor_jobs").update({ stage }).eq("id", j.id);
    if (error) setErr(error.message); else await t.reload();
  };
  const notify = (j: Job) => {
    const bal = Math.max(0, j.price - j.deposit);
    messageContact(j.contact_id, `Hello ${name(j.contact_id).split(" ")[0]}, your ${j.garment} is ready for pickup.${bal ? ` Balance: ${money(bal)}.` : ""} Thank you!`);
  };
  const late = d.jobs.filter((j) => j.due_date && j.due_date < today() && !["ready", "delivered"].includes(j.stage)).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button size="sm" onClick={() => setAdding((x) => !x)}><Plus className="size-4" /> New job</Button>
        <span className="text-muted-foreground">{d.jobs.filter((j) => j.stage !== "delivered").length} in progress</span>
        {late > 0 && <StatusBadge tone="danger">{late} past due</StatusBadge>}
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {adding && <NewJob t={t} onDone={() => setAdding(false)} />}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((s) => {
          const list = d.jobs.filter((j) => j.stage === s);
          return (
            <section key={s} className="w-64 shrink-0 rounded-lg border bg-muted/30" aria-label={STAGE_LABEL[s]}>
              <h3 className="flex justify-between px-3 py-2 text-sm font-semibold">{STAGE_LABEL[s]}<span className="text-muted-foreground">{list.length}</span></h3>
              <ul className="space-y-2 px-2 pb-2">
                {list.slice(0, 60).map((j) => {
                  const overdue = j.due_date && j.due_date < today() && !["ready", "delivered"].includes(s);
                  const i = STAGES.indexOf(s);
                  return (
                    <li key={j.id} className="space-y-1 rounded-md border bg-background p-2 text-sm">
                      <p className="font-medium">{j.garment}</p>
                      <p className="text-xs text-muted-foreground">{name(j.contact_id)}{j.group_id ? ` · ${d.groups.find((g) => g.id === j.group_id)?.name ?? "group"}` : ""}</p>
                      {j.due_date && <p className={overdue ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>Due {j.due_date}{overdue ? " — late" : ""}</p>}
                      {j.price > 0 && <p className="text-xs">{money(j.price)}{j.deposit ? ` · paid ${money(j.deposit)}` : ""}</p>}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {i > 0 && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void move(j, STAGES[i - 1]!)}>Back</Button>}
                        {i < STAGES.length - 1 && <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => void move(j, STAGES[i + 1]!)}>{STAGE_LABEL[STAGES[i + 1]!]} →</Button>}
                        {s === "ready" && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => notify(j)}>Tell client</Button>}
                        {s === "booked" && <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => void move(j, "cancelled")}>Cancel</Button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function NewJob({ t, onDone }: { t: T; onDone: () => void }) {
  const d = t.data!;
  const [f, setF] = useState({ contact: "", garment: "", measurement: "", fabric: "", yards: "", due: "", price: "", deposit: "", notes: "" });
  const [err, setErr] = useState("");
  const sets = d.measures.filter((m) => m.contact_id === f.contact);
  const save = async () => {
    if (!f.contact || !f.garment.trim()) { setErr("Pick the client and type the garment."); return; }
    const { error } = await supabase()!.from("tailor_jobs").insert({ workspace_id: t.ws, contact_id: f.contact, garment: f.garment.trim(), measurement_id: f.measurement || null,
      fabric_id: f.fabric || null, fabric_yards: Number(f.yards) || 0, due_date: f.due || null, price: Number(f.price) || 0, deposit: Number(f.deposit) || 0, notes: f.notes.trim() || null });
    if (error) { setErr(error.message); return; }
    await t.reload(); onDone();
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Section title="New job">
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <ClientPicker value={f.contact} onChange={(id) => setF((x) => ({ ...x, contact: id, measurement: "" }))} />
        <div className="space-y-1"><Label htmlFor="tj-g">Garment</Label><Input id="tj-g" value={f.garment} onChange={set("garment")} placeholder="Agbada, kaftan, wedding gown…" /></div>
        <div className="space-y-1"><Label htmlFor="tj-m">Measurements</Label>
          <select id="tj-m" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.measurement} onChange={set("measurement")}>
            <option value="">{f.contact ? (sets.length ? "Choose a set" : "None yet — add on Measurements") : "Pick the client first"}</option>
            {sets.map((m) => <option key={m.id} value={m.id}>{m.label} ({m.taken_at.slice(0, 10)})</option>)}
          </select></div>
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <div className="space-y-1"><Label htmlFor="tj-f">Fabric</Label>
            <select id="tj-f" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.fabric} onChange={set("fabric")}>
              <option value="">Client's own / none</option>
              {d.fabrics.map((x) => <option key={x.id} value={x.id}>{x.name}{x.colour ? ` (${x.colour})` : ""} — {x.yards} yd</option>)}
            </select></div>
          <div className="space-y-1"><Label htmlFor="tj-y">Yards</Label><Input id="tj-y" inputMode="decimal" value={f.yards} onChange={set("yards")} /></div>
        </div>
        <div className="space-y-1"><Label htmlFor="tj-d">Due date</Label><Input id="tj-d" type="date" value={f.due} onChange={set("due")} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label htmlFor="tj-p">Price</Label><Input id="tj-p" inputMode="numeric" value={f.price} onChange={set("price")} /></div>
          <div className="space-y-1"><Label htmlFor="tj-dp">Deposit paid</Label><Input id="tj-dp" inputMode="numeric" value={f.deposit} onChange={set("deposit")} /></div>
        </div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="tj-n">Style notes</Label><Textarea id="tj-n" rows={2} value={f.notes} onChange={set("notes")} placeholder="Collar style, embroidery, pictures sent on WhatsApp…" /></div>
        {err && <p role="alert" className="text-sm text-destructive sm:col-span-2">{err}</p>}
        <div className="flex gap-2 sm:col-span-2"><Button onClick={() => void save()}>Save job</Button><Button variant="outline" onClick={onDone}>Cancel</Button></div>
      </div>
    </Section>
  );
}

function Measurements({ t }: { t: T }) {
  const db = useDb();
  const d = t.data!;
  const [client, setClient] = useState("");
  const [form, setForm] = useState<{ label: string; unit: "in" | "cm"; vals: Record<string, string>; notes: string } | null>(null);
  const [err, setErr] = useState("");
  const sets = d.measures.filter((m) => m.contact_id === client);
  const recent = useMemo(() => [...new Set(d.measures.map((m) => m.contact_id))].slice(0, 12).map((id) => db.contacts.find((c) => c.id === id)).filter(Boolean) as Contact[], [d.measures, db.contacts]);
  const save = async () => {
    if (!form || !client) return;
    const vals = Object.fromEntries(Object.entries(form.vals).filter(([, v]) => v.trim()));
    if (!Object.keys(vals).length) { setErr("Fill at least one measurement."); return; }
    const { error } = await supabase()!.from("tailor_measurements").insert({ workspace_id: t.ws, contact_id: client, label: form.label.trim() || "General", unit: form.unit, vals, notes: form.notes.trim() || null });
    if (error) { setErr(error.message); return; }
    setForm(null); setErr(""); await t.reload();
  };
  return (
    <div className="space-y-3">
      <div className="max-w-md"><ClientPicker value={client} onChange={(id) => { setClient(id); setForm(null); }} /></div>
      {!client && recent.length > 0 && <p className="text-sm text-muted-foreground">Recently measured: {recent.map((c, i) => <button key={c.id} type="button" className="text-primary hover:underline" onClick={() => setClient(c.id)}>{fullName(c)}{i < recent.length - 1 ? ", " : ""}</button>)}</p>}
      {client && (
        <>
          <Button size="sm" onClick={() => setForm({ label: "General", unit: "in", vals: Object.fromEntries((sets[0] ? Object.entries(sets[0].vals) : [])), notes: "" })}><Plus className="size-4" /> {sets.length ? "New set (starts from the last one)" : "Add measurements"}</Button>
          {form && (
            <Section title="Measurements">
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-2">
                  <Input className="max-w-xs" aria-label="Set name" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Agbada, Gown, Trousers…" />
                  <select aria-label="Unit" className="h-9 rounded-md border bg-background px-2 text-sm" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as "in" | "cm" })}><option value="in">inches</option><option value="cm">cm</option></select>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {MEASURES.map((k) => <div key={k} className="space-y-1"><Label className="text-xs">{k}</Label><Input inputMode="decimal" value={form.vals[k] ?? ""} onChange={(e) => setForm({ ...form, vals: { ...form.vals, [k]: e.target.value } })} /></div>)}
                </div>
                <Textarea rows={2} aria-label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Posture, fit preference…" />
                {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
                <div className="flex gap-2"><Button onClick={() => void save()}>Save</Button><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button></div>
              </div>
            </Section>
          )}
          {sets.map((m) => (
            <Section key={m.id} title={m.label} description={`Taken ${m.taken_at.slice(0, 10)} · ${m.unit === "in" ? "inches" : "cm"}`}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 p-4 text-sm sm:grid-cols-4">{Object.entries(m.vals).map(([k, v]) => <div key={k} className="flex justify-between gap-2 border-b py-1"><dt className="text-muted-foreground">{k}</dt><dd className="num font-medium">{v}</dd></div>)}</dl>
              {m.notes && <p className="px-4 pb-3 text-xs text-muted-foreground">{m.notes}</p>}
            </Section>
          ))}
          {!sets.length && !form && <p className="text-sm text-muted-foreground">No measurements for this client yet.</p>}
        </>
      )}
    </div>
  );
}

function Fabrics({ t }: { t: T }) {
  const ws = useWorkspace();
  const d = t.data!;
  const [f, setF] = useState({ name: "", colour: "", yards: "", cost: "" });
  const [err, setErr] = useState("");
  const sb = supabase()!;
  const add = async () => {
    if (!f.name.trim()) return;
    const { error } = await sb.from("tailor_fabrics").insert({ workspace_id: t.ws, name: f.name.trim(), colour: f.colour.trim() || null, yards: Number(f.yards) || 0, cost_per_yard: Number(f.cost) || 0 });
    if (error) { setErr(error.message); return; }
    setF({ name: "", colour: "", yards: "", cost: "" }); await t.reload();
  };
  const adjust = async (x: Fabric, by: number) => { const { error } = await sb.from("tailor_fabrics").update({ yards: Math.max(0, x.yards + by) }).eq("id", x.id); if (error) setErr(error.message); else await t.reload(); };
  const reserved = (id: string) => d.jobs.filter((j) => j.fabric_id === id && j.stage === "booked").reduce((n, j) => n + j.fabric_yards, 0);
  return (
    <div className="space-y-3">
      <Section title="Add fabric">
        <div className="grid gap-2 p-4 sm:grid-cols-[2fr_1fr_100px_120px_auto]">
          <Input aria-label="Fabric name" placeholder="Ankara, lace, cashmere…" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input aria-label="Colour" placeholder="Colour" value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} />
          <Input aria-label="Yards" inputMode="decimal" placeholder="Yards" value={f.yards} onChange={(e) => setF({ ...f, yards: e.target.value })} />
          <Input aria-label="Cost per yard" inputMode="numeric" placeholder="Cost / yard" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />
          <Button onClick={() => void add()}>Add</Button>
        </div>
      </Section>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Section title="Fabric in stock" description="Yards come off automatically when a job moves to Cutting; a cancelled job puts them back">
        <ul className="divide-y text-sm">
          {d.fabrics.map((x) => {
            const r = reserved(x.id); const short = r > x.yards;
            return (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span><span className="font-medium">{x.name}</span>{x.colour ? ` · ${x.colour}` : ""}{x.cost_per_yard ? <span className="text-muted-foreground"> · {formatCurrency(x.cost_per_yard, ws.currency)}/yd</span> : null}</span>
                <span className="flex items-center gap-2">
                  {r > 0 && <span className={short ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>{r} yd booked{short ? " — not enough" : ""}</span>}
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => void adjust(x, -1)} aria-label={`One yard less ${x.name}`}>−</Button>
                  <span className="num w-14 text-center font-semibold">{x.yards} yd</span>
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => void adjust(x, 1)} aria-label={`One yard more ${x.name}`}>+</Button>
                </span>
              </li>
            );
          })}
          {!d.fabrics.length && <li className="px-4 py-3 text-muted-foreground">No fabric yet.</li>}
        </ul>
      </Section>
    </div>
  );
}

function Groups({ t }: { t: T }) {
  const db = useDb();
  const ws = useWorkspace();
  const d = t.data!;
  const [g, setG] = useState({ name: "", date: "", fabric: "", price: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [member, setMember] = useState("");
  const [garment, setGarment] = useState("");
  const [yards, setYards] = useState("");
  const [err, setErr] = useState("");
  const sb = supabase()!;
  const create = async () => {
    if (!g.name.trim()) return;
    const { data, error } = await sb.from("tailor_groups").insert({ workspace_id: t.ws, name: g.name.trim(), event_date: g.date || null, fabric_id: g.fabric || null, price_each: Number(g.price) || 0 }).select("id").single();
    if (error) { setErr(error.message); return; }
    setG({ name: "", date: "", fabric: "", price: "" }); setOpen((data as { id: string }).id); await t.reload();
  };
  const addMember = async (gid: string) => {
    if (!member) return;
    const { error } = await sb.rpc("tailor_group_add", { p_group: gid, p_contacts: [member], p_garment: garment, p_yards: Number(yards) || 0, p_due: null });
    if (error) { setErr(error.message); return; }
    setMember(""); await t.reload();
  };
  return (
    <div className="space-y-3">
      <Section title="New group order" description="Aso-ebi, weddings, uniforms: one job per member with the same fabric and price">
        <div className="grid gap-2 p-4 sm:grid-cols-[2fr_150px_1fr_120px_auto]">
          <Input aria-label="Group name" placeholder="Adeola & Tunde wedding" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} />
          <Input aria-label="Event date" type="date" value={g.date} onChange={(e) => setG({ ...g, date: e.target.value })} />
          <select aria-label="Fabric" className="h-9 rounded-md border bg-background px-2 text-sm" value={g.fabric} onChange={(e) => setG({ ...g, fabric: e.target.value })}><option value="">Fabric (optional)</option>{d.fabrics.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <Input aria-label="Price each" inputMode="numeric" placeholder="Price each" value={g.price} onChange={(e) => setG({ ...g, price: e.target.value })} />
          <Button onClick={() => void create()}>Create</Button>
        </div>
      </Section>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {d.groups.map((x) => {
        const jobs = d.jobs.filter((j) => j.group_id === x.id);
        const done = jobs.filter((j) => j.stage === "ready" || j.stage === "delivered").length;
        return (
          <Section key={x.id} title={x.name} description={`${x.event_date ? `Event ${x.event_date} · ` : ""}${jobs.length} member${jobs.length === 1 ? "" : "s"} · ${done} ready${x.price_each ? ` · ${formatCurrency(x.price_each, ws.currency)} each` : ""}`}
            action={<Button size="sm" variant="ghost" onClick={() => setOpen(open === x.id ? null : x.id)}>{open === x.id ? "Close" : "Add members"}</Button>}>
            {open === x.id && (
              <div className="grid gap-2 border-b p-4 sm:grid-cols-[2fr_1fr_90px_auto] sm:items-end">
                <ClientPicker value={member} onChange={setMember} label="Member" />
                <div className="space-y-1"><Label htmlFor={`gg-${x.id}`}>Garment</Label><Input id={`gg-${x.id}`} value={garment} onChange={(e) => setGarment(e.target.value)} placeholder={x.name} /></div>
                <div className="space-y-1"><Label htmlFor={`gy-${x.id}`}>Yards</Label><Input id={`gy-${x.id}`} inputMode="decimal" value={yards} onChange={(e) => setYards(e.target.value)} /></div>
                <Button disabled={!member} onClick={() => void addMember(x.id)}>Add</Button>
              </div>
            )}
            <ul className="divide-y text-sm">
              {jobs.map((j) => { const c = db.contacts.find((k) => k.id === j.contact_id); return <li key={j.id} className="flex justify-between gap-2 px-4 py-2"><span>{c ? fullName(c) : "Member"} · {j.garment}</span><StatusBadge tone={j.stage === "ready" || j.stage === "delivered" ? "success" : "neutral"}>{STAGE_LABEL[j.stage]}</StatusBadge></li>; })}
              {!jobs.length && <li className="px-4 py-3 text-muted-foreground">No members yet.</li>}
            </ul>
          </Section>
        );
      })}
    </div>
  );
}
