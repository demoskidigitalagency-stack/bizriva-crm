import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EmptyState, KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import type { Product, StockMovement } from "@/domain/types";
import { formatCurrency, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [{ title: "Inventory · Bizriva CRM" }] }),
  component: Inventory,
});

const REASONS: { id: StockMovement["reason"]; label: string; sign: 1 | -1 }[] = [
  { id: "restock", label: "Restock from supplier", sign: 1 },
  { id: "return", label: "Customer return", sign: 1 },
  { id: "adjustment", label: "Count correction", sign: 1 },
  { id: "damaged", label: "Damaged or lost", sign: -1 },
  { id: "sale", label: "Sold offline", sign: -1 },
];

function AdjustDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const { moveStock } = useActions();
  const [reason, setReason] = useState<StockMovement["reason"]>("restock");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const r = REASONS.find((x) => x.id === reason)!;
  const save = () => {
    const n = Math.round(Number(qty));
    if (!n || n < 0) return setError("Enter how many units, as a positive number.");
    if (r.sign < 0 && n > product.stock) return setError(`Only ${product.stock} in stock.`);
    moveStock(product.id, n * r.sign, reason, note.trim() || undefined);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Adjust stock</DialogTitle><DialogDescription>{product.name} · {product.stock} in stock now</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as StockMovement["reason"])}>
              <SelectTrigger aria-label="Reason"><SelectValue>{r.label}</SelectValue></SelectTrigger>
              <SelectContent>{REASONS.map((x) => <SelectItem key={x.id} value={x.id}>{x.label} ({x.sign > 0 ? "adds" : "removes"})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="q">Units</Label><Input id="q" inputMode="numeric" value={qty} onChange={(e) => { setQty(e.target.value); setError(""); }} /></div>
          <div className="space-y-1.5"><Label htmlFor="n">Note (optional)</Label><Input id="n" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier batch #, reason" /></div>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Inventory() {
  const db = useDb();
  const ws = useWorkspace();
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const low = db.products.filter((p) => p.stock <= p.reorderLevel).sort((a, b) => a.stock / Math.max(1, a.reorderLevel) - b.stock / Math.max(1, b.reorderLevel));
  const units = db.products.reduce((s, p) => s + p.stock, 0);
  const atCost = db.products.reduce((s, p) => s + p.stock * p.cost, 0);
  const atPrice = db.products.reduce((s, p) => s + p.stock * p.price, 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Commerce</p>
        <h1 className="text-2xl font-bold">Inventory</h1>
        <p className="mt-1 text-sm text-muted-foreground">Stock on hand, what to reorder and every movement in or out. Prices and product details live in <Link to="/products" className="underline">Products</Link>.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Units in stock" value={String(units)} />
        <KpiCard label="Need reordering" value={String(low.length)} tone={low.length ? "warning" : "success"} />
        <KpiCard label="Stock value at cost" value={formatCurrency(atCost, ws.currency, { compact: true })} tone="info" />
        <KpiCard label="Stock value at price" value={formatCurrency(atPrice, ws.currency, { compact: true })} tone="success" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Reorder list" description="At or below the reorder level, lowest first">
          {low.length === 0 ? <EmptyState title="Nothing to reorder" /> : (
            <ul className="divide-y">
              {low.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span><span className="text-xs text-muted-foreground">Reorder at {p.reorderLevel} · suggest ordering {Math.max(p.reorderLevel * 2 - p.stock, 1)}</span></span>
                  <StatusBadge tone={p.stock === 0 ? "danger" : "warning"}>{p.stock} left</StatusBadge>
                  <Button size="sm" variant="outline" onClick={() => setAdjusting(p)}>Restock</Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Stock movements" description="Most recent first">
          {db.stockMovements.length === 0 ? <EmptyState title="No movements yet" /> : (
            <ul className="max-h-96 divide-y overflow-y-auto">
              {db.stockMovements.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={`num w-12 font-semibold ${m.delta > 0 ? "text-success" : "text-destructive"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate">{db.products.find((p) => p.id === m.productId)?.name ?? "Removed product"}</span><span className="text-xs text-muted-foreground">{REASONS.find((r) => r.id === m.reason)?.label}{m.note ? ` · ${m.note}` : ""}</span></span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(m.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <Section title="All stock">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2 text-right">In stock</th><th className="px-4 py-2 text-right">Reorder at</th><th className="px-4 py-2 text-right">Value at cost</th><th className="px-4 py-2" /></tr></thead>
            <tbody className="divide-y">
              {db.products.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="num px-4 py-2 text-right">{p.stock}</td>
                  <td className="num px-4 py-2 text-right text-muted-foreground">{p.reorderLevel}</td>
                  <td className="num px-4 py-2 text-right">{formatCurrency(p.stock * p.cost, ws.currency)}</td>
                  <td className="px-4 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => setAdjusting(p)}>Adjust</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      {adjusting && <AdjustDialog product={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  );
}
