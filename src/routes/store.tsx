import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/store")({
  head: () => ({ meta: [{ title: "Store · Bizriva CRM" }] }),
  component: Store,
});

function Store() {
  const db = useDb();
  const ws = useWorkspace();
  const { updateSettings } = useActions();
  const s = db.settings;
  const [slug, setSlug] = useState(s.storeSlug);
  const [cart, setCart] = useState<string[]>([]);
  const valid = /^[a-z0-9-]{3,30}$/.test(slug);
  const items = db.products.filter((p) => p.stock > 0 && p.active !== false);
  const photo = (id: string) => db.media.find((m) => m.productId === id && m.url)?.url;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Commerce</p>
        <h1 className="text-2xl font-bold">Store</h1>
        <p className="mt-1 text-sm text-muted-foreground">A simple shop page built from your catalogue. Orders from it land in Orders like any other. Publishing it on the web comes with the backend.</p>
      </div>

      <Section title="Store settings">
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <label className="flex items-center gap-3 text-sm"><Switch checked={s.storeEnabled} onCheckedChange={(v) => updateSettings({ storeEnabled: v })} /> Store switched on {s.storeEnabled ? <StatusBadge tone="info">Practice only</StatusBadge> : null}</label>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Store address</Label>
            <div className="flex gap-2">
              <span className="flex items-center rounded-md border bg-muted px-2 text-xs text-muted-foreground">bizriva.shop/</span>
              <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} aria-invalid={!valid} />
              <Button size="sm" disabled={!valid || slug === s.storeSlug} onClick={() => updateSettings({ storeSlug: slug })}>Save</Button>
            </div>
            {!valid && <p className="text-xs text-destructive">3–30 lowercase letters, numbers or dashes.</p>}
          </div>
        </div>
      </Section>

      <Section title="Preview" description={`What customers would see at bizriva.shop/${s.storeSlug}`} action={<StatusBadge tone="brand">{cart.length} in bag</StatusBadge>}>
        <div className="bg-surface p-4">
          <div className="mx-auto max-w-4xl rounded-xl border bg-background p-4">
            <div className="flex items-center justify-between border-b pb-3">
              <p className="text-lg font-bold">{s.businessName}</p>
              <span className="flex items-center gap-1.5 text-sm"><ShoppingBag className="size-4" aria-hidden="true" /> {cart.length}</span>
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {items.map((p) => (
                <li key={p.id} className="overflow-hidden rounded-lg border">
                  <div className="grid aspect-square place-items-center bg-muted text-xs text-muted-foreground">
                    {photo(p.id) ? <img src={photo(p.id)} alt={p.name} className="size-full object-cover" /> : "Add a photo in Media Library"}
                  </div>
                  <div className="p-2 text-sm">
                    <p className="line-clamp-2 font-medium">{p.name}</p>
                    <p className="num mt-1 font-semibold">{formatCurrency(p.price, ws.currency)}</p>
                    <Button size="sm" className="mt-2 h-7 w-full text-xs" onClick={() => setCart((c) => [...c, p.id])}>Add to bag</Button>
                  </div>
                </li>
              ))}
            </ul>
            {cart.length > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-lg bg-muted p-3 text-sm">
                <span>{cart.length} item{cart.length > 1 ? "s" : ""} · <span className="num font-semibold">{formatCurrency(cart.reduce((sum, id) => sum + (db.products.find((p) => p.id === id)?.price ?? 0), 0), ws.currency)}</span></span>
                <Button size="sm" variant="outline" onClick={() => setCart([])}>Clear preview bag</Button>
              </div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
