/** Real data: send a payment link for one of this customer's unpaid orders into the chat. */
import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDb, useLive, useWorkspace } from "@/domain/store";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";

export function LivePaymentLink({ conversationId }: { conversationId: string }) {
  const db = useDb();
  const ws = useWorkspace();
  const live = useLive();
  const conv = db.conversations.find((c) => c.id === conversationId);
  const owing = db.orders.filter((o) => o.contactId === conv?.contactId && !["cancelled", "returned", "refused"].includes(o.status) && o.total - (o.amountPaid ?? 0) > 0);
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ url?: string; error?: string }>({});
  const pick = orderId || owing[0]?.id || "";
  const send = async () => {
    const sb = supabase(); if (!sb || !pick) return;
    setBusy(true); setRes({});
    const { data, error } = await sb.functions.invoke("payment-link", { body: { order_id: pick } });
    let msg: string | undefined;
    if (error) {
      // deno function errors come back with a JSON body
      try { msg = (await (error as { context?: Response }).context?.json())?.error; } catch { /* ignore */ }
      msg = msg ?? error.message;
    }
    setBusy(false);
    if (msg) return setRes({ error: msg });
    setRes({ url: (data as { url?: string })?.url ?? "" });
    await live.reload();
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setRes({}); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" aria-label="Request payment"><CreditCard className="size-4" /><span className="hidden sm:inline">Payment</span></Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-3 text-xs">
        <p className="text-sm font-semibold">Send a payment link</p>
        {owing.length === 0 ? <p className="text-muted-foreground">This customer has no unpaid orders.</p> : (
          <>
            <label className="block space-y-1"><span className="text-muted-foreground">Order</span>
              <select className="w-full rounded border bg-background px-2 py-1.5" value={pick} onChange={(e) => setOrderId(e.target.value)} aria-label="Order to pay">
                {owing.map((o) => <option key={o.id} value={o.id}>{o.reference} · {formatCurrency(o.total - (o.amountPaid ?? 0), ws.currency)} to pay</option>)}
              </select>
            </label>
            <Button size="sm" className="w-full" disabled={busy} onClick={() => void send()}>{busy ? "Creating link…" : "Send link in chat"}</Button>
          </>
        )}
        {res.error && <p className="text-destructive" role="alert">{res.error}{/Connect/.test(res.error) && <> — <Link to="/payments" className="underline">Payments</Link></>}</p>}
        {res.url && <p className="break-all text-success" role="status">Link sent in the chat: {res.url}</p>}
        <p className="text-muted-foreground">The customer pays by card, transfer or USSD; the order is marked paid automatically.</p>
      </PopoverContent>
    </Popover>
  );
}
