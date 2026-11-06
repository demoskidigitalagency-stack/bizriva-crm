/**
 * Call list — the customer agent's screen and the supervisor's control room.
 * Orders are shared to agents on duty (least busy, round robin or by state),
 * every call and WhatsApp is recorded, uncalled orders alert supervisors and
 * then move to someone else, and commission is earned only when an order is
 * delivered and paid.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlarmClock, MessageCircle, Phone, PhoneCall, Shuffle, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { NOW } from "@/domain/database";
import { fullName } from "@/domain/repositories";
import { agentScores, agentsOnDuty, isAgent, isOverdue, minutesUncalled, orderState, OUTCOME_LABEL, phoneDigits, workload } from "@/domain/ops";
import type { AssignmentSettings, AttemptOutcome, ID, OrderSummary } from "@/domain/types";
import { formatCurrency, relativeTime } from "@/lib/format";

type View = "mine" | "team" | "board" | "rules";
export const Route = createFileRoute("/calls")({
  validateSearch: (s: Record<string, unknown>): { v?: View; as?: string } => ({
    ...(["mine", "team", "board", "rules"].includes(String(s["v"])) ? { v: s["v"] as View } : {}),
    ...(typeof s["as"] === "string" ? { as: s["as"] } : {}),
  }),
  head: () => ({ meta: [{ title: "Call list · Bizriva CRM" }] }),
  component: Calls,
});

const MODE_LABEL: Record<AssignmentSettings["mode"], { name: string; hint: string }> = {
  least_busy: { name: "Least busy", hint: "Each new order goes to the agent on duty with the fewest orders to call." },
  round_robin: { name: "Round robin", hint: "Agents on duty take turns, one order each." },
  by_state: { name: "By state", hint: "Orders go to agents who cover the customer's state; anyone on duty if nobody does." },
};
const waited = (m: number) => (m >= 120 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)} min`);

function Ring({ value, label }: { value: number; label: string }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <figure className="flex items-center gap-3" aria-label={label}>
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" strokeLinecap="round" className="stroke-primary" strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
      </svg>
      <figcaption className="text-sm"><span className="num block text-lg font-bold">{Math.round(value * 100)}%</span><span className="text-xs text-muted-foreground">{label}</span></figcaption>
    </figure>
  );
}

function OrderCard({ o, agentId }: { o: OrderSummary; agentId: ID }) {
  const db = useDb();
  const ws = useWorkspace();
  const { logAttempt, recordCodCheck } = useActions();
  const [asking, setAsking] = useState<"call" | "whatsapp" | null>(null);
  const c = db.contacts.find((x) => x.id === o.contactId);
  if (!c) return null;
  const mins = minutesUncalled(o);
  const late = isOverdue(db, o);
  const attempts = o.contactAttempts ?? [];
  const due = Math.max(0, o.total - (o.amountPaid ?? 0));
  const wa = `https://wa.me/${phoneDigits(c.phone)}?text=${encodeURIComponent(`Hi ${c.firstName}, this is ${db.team.find((m) => m.id === agentId)?.name.split(" ")[0] ?? "the team"} from ${ws.name} about your order ${o.reference} (${o.productNames.join(", ")}). Can you confirm your delivery address and that you'll be available to receive it?`)}`;
  const outcome = (out: AttemptOutcome) => { logAttempt(o.id, agentId, asking ?? "call", out); setAsking(null); };
  return (
    <li className="space-y-2 px-4 py-3 text-sm" aria-label={`Order ${o.reference}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/crm/contacts/$contactId" params={{ contactId: c.id }} className="font-semibold hover:underline">{fullName(c)}</Link>
        <span className="text-xs text-muted-foreground">{o.reference} · {orderState(db, o)} · {formatCurrency(o.total, ws.currency)}{due && due < o.total ? ` (${formatCurrency(due, ws.currency)} due)` : ""}</span>
        {mins !== null && <StatusBadge tone={late ? "danger" : "warning"}>{late ? `Not called · ${waited(mins)}` : `New · ${waited(mins)}`}</StatusBadge>}
        {attempts.length > 0 && <StatusBadge tone="info">{attempts.length} attempt{attempts.length > 1 ? "s" : ""} · last: {OUTCOME_LABEL[attempts.at(-1)!.outcome]}</StatusBadge>}
        {o.movedFrom?.length ? <StatusBadge>Moved to you</StatusBadge> : null}
      </div>
      <p className="text-xs text-muted-foreground">{o.productNames.join(", ")}{c.address ? ` · ${c.address}` : ""}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm"><a href={`tel:+${phoneDigits(c.phone)}`} onClick={() => setAsking("call")}><Phone className="size-4" /> Call</a></Button>
        <Button asChild size="sm" variant="outline"><a href={wa} target="_blank" rel="noreferrer" onClick={() => setAsking("whatsapp")}><MessageCircle className="size-4" /> WhatsApp</a></Button>
        <Button size="sm" variant="secondary" onClick={() => { logAttempt(o.id, agentId, asking ?? "call", "reached", "Customer confirmed"); recordCodCheck(o.id, "confirmed", "Confirmed on the call list"); setAsking(null); }}>Confirmed ✓</Button>
        <Button size="sm" variant="ghost" onClick={() => setAsking(asking ? null : "call")}>Log outcome</Button>
      </div>
      {asking && (
        <div role="group" aria-label="How did it go?" className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 p-2">
          <span className="text-xs font-medium">How did the {asking === "call" ? "call" : "chat"} go?</span>
          {(["no_answer", "busy", "call_back", "wrong_number"] as AttemptOutcome[]).map((x) => <Button key={x} size="sm" variant="outline" className="h-7 text-xs" onClick={() => outcome(x)}>{OUTCOME_LABEL[x]}</Button>)}
          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => { logAttempt(o.id, agentId, asking, "reached", "Customer cancelled"); recordCodCheck(o.id, "cancelled", "Cancelled on the call list"); setAsking(null); }}>They cancelled</Button>
        </div>
      )}
    </li>
  );
}

function MyCalls({ agentId }: { agentId: ID }) {
  const db = useDb();
  const ws = useWorkspace();
  const { setOnDuty } = useActions();
  const me = db.team.find((m) => m.id === agentId);
  const score = agentScores(db, NOW).find((s) => s.member.id === agentId);
  const list = db.orders.filter((o) => o.assignedTo === agentId && o.status === "pending_verification")
    .sort((a, b) => Number(isOverdue(db, b)) - Number(isOverdue(db, a)) || Number(!b.contactAttempts?.length) - Number(!a.contactAttempts?.length) || a.placedAt.localeCompare(b.placedAt));
  if (!me) return <EmptyState title="Pick an agent" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="To call" value={String(list.length)} hint={`${list.filter((o) => isOverdue(db, o)).length} late`} tone={list.some((o) => isOverdue(db, o)) ? "danger" : "info"} />
        <KpiCard label="Earned commission" value={formatCurrency(score?.earned ?? 0, ws.currency)} hint={`${formatCurrency(score?.unpaid ?? 0, ws.currency)} not paid out yet`} tone="success" />
        <KpiCard label="On the way" value={formatCurrency(score?.pending ?? 0, ws.currency)} hint="confirmed, not yet delivered and paid" />
        <div className="rounded-lg border bg-card p-3"><Ring value={score?.progress ?? 0} label={`${score?.closed ?? 0} of ${me.monthlyTarget ?? 0} closed this month`} /></div>
      </div>
      <Section title={`${me.name.split(" ")[0]}'s call list`} description="Late ones first. Tap Call or WhatsApp — every attempt is recorded." action={
        <label className="flex items-center gap-2 text-sm"><Switch checked={me.onDuty !== false} onCheckedChange={(v) => setOnDuty(me.id, v)} aria-label="On duty" /> On duty</label>}>
        {list.length === 0 ? <EmptyState title="Nothing to call" description={me.onDuty === false ? "You're off duty, so new orders go to others." : "New orders will appear here as they come in."} /> : (
          <ul className="divide-y">{list.slice(0, 40).map((o) => <OrderCard key={o.id} o={o} agentId={agentId} />)}</ul>
        )}
      </Section>
      <Rebook agentId={agentId} />
    </div>
  );
}

/** Failed deliveries come back to the agent who confirmed the order, to rebook with the customer. */
function Rebook({ agentId }: { agentId: ID }) {
  const db = useDb();
  const { setDeliveryStatus, logAttempt } = useActions();
  const rows = db.deliveries.filter((d) => d.status === "failed" && db.orders.find((o) => o.id === d.orderId)?.assignedTo === agentId);
  if (!rows.length) return null;
  return (
    <Section title={`Failed deliveries to rebook (${rows.length})`} description="Call the customer, agree a new day, then press Rebooked — it goes back on the dispatch board.">
      <ul className="divide-y">
        {rows.map((d) => {
          const c = db.contacts.find((x) => x.id === d.contactId);
          const o = db.orders.find((x) => x.id === d.orderId);
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm" aria-label={`Rebook ${o?.reference}`}>
              <span className="min-w-0 flex-1 basis-56"><span className="font-medium">{c ? fullName(c) : "Customer"}</span> <span className="text-xs text-muted-foreground">{o?.reference} · {d.failureReason ?? "failed"} · {d.attempts} attempt{d.attempts === 1 ? "" : "s"}</span></span>
              {c && <Button asChild size="sm" variant="outline"><a href={`tel:+${phoneDigits(c.phone)}`}><Phone className="size-4" /> Call</a></Button>}
              <Button size="sm" onClick={() => { if (o) logAttempt(o.id, agentId, "call", "reached", "Delivery rebooked"); setDeliveryStatus(d.id, "scheduled"); }}>Rebooked</Button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Team() {
  const db = useDb();
  const { assignOrders, runAssignmentNow, setOnDuty } = useActions();
  const [msg, setMsg] = useState("");
  const late = db.orders.filter((o) => isOverdue(db, o));
  const unassigned = db.orders.filter((o) => o.status === "pending_verification" && !o.assignedTo);
  const agents = db.team.filter(isAgent);
  const s = db.settings.assignment;
  return (
    <div className="space-y-4">
      <Section title={`Not called in ${s.callWithinMinutes >= 60 ? `${s.callWithinMinutes / 60} hour${s.callWithinMinutes > 60 ? "s" : ""}` : `${s.callWithinMinutes} minutes`}`}
        description={s.moveUncalled ? `Moves to another agent on duty automatically at ${s.callWithinMinutes * 2 / 60} hours.` : "Automatic moving is off — reassign by hand."}
        action={<Button size="sm" variant="outline" onClick={() => { const r = runAssignmentNow(); setMsg(r.assigned || r.moved ? `${r.assigned} shared, ${r.moved} moved.` : "Nothing to share or move right now."); }}><Shuffle className="size-4" /> Share and move now</Button>}>
        {msg && <p role="status" className="border-b px-4 py-2 text-sm">{msg}</p>}
        {late.length === 0 ? <EmptyState title="Every new order has been called" /> : (
          <ul className="divide-y">
            {late.map((o) => {
              const c = db.contacts.find((x) => x.id === o.contactId);
              const who = db.team.find((m) => m.id === o.assignedTo);
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm" aria-label={`Late ${o.reference}`}>
                  <AlarmClock className="size-4 text-destructive" aria-hidden="true" />
                  <span className="min-w-0 flex-1 basis-56"><span className="font-medium">{c ? fullName(c) : "Customer"}</span> <span className="text-xs text-muted-foreground">{o.reference} · {who?.name ?? "nobody"} · waiting {waited(minutesUncalled(o) ?? 0)}</span></span>
                  <Select value="" onValueChange={(v) => assignOrders([o.id], v)}>
                    <SelectTrigger className="h-8 w-44" aria-label={`Give ${o.reference} to`}><SelectValue placeholder="Give to…" /></SelectTrigger>
                    <SelectContent>{agentsOnDuty(db).filter((m) => m.id !== o.assignedTo).map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({workload(db, m.id)})</SelectItem>)}</SelectContent>
                  </Select>
                </li>
              );
            })}
          </ul>
        )}
        {unassigned.length > 0 && <p className="border-t px-4 py-2 text-xs text-warning-foreground">{unassigned.length} order{unassigned.length > 1 ? "s" : ""} waiting for an agent — nobody is on duty.</p>}
      </Section>
      <Section title="Agents" description="Who's taking new orders, and how much each has to call.">
        <ul className="divide-y">
          {agents.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1 basis-40"><span className="font-medium">{m.name}</span> <span className="text-xs text-muted-foreground">{m.states?.join(", ") || "all states"}</span></span>
              <span className="text-xs text-muted-foreground"><span className="num font-semibold text-foreground">{workload(db, m.id)}</span> to call · {db.orders.filter((o) => o.assignedTo === m.id && isOverdue(db, o)).length} late</span>
              <label className="flex items-center gap-2 text-xs"><Switch checked={m.onDuty !== false} onCheckedChange={(v) => setOnDuty(m.id, v)} aria-label={`${m.name} on duty`} /> On duty</label>
              <Button asChild size="sm" variant="ghost"><Link to="/calls" search={{ v: "mine", as: m.id }}>Open list</Link></Button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Board() {
  const db = useDb();
  const ws = useWorkspace();
  const { payCommission } = useActions();
  const rows = useMemo(() => agentScores(db, NOW), [db]);
  return (
    <Section title="Leaderboard and commission" description={`${formatCurrency(db.settings.commission.perOrder, ws.currency)} per closed order, earned only when it's delivered and paid. Closed orders and targets count this month.`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2">#</th><th>Agent</th><th>Closed</th><th>Target</th><th>Delivery rate</th><th>Calls</th><th>Earned</th><th>To pay</th><th /></tr></thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={r.member.id} aria-label={`Leaderboard ${r.member.name}`}>
                <td className="px-4 py-2">{i === 0 && r.closed ? <Trophy className="size-4 text-warning" aria-label="Top agent" /> : i + 1}</td>
                <td className="font-medium">{r.member.name}</td>
                <td className="num">{r.closed}</td>
                <td><div className="flex items-center gap-2"><div className="h-2 w-20 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${r.progress * 100}%` }} /></div><span className="num text-xs">{r.target ? `${Math.round(r.progress * 100)}%` : "—"}</span></div></td>
                <td className="num">{Math.round(r.deliveryRate * 100)}%</td>
                <td className="num">{r.calls}</td>
                <td className="num">{formatCurrency(r.earned, ws.currency)}</td>
                <td className="num font-semibold">{formatCurrency(r.unpaid, ws.currency)}</td>
                <td className="pr-4 text-right"><Button size="sm" variant="outline" disabled={!r.unpaid} onClick={() => payCommission(r.member.id)}>Mark paid</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">Finance marks commission paid once it's sent; agents see their own earnings on their call list.</p>
    </Section>
  );
}

function Rules() {
  const db = useDb();
  const ws = useWorkspace();
  const { updateSettings, saveRecord } = useActions();
  const s = db.settings.assignment;
  const [mins, setMins] = useState(String(s.callWithinMinutes));
  const [per, setPer] = useState(String(db.settings.commission.perOrder));
  return (
    <div className="space-y-4">
      <Section title="How new orders are shared">
        <div className="grid gap-2 p-4 sm:grid-cols-3">
          {(Object.keys(MODE_LABEL) as AssignmentSettings["mode"][]).map((m) => (
            <button key={m} type="button" aria-pressed={s.mode === m} onClick={() => updateSettings({ assignment: { ...s, mode: m } })} className={`rounded-lg border p-3 text-left text-sm ${s.mode === m ? "border-primary bg-primary/5" : ""}`}>
              <span className="block font-medium">{MODE_LABEL[m].name}</span><span className="block text-xs text-muted-foreground">{MODE_LABEL[m].hint}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4 border-t p-4 text-sm">
          <div className="space-y-1.5"><Label htmlFor="cw">Alert if not called within (minutes)</Label><Input id="cw" className="w-32" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} /></div>
          <label className="flex items-center gap-2"><Switch checked={s.moveUncalled} onCheckedChange={(v) => updateSettings({ assignment: { ...s, moveUncalled: v } })} aria-label="Move uncalled orders" /> Move to another agent at twice that time</label>
          <div className="space-y-1.5"><Label htmlFor="cp">Commission per closed order ({ws.currency})</Label><Input id="cp" className="w-32" inputMode="numeric" value={per} onChange={(e) => setPer(e.target.value.replace(/\D/g, ""))} /></div>
          <Button size="sm" onClick={() => updateSettings({ assignment: { ...s, callWithinMinutes: Math.max(5, Number(mins) || 120) }, commission: { perOrder: Number(per) || 0 } })}>Save</Button>
        </div>
      </Section>
      <Section title="Agents' states and targets" description="States are used when orders are shared by state.">
        <ul className="divide-y">
          {db.team.filter(isAgent).map((m) => <AgentRow key={m.id} id={m.id} onSave={(states, target) => saveRecord("team", { ...m, states, monthlyTarget: target })} />)}
        </ul>
      </Section>
    </div>
  );
}

function AgentRow({ id, onSave }: { id: ID; onSave: (states: string[], target: number) => void }) {
  const db = useDb();
  const m = db.team.find((x) => x.id === id)!;
  const [states, setStates] = useState((m.states ?? []).join(", "));
  const [target, setTarget] = useState(String(m.monthlyTarget ?? 0));
  return (
    <li className="flex flex-wrap items-end gap-3 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1 basis-32 pb-2 font-medium">{m.name}</span>
      <div className="min-w-0 flex-1 basis-56 space-y-1"><Label htmlFor={`st-${id}`} className="text-xs">States</Label><Input id={`st-${id}`} value={states} onChange={(e) => setStates(e.target.value)} placeholder="Lagos, Ogun" /></div>
      <div className="space-y-1"><Label htmlFor={`tg-${id}`} className="text-xs">Monthly target</Label><Input id={`tg-${id}`} className="w-24" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} /></div>
      <Button size="sm" variant="outline" onClick={() => onSave(states.split(",").map((x) => x.trim()).filter(Boolean), Number(target) || 0)}>Save</Button>
    </li>
  );
}

function Calls() {
  const db = useDb();
  const { v = "mine", as } = Route.useSearch();
  const navigate = Route.useNavigate();
  const agents = db.team.filter(isAgent);
  const agentId = as && agents.some((m) => m.id === as) ? as : agents.find((m) => m.role === "sales_rep")?.id ?? agents[0]?.id ?? "";
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Sales</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><PhoneCall className="size-6" aria-hidden="true" /> Call list</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every new order goes to an agent on duty. Nothing is left uncalled: late orders alert supervisors, then move to someone else.</p>
        </div>
        {v === "mine" && (
          <Select value={agentId} onValueChange={(x) => navigate({ search: { v, as: x } })}>
            <SelectTrigger className="w-56" aria-label="Viewing as"><SelectValue>{`Viewing as ${db.team.find((m) => m.id === agentId)?.name ?? ""}`}</SelectValue></SelectTrigger>
            <SelectContent>{agents.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>
      <Tabs value={v} onValueChange={(x) => navigate({ search: { v: x as View, ...(as ? { as } : {}) } })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="mine">My calls</TabsTrigger>
          <TabsTrigger value="team">Team and alerts ({db.orders.filter((o) => isOverdue(db, o)).length})</TabsTrigger>
          <TabsTrigger value="board">Leaderboard</TabsTrigger>
          <TabsTrigger value="rules">Sharing rules</TabsTrigger>
        </TabsList>
      </Tabs>
      {v === "mine" && <MyCalls agentId={agentId} />}
      {v === "team" && <Team />}
      {v === "board" && <Board />}
      {v === "rules" && <Rules />}
      <p className="text-xs text-muted-foreground">Works on any phone — add it to your home screen from the browser menu. In Practice Mode, Call and WhatsApp open your phone's dialer and WhatsApp.</p>
    </div>
  );
}
