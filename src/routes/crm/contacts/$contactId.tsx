import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, CalendarPlus, MessageSquare, NotebookPen, Phone, ShoppingBag, Target, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, KpiCard, PersonAvatar, Section, StatusBadge } from "@/components/app/primitives";
import { AssignDialog, CallDialog, LeadStageSelect, NoteDialog, OrderDialog, TaskDialog } from "@/components/app/dialogs";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { fullName, getCustomer360, getMember } from "@/domain/repositories";
import {
  CHANNEL_LABELS, DELIVERY_STATUS_META, LEAD_OUTCOMES, LIFECYCLE_META, ORDER_STATUS_META, PAYMENT_STATUS_META, SLA_META, SOURCE_LABELS,
  type LeadOutcome, type LeadStage, type Lifecycle,
} from "@/domain/types";
import { countryFlag, formatCurrency, formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/crm/contacts/$contactId")({
  head: () => ({ meta: [{ title: "Customer 360 · Bizriva CRM" }] }),
  component: Customer360Page,
  notFoundComponent: () => (
    <EmptyState title="Contact not found" description="It may have been merged into another record." action={<Button asChild size="sm"><Link to="/crm/contacts">Back to contacts</Link></Button>} />
  ),
});

type DialogKind = "order" | "task" | "note" | "call" | "assign" | null;

function Customer360Page() {
  const { contactId } = Route.useParams();
  const db = useDb();
  const ws = useWorkspace();
  const { setLifecycle, setLeadStage, setLeadOutcome, completeTask, startLead } = useActions();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const c360 = getCustomer360(db, contactId);
  if (!c360) throw notFound();

  const { contact: c, kpis } = c360;
  const name = fullName(c);
  const money = (n: number) => formatCurrency(n, ws.currency);
  const conversation = c360.conversations[0];
  const close = (o: boolean) => !o && setDialog(null);

  return (
    <div className="space-y-5">
      <Link to="/crm/contacts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Contacts
      </Link>

      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <PersonAvatar name={name} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {countryFlag(c.countryCode)} {c.city} · {c.phone}{c.email ? ` · ${c.email}` : ""}
            </p>
            {(c.address || c.landmark) && <p className="mt-0.5 text-sm text-muted-foreground">Delivery: {[c.address, c.landmark].filter(Boolean).join(" · ")}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={LIFECYCLE_META[c.lifecycle].tone}>{LIFECYCLE_META[c.lifecycle].label}</StatusBadge>
              <StatusBadge>Score {c.leadScore}</StatusBadge>
              <StatusBadge>{SOURCE_LABELS[c.source]}</StatusBadge>
              {c.tags.map((t) => <StatusBadge key={t} tone="brand">{t}</StatusBadge>)}
              {!c.consentMarketing && <StatusBadge tone="warning">No marketing consent</StatusBadge>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Owner: {c360.owner?.name ?? "Unassigned"} · Added {formatDate(c.createdAt)} · Last activity {relativeTime(c.lastActivityAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
          {conversation && (
            <Button asChild size="sm" variant="outline"><Link to="/inbox" search={{ c: conversation.id }}><MessageSquare className="size-4" /> Message</Link></Button>
          )}
          <Button size="sm" onClick={() => setDialog("order")}><ShoppingBag className="size-4" /> New order</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("task")}><CalendarPlus className="size-4" /> Task</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("note")}><NotebookPen className="size-4" /> Note</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("call")}><Phone className="size-4" /> Log call</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("assign")}><UserRoundCog className="size-4" /> Assign</Button>
          <Select value={c.lifecycle} onValueChange={(v) => setLifecycle(c.id, v as Lifecycle)}>
            <SelectTrigger className="h-8 w-40" aria-label="Lifecycle"><SelectValue>{`Lifecycle: ${LIFECYCLE_META[c.lifecycle].label}`}</SelectValue></SelectTrigger>
            <SelectContent>{(Object.keys(LIFECYCLE_META) as Lifecycle[]).map((l) => <SelectItem key={l} value={l}>{LIFECYCLE_META[l].label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Lifetime revenue" value={money(kpis.lifetimeRevenue)} hint={`${kpis.orders} orders`} />
        <KpiCard label="Delivered revenue" value={money(kpis.deliveredRevenue)} hint={`${kpis.deliveredOrders} delivered`} tone="success" />
        <KpiCard label="Average order" value={money(kpis.averageOrderValue)} hint={kpis.lastPurchaseAt ? `last ${relativeTime(kpis.lastPurchaseAt)}` : "no orders yet"} tone="info" />
        <KpiCard label="Outstanding" value={money(kpis.outstandingBalance)} hint="COD and unpaid" tone={kpis.outstandingBalance > 0 ? "warning" : "success"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Tabs defaultValue="timeline">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="orders">Orders ({c360.orders.length})</TabsTrigger>
            <TabsTrigger value="delivery">Delivery and payments</TabsTrigger>
            <TabsTrigger value="conversations">Conversations ({c360.conversations.length})</TabsTrigger>
            <TabsTrigger value="tasks">Tasks ({c360.tasks.filter((t) => t.status === "open").length})</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline">
            <Section>
              {c360.activities.length === 0 ? <EmptyState title="No activity yet" /> : (
                <ol className="divide-y">
                  {c360.activities.map((a) => (
                    <li key={a.id} className="flex gap-3 px-4 py-2.5 text-sm">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{a.title}</p>
                        {a.description && <p className="text-muted-foreground">{a.description}</p>}
                        <p className="text-xs text-muted-foreground">{formatDateTime(a.at)}{a.actorId ? ` · ${getMember(db, a.actorId)?.name ?? ""}` : ""}{a.channel ? ` · ${CHANNEL_LABELS[a.channel]}` : ""}</p>
                      </div>
                      {a.amount !== undefined && <span className="num shrink-0 font-semibold">{money(a.amount)}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </TabsContent>

          <TabsContent value="orders">
            <Section action={<Button size="sm" onClick={() => setDialog("order")}>New order</Button>} title="Orders">
              {c360.orders.length === 0 ? <EmptyState title="No orders yet" description="Create one from this page or from a conversation." /> : (
                <ul className="divide-y">
                  {c360.orders.map((o) => (
                    <li key={o.id}>
                      <Link to="/orders" search={{ o: o.id }} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/40">
                        <span className="num font-semibold">{o.reference}</span>
                        <StatusBadge tone={ORDER_STATUS_META[o.status].tone}>{ORDER_STATUS_META[o.status].label}</StatusBadge>
                        <StatusBadge tone={PAYMENT_STATUS_META[o.paymentStatus].tone}>{PAYMENT_STATUS_META[o.paymentStatus].label}</StatusBadge>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.productNames.join(", ")}</span>
                        <span className="num font-semibold">{money(o.total)}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(o.placedAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </TabsContent>

          <TabsContent value="delivery" className="space-y-4">
            <Section title="Deliveries">
              {c360.deliveries.length === 0 ? <EmptyState title="No deliveries yet" /> : (
                <ul className="divide-y">
                  {c360.deliveries.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                      <span className="num font-medium">{d.trackingRef}</span>
                      <StatusBadge tone={DELIVERY_STATUS_META[d.status].tone}>{DELIVERY_STATUS_META[d.status].label}</StatusBadge>
                      <span className="flex-1 text-muted-foreground">{d.courier} · {d.city} · {d.attempts} attempt{d.attempts === 1 ? "" : "s"}{d.failureReason ? ` · ${d.failureReason}` : ""}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(d.deliveredAt ?? d.scheduledFor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Payments">
              {c360.payments.length === 0 ? <EmptyState title="No payments yet" /> : (
                <ul className="divide-y">
                  {c360.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                      <span className="num font-semibold">{money(p.amount)}</span>
                      <StatusBadge tone={PAYMENT_STATUS_META[p.status].tone}>{PAYMENT_STATUS_META[p.status].label}</StatusBadge>
                      <span className="flex-1 capitalize text-muted-foreground">{p.method.replace(/_/g, " ")}</span>
                      {p.method === "cash_on_delivery" && <StatusBadge tone={p.remitted ? "success" : "warning"}>{p.remitted ? "Remitted" : "Not remitted"}</StatusBadge>}
                      <span className="text-xs text-muted-foreground">{formatDate(p.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </TabsContent>

          <TabsContent value="conversations">
            <Section>
              {c360.conversations.length === 0 ? <EmptyState title="No conversations" description="Messages from any channel will appear here." /> : (
                <ul className="divide-y">
                  {c360.conversations.map((cv) => (
                    <li key={cv.id}>
                      <Link to="/inbox" search={{ c: cv.id }} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/40">
                        <StatusBadge>{CHANNEL_LABELS[cv.channel]}</StatusBadge>
                        <span className="min-w-0 flex-1 truncate">{cv.messages.at(-1)?.body ?? cv.subject}</span>
                        {cv.awaitingReply && <StatusBadge tone="warning">Needs reply</StatusBadge>}
                        <span className="text-xs text-muted-foreground">{relativeTime(cv.lastMessageAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </TabsContent>

          <TabsContent value="tasks">
            <Section title="Tasks" action={<Button size="sm" onClick={() => setDialog("task")}>Add task</Button>}>
              {c360.tasks.length === 0 ? <EmptyState title="No tasks" /> : (
                <ul className="divide-y">
                  {c360.tasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className={cn("min-w-0 flex-1", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</span>
                      <span className="text-xs text-muted-foreground">due {relativeTime(t.dueAt)}</span>
                      {t.status === "open" ? <Button size="sm" variant="outline" onClick={() => completeTask(t.id)}>Done</Button> : <StatusBadge tone="success">Done</StatusBadge>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </TabsContent>
        </Tabs>

        <div className="space-y-4">
          <Section title="Lead">
            {c360.lead ? (
              <div className="space-y-3 p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Stage</span>
                  <LeadStageSelect value={c360.lead.stage} onChange={(v) => setLeadStage(c360.lead!.id, v as LeadStage)} className="w-40" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Outcome</span>
                  <Select value={c360.lead.outcome ?? "none"} onValueChange={(v) => setLeadOutcome(c360.lead!.id, v === "none" ? undefined : (v as LeadOutcome))}>
                    <SelectTrigger className="h-8 w-40" aria-label="Outcome"><SelectValue>{LEAD_OUTCOMES.find((x) => x.id === c360.lead!.outcome)?.label ?? "None"}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {LEAD_OUTCOMES.map((x) => <SelectItem key={x.id} value={x.id}>{x.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-muted-foreground">Value</dt><dd className="num font-semibold">{money(c360.lead.value)}</dd></div>
                  <div><dt className="text-muted-foreground">Score</dt><dd className="num font-semibold">{c360.lead.score}</dd></div>
                  <div><dt className="text-muted-foreground">Response time</dt><dd><StatusBadge tone={SLA_META[c360.lead.slaStatus].tone}>{SLA_META[c360.lead.slaStatus].label}</StatusBadge></dd></div>
                  <div><dt className="text-muted-foreground">Next follow-up</dt><dd>{c360.lead.nextFollowUpAt ? relativeTime(c360.lead.nextFollowUpAt) : "None"}</dd></div>
                </dl>
              </div>
            ) : (
              <EmptyState title="Not a lead right now" action={<Button size="sm" onClick={() => startLead(c.id)}><Target className="size-4" /> Open a lead</Button>} />
            )}
          </Section>

          <Section title="Channels">
            <ul className="divide-y text-sm">
              {c360.identities.length === 0 && <li className="px-4 py-2.5 text-muted-foreground">No linked channels</li>}
              {c360.identities.map((i) => (
                <li key={i.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="w-20 text-muted-foreground">{CHANNEL_LABELS[i.channel]}</span>
                  <span className="min-w-0 flex-1 truncate">{i.handle}</span>
                  {i.primary && <StatusBadge tone="brand">Primary</StatusBadge>}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Came from">
            <dl className="space-y-1.5 p-4 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Source</dt><dd>{SOURCE_LABELS[c360.attribution?.source ?? c.source]}</dd></div>
              {c360.attribution?.campaign && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Campaign</dt><dd className="truncate">{c360.attribution.campaign}</dd></div>}
              {c360.attribution?.adSet && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Ad set</dt><dd className="truncate">{c360.attribution.adSet}</dd></div>}
              {c360.attribution?.creative && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Creative</dt><dd className="truncate">{c360.attribution.creative}</dd></div>}
              {c360.attribution && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">First channel</dt><dd>{CHANNEL_LABELS[c360.attribution.firstTouchChannel]}</dd></div>}
            </dl>
          </Section>

          <Section title="Product interest">
            {c360.interests.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">None recorded</p> : (
              <ul className="divide-y text-sm">
                {c360.interests.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <span className="min-w-0 truncate">{i.productName}</span>
                    <StatusBadge tone={i.intent === "ready_to_buy" ? "success" : "info"}>{i.intent.replace(/_/g, " ")}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <OrderDialog open={dialog === "order"} onOpenChange={close} contactId={c.id} />
      <TaskDialog open={dialog === "task"} onOpenChange={close} contactId={c.id} defaultTitle={`Follow up with ${c.firstName}`} />
      <NoteDialog open={dialog === "note"} onOpenChange={close} contactId={c.id} />
      <CallDialog open={dialog === "call"} onOpenChange={close} contactId={c.id} />
      <AssignDialog open={dialog === "assign"} onOpenChange={close} contactId={c.id} currentOwnerId={c.ownerId} />
    </div>
  );
}
