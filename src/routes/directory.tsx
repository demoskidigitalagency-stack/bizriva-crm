/**
 * Seller directory — bizriva-crm.vercel.app/directory. Businesses that chose to be listed
 * (Store → Public store → List me in the directory), searchable by product and filtered by
 * category and city. Reads only public_directory().
 */
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/directory")({
  head: () => ({ meta: [{ title: "Seller directory · Bizriva" }, { name: "description", content: "Find trusted sellers by category and city, and order on WhatsApp." }] }),
  component: Directory,
});

interface Seller { slug: string; name: string; tagline: string | null; category: string | null; city: string | null; products: number; rating: number | null; reviews: number }

function Directory() {
  const [list, setList] = useState<Seller[] | null>(null);
  const [f, setF] = useState({ q: "", category: "", city: "" });
  const [all, setAll] = useState<Seller[]>([]);
  useEffect(() => {
    const sb = supabase();
    if (!sb) { setList([]); return; }
    const t = setTimeout(() => {
      void sb.rpc("public_directory", { p_category: f.category || null, p_city: f.city || null, p_q: f.q || null }).then(({ data }) => {
        const rows = (data as Seller[] | null) ?? [];
        setList(rows);
        if (!f.q && !f.category && !f.city) setAll(rows);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [f]);
  const opts = (k: "category" | "city") => [...new Set(all.map((s) => s[k]).filter(Boolean) as string[])].sort();
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <header><h1 className="text-3xl font-bold">Seller directory</h1><p className="text-muted-foreground">Businesses on Bizriva that chose to be listed. Order from them directly on WhatsApp.</p></header>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <input aria-label="Search" placeholder="What are you looking for?" className="h-10 rounded-md border bg-background px-3 text-sm" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select aria-label="Category" className="h-10 rounded-md border bg-background px-2 text-sm" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All categories</option>{opts("category").map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="City" className="h-10 rounded-md border bg-background px-2 text-sm" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}><option value="">All cities</option>{opts("city").map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      {list === null ? <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" /> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <li key={s.slug}>
              <Link to="/s/$slug" params={{ slug: s.slug }} className="block h-full space-y-1 rounded-lg border p-4 hover:border-primary">
                <p className="font-semibold">{s.name}</p>
                {s.tagline && <p className="line-clamp-2 text-sm text-muted-foreground">{s.tagline}</p>}
                <p className="text-xs text-muted-foreground">{[s.category, s.city, `${s.products} product${s.products === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</p>
                {s.reviews > 0 && <p className="flex items-center gap-1 text-xs"><Star className="size-3.5 fill-amber-500 text-amber-500" /> {s.rating} ({s.reviews} on Google)</p>}
              </Link>
            </li>
          ))}
          {!list.length && <li className="text-sm text-muted-foreground">No sellers match yet.</li>}
        </ul>
      )}
      <footer className="border-t pt-4 text-xs text-muted-foreground">Sell on WhatsApp? <Link to="/welcome" className="underline">Get your Bizriva store</Link></footer>
    </main>
  );
}
