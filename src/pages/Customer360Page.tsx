import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckSquare, MessageCircle, Phone, ShoppingBag, StickyNote } from "lucide-react";
import { useAppData } from "@/state/AppData";
import { fullName, getCustomer360, type Customer360 } from "@/domain/repositories";
import { CHANNEL_LABELS, FULFILMENT_STATUS_META, LIFECYCLE_META, ORDER_STATUS_META } from "@/domain/types";
import { countryFlag, countryName, formatCurrency, formatDateTime } from "@/lib/format";
import { KpiCard, Pill, SectionCard } from "@/components/Common";

const TABS = ["Overview","Timeline","Conversations","Orders","Product Interests","Tasks","Delivery","Payments","Marketing","Notes","Files"];

export function Customer360Page() {
  const { contactId } = useParams();
  const { db } = useAppData();
  const navigate = useNavigate();
  const [tab,setTab] = useState("Overview");
  const data = useMemo(() => contactId ? getCustomer360(db,contactId) : undefined, [db,contactId]);

  if (!data) {
    return <div className="p-8"><Link to="/crm/contacts" className="text-primary">← Back to contacts</Link><h1 className="mt-4 text-2xl font-bold">Contact not found</h1></div>;
  }

  const c = data.contact;

  return (
    <div>
      <div className="border-b bg-card px-4 py-5 md:px-6">
        <Link to="/crm/contacts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Contacts</Link>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-lg font-bold">{c.firstName[0]}{c.lastName[0]}</div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{fullName(c)}</h1><Pill tone={LIFECYCLE_META[c.lifecycle].tone}>{LIFECYCLE_META[c.lifecycle].label}</Pill></div>
              <div className="mt-1 text-sm text-muted-foreground">{c.phone} · {countryFlag(c.countryCode)} {c.city}, {countryName(c.countryCode)} · Score {c.leadScore}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 xl:ml-auto">
            <Action icon={<MessageCircle className="h-4 w-4"/>} text="Message" onClick={() => navigate("/inbox")} />
            <a href={"tel:"+c.phone} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"><Phone className="h-4 w-4"/>Call</a>
            <Action icon={<ShoppingBag className="h-4 w-4"/>} text="Create Order" onClick={() => navigate("/orders")} />
            <Action icon={<CheckSquare className="h-4 w-4"/>} text="Task" onClick={() => navigate("/crm/follow-ups")} />
            <Action icon={<StickyNote className="h-4 w-4"/>} text="Note" onClick={() => setTab("Notes")} />
          </div>
        </div>
      </div>

      <div className="scroll-thin flex gap-1 overflow-x-auto border-b bg-card px-4 py-2 md:px-6">
        {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={"whitespace-nowrap rounded-lg px-3 py-2 text-sm " + (tab === t ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted")}>{t}</button>)}
      </div>

      <div className="p-4 md:p-6">
        {tab === "Overview" && <Overview data={data} />}
        {tab === "Timeline" && <Timeline data={data} />}
        {tab === "Conversations" && <List title="Conversations" rows={data.conversations.map((x) => [CHANNEL_LABELS[x.channel],x.subject,formatDateTime(x.lastMessageAt)])} />}
        {tab === "Orders" && <List title="Orders" rows={data.orders.map((x) => [x.reference,x.productNames.join(", ") + " · " + ORDER_STATUS_META[x.orderStatus].label + " · " + FULFILMENT_STATUS_META[x.fulfilmentStatus].label,formatCurrency(x.total,"NGN")])} />}
        {tab === "Product Interests" && <List title="Product Interests" rows={data.interests.map((x) => [x.productName,x.intent.replaceAll("_"," "),formatDateTime(x.capturedAt)])} />}
        {tab === "Tasks" && <List title="Tasks" rows={data.tasks.map((x) => [x.title,x.status,formatDateTime(x.dueAt)])} />}
        {tab === "Delivery" && <List title="Delivery History" rows={data.deliveries.map((x) => [x.courier,x.status.replaceAll("_"," "),x.trackingRef])} />}
        {tab === "Payments" && <List title="Payments" rows={data.payments.map((x) => [formatCurrency(x.amount,"NGN"),x.method.replaceAll("_"," "),x.status.replaceAll("_"," ")])} />}
        {["Marketing","Notes","Files"].includes(tab) && <SectionCard title={tab}><div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No {tab.toLowerCase()} records in the current dataset.</div></SectionCard>}
      </div>
    </div>
  );
}

function Overview({data}:{data:Customer360}) {
  const c = data.contact;
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Lifetime revenue" value={formatCurrency(data.kpis.lifetimeRevenue,"NGN",{compact:true})} />
      <KpiCard label="Delivered revenue" value={formatCurrency(data.kpis.deliveredRevenue,"NGN",{compact:true})} tone="success" />
      <KpiCard label="Contribution profit" value={formatCurrency(data.kpis.contributionProfit,"NGN",{compact:true})} tone="success" />
      <KpiCard label="Outstanding balance" value={formatCurrency(data.kpis.outstandingBalance,"NGN",{compact:true})} tone={data.kpis.outstandingBalance ? "warning" : "default"} />
    </div>
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard title="Customer profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Owner" value={data.owner?.name || "Unassigned"} />
          <Field label="Email" value={c.email || "Not provided"} />
          <Field label="Phone" value={c.phone} />
          <Field label="Location" value={c.city + ", " + countryName(c.countryCode)} />
          <Field label="Orders" value={String(data.kpis.orders)} />
          <Field label="Average order" value={formatCurrency(data.kpis.averageOrderValue,"NGN")} />
        </div>
      </SectionCard>
      <SectionCard title="Channel identities">
        <div className="space-y-2">{data.identities.map((i) => <div key={i.id} className="flex items-center justify-between rounded-lg border p-3"><div><div className="text-sm font-medium">{CHANNEL_LABELS[i.channel]}</div><div className="text-xs text-muted-foreground">{i.handle}</div></div><Pill tone={i.verified ? "success" : "neutral"}>{i.verified ? "Verified" : "Observed"}</Pill></div>)}</div>
      </SectionCard>
    </div>
    <Timeline data={data} compact />
  </div>;
}

function Timeline({data,compact=false}:{data:Customer360;compact?:boolean}) {
  const items = compact ? data.activities.slice(0,8) : data.activities;
  return <SectionCard title={compact ? "Recent activity" : "Customer timeline"} subtitle="Acquisition, conversations, orders, delivery and payments in one history"><div>{items.map((a) => <div key={a.id} className="flex gap-3 border-l-2 border-accent pb-5 pl-4"><div className="min-w-0 flex-1"><div className="text-sm font-medium">{a.title}</div>{a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}<div className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(a.at)} · {a.kind}</div></div>{a.amount != null && <div className="text-sm font-semibold">{formatCurrency(a.amount,"NGN",{compact:true})}</div>}</div>)}</div></SectionCard>;
}

function List({title,rows}:{title:string;rows:string[][]}) {
  return <SectionCard title={title}><div className="space-y-2">{rows.length ? rows.map((r,i) => <div key={i} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center"><div className="font-medium sm:w-48">{r[0]}</div><div className="flex-1 text-sm text-muted-foreground">{r[1]}</div><div className="text-xs text-muted-foreground">{r[2]}</div></div>) : <div className="p-8 text-center text-sm text-muted-foreground">No records.</div>}</div></SectionCard>;
}

function Field({label,value}:{label:string;value:string}) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>;
}

function Action({icon,text,onClick}:{icon:ReactNode;text:string;onClick:()=>void}) {
  return <button onClick={onClick} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">{icon}{text}</button>;
}
