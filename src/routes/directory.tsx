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
      <BuyerRequests />
      <footer className="border-t pt-4 text-xs text-muted-foreground">Sell on WhatsApp? <Link to="/welcome" className="underline">Get your Bizriva store</Link></footer>
    </main>
  );
}

interface Req { what: string; city: string | null; category: string | null; budget: string | null; at: string }

/** "Can't find it?" — buyers post what they want; sellers in the directory near them reply on WhatsApp. */
function BuyerRequests() {
  const [list, setList] = useState<Req[]>([]);
  const [f, setF] = useState({ what: "", city: "", category: "", budget: "", name: "", phone: "", ok: false });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => void supabase()?.rpc("public_buyer_requests", { p_q: null }).then(({ data }) => setList((data as Req[]) ?? []));
  useEffect(load, []);
  const post = async () => {
    setMsg("");
    if (!f.ok) return setMsg("Tick the box so sellers can message you.");
    setBusy(true);
    const { data, error } = await supabase()!.rpc("post_buyer_request", { p_what: f.what, p_city: f.city, p_category: f.category, p_budget: f.budget, p_name: f.name, p_phone: f.phone });
    setBusy(false);
    const r = data as { ok: boolean; error?: string } | null;
    if (error || !r?.ok) return setMsg(error?.message ?? r?.error ?? "Couldn't post — try again.");
    setF({ what: "", city: "", category: "", budget: "", name: "", phone: "", ok: false });
    setMsg("Posted. Sellers near you will message you on WhatsApp."); load();
  };
  const ago = (iso: string) => { const h = Math.round((Date.now() - +new Date(iso)) / 3600000); return h < 1 ? "just now" : h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`; };
  const input = "h-10 rounded-md border bg-background px-3 text-sm";
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Buyer requests">
      <h2 className="text-xl font-semibold">Can't find it? Post what you want</h2>
      <p className="text-sm text-muted-foreground">Sellers near you get your request and reply on WhatsApp. Your number is only shown to sellers listed here.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label="What do you want to buy" className={`${input} sm:col-span-2`} placeholder="What do you want? e.g. 6ft snooker table" value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} />
        <input aria-label="City" className={input} placeholder="Your city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <input aria-label="Category" className={input} placeholder="Category (optional)" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
        <input aria-label="Budget" className={input} placeholder="Budget (optional)" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
        <input aria-label="Your name" className={input} placeholder="Your name (optional)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input aria-label="WhatsApp number" inputMode="tel" className={`${input} sm:col-span-2`} placeholder="WhatsApp number with country code" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <label className="flex items-start gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={f.ok} onChange={(e) => setF({ ...f, ok: e.target.checked })} /> Sellers listed in this directory may message me on WhatsApp about this request (for 14 days).</label>
      </div>
      <button type="button" disabled={busy} onClick={() => void post()} className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Posting…" : "Post request"}</button>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {list.length > 0 && (
        <ul className="divide-y text-sm">
          {list.slice(0, 12).map((r, i) => <li key={i} className="py-2"><b>{r.what}</b> <span className="text-muted-foreground">· {[r.city, r.category, r.budget && `budget ${r.budget}`].filter(Boolean).join(" · ")} · {ago(r.at)}</span></li>)}
        </ul>
      )}
    </section>
  );
}
