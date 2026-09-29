import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Phone, MessageCircle, MapPin, Truck, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import { useAppData } from "@/state/AppData";
import { fullName } from "@/domain/repositories";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { DeliveryStatus } from "@/domain/types";

export function DeliveryAgentPage() {
  const { db, updateDeliveryStatus } = useAppData();
  const [filter,setFilter]=useState<"active"|"completed"|"failed">("active");
  const deliveries=db.deliveries.filter(d=>{
    if(filter==="completed") return d.status==="delivered";
    if(filter==="failed") return d.status==="failed"||d.status==="returned";
    return !["delivered","returned"].includes(d.status);
  });

  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-10 border-b bg-card"><div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3"><Link to="/delivery" className="rounded-lg p-2 hover:bg-muted"><ArrowLeft className="h-5 w-5"/></Link><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Truck className="h-4 w-4"/></div><div><div className="font-bold">Delivery Agent</div><div className="text-xs text-muted-foreground">Assigned delivery workspace</div></div></div></header>
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-4 grid grid-cols-3 rounded-xl bg-muted p-1">{(["active","completed","failed"] as const).map(x=><button key={x} onClick={()=>setFilter(x)} className={"rounded-lg px-3 py-2 text-sm capitalize "+(filter===x?"bg-card font-semibold shadow-sm":"")}>{x}</button>)}</div>
      <div className="space-y-3">{deliveries.length?deliveries.map(d=>{
        const contact=db.contacts.find(c=>c.id===d.contactId);
        const order=db.orders.find(o=>o.id===d.orderId);
        const payment=db.payments.find(p=>p.orderId===d.orderId);
        return <article key={d.id} className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><div className="font-bold">{contact?fullName(contact):"Customer"}</div><div className="text-xs text-muted-foreground">{d.trackingRef} · {d.city}</div></div><span className="rounded-full bg-muted px-2 py-1 text-xs capitalize">{d.status.replaceAll("_"," ")}</span></div>
          <div className="mt-4 grid gap-2 rounded-xl bg-muted/50 p-3 text-sm"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary"/><span>{d.city}</span></div><div className="flex justify-between"><span>Order</span><span className="font-medium">{order?.reference ?? "—"}</span></div><div className="flex justify-between"><span>Amount</span><span className="font-semibold">{order?formatCurrency(order.total,"NGN"):"—"}</span></div><div className="flex justify-between"><span>Payment</span><span className="capitalize">{payment?.method.replaceAll("_"," ") ?? "—"}</span></div><div className="flex justify-between"><span>Scheduled</span><span>{formatDateTime(d.scheduledFor)}</span></div></div>
          {contact&&<div className="mt-3 grid grid-cols-2 gap-2"><a href={"tel:"+contact.phone} className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"><Phone className="h-4 w-4"/>Call</a><a href={"https://wa.me/"+contact.phone.replace(/\D/g,"")} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"><MessageCircle className="h-4 w-4"/>WhatsApp</a></div>}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatusButton label="In transit" icon={<Truck className="h-4 w-4"/>} onClick={()=>updateDeliveryStatus(d.id,"in_transit")}/>
            <StatusButton label="Delivered" icon={<CheckCircle2 className="h-4 w-4"/>} onClick={()=>updateDeliveryStatus(d.id,"delivered")}/>
            <StatusButton label="Failed" icon={<AlertTriangle className="h-4 w-4"/>} onClick={()=>updateDeliveryStatus(d.id,"failed")}/>
            <StatusButton label="Reschedule" icon={<RotateCcw className="h-4 w-4"/>} onClick={()=>updateDeliveryStatus(d.id,"rescheduled" as DeliveryStatus)}/>
          </div>
        </article>;
      }):<div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No deliveries in this queue.</div>}</div>
    </main>
  </div>;
}

function StatusButton({label,icon,onClick}:{label:string;icon:React.ReactNode;onClick:()=>void}) {
  return <button onClick={onClick} className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">{icon}{label}</button>;
}
