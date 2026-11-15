/**
 * Public store page — bizriva-crm.vercel.app/s/<slug>. Shows the business's active products with
 * photos and prices, an order button that opens WhatsApp with the product named, its order
 * forms, and real Google reviews (each links back to Google). Reads only public_store().
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, MessageCircle, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/s/$slug")({
  head: () => ({ meta: [{ title: "Store · Bizriva" }] }),
  component: PublicStore,
});

interface StoreData {
  name: string; currency: string; tagline: string | null; category: string | null; city: string | null; google_url: string | null; whatsapp: string | null;
  products: { id: string; name: string; price: number; promo_price: number | null; description: string | null; category: string | null; image: string | null; digital: boolean }[];
  forms: { id: string; headline: string }[];
  reviews: { author: string; rating: number; body: string; url: string; date: string | null }[];
}

function Stars({ n }: { n: number }) {
  return <span className="inline-flex text-amber-500" aria-label={`${n} out of 5 stars`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`size-3.5 ${i <= Math.round(n) ? "fill-current" : "opacity-30"}`} />)}</span>;
}

function PublicStore() {
  const { slug } = Route.useParams();
  const [s, setS] = useState<StoreData | null | "missing">(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    const sb = supabase();
    if (!sb) { setS("missing"); return; }
    void sb.rpc("public_store", { p_slug: slug }).then(({ data }) => setS((data as StoreData | null) ?? "missing"));
  }, [slug]);
  const money = (n: number) => { try { return new Intl.NumberFormat("en", { style: "currency", currency: s && s !== "missing" ? s.currency : "NGN", maximumFractionDigits: 0 }).format(n); } catch { return String(n); } };
  const list = useMemo(() => (s && s !== "missing" ? s.products.filter((p) => !q.trim() || `${p.name} ${p.category ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) : []), [s, q]);
  if (s === null) return <main className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" /></main>;
  if (s === "missing") return <main className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-xl font-semibold">This store isn't open</h1><p className="mt-1 text-sm text-muted-foreground"><Link to="/directory" className="underline">Browse other stores</Link></p></div></main>;
  const wa = (text: string) => (s.whatsapp ? `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(text)}` : null);
  const avg = s.reviews.length ? s.reviews.reduce((n, r) => n + r.rating, 0) / s.reviews.length : 0;
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{s.name}</h1>
        {s.tagline && <p className="text-muted-foreground">{s.tagline}</p>}
        <p className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {[s.category, s.city].filter(Boolean).join(" · ")}
          {s.reviews.length > 0 && <a href="#reviews" className="inline-flex items-center gap-1"><Stars n={avg} /> {avg.toFixed(1)} ({s.reviews.length} on Google)</a>}
        </p>
        <div className="flex flex-wrap gap-2">
          {wa("Hello, I'd like to order") && <a href={wa("Hello, I'd like to order")!} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"><MessageCircle className="size-4" /> Chat on WhatsApp</a>}
          {s.forms.slice(0, 2).map((f) => <a key={f.id} href={`/f/${f.id}`} className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium">{f.headline}</a>)}
        </div>
      </header>
      {s.products.length > 6 && <input aria-label="Search products" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" />}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Products">
        {list.map((p) => (
          <article key={p.id} className="flex flex-col overflow-hidden rounded-lg border">
            {p.image ? <img src={p.image} alt={p.name} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center bg-muted text-3xl font-bold text-muted-foreground">{p.name.slice(0, 1)}</div>}
            <div className="flex flex-1 flex-col gap-1 p-3">
              <h2 className="font-semibold">{p.name}</h2>
              {p.description && <p className="line-clamp-3 text-sm text-muted-foreground">{p.description}</p>}
              <p className="mt-auto pt-2 font-bold">{p.promo_price && p.promo_price < p.price ? <><span>{money(p.promo_price)}</span> <s className="text-sm font-normal text-muted-foreground">{money(p.price)}</s></> : money(p.price)}{p.digital && <span className="ml-2 text-xs font-normal text-muted-foreground">instant download</span>}</p>
              {wa(`Hello, I'd like to order: ${p.name}`) && <a href={wa(`Hello, I'd like to order: ${p.name}`)!} className="mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><MessageCircle className="size-4" /> Order on WhatsApp</a>}
            </div>
          </article>
        ))}
        {!list.length && <p className="text-sm text-muted-foreground">No products yet.</p>}
      </section>
      {s.reviews.length > 0 && (
        <section id="reviews" className="space-y-3" aria-label="Reviews">
          <h2 className="text-xl font-semibold">Reviews on Google</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {s.reviews.map((r, i) => (
              <li key={i} className="space-y-1 rounded-lg border p-3 text-sm">
                <p className="flex items-center justify-between gap-2"><span className="font-medium">{r.author}</span><Stars n={r.rating} /></p>
                <p className="text-muted-foreground">{r.body}</p>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline-offset-2 hover:underline">{r.date ? `${r.date} · ` : ""}See it on Google</a>
              </li>
            ))}
          </ul>
          {s.google_url && <a href={s.google_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline-offset-2 hover:underline">All reviews on Google</a>}
        </section>
      )}
      <footer className="border-t pt-4 text-xs text-muted-foreground">Store powered by Bizriva · <Link to="/directory" className="underline">More stores</Link></footer>
    </main>
  );
}
