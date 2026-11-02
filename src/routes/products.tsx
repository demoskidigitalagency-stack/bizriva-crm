import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Minus, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import type { Product } from "@/domain/types";
import { formatCurrency, formatPercent } from "@/lib/format";

export const Route = createFileRoute("/products")({
  // ?p=<productId> opens that product's editor (used by search).
  validateSearch: (s: Record<string, unknown>): { p?: string } => (typeof s["p"] === "string" ? { p: s["p"] } : {}),
  head: () => ({ meta: [{ title: "Products · Bizriva CRM" }] }),
  component: Products,
});

type Draft = { id?: string; name: string; category: string; price: string; cost: string; stock: string; reorderLevel: string };
const toDraft = (p?: Product): Draft => ({
  ...(p ? { id: p.id } : {}),
  name: p?.name ?? "", category: p?.category ?? "", price: p ? String(p.price) : "", cost: p ? String(p.cost) : "",
  stock: p ? String(p.stock) : "0", reorderLevel: p ? String(p.reorderLevel) : "5",
});

function ProductDialog({ product, open, onOpenChange }: { product?: Product | undefined; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { saveProduct } = useActions();
  const [d, setD] = useState<Draft>(toDraft(product));
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setD(toDraft(product)); setError(""); } }, [open, product]);

  const num = (v: string) => Number(v.replace(/,/g, ""));
  const submit = () => {
    if (!d.name.trim()) return setError("Enter a product name.");
    if (!(num(d.price) > 0)) return setError("Enter a selling price above zero.");
    if (Number.isNaN(num(d.cost)) || num(d.cost) < 0) return setError("Enter the cost, or 0 if you don't know it yet.");
    saveProduct({ ...(d.id ? { id: d.id } : {}), name: d.name.trim(), category: d.category.trim() || "General", price: num(d.price), cost: num(d.cost) || 0, stock: Math.max(0, Math.round(num(d.stock) || 0)), reorderLevel: Math.max(0, Math.round(num(d.reorderLevel) || 0)) });
    onOpenChange(false);
  };
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => { setD((x) => ({ ...x, [k]: e.target.value })); setError(""); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "New product"}</DialogTitle>
          <DialogDescription>Prices here are what the AI agent and sales staff quote. Variants, media and FAQs come with the Media Library.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pn">Name</Label><Input id="pn" value={d.name} onChange={set("name")} placeholder="Brazilian body wave, 20 inch" /></div>
          <div className="space-y-1.5"><Label htmlFor="pc">Category</Label><Input id="pc" value={d.category} onChange={set("category")} placeholder="Hair" /></div>
          <div className="space-y-1.5"><Label htmlFor="pp">Selling price</Label><Input id="pp" inputMode="decimal" value={d.price} onChange={set("price")} placeholder="45000" /></div>
          <div className="space-y-1.5"><Label htmlFor="pco">Cost</Label><Input id="pco" inputMode="decimal" value={d.cost} onChange={set("cost")} placeholder="28000" /></div>
          <div className="space-y-1.5"><Label htmlFor="ps">In stock</Label><Input id="ps" inputMode="numeric" value={d.stock} onChange={set("stock")} /></div>
          <div className="space-y-1.5"><Label htmlFor="pr">Reorder at</Label><Input id="pr" inputMode="numeric" value={d.reorderLevel} onChange={set("reorderLevel")} /></div>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>{product ? "Save changes" : "Add product"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Products() {
  const db = useDb();
  const ws = useWorkspace();
  const { adjustStock } = useActions();
  const { p: requested } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | "new" | null>(() => db.products.find((x) => x.id === requested) ?? null);
  const money = (n: number) => formatCurrency(n, ws.currency);

  const needle = search.trim().toLowerCase();
  const rows = db.products.filter((p) => !needle || `${p.name} ${p.category}`.toLowerCase().includes(needle));
  const low = db.products.filter((p) => p.stock <= p.reorderLevel);
  const stockValue = db.products.reduce((s, p) => s + p.cost * p.stock, 0);
  const avgMargin = db.products.length ? db.products.reduce((s, p) => s + (p.price ? (p.price - p.cost) / p.price : 0), 0) / db.products.length * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Commerce</p>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">The catalogue every price quote comes from — staff and the AI agent alike.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" /> New product</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Products" value={String(db.products.length)} />
        <KpiCard label="Low on stock" value={String(low.length)} tone={low.length ? "warning" : "success"} />
        <KpiCard label="Stock value at cost" value={formatCurrency(stockValue, ws.currency, { compact: true })} tone="info" />
        <KpiCard label="Average margin" value={formatPercent(avgMargin)} tone="success" />
      </div>

      <Section>
        <div className="border-b p-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Product or category" className="pl-8" aria-label="Search products" />
          </div>
        </div>
        {rows.length === 0 ? <EmptyState title="No products match" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Margin</th><th className="px-3 py-2">Stock</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((p) => {
                  const margin = p.price ? ((p.price - p.cost) / p.price) * 100 : 0;
                  return (
                    <tr key={p.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2"><span className="block font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{p.category}</span></td>
                      <td className="num px-3 py-2 text-right">{money(p.price)}</td>
                      <td className="num px-3 py-2 text-right text-muted-foreground">{money(p.cost)}</td>
                      <td className="num px-3 py-2 text-right">{formatPercent(margin)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Button variant="outline" size="icon" className="size-7" onClick={() => adjustStock(p.id, -1)} disabled={p.stock === 0} aria-label={`Remove one ${p.name}`}><Minus className="size-3" /></Button>
                          <span className="num w-8 text-center">{p.stock}</span>
                          <Button variant="outline" size="icon" className="size-7" onClick={() => adjustStock(p.id, 1)} aria-label={`Add one ${p.name}`}><Plus className="size-3" /></Button>
                          {p.stock <= p.reorderLevel && <StatusBadge tone={p.stock === 0 ? "danger" : "warning"}>{p.stock === 0 ? "Out" : "Low"}</StatusBadge>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right"><Button variant="ghost" size="sm" onClick={() => setEditing(p)}><Pencil className="size-3.5" /> Edit</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <ProductDialog product={editing && editing !== "new" ? editing : undefined} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
