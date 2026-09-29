import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Search, Send, Boxes, Store, Truck, Megaphone, BadgeDollarSign, Workflow,
  WalletCards, BarChart3, Users, Plug, Settings, CircleHelp, CheckCircle2,
  AlertTriangle, MessageSquareText, Globe2, CreditCard, RefreshCw, ShieldCheck, KeyRound
} from "lucide-react";
import { useAppData } from "@/state/AppData";
import { fullName } from "@/domain/repositories";
import {
  CHANNEL_LABELS, DELIVERY_STATUS_META, FULFILMENT_STATUS_META, ORDER_STATUS_META, PAYMENT_STATUS_META,
  type DeliveryStatus, type FulfilmentStatus, type OrderStatus
} from "@/domain/types";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { KpiCard, PageHeader, Pill, SectionCard } from "@/components/Common";

function contactName(db: ReturnType<typeof useAppData>["db"], contactId: string) {
  const contact = db.contacts.find(c => c.id === contactId);
  return contact ? fullName(contact) : "Unknown contact";
}

export function InboxPage() {
  const { db, markConversationRead, sendMessage } = useAppData();
  const [selectedId, setSelectedId] = useState(db.conversations[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const conversations = useMemo(() => db.conversations.filter(c => {
    const name = contactName(db, c.contactId).toLowerCase();
    const q = search.toLowerCase();
    return !q || name.includes(q) || c.subject.toLowerCase().includes(q);
  }).sort((a,b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)), [db, search]);
  const selected = db.conversations.find(c => c.id === selectedId) ?? conversations[0];
  const customer = selected ? db.contacts.find(c => c.id === selected.contactId) : undefined;

  return <div>
    <PageHeader eyebrow="Customers" title="Unified Inbox" description="One shared conversation workspace across connected customer channels." />
    <div className="grid min-h-[calc(100vh-8rem)] lg:grid-cols-[320px_minmax(0,1fr)_300px]">
      <aside className="border-r bg-card">
        <div className="border-b p-3">
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search conversations..." className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm"/></div>
        </div>
        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">
          {conversations.map(c => <button key={c.id} onClick={()=>{setSelectedId(c.id);markConversationRead(c.id);}} className={"w-full border-b p-3 text-left hover:bg-muted/60 "+(selected?.id===c.id?"bg-accent/60":"")}>
            <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{contactName(db,c.contactId)}</span>{c.unread&&<span className="h-2 w-2 rounded-full bg-primary"/>}</div>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{CHANNEL_LABELS[c.channel]}</span><span>{formatDateTime(c.lastMessageAt)}</span></div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{c.messages[c.messages.length-1]?.body}</div>
          </button>)}
        </div>
      </aside>
      <section className="flex min-h-[560px] flex-col bg-background">
        {selected ? <>
          <div className="border-b bg-card px-4 py-3"><div className="font-semibold">{customer ? fullName(customer) : "Conversation"}</div><div className="text-xs text-muted-foreground">{CHANNEL_LABELS[selected.channel]} · {selected.subject}</div></div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {selected.messages.map(m => <div key={m.id} className={"flex "+(m.direction==="out"?"justify-end":"justify-start")}><div className={"max-w-[78%] rounded-2xl px-3 py-2 text-sm "+(m.direction==="out"?"bg-primary text-primary-foreground":"border bg-card")}><div>{m.body}</div><div className="mt-1 text-[10px] opacity-70">{formatDateTime(m.at)}</div></div></div>)}
          </div>
          <form onSubmit={e=>{e.preventDefault();sendMessage(selected.id,draft);setDraft("");}} className="flex gap-2 border-t bg-card p-3"><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a reply..." className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"/><button className="rounded-lg bg-primary px-3 text-primary-foreground"><Send className="h-4 w-4"/></button></form>
        </> : <div className="m-auto text-sm text-muted-foreground">No conversations.</div>}
      </section>
      <aside className="hidden border-l bg-card p-4 lg:block">
        {customer && <><div className="text-lg font-bold">{fullName(customer)}</div><div className="mt-1 text-sm text-muted-foreground">{customer.phone}</div><div className="mt-4 grid gap-2"><KpiCard label="Lead score" value={String(customer.leadScore)}/><KpiCard label="Orders" value={String(customer.totalOrders)}/><KpiCard label="Lifetime value" value={formatCurrency(customer.lifetimeValue,"NGN",{compact:true})}/></div><Link to={"/contacts/"+customer.id} className="mt-4 block rounded-lg border px-3 py-2 text-center text-sm font-medium">Open Customer 360</Link></>}
      </aside>
    </div>
  </div>;
}

export function OrdersPage() {
  const { db, updateOrderStatus, updateFulfilmentStatus } = useAppData();
  const [search,setSearch]=useState("");
  const rows=useMemo(()=>db.orders.filter(o=>!search||(`${o.reference} ${contactName(db,o.contactId)} ${o.productNames.join(" ")}`).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>+new Date(b.placedAt)-+new Date(a.placedAt)),[db,search]);
  const revenue=rows.filter(o=>o.orderStatus!=="cancelled").reduce((s,o)=>s+o.total,0);
  return <div><PageHeader eyebrow="Sales" title="Orders" description="Manage confirmation, payment visibility and fulfilment handoff."/>
    <div className="space-y-4 p-4 md:p-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Orders" value={String(rows.length)}/><KpiCard label="Order value" value={formatCurrency(revenue,"NGN",{compact:true})}/><KpiCard label="Delivered" value={String(rows.filter(o=>o.fulfilmentStatus==="delivered").length)} tone="success"/><KpiCard label="Need confirmation" value={String(rows.filter(o=>o.orderStatus==="needs_confirmation").length)} tone="warning"/></div>
      <div className="relative max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search orders..." className="w-full rounded-lg border bg-card py-2 pl-9 pr-3 text-sm"/></div>
      <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[980px] text-sm"><thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Order</th><th>Customer</th><th>Products</th><th>Amount</th><th>Payment</th><th>Order status</th><th>Fulfilment</th><th>Date</th></tr></thead><tbody>{rows.map(o=><tr key={o.id} className="border-t"><td className="px-4 py-3 font-semibold">{o.reference}</td><td><Link to={"/contacts/"+o.contactId} className="hover:text-primary">{contactName(db,o.contactId)}</Link></td><td>{o.productNames.join(", ")}</td><td className="font-semibold">{formatCurrency(o.total,"NGN")}</td><td><Pill tone={PAYMENT_STATUS_META[o.paymentStatus].tone}>{PAYMENT_STATUS_META[o.paymentStatus].label}</Pill></td><td><select value={o.orderStatus} onChange={e=>updateOrderStatus(o.id,e.target.value as OrderStatus)} className="rounded-md border bg-background px-2 py-1.5 text-xs">{Object.entries(ORDER_STATUS_META).map(([id,m])=><option key={id} value={id}>{m.label}</option>)}</select></td><td><select value={o.fulfilmentStatus} onChange={e=>updateFulfilmentStatus(o.id,e.target.value as FulfilmentStatus)} className="rounded-md border bg-background px-2 py-1.5 text-xs">{Object.entries(FULFILMENT_STATUS_META).map(([id,m])=><option key={id} value={id}>{m.label}</option>)}</select></td><td className="text-muted-foreground">{formatDateTime(o.placedAt)}</td></tr>)}</tbody></table></div>
    </div>
  </div>;
}

export function ProductsPage() {
  const { db, updateProductStock } = useAppData();
  const [search,setSearch]=useState("");
  const rows=useMemo(()=>db.products.filter(p=>!search||(`${p.name} ${p.category}`).toLowerCase().includes(search.toLowerCase())),[db,search]);
  return <div><PageHeader eyebrow="Commerce" title="Products" description="Catalog, pricing and stock visibility."/>
  <div className="space-y-4 p-4 md:p-6">
    <div className="grid gap-3 sm:grid-cols-3"><KpiCard label="Products" value={String(rows.length)}/><KpiCard label="Low stock" value={String(rows.filter(p=>p.stock<=p.reorderLevel).length)} tone="warning"/><KpiCard label="Inventory retail value" value={formatCurrency(rows.reduce((s,p)=>s+p.price*p.stock,0),"NGN",{compact:true})}/></div>
    <div className="relative max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search products..." className="w-full rounded-lg border bg-card py-2 pl-9 pr-3 text-sm"/></div>
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{rows.map(p=><div key={p.id} className="rounded-xl border bg-card p-4"><div className="flex items-start justify-between"><div><div className="font-semibold">{p.name}</div><div className="text-xs text-muted-foreground">{p.category}</div></div>{p.stock<=p.reorderLevel?<Pill tone="warning">Low stock</Pill>:<Pill tone="success">In stock</Pill>}</div><div className="mt-4 grid grid-cols-3 gap-2 text-sm"><div><div className="text-xs text-muted-foreground">Price</div><div className="font-semibold">{formatCurrency(p.price,"NGN")}</div></div><div><div className="text-xs text-muted-foreground">Cost</div><div>{formatCurrency(p.cost,"NGN")}</div></div><div><div className="text-xs text-muted-foreground">Stock</div><input type="number" min="0" value={p.stock} onChange={e=>updateProductStock(p.id,Number(e.target.value))} className="w-20 rounded border bg-background px-2 py-1"/></div></div></div>)}</div>
  </div></div>;
}

export function InventoryPage() {
  const { db } = useAppData();
  const low=db.products.filter(p=>p.stock<=p.reorderLevel);
  return <ModuleLayout icon={<Boxes className="h-5 w-5"/>} eyebrow="Commerce" title="Inventory" description="Stock health, availability and replenishment signals.">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Units on hand" value={String(db.products.reduce((s,p)=>s+p.stock,0))}/><KpiCard label="Low stock SKUs" value={String(low.length)} tone="warning"/><KpiCard label="At cost" value={formatCurrency(db.products.reduce((s,p)=>s+p.cost*p.stock,0),"NGN",{compact:true})}/><KpiCard label="Retail value" value={formatCurrency(db.products.reduce((s,p)=>s+p.price*p.stock,0),"NGN",{compact:true})}/></div>
    <SectionCard title="Replenishment queue" subtitle="Products at or below reorder threshold"><div className="space-y-2">{low.length?low.map(p=><div key={p.id} className="flex items-center justify-between rounded-lg border p-3"><div><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.category}</div></div><div className="text-right"><div className="font-semibold">{p.stock} units</div><div className="text-xs text-muted-foreground">Reorder at {p.reorderLevel}</div></div></div>):<div className="text-sm text-muted-foreground">No products need replenishment.</div>}</div></SectionCard>
  </ModuleLayout>;
}

export function StorePage() {
  const { db }=useAppData();
  const [tab,setTab]=useState<"overview"|"forms"|"checkout">("overview");
  const [fields,setFields]=useState(["Full name","Phone / WhatsApp","Country","City","Address","Product","Quantity"]);
  const handle=db.workspaces[0]?.handle ?? "store";
  return <ModuleLayout icon={<Store className="h-5 w-5"/>} eyebrow="Commerce" title="Store" description="Direct-response storefront, forms, checkout, upsells and tracking.">
    <div className="flex flex-wrap gap-2">{(["overview","forms","checkout"] as const).map(x=><button key={x} onClick={()=>setTab(x)} className={"rounded-lg px-3 py-2 text-sm capitalize "+(tab===x?"bg-primary text-primary-foreground":"border bg-card")}>{x}</button>)}<a href={"/shop/"+handle} target="_blank" rel="noreferrer" className="ml-auto rounded-lg border px-3 py-2 text-sm font-medium">Open storefront</a></div>
    {tab==="overview"&&<div className="grid gap-4 lg:grid-cols-3"><SectionCard title="Storefront"><div className="space-y-3 text-sm"><StatusLine label="Public storefront" ok/><StatusLine label="Product catalog" ok/><StatusLine label="Checkout" ok/><StatusLine label="Custom domain" ok={false}/></div></SectionCard><SectionCard title="Conversion tools"><div className="space-y-3 text-sm"><StatusLine label="Lead forms" ok/><StatusLine label="Order forms" ok/><StatusLine label="Order bumps" ok/><StatusLine label="Upsells" ok/></div></SectionCard><SectionCard title="Catalog"><div className="text-3xl font-bold">{db.products.length}</div><div className="text-sm text-muted-foreground">Products available to publish</div></SectionCard></div>}
    {tab==="forms"&&<div className="grid gap-4 xl:grid-cols-[1fr_.8fr]"><SectionCard title="Order form builder" subtitle="Fields can later be persisted to the backend forms schema"><div className="space-y-2">{fields.map((field,i)=><div key={field+i} className="flex items-center gap-2 rounded-lg border p-3"><span className="flex-1 text-sm font-medium">{field}</span><button onClick={()=>setFields(v=>v.filter((_,idx)=>idx!==i))} className="text-xs text-destructive">Remove</button></div>)}<button onClick={()=>setFields(v=>[...v,"Custom field "+(v.length+1)])} className="mt-2 rounded-lg border px-3 py-2 text-sm">+ Add field</button></div></SectionCard><SectionCard title="Form preview"><div className="space-y-3">{fields.map(field=><label key={field} className="block"><span className="mb-1 block text-xs font-medium">{field}</span><div className="h-9 rounded-lg border bg-background"/></label>)}</div></SectionCard></div>}
    {tab==="checkout"&&<SectionCard title="Checkout configuration" subtitle="Payment and fulfilment options"><div className="grid gap-3 md:grid-cols-2"><StatusLine label="Cash / payment on delivery" ok/><StatusLine label="Bank transfer" ok/><StatusLine label="Card via payment provider" ok={false}/><StatusLine label="Country-specific pricing" ok/></div></SectionCard>}
  </ModuleLayout>;
}

export function DeliveryPage() {
  const { db, updateDeliveryStatus }=useAppData();
  const [tab,setTab]=useState<"deliveries"|"agents"|"exceptions"|"cod">("deliveries");
  const active=db.deliveries.filter(d=>["scheduled","picked_up","in_transit","rescheduled"].includes(d.status));
  const failed=db.deliveries.filter(d=>["failed","returned"].includes(d.status));
  const cod=db.payments.filter(p=>["cod_pending","cod_collected"].includes(p.status));
  const couriers=Array.from(new Set(db.deliveries.map(d=>d.courier)));
  return <ModuleLayout icon={<Truck className="h-5 w-5"/>} eyebrow="Operations" title="Delivery" description="Dispatch, delivery agents, proof of delivery, exceptions, COD and remittance.">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Active deliveries" value={String(active.length)}/><KpiCard label="Delivered" value={String(db.deliveries.filter(d=>d.status==="delivered").length)} tone="success"/><KpiCard label="Failed / returned" value={String(failed.length)} tone="danger"/><KpiCard label="COD outstanding" value={formatCurrency(cod.reduce((s,p)=>s+p.amount,0),"NGN",{compact:true})} tone="warning"/></div>
    <div className="flex flex-wrap gap-2">{(["deliveries","agents","exceptions","cod"] as const).map(x=><button key={x} onClick={()=>setTab(x)} className={"rounded-lg px-3 py-2 text-sm capitalize "+(tab===x?"bg-primary text-primary-foreground":"border bg-card")}>{x}</button>)}<Link to="/agent" className="ml-auto rounded-lg border px-3 py-2 text-sm font-medium">Agent workspace</Link></div>
    {tab==="deliveries"&&<div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Tracking</th><th>Customer</th><th>Courier</th><th>City</th><th>Attempts</th><th>Status</th><th>Scheduled</th></tr></thead><tbody>{db.deliveries.map(d=><tr key={d.id} className="border-t"><td className="px-4 py-3 font-semibold">{d.trackingRef}</td><td>{contactName(db,d.contactId)}</td><td>{d.courier}</td><td>{d.city}</td><td>{d.attempts}</td><td><select value={d.status} onChange={e=>updateDeliveryStatus(d.id,e.target.value as DeliveryStatus)} className="rounded-md border bg-background px-2 py-1.5 text-xs">{Object.entries(DELIVERY_STATUS_META).map(([id,m])=><option key={id} value={id}>{m.label}</option>)}</select></td><td>{formatDateTime(d.scheduledFor)}</td></tr>)}</tbody></table></div>}
    {tab==="agents"&&<div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{couriers.map(courier=>{const items=db.deliveries.filter(d=>d.courier===courier);return <div key={courier} className="rounded-xl border bg-card p-4"><div className="font-semibold">{courier}</div><div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><div className="text-xs text-muted-foreground">Assigned</div><b>{items.length}</b></div><div><div className="text-xs text-muted-foreground">Delivered</div><b>{items.filter(d=>d.status==="delivered").length}</b></div><div><div className="text-xs text-muted-foreground">Failed</div><b>{items.filter(d=>d.status==="failed").length}</b></div></div></div>})}</div>}
    {tab==="exceptions"&&<SectionCard title="Failed delivery & returns" subtitle="Recovery and rescheduling queue"><div className="space-y-2">{failed.map(d=><div key={d.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"><div className="flex-1"><div className="font-semibold">{contactName(db,d.contactId)}</div><div className="text-xs text-muted-foreground">{d.failureReason||d.status}</div></div><button onClick={()=>updateDeliveryStatus(d.id,"rescheduled")} className="rounded-lg border px-3 py-2 text-xs font-medium">Reschedule</button></div>)}</div></SectionCard>}
    {tab==="cod"&&<SectionCard title="COD & remittance" subtitle="Collections remain liabilities until verified"><div className="space-y-2">{cod.map(p=><div key={p.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_.7fr_.7fr] sm:items-center"><div><div className="font-semibold">{contactName(db,p.contactId)}</div><div className="text-xs text-muted-foreground">{p.orderId}</div></div><div className="font-semibold">{formatCurrency(p.amount,"NGN")}</div><Pill tone={p.status==="cod_collected"?"info":"warning"}>{PAYMENT_STATUS_META[p.status].label}</Pill></div>)}</div></SectionCard>}
  </ModuleLayout>;
}

export function MarketingPage() {
  const { db }=useAppData();
  return <ModuleLayout icon={<Megaphone className="h-5 w-5"/>} eyebrow="Growth" title="Marketing" description="Audiences, lifecycle campaigns and customer reactivation.">
    <div className="grid gap-3 sm:grid-cols-3"><KpiCard label="Segments" value={String(db.segments.length)}/><KpiCard label="Reachable contacts" value={String(db.contacts.filter(c=>c.consentMarketing).length)}/><KpiCard label="Reactivation pool" value={String(db.contacts.filter(c=>["dormant","at_risk"].includes(c.lifecycle)).length)} tone="warning"/></div>
    <div className="grid gap-4 xl:grid-cols-2"><SectionCard title="Audience library" subtitle="Smart audiences update as customer data changes"><div className="grid gap-3">{db.segments.map(s=><div key={s.id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><div className="font-semibold">{s.name}</div><Pill tone={s.type==="smart"?"brand":"neutral"}>{s.type}</Pill></div><div className="mt-1 text-xs text-muted-foreground">{s.description}</div><div className="mt-3 text-sm">{s.memberCount} members · {s.rulesSummary}</div></div>)}</div></SectionCard><SectionCard title="Lifecycle campaigns" subtitle="WhatsApp, email and SMS campaigns"><div className="space-y-2">{db.marketingCampaigns.map(c=><div key={c.id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><div><div className="font-semibold">{c.name}</div><div className="text-xs uppercase text-muted-foreground">{c.channel}</div></div><Pill tone={c.status==="completed"?"success":c.status==="running"?"brand":"neutral"}>{c.status}</Pill></div><div className="mt-3 grid grid-cols-4 gap-2 text-xs"><div><span className="text-muted-foreground">Sent</span><div className="font-semibold">{c.sent}</div></div><div><span className="text-muted-foreground">Delivered</span><div className="font-semibold">{c.delivered}</div></div><div><span className="text-muted-foreground">Replies</span><div className="font-semibold">{c.responses}</div></div><div><span className="text-muted-foreground">Orders</span><div className="font-semibold">{c.orders}</div></div></div></div>)}</div></SectionCard></div>
  </ModuleLayout>;
}

export function AdsPage() {
  const { db, updateCampaignStatus }=useAppData();
  const spend=db.adCampaigns.reduce((s,c)=>s+c.spend,0), revenue=db.adCampaigns.reduce((s,c)=>s+c.revenue,0);
  return <ModuleLayout icon={<BadgeDollarSign className="h-5 w-5"/>} eyebrow="Growth" title="Ads" description="Connect ad spend to leads, orders, delivered revenue and profitability.">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Ad spend" value={formatCurrency(spend,"NGN",{compact:true})}/><KpiCard label="Attributed revenue" value={formatCurrency(revenue,"NGN",{compact:true})}/><KpiCard label="ROAS" value={(spend?revenue/spend:0).toFixed(2)+"×"}/><KpiCard label="Leads" value={String(db.adCampaigns.reduce((s,c)=>s+c.leads,0))}/></div>
    <SectionCard title="Campaign performance"><div className="space-y-2">{db.adCampaigns.map(c=><div key={c.id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1.5fr_.7fr_.7fr_.6fr_.8fr] md:items-center"><div><div className="font-semibold">{c.name}</div><div className="text-xs text-muted-foreground">{c.platform.toUpperCase()}{c.issue?" · "+c.issue:""}</div></div><div><div className="text-xs text-muted-foreground">Spend</div>{formatCurrency(c.spend,"NGN",{compact:true})}</div><div><div className="text-xs text-muted-foreground">Revenue</div>{formatCurrency(c.revenue,"NGN",{compact:true})}</div><div><div className="text-xs text-muted-foreground">ROAS</div>{(c.spend?c.revenue/c.spend:0).toFixed(1)}×</div><select value={c.status} onChange={e=>updateCampaignStatus(c.id,e.target.value as "active"|"paused"|"review_needed")} className="rounded-md border bg-background px-2 py-1.5 text-xs"><option value="active">Active</option><option value="paused">Paused</option><option value="review_needed">Review needed</option></select></div>)}</div></SectionCard>
  </ModuleLayout>;
}

export function AutomationPage() {
  const templates=[["Unanswered Lead SLA","Lead created → wait 5m → remind rep → escalate manager"],["Failed Delivery Recovery","Delivery failed → task → WhatsApp → reschedule branch"],["Repeat Purchase Reactivation","Delivered → wait 30d → no repurchase → audience → campaign"],["COD Remittance Escalation","COD collected → remittance overdue → notify finance/logistics"]];
  return <ModuleLayout icon={<Workflow className="h-5 w-5"/>} eyebrow="Growth" title="Automation" description="Trigger → conditions → actions → waits → branches → goals."><div className="grid gap-3 lg:grid-cols-2">{templates.map(([name,flow])=><div key={name} className="rounded-xl border bg-card p-4"><div className="font-semibold">{name}</div><div className="mt-2 text-sm text-muted-foreground">{flow}</div><div className="mt-4"><Pill tone="success">Ready template</Pill></div></div>)}</div></ModuleLayout>;
}

export function FinancePage() {
  const { db }=useAppData();
  const paid=db.payments.filter(p=>p.status==="paid").reduce((s,p)=>s+p.amount,0);
  const cod=db.payments.filter(p=>p.status==="cod_pending").reduce((s,p)=>s+p.amount,0);
  return <ModuleLayout icon={<WalletCards className="h-5 w-5"/>} eyebrow="Money" title="Finance" description="Operational payments, COD, remittance, refunds and profitability.">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Paid" value={formatCurrency(paid,"NGN",{compact:true})} tone="success"/><KpiCard label="COD pending" value={formatCurrency(cod,"NGN",{compact:true})} tone="warning"/><KpiCard label="Transactions" value={String(db.payments.length)}/><KpiCard label="Refunded" value={formatCurrency(db.payments.filter(p=>p.status==="refunded").reduce((s,p)=>s+p.amount,0),"NGN",{compact:true})}/></div>
    <SectionCard title="Payments"><div className="space-y-2">{db.payments.slice(0,20).map(p=><div key={p.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"><div className="font-semibold sm:w-36">{formatCurrency(p.amount,"NGN")}</div><div className="flex-1 text-sm">{contactName(db,p.contactId)}</div><Pill tone={PAYMENT_STATUS_META[p.status].tone}>{PAYMENT_STATUS_META[p.status].label}</Pill><div className="text-xs text-muted-foreground">{p.method.replaceAll("_"," ")}</div></div>)}</div></SectionCard>
  </ModuleLayout>;
}

export function AnalyticsPage() {
  const { db }=useAppData();
  const countries=useMemo(()=>Object.entries(db.contacts.reduce<Record<string,number>>((a,c)=>{a[c.countryCode]=(a[c.countryCode]??0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]),[db]);
  const channels=useMemo(()=>Object.entries(db.conversations.reduce<Record<string,number>>((a,c)=>{a[c.channel]=(a[c.channel]??0)+1;return a;},{})),[db]);
  return <ModuleLayout icon={<BarChart3 className="h-5 w-5"/>} eyebrow="Insights" title="Analytics" description="Executive, marketing, sales, customer, product, delivery and country intelligence.">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Contacts" value={String(db.contacts.length)}/><KpiCard label="Orders" value={String(db.orders.length)}/><KpiCard label="Delivered revenue" value={formatCurrency(db.contacts.reduce((s,c)=>s+c.deliveredRevenue,0),"NGN",{compact:true})}/><KpiCard label="Countries" value={String(countries.length)}/></div>
    <div className="grid gap-4 lg:grid-cols-2"><SectionCard title="Customer distribution by country"><div className="space-y-2">{countries.map(([c,n])=><div key={c} className="flex items-center justify-between rounded-lg border p-3"><span>{c}</span><span className="font-semibold">{n}</span></div>)}</div></SectionCard><SectionCard title="Channel mix"><div className="space-y-2">{channels.map(([c,n])=><div key={c} className="flex items-center justify-between rounded-lg border p-3"><span>{c}</span><span className="font-semibold">{n}</span></div>)}</div></SectionCard></div>
  </ModuleLayout>;
}

export function TeamPage() {
  const { db }=useAppData();
  return <ModuleLayout icon={<Users className="h-5 w-5"/>} eyebrow="Workspace" title="Team" description="Members, roles, workload and access boundaries."><div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{db.team.map(t=><div key={t.id} className="rounded-xl border bg-card p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-bold">{t.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</div><div><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">{t.email}</div></div></div><div className="mt-4 flex items-center justify-between"><Pill tone={t.active?"success":"neutral"}>{t.active?"Active":"Inactive"}</Pill><span className="text-xs capitalize text-muted-foreground">{t.role.replaceAll("_"," ")}</span></div></div>)}</div></ModuleLayout>;
}

export function IntegrationsPage() {
  const connectors=[["WhatsApp Business","Messaging","Connect official WhatsApp Business Platform"],["Meta","Ads & Messaging","Meta Ads, Instagram and Messenger"],["TikTok","Ads & Messaging","TikTok Ads and supported messaging"],["Google Ads","Advertising","Campaign performance and attribution"],["Paystack","Payments","Nigeria-first payment processing"],["Shopify","Commerce","Orders, customers and catalog synchronization"],["WooCommerce","Commerce","WordPress commerce synchronization"],["Webhooks / API","Developer","Generic inbound and outbound integration"]];
  return <ModuleLayout icon={<Plug className="h-5 w-5"/>} eyebrow="Workspace" title="Integrations" description="Provider adapters keep external services replaceable and observable."><div className="grid gap-3 lg:grid-cols-2">{connectors.map(([name,cat,desc])=><div key={name} className="rounded-xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{name}</div><div className="text-xs text-muted-foreground">{cat}</div></div><Pill>Not connected</Pill></div><div className="mt-3 text-sm text-muted-foreground">{desc}</div><button disabled title="Credentials required" className="mt-4 rounded-lg border px-3 py-2 text-sm opacity-60">Credentials required</button></div>)}</div></ModuleLayout>;
}

export function SettingsPage() {
  const sections:[string,string,ReactNode][]=[["Business","Workspace identity, branches, markets and currencies",<Globe2 className="h-5 w-5"/>],["Channels","Messaging and inbox configuration",<MessageSquareText className="h-5 w-5"/>],["Payments","Gateways, transfer and COD settings",<CreditCard className="h-5 w-5"/>],["Automation","SLA, workflow and notification defaults",<RefreshCw className="h-5 w-5"/>],["Security","Roles, sessions and audit controls",<ShieldCheck className="h-5 w-5"/>],["Developer","API keys, webhooks and environments",<KeyRound className="h-5 w-5"/>]];
  return <ModuleLayout icon={<Settings className="h-5 w-5"/>} eyebrow="Workspace" title="Settings" description="Configure business behavior without changing application code."><div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{sections.map(([name,desc,icon])=><div key={name} className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-primary">{icon}<div className="font-semibold text-foreground">{name}</div></div><div className="mt-2 text-sm text-muted-foreground">{desc}</div></div>)}</div></ModuleLayout>;
}

export function HelpPage() {
  return <ModuleLayout icon={<CircleHelp className="h-5 w-5"/>} eyebrow="Support" title="Help" description="Product guidance, onboarding and operational support."><div className="grid gap-4 lg:grid-cols-3"><SectionCard title="Getting started"><p className="text-sm text-muted-foreground">Set up your workspace, team, channels, products and sales pipeline.</p></SectionCard><SectionCard title="CRM workflow"><p className="text-sm text-muted-foreground">Capture contacts, qualify leads, create orders and retain the complete customer history.</p></SectionCard><SectionCard title="Operations"><p className="text-sm text-muted-foreground">Manage inventory, dispatch, delivery, COD and remittance from one operating system.</p></SectionCard></div></ModuleLayout>;
}

function ModuleLayout({ icon, eyebrow, title, description, children }:{icon:ReactNode;eyebrow:string;title:string;description:string;children:ReactNode}) {
  return <div><PageHeader eyebrow={eyebrow} title={title} description={description} actions={<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">{icon}</div>}/><div className="space-y-5 p-4 md:p-6">{children}</div></div>;
}
function StatusLine({label,ok}:{label:string;ok:boolean}) {
  return <div className="flex items-center justify-between rounded-lg border p-3"><span>{label}</span>{ok?<CheckCircle2 className="h-4 w-4 text-success"/>:<AlertTriangle className="h-4 w-4 text-warning"/>}</div>;
}
