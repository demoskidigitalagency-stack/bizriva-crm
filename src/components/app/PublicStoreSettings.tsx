/**
 * Store → your real public store page (/s/<slug>), the seller directory listing, and the Google
 * reviews shown on it. Reviews must be real: each one needs its Google link.
 */
import { useCallback, useEffect, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useDb } from "@/domain/store";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";

interface Page { slug: string; published: boolean; in_directory: boolean; tagline: string; category: string; city: string; whatsapp: string; google_url: string }
interface Review { id: string; author: string; rating: number; body: string; source_url: string; review_date: string | null; shown: boolean }
const GOOGLE = /^https:\/\/([a-z0-9-]+\.)*(google\.[a-z.]+|goo\.gl|g\.page)\//i;

export function PublicStoreSettings() {
  const db = useDb();
  const { current } = useAuth();
  const ws = current?.workspaceId;
  const [p, setP] = useState<Page | null>(null);
  const [exists, setExists] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [msg, setMsg] = useState("");
  const [r, setR] = useState({ author: "", rating: "5", body: "", url: "", date: "" });
  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const [{ data: page }, { data: rv }] = await Promise.all([
      sb.from("store_pages").select("*").eq("workspace_id", ws).maybeSingle(),
      sb.from("store_reviews").select("*").eq("workspace_id", ws).order("review_date", { ascending: false, nullsFirst: false }),
    ]);
    const base = db.settings.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "my-store";
    const row = page as Record<string, unknown> | null;
    setExists(!!row);
    setP({ slug: String(row?.["slug"] ?? base), published: !!row?.["published"], in_directory: !!row?.["in_directory"], tagline: String(row?.["tagline"] ?? ""), category: String(row?.["category"] ?? ""), city: String(row?.["city"] ?? ""), whatsapp: String(row?.["whatsapp"] ?? ""), google_url: String(row?.["google_url"] ?? "") });
    setReviews((rv ?? []) as Review[]);
  }, [ws, db.settings.businessName]);
  useEffect(() => { void load(); }, [load]);
  if (!p) return null;

  const url = `${typeof window === "undefined" ? "" : window.location.origin}/s/${p.slug}`;
  const save = async (patch: Partial<Page> = {}) => {
    const next = { ...p, ...patch };
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(next.slug)) { setMsg("Web address: 3–40 small letters, numbers or dashes."); return; }
    if (next.google_url && !/^https:\/\//.test(next.google_url)) { setMsg("The Google profile link must start with https://"); return; }
    const row = { workspace_id: ws, slug: next.slug, published: next.published, in_directory: next.in_directory, tagline: next.tagline.trim() || null, category: next.category.trim() || null,
      city: next.city.trim() || null, whatsapp: next.whatsapp.replace(/\D/g, "") || null, google_url: next.google_url.trim() || null, updated_at: new Date().toISOString() };
    const { error } = await supabase()!.from("store_pages").upsert(row, { onConflict: "workspace_id" });
    if (error) { setMsg(/duplicate|unique/i.test(error.message) ? "That web address is taken — try another." : error.message); return; }
    setP(next); setExists(true); setMsg("Saved.");
  };
  const addReview = async () => {
    if (!r.author.trim() || !r.body.trim()) { setMsg("Add the reviewer's name and what they wrote."); return; }
    if (!GOOGLE.test(r.url.trim())) { setMsg("Paste the review's link from Google (Google Maps → the review → Share). Only real Google reviews can be shown."); return; }
    const { error } = await supabase()!.from("store_reviews").insert({ workspace_id: ws, author: r.author.trim(), rating: Number(r.rating), body: r.body.trim(), source_url: r.url.trim(), review_date: r.date || null });
    if (error) { setMsg(error.message); return; }
    setR({ author: "", rating: "5", body: "", url: "", date: "" }); setMsg("Review added."); await load();
  };
  const toggle = async (x: Review) => { await supabase()!.from("store_reviews").update({ shown: !x.shown }).eq("id", x.id); await load(); };
  const remove = async (x: Review) => { await supabase()!.from("store_reviews").delete().eq("id", x.id); await load(); };
  const set = (k: keyof Page) => (e: { target: { value: string } }) => setP({ ...p, [k]: e.target.value });

  return (
    <>
      <Section title="Your public store" description="A real page customers can open: your products, prices and photos, with an Order on WhatsApp button"
        action={<StatusBadge tone={p.published ? "success" : "neutral"}>{p.published ? "Open" : "Not published"}</StatusBadge>}>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="ps-slug">Web address</Label>
            <div className="flex items-center gap-2"><span className="shrink-0 text-sm text-muted-foreground">…/s/</span><Input id="ps-slug" value={p.slug} onChange={(e) => setP({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div>
            {exists && p.published && <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline-offset-2 hover:underline">{url}</a>}
          </div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="ps-tag">One line about the business</Label><Input id="ps-tag" value={p.tagline} onChange={set("tagline")} placeholder="Game tables delivered anywhere in Ghana" /></div>
          <div className="space-y-1"><Label htmlFor="ps-cat">Category</Label><Input id="ps-cat" value={p.category} onChange={set("category")} placeholder="Sports & games" /></div>
          <div className="space-y-1"><Label htmlFor="ps-city">City</Label><Input id="ps-city" value={p.city} onChange={set("city")} placeholder="Accra" /></div>
          <div className="space-y-1"><Label htmlFor="ps-wa">WhatsApp number (if not linked)</Label><Input id="ps-wa" inputMode="tel" value={p.whatsapp} onChange={set("whatsapp")} placeholder="233241234567" /></div>
          <div className="space-y-1"><Label htmlFor="ps-g">Google Business Profile link</Label><Input id="ps-g" value={p.google_url} onChange={set("google_url")} placeholder="https://g.page/…" /></div>
          <label className="flex items-center gap-3 text-sm"><Switch checked={p.published} onCheckedChange={(v) => void save({ published: v })} aria-label="Publish the store" /> Publish the store</label>
          <label className="flex items-center gap-3 text-sm"><Switch checked={p.in_directory} onCheckedChange={(v) => void save({ in_directory: v })} aria-label="List me in the seller directory" /> List me in the <a href="/directory" target="_blank" rel="noopener noreferrer" className="underline">seller directory</a></label>
          <div className="flex items-center gap-3 sm:col-span-2"><Button onClick={() => void save()}>Save</Button>{msg && <span role="status" className="text-sm text-muted-foreground">{msg}</span>}</div>
        </div>
      </Section>
      <Section title="Google reviews on the store" description="Copy real reviews from your Google Business Profile. Each one keeps its Google link, so customers can check it">
        <div className="grid gap-2 border-b p-4 sm:grid-cols-[1fr_90px_140px]">
          <Input aria-label="Reviewer name" placeholder="Reviewer's name" value={r.author} onChange={(e) => setR({ ...r, author: e.target.value })} />
          <select aria-label="Stars" className="h-9 rounded-md border bg-background px-2 text-sm" value={r.rating} onChange={(e) => setR({ ...r, rating: e.target.value })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}</select>
          <Input aria-label="Review date" type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} />
          <Textarea aria-label="What they wrote" rows={2} className="sm:col-span-3" placeholder="What they wrote, word for word" value={r.body} onChange={(e) => setR({ ...r, body: e.target.value })} />
          <Input aria-label="Link to the review on Google" className="sm:col-span-2" placeholder="Link to the review on Google (https://maps.app.goo.gl/…)" value={r.url} onChange={(e) => setR({ ...r, url: e.target.value })} />
          <Button onClick={() => void addReview()}>Add review</Button>
        </div>
        <ul className="divide-y text-sm">
          {reviews.map((x) => (
            <li key={x.id} className="flex items-start justify-between gap-3 px-4 py-2">
              <div className="min-w-0"><p className="flex items-center gap-2 font-medium">{x.author} <span className="inline-flex text-amber-500">{Array.from({ length: x.rating }, (_, i) => <Star key={i} className="size-3 fill-current" />)}</span></p><p className="line-clamp-2 text-muted-foreground">{x.body}</p></div>
              <div className="flex shrink-0 items-center gap-2"><Switch checked={x.shown} onCheckedChange={() => void toggle(x)} aria-label={`Show ${x.author}'s review`} /><Button size="icon" variant="ghost" className="size-7" aria-label={`Delete ${x.author}'s review`} onClick={() => void remove(x)}><Trash2 className="size-4" /></Button></div>
            </li>
          ))}
          {!reviews.length && <li className="px-4 py-3 text-muted-foreground">No reviews added yet.</li>}
        </ul>
      </Section>
    </>
  );
}
