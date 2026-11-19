/**
 * Message to order — paste (or pick) a chat message, check the draft orders Bizriva read from it,
 * create them in one click. Reading is rules only (src/lib/message-order.ts); nothing is created
 * until the owner presses Create.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDb, useLive, useWorkspace } from "@/domain/store";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import { dialFor, draftCurrency, messageToOrders, priceIn, type DraftOrder } from "@/lib/message-order";
import type { CurrencyCode } from "@/lib/format";

export function MessageToOrderDialog({ open, onOpenChange, message = "", fromContactId, senderName }: {
  open: boolean; onOpenChange: (o: boolean) => void; message?: string; fromContactId?: string; senderName?: string;
}) {
  const db = useDb();
  const live = useLive();
  const ws = useWorkspace();
  const { current } = useAuth();
  const [text, setText] = useState(message);
  const [drafts, setDrafts] = useState<DraftOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const products = useMemo(() => db.products.filter((p) => p.active !== false).map((p) => ({ id: p.id, name: p.name, price: p.price, aliases: p.aliases ?? [], ...(p.prices ? { prices: p.prices } : {}) })), [db.products]);
  const dial = dialFor(ws.currency);
  // Each draft is priced in the customer's currency (from their phone), like the server does.
  const curOf = (d: DraftOrder) => draftCurrency(d, ws.currency, products);
  const totalOf = (d: DraftOrder) => { const c = curOf(d); return d.items.reduce((n, i) => { const p = products.find((x) => x.id === i.productId); return n + (p ? (priceIn(p, c, ws.currency) ?? 0) : 0) * i.qty; }, 0); };

  const read = (t: string) => setDrafts(messageToOrders(t, products, { dial, ...(senderName ? { senderName } : {}) }));
  useEffect(() => { if (open) { setText(message); read(message); } }, [open, message]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (i: number, p: Partial<DraftOrder>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const ready = drafts.filter((d) => d.items.length && (d.phone || fromContactId));

  const create = async () => {
    const sb = supabase();
    if (!live.on || !sb || !current?.workspaceId) { toast.info("Message to order creates real orders once your business is live."); return; }
    setBusy(true);
    let made = 0; const failed: string[] = [];
    for (const d of ready) {
      const { error } = await sb.rpc("create_order_from_message", { p_workspace: current.workspaceId, p_draft: {
        name: d.name, phone: d.phone, town: d.town, deposit: d.deposit, text: d.text, from_contact: fromContactId ?? null,
        delivery_fee: 0, items: d.items.map((i) => ({ product_id: i.productId, qty: i.qty })),
      } });
      if (error) failed.push(`${d.name || d.phone}: ${error.message}`); else made++;
    }
    setBusy(false);
    await live.reload();
    if (made) toast.success(`${made} order${made === 1 ? "" : "s"} created — they're waiting for confirmation in Orders.`);
    if (failed.length) toast.error(failed.join(" · ")); else onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Message to order</DialogTitle>
          <DialogDescription>Bizriva reads the products (by name, the other names you gave them, or the price you quoted), quantities, names, phones, towns and deposits. Check each draft, then create.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="m2o">Message</Label>
          <Textarea id="m2o" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"2 table tennis for Kofi, Kumasi 0241234567, deposit 1,000\n— or paste an agent's list, one customer per line"} />
          <Button size="sm" variant="outline" onClick={() => read(text)}>Read message</Button>
        </div>
        {drafts.length > 0 && <ul className="space-y-3">
          {drafts.map((d, i) => (
            <li key={i} className="space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-xs text-muted-foreground">{d.text}</p>
                <Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label="Remove this draft" onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <Input aria-label="Customer name" value={d.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Name" />
                <Input aria-label="Phone" value={d.phone} onChange={(e) => patch(i, { phone: e.target.value.replace(/[^\d+]/g, "") })} placeholder={fromContactId ? "Phone (this chat if empty)" : "Phone"} />
                <Input aria-label="Town" value={d.town} onChange={(e) => patch(i, { town: e.target.value })} placeholder="Town" />
                <Input aria-label="Deposit" inputMode="numeric" value={d.deposit || ""} onChange={(e) => patch(i, { deposit: Number(e.target.value.replace(/\D/g, "")) || 0 })} placeholder="Deposit" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {d.items.map((it, k) => (
                  <span key={k} className="flex items-center gap-1 rounded-md border px-2 py-1">
                    <select aria-label="Product" className="bg-transparent text-sm" value={it.productId} onChange={(e) => patch(i, { items: d.items.map((x, z) => (z === k ? { ...x, productId: e.target.value } : x)) })}>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input aria-label="Quantity" type="number" min={1} max={500} className="w-12 bg-transparent text-right" value={it.qty} onChange={(e) => patch(i, { items: d.items.map((x, z) => (z === k ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)) })} />
                    <button type="button" aria-label="Remove product" className="text-muted-foreground" onClick={() => patch(i, { items: d.items.filter((_, z) => z !== k) })}>×</button>
                  </span>
                ))}
                {products.length > 0 && <Button size="sm" variant="ghost" onClick={() => patch(i, { items: [...d.items, { productId: products[0]!.id, qty: 1 }] })}>+ Product</Button>}
                <span className="ml-auto font-semibold">{formatCurrency(totalOf(d), curOf(d) as CurrencyCode)}</span>
              </div>
              {!d.items.length && <p className="text-xs text-amber-700 dark:text-amber-400">No product found — add one, or give the product another name in Products.</p>}
              {!d.phone && !fromContactId && <p className="text-xs text-amber-700 dark:text-amber-400">Add the customer's phone.</p>}
              {d.payOnDelivery && <p className="text-xs text-muted-foreground">Customer asked to pay on delivery.</p>}
            </li>
          ))}
        </ul>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !ready.length} onClick={() => void create()}>{busy ? "Creating…" : `Create ${ready.length || ""} order${ready.length === 1 ? "" : "s"}`.replace("  ", " ")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
