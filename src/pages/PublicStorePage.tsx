import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ShoppingBag, CheckCircle2 } from "lucide-react";
import { useAppData } from "@/state/AppData";
import { formatCurrency } from "@/lib/format";
import type { PaymentMethod } from "@/domain/types";

export function PublicStorePage() {
  const { handle } = useParams();
  const { db, addContact, addOrder } = useAppData();
  const [productId,setProductId]=useState(db.products[0]?.id ?? "");
  const [quantity,setQuantity]=useState(1);
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [email,setEmail]=useState("");
  const [city,setCity]=useState("");
  const [countryCode,setCountryCode]=useState("NG");
  const [paymentMethod,setPaymentMethod]=useState<PaymentMethod>("cash_on_delivery");
  const [confirmation,setConfirmation]=useState<{reference:string;total:number}|null>(null);
  const product=useMemo(()=>db.products.find(p=>p.id===productId),[db.products,productId]);

  const submit=(e:React.FormEvent)=>{
    e.preventDefault();
    if(!product) return;
    const [firstName,...rest]=name.trim().split(/\s+/);
    if(!firstName || !phone.trim()) return;
    const contact=addContact({firstName,lastName:rest.join(" "),phone:phone.trim(),email:email.trim()||undefined,city:city.trim(),countryCode});
    const order=addOrder({contactId:contact.id,productId:product.id,quantity,channel:"webchat",paymentMethod});
    setConfirmation({reference:order.reference,total:order.total});
  };

  if(confirmation) return <div className="min-h-screen bg-background p-4"><div className="mx-auto mt-16 max-w-lg rounded-2xl border bg-card p-8 text-center shadow-lg"><CheckCircle2 className="mx-auto h-12 w-12 text-success"/><h1 className="mt-4 text-2xl font-bold">Order received</h1><p className="mt-2 text-sm text-muted-foreground">Your order has entered the Bizriva CRM confirmation queue.</p><div className="mt-6 rounded-xl bg-muted p-4"><div className="text-xs text-muted-foreground">Order reference</div><div className="text-xl font-bold">{confirmation.reference}</div><div className="mt-2 text-lg font-semibold">{formatCurrency(confirmation.total,"NGN")}</div></div></div></div>;

  return <div className="min-h-screen bg-background">
    <header className="border-b bg-card"><div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ShoppingBag className="h-5 w-5"/></div><div><div className="font-bold">{db.workspaces.find(w=>w.handle===handle)?.name ?? "Bizriva Store"}</div><div className="text-xs text-muted-foreground">Secure commerce powered by Bizriva CRM</div></div></div></header>
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1.2fr_.8fr]">
      <section><div className="mb-5"><h1 className="text-3xl font-bold">Shop products</h1><p className="mt-1 text-muted-foreground">Choose a product and place your order.</p></div><div className="grid gap-3 sm:grid-cols-2">{db.products.map(p=><button key={p.id} onClick={()=>setProductId(p.id)} className={"rounded-xl border bg-card p-4 text-left transition "+(productId===p.id?"ring-2 ring-primary":"hover:bg-muted/50")}><div className="font-semibold">{p.name}</div><div className="mt-1 text-xs text-muted-foreground">{p.category}</div><div className="mt-4 text-lg font-bold">{formatCurrency(p.price,"NGN")}</div><div className="text-xs text-muted-foreground">{p.stock} in stock</div></button>)}</div></section>
      <form onSubmit={submit} className="h-fit rounded-2xl border bg-card p-5 shadow-sm"><h2 className="text-lg font-bold">Checkout</h2><div className="mt-4 space-y-3"><label className="block"><span className="mb-1 block text-xs font-medium">Full name</span><input required value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2"/></label><label className="block"><span className="mb-1 block text-xs font-medium">Phone / WhatsApp</span><input required value={phone} onChange={e=>setPhone(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2"/></label><label className="block"><span className="mb-1 block text-xs font-medium">Email</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2"/></label><div className="grid grid-cols-2 gap-2"><label><span className="mb-1 block text-xs font-medium">City</span><input value={city} onChange={e=>setCity(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2"/></label><label><span className="mb-1 block text-xs font-medium">Country</span><select value={countryCode} onChange={e=>setCountryCode(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2"><option value="NG">Nigeria</option><option value="GH">Ghana</option><option value="ZA">South Africa</option><option value="US">United States</option><option value="GB">United Kingdom</option></select></label></div><label className="block"><span className="mb-1 block text-xs font-medium">Quantity</span><input type="number" min="1" max={product?.stock || 1} value={quantity} onChange={e=>setQuantity(Math.max(1,Number(e.target.value)))} className="w-full rounded-lg border bg-background px-3 py-2"/></label><label className="block"><span className="mb-1 block text-xs font-medium">Payment method</span><select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as PaymentMethod)} className="w-full rounded-lg border bg-background px-3 py-2"><option value="cash_on_delivery">Cash / payment on delivery</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option></select></label></div>
        <div className="mt-5 border-t pt-4"><div className="flex justify-between text-sm"><span>{product?.name}</span><span>{quantity} × {product?formatCurrency(product.price,"NGN"):"—"}</span></div><div className="mt-3 flex justify-between text-lg font-bold"><span>Total</span><span>{product?formatCurrency(product.price*quantity,"NGN"):"—"}</span></div><button disabled={!product || !product.stock} className="mt-4 w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">Place order</button></div>
      </form>
    </main>
  </div>;
}
