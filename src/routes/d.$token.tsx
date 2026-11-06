/**
 * The rider's or logistics partner's private delivery link: bizriva-crm.vercel.app/d/<token>.
 * No app, no login — they accept, mark delivered (with the cash collected) or
 * failed. Practice deliveries are read from this browser's practice data; real
 * ones go through the delivery-link Edge Function, which checks the token.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActions, useDb } from "@/domain/store";
import { phoneDigits } from "@/domain/ops";

export const Route = createFileRoute("/d/$token")({
  head: () => ({ meta: [{ title: "Delivery · Bizriva" }, { name: "robots", content: "noindex" }] }),
  component: DeliveryLink,
});

const FN = `${import.meta.env.VITE_SUPABASE_URL ?? "https://xjhzkciowmklxrtwsikm.supabase.co"}/functions/v1/delivery-link`;
const REASONS = ["Customer unreachable", "Customer not at home", "Wrong address", "Customer refused", "Customer asked to reschedule", "Other"];

interface View {
  business: string; ref: string; customer: string; phone: string; address: string; items: string[]; collect: number; currency: string;
  status: string; accepted: boolean; partner: string;
}

function DeliveryLink() {
  const { token } = Route.useParams();
  const db = useDb();
  const { partnerAction } = useActions();
  const [live, setLive] = useState<View | null | "none">(null);
  const [cash, setCash] = useState("");
  const [failing, setFailing] = useState(false);
  const [reason, setReason] = useState(REASONS[0]!);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  // Practice: the delivery lives in this browser.
  const del = db.deliveries.find((d) => d.linkToken === token);
  const practice: View | null = (() => {
    if (!del) return null;
    const o = db.orders.find((x) => x.id === del.orderId);
    const c = db.contacts.find((x) => x.id === del.contactId);
    return {
      business: db.workspaces[0]?.name ?? db.settings.businessName, ref: o?.reference ?? del.trackingRef,
      customer: c ? `${c.firstName} ${c.lastName}` : "Customer", phone: c?.phone ?? "",
      address: [c?.address, del.city, c?.landmark ? `near ${c.landmark}` : ""].filter(Boolean).join(", "),
      items: o?.productNames ?? [], collect: o ? Math.max(0, o.total - (o.amountPaid ?? 0)) : 0, currency: db.workspaces[0]?.currency ?? "NGN",
      status: del.status, accepted: !!del.acceptedAt, partner: db.riders.find((r) => r.id === del.riderId)?.name ?? del.courier,
    };
  })();

  useEffect(() => {
    if (practice || live !== null) return;
    fetch(`${FN}/${token}`).then((r) => (r.ok ? r.json() : "none")).then(setLive).catch(() => setLive("none"));
  }, [token, practice, live]);

  const v = practice ?? (live && live !== "none" ? live : null);
  useEffect(() => { if (v && cash === "") setCash(String(v.collect)); }, [v, cash]);
  const money = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: v?.currency ?? "NGN", maximumFractionDigits: 0 }).format(n);

  const act = async (action: "accept" | "delivered" | "failed") => {
    setError("");
    const opts = action === "delivered" ? { cash: Number(cash.replace(/\D/g, "")) || 0 } : action === "failed" ? { reason } : {};
    if (practice) {
      if (!partnerAction(token, action, opts)) return setError("This delivery is already closed.");
    } else {
      const r = await fetch(`${FN}/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...opts }) }).catch(() => null);
      const d = await r?.json().catch(() => null);
      if (!r?.ok) return setError(d?.error ?? "Couldn't save — check your data and try again.");
      setLive(null);
    }
    setFailing(false);
    setDone(action === "accept" ? "Accepted — the business can see you're on it." : action === "delivered" ? "Marked delivered. Thank you!" : "Saved. The business will rebook with the customer.");
  };

  if (!v) {
    if (live === "none") return <main className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-xl font-semibold">This delivery link isn't valid</h1><p className="mt-1 text-sm text-muted-foreground">It may have been sent to someone else. Ask the business for a new link.</p></div></main>;
    return <main className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" /></main>;
  }
  const closed = ["delivered", "returned"].includes(v.status);
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{v.business} · for {v.partner}</p>
        <h1 className="text-2xl font-bold">Delivery {v.ref}</h1>
        <p className="text-sm text-muted-foreground">{closed ? `Closed — ${v.status}` : v.accepted ? "You've accepted this delivery" : "Please accept if you're taking it"}</p>
      </header>
      <section className="space-y-2 rounded-xl border p-4 text-sm">
        <p className="text-base font-semibold">{v.customer}</p>
        <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {v.address}</p>
        {v.items.length > 0 && <p className="text-muted-foreground">{v.items.join(", ")}</p>}
        <p className="text-lg font-bold" data-testid="collect">{closed ? "Done — thank you" : v.collect > 0 ? `Collect ${money(v.collect)}` : "Paid — collect nothing"}</p>
        {v.phone && <Button asChild variant="outline" className="w-full"><a href={`tel:+${phoneDigits(v.phone)}`}><Phone className="size-4" /> Call {v.customer.split(" ")[0]}</a></Button>}
      </section>
      {done && <p role="status" className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-sm text-success"><CheckCircle2 className="size-4" /> {done}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!closed && (
        <div className="space-y-3">
          {!v.accepted && <Button className="w-full" size="lg" onClick={() => act("accept")}>Accept delivery</Button>}
          <div className="space-y-1.5"><Label htmlFor="cash">Cash collected</Label><Input id="cash" inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value)} /></div>
          <Button className="w-full" size="lg" variant={v.accepted ? "default" : "secondary"} onClick={() => act("delivered")}>Delivered</Button>
          {failing ? (
            <div className="space-y-2 rounded-md border p-3">
              <Select value={reason} onValueChange={setReason}><SelectTrigger aria-label="Reason"><SelectValue>{reason}</SelectValue></SelectTrigger><SelectContent>{REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
              <Button className="w-full" variant="destructive" onClick={() => act("failed")}>Save — couldn't deliver</Button>
            </div>
          ) : <Button className="w-full" variant="ghost" onClick={() => setFailing(true)}>Couldn't deliver</Button>}
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">This private link only works for this delivery. Don't forward it.</p>
    </main>
  );
}
