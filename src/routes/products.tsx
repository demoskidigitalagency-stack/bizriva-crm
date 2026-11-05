import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Minus, Pencil, Plus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import type { Product } from "@/domain/types";
import { CARE_STARTERS } from "@/domain/receipt";
import { formatCurrency, formatPercent } from "@/lib/format";

export const Route = createFileRoute("/products")({
  // ?p=<productId> opens that product's editor (used by search).
  validateSearch: (s: Record<string, unknown>): { p?: string } => (typeof s["p"] === "string" ? { p: s["p"] } : {}),
  head: () => ({ meta: [{ title: "Products · Bizriva CRM" }] }),
  component: Products,
});

type Draft = { id?: string; name: string; category: string; price: string; cost: string; stock: string; reorderLevel: string; description: string; active: boolean; deposit: string; careGuide: string };
const toDraft = (p?: Product): Draft => ({
  ...(p ? { id: p.id } : {}),
  name: p?.name ?? "", category: p?.category ?? "", price: p ? String(p.price) : "", cost: p ? String(p.cost) : "",
  stock: p ? String(p.stock) : "0", reorderLevel: p ? String(p.reorderLevel) : "5",
  description: p?.description ?? "", active: p?.active !== false, deposit: p?.deposit ? String(p.deposit) : "", careGuide: p?.careGuide ?? "",
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
    const deposit = d.deposit.trim() ? num(d.deposit) : 0;
    if (Number.isNaN(deposit) || deposit < 0 || deposit > num(d.price)) return setError("Deposit must be between 0 and the selling price.");
    saveProduct({ ...(d.id ? { id: d.id } : {}), name: d.name.trim(), category: d.category.trim() || "General", price: num(d.price), cost: num(d.cost) || 0, stock: Math.max(0, Math.round(num(d.stock) || 0)), reorderLevel: Math.max(0, Math.round(num(d.reorderLevel) || 0)), description: d.description.trim(), active: d.active, deposit, careGuide: d.careGuide.trim() });
    onOpenChange(false);
  };
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => { setD((x) => ({ ...x, [k]: e.target.value })); setError(""); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "New product"}</DialogTitle>
          <DialogDescription>Prices here are what the AI agent and sales staff quote. Photos are added in the Media Library.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pn">Name</Label><Input id="pn" value={d.name} onChange={set("name")} placeholder="Brazilian body wave, 20 inch" /></div>
          <div className="space-y-1.5"><Label htmlFor="pc">Category</Label><Input id="pc" value={d.category} onChange={set("category")} placeholder="Hair" /></div>
          <div className="space-y-1.5"><Label htmlFor="pp">Selling price</Label><Input id="pp" inputMode="decimal" value={d.price} onChange={set("price")} placeholder="45000" /></div>
          <div className="space-y-1.5"><Label htmlFor="pco">Cost</Label><Input id="pco" inputMode="decimal" value={d.cost} onChange={set("cost")} placeholder="28000" /></div>
          <div className="space-y-1.5"><Label htmlFor="ps">In stock</Label><Input id="ps" inputMode="numeric" value={d.stock} onChange={set("stock")} /></div>
          <div className="space-y-1.5"><Label htmlFor="pr">Reorder at</Label><Input id="pr" inputMode="numeric" value={d.reorderLevel} onChange={set("reorderLevel")} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pd">Description (the AI agent and product cards use it)</Label><Textarea id="pd" rows={2} value={d.description} onChange={(e) => { setD((x) => ({ ...x, description: e.target.value })); setError(""); }} /></div>
          <div className="space-y-1.5"><Label htmlFor="pdep">Deposit to book (optional)</Label><Input id="pdep" inputMode="decimal" value={d.deposit} onChange={set("deposit")} placeholder="0 = pure cash on delivery" /></div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><Switch checked={d.active} onCheckedChange={(v) => setD((x) => ({ ...x, active: v }))} aria-label="Visible" /> Visible to customers and the AI agent</label>
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between gap-2"><Label htmlFor="pcare">How to use and care (sent after delivery)</Label>
              {!d.careGuide && CARE_STARTERS[d.category] && <button type="button" className="text-xs text-primary underline" onClick={() => setD((x) => ({ ...x, careGuide: CARE_STARTERS[x.category] ?? "" }))}>Use the {d.category} starter</button>}
            </div>
            <Textarea id="pcare" rows={4} value={d.careGuide} onChange={(e) => setD((x) => ({ ...x, careGuide: e.target.value }))} placeholder="1. Wash before first use… 2. Store on a stand…" />
          </div>
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

/** Minimal CSV parser: quoted fields, commas inside quotes, header row. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some((c) => c.trim())) rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const SAMPLE_CSV = "name,category,price,cost,stock,description\nBody Wave 22\",Hair Bundles,210000,120000,15,\"Double drawn, 22 inches\"\nEdge Control 100ml,Hair Care,6500,2800,60,Strong hold without flakes";

function ImportProducts({ onClose }: { onClose: () => void }) {
  const { importProducts } = useActions();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ ok: Omit<Product, "id">[]; bad: number } | null>(null);
  const [done, setDone] = useState(0);
  const parse = (raw: string) => {
    const rows = parseCsv(raw);
    const [head, ...body] = rows;
    if (!head) return setResult({ ok: [], bad: 0 });
    const idx = (k: string) => head.findIndex((h) => h.trim().toLowerCase() === k);
    const col = { name: idx("name"), category: idx("category"), price: idx("price"), cost: idx("cost"), stock: idx("stock"), description: idx("description") };
    const ok: Omit<Product, "id">[] = [];
    let bad = 0;
    body.forEach((r) => {
      const name = (r[col.name] ?? "").trim();
      const price = Number((r[col.price] ?? "").replace(/[^\d.]/g, ""));
      if (!name || !(price > 0)) { bad++; return; }
      ok.push({ name, category: (r[col.category] ?? "").trim() || "Uncategorised", price, cost: Number((r[col.cost] ?? "").replace(/[^\d.]/g, "")) || 0, stock: Number(r[col.stock] ?? 0) || 0, reorderLevel: 5, description: (r[col.description] ?? "").trim(), active: true });
    });
    setResult({ ok, bad });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Import products from CSV</DialogTitle><DialogDescription>Columns: name, category, price, cost, stock, description. Name and price are required. Export a CSV from Excel, Google Sheets, Shopify or WooCommerce.</DialogDescription></DialogHeader>
        {done ? (
          <p className="text-sm text-success" role="status">{done} product{done === 1 ? "" : "s"} added to the catalogue.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <Input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const t = await f.text(); setText(t); parse(t); } }} />
            <Textarea rows={5} aria-label="CSV text" placeholder="…or paste CSV here" value={text} onChange={(e) => { setText(e.target.value); parse(e.target.value); }} />
            <Button size="sm" variant="ghost" className="px-0" onClick={() => { setText(SAMPLE_CSV); parse(SAMPLE_CSV); }}>Use a sample</Button>
            {result && <p className={result.ok.length ? "" : "text-destructive"}>{result.ok.length} ready to import{result.bad ? `, ${result.bad} skipped (missing name or price)` : ""}.</p>}
            {result && result.ok.length > 0 && <ul className="max-h-32 overflow-y-auto rounded border p-2 text-xs">{result.ok.map((p) => <li key={p.name}>{p.name} · {p.category} · {p.price}</li>)}</ul>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{done ? "Close" : "Cancel"}</Button>
          {!done && <Button disabled={!result?.ok.length} onClick={() => setDone(importProducts(result!.ok))}>Import {result?.ok.length ?? 0}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Products() {
  const [importing, setImporting] = useState(false);
  const db = useDb();
  const ws = useWorkspace();
  const { moveStock } = useActions();
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
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setImporting(true)}><Upload className="size-4" /> Import CSV</Button>
          <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" /> New product</Button>
        </div>
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
                      <td className="px-3 py-2"><span className="block font-medium">{p.name} {p.active === false && <StatusBadge>Hidden</StatusBadge>}</span><span className="block text-xs text-muted-foreground">{p.category}{p.deposit ? ` · deposit ${money(p.deposit)}` : ""}</span></td>
                      <td className="num px-3 py-2 text-right">{money(p.price)}</td>
                      <td className="num px-3 py-2 text-right text-muted-foreground">{money(p.cost)}</td>
                      <td className="num px-3 py-2 text-right">{formatPercent(margin)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Button variant="outline" size="icon" className="size-7" onClick={() => moveStock(p.id, -1, "adjustment", "Quick adjust from Products")} disabled={p.stock === 0} aria-label={`Remove one ${p.name}`}><Minus className="size-3" /></Button>
                          <span className="num w-8 text-center">{p.stock}</span>
                          <Button variant="outline" size="icon" className="size-7" onClick={() => moveStock(p.id, 1, "adjustment", "Quick adjust from Products")} aria-label={`Add one ${p.name}`}><Plus className="size-3" /></Button>
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
      {importing && <ImportProducts onClose={() => setImporting(false)} />}
    </div>
  );
}
