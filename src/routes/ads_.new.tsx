import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, ImageIcon, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { CTA_LABEL, draftCopy, INTERESTS, NG_LOCATIONS, PLACEMENT_LABEL, policyCheck } from "@/domain/adcopy";
import type { AdDraft, AdPlacement } from "@/domain/types";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ads_/new")({
  head: () => ({ meta: [{ title: "Create an ad · Bizriva CRM" }] }),
  validateSearch: (s: Record<string, unknown>): { a?: string } => (typeof s["a"] === "string" ? { a: s["a"] } : {}),
  component: AdCreator,
});

const Chip = ({ on, children, onClick, label }: { on: boolean; children: React.ReactNode; onClick: () => void; label?: string }) => (
  <button type="button" aria-pressed={on} aria-label={label} onClick={onClick} className={cn("rounded-full border px-3 py-1 text-xs", on && "border-primary bg-primary/10 font-medium text-primary")}>{children}</button>
);

function Preview({ ad, place, imageUrl, business }: { ad: Omit<AdDraft, "id">; place: AdPlacement; imageUrl?: string | undefined; business: string }) {
  const story = place === "stories" || place === "reels";
  const img = imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary/20 to-warning/20 text-muted-foreground"><ImageIcon className="size-8" aria-hidden="true" /></div>;
  if (story) {
    return (
      <div className="relative mx-auto aspect-[9/16] w-56 overflow-hidden rounded-2xl bg-black text-white" aria-label="Ad preview">
        <div className="absolute inset-0 opacity-90">{img}</div>
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-3 text-xs"><span className="grid size-6 place-items-center rounded-full bg-white/20 font-bold">{business[0]}</span><span className="font-semibold">{business}</span><span className="opacity-70">Sponsored</span></div>
        <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 p-3 text-xs"><p className="line-clamp-3">{ad.primaryText}</p><p className="rounded-full bg-white py-1.5 text-center font-semibold text-black">{CTA_LABEL[ad.cta]}</p></div>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border bg-background text-sm shadow-sm" aria-label="Ad preview">
      <div className="flex items-center gap-2 p-3"><span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{business[0]}</span><span><span className="block text-sm font-semibold">{business}</span><span className="block text-xs text-muted-foreground">Sponsored</span></span></div>
      <p className="whitespace-pre-wrap px-3 pb-3">{ad.primaryText || "Your ad text appears here."}</p>
      <div className="aspect-square bg-muted">{img}</div>
      <div className="flex items-center justify-between gap-2 bg-muted/50 p-3">
        <span className="min-w-0"><span className="block truncate text-[11px] uppercase text-muted-foreground">{ad.destination === "whatsapp" ? "WhatsApp" : "Order form"}</span><span className="block truncate font-semibold">{ad.headline || "Headline"}</span></span>
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-background px-3 py-1.5 text-xs font-semibold">{ad.cta === "send_whatsapp" && <MessageCircle className="size-3.5" aria-hidden="true" />}{CTA_LABEL[ad.cta]}</span>
      </div>
    </div>
  );
}

function AdCreator() {
  const db = useDb();
  const ws = useWorkspace();
  const { saveRecord, publishAd } = useActions();
  const navigate = useNavigate({ from: "/ads/new" });
  const { a } = Route.useSearch();
  const existing = a ? db.adDrafts.find((x) => x.id === a) : undefined;
  const first = db.products.find((p) => p.active !== false) ?? db.products[0]!;
  const [ad, setAd] = useState<Omit<AdDraft, "id"> & { id?: string }>(existing ?? {
    name: `${first.name} — Lagos (WhatsApp)`, productId: first.id, mediaIds: [], primaryText: "", headline: "", cta: "send_whatsapp", destination: "whatsapp", language: "en",
    audience: { locations: ["Lagos"], ageMin: 21, ageMax: 50, gender: "women", interests: ["Wigs"] }, dailyBudget: 10000, days: 7, placements: ["fb_feed", "ig_feed", "stories"], status: "draft", createdAt: new Date().toISOString(),
  });
  const [place, setPlace] = useState<AdPlacement>("fb_feed");
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const set = (patch: Partial<AdDraft>) => { setAd({ ...ad, ...patch }); setNote(null); };
  const product = db.products.find((p) => p.id === ad.productId) ?? first;
  const media = db.media.filter((m) => m.kind === "image" && (m.productId === product.id || !m.productId));
  const drafts = useMemo(() => draftCopy(product, ad.language, ad.audience.locations, ad.destination === "whatsapp"), [product, ad.language, ad.audience.locations, ad.destination]);
  const flags = policyCheck(ad.primaryText, ad.headline);
  const locked = !!existing?.campaignId;
  const connected = db.settings.meta.status === "connected";
  const total = ad.dailyBudget * ad.days;
  const money = (n: number) => formatCurrency(n, ws.currency);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const validate = () => {
    if (!ad.primaryText.trim() || !ad.headline.trim()) return "Add the ad text and a headline (or pick a draft).";
    if (!ad.audience.locations.length) return "Choose at least one location.";
    if (!ad.placements.length) return "Choose at least one placement.";
    if (ad.dailyBudget < 1000) return "Meta needs a daily budget of at least about ₦1,000.";
    if (ad.destination === "order_form" && !ad.formId) return "Pick the order form the ad should open.";
    return "";
  };
  const save = (): string | null => {
    const err = validate(); if (err) { setNote({ tone: "err", text: err }); return null; }
    const id = saveRecord("adDrafts", ad);
    setAd({ ...ad, id });
    return id;
  };

  return (
    <div className="space-y-4">
      <Link to="/ads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Ads</Link>
      <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{existing ? "Edit ad" : "Create an ad"}</h1>{locked && <StatusBadge tone="info">Created in Meta — edit it there</StatusBadge>}</div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <fieldset disabled={locked} className="min-w-0 space-y-4">
          <Section title="1 · Product and picture">
            <div className="grid gap-3 p-4 text-sm sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Product</Label>
                <Select value={ad.productId} onValueChange={(v) => { const p = db.products.find((x) => x.id === v)!; set({ productId: v, mediaIds: [], name: `${p.name} — ${ad.audience.locations[0] ?? "Nigeria"} (${ad.destination === "whatsapp" ? "WhatsApp" : "Order form"})` }); }}>
                  <SelectTrigger aria-label="Ad product"><SelectValue>{product.name}</SelectValue></SelectTrigger>
                  <SelectContent>{db.products.filter((p) => p.active !== false).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="ad-name">Ad name (only you see this)</Label><Input id="ad-name" value={ad.name} onChange={(e) => set({ name: e.target.value })} /></div>
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-sm font-medium">Picture</p>
                {media.length === 0 ? <p className="text-xs text-muted-foreground">No pictures yet. <Link to="/media" className="text-primary underline">Add one in the Media Library</Link>, or the ad uses your product photo from Meta.</p> : (
                  <div className="flex flex-wrap gap-2">{media.slice(0, 8).map((m) => (
                    <button key={m.id} type="button" aria-pressed={ad.mediaIds.includes(m.id)} aria-label={`Use ${m.name}`} onClick={() => set({ mediaIds: ad.mediaIds.includes(m.id) ? [] : [m.id] })} className={cn("relative size-16 overflow-hidden rounded-md border", ad.mediaIds.includes(m.id) && "ring-2 ring-primary")}>
                      {m.url ? <img src={m.url} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center bg-muted text-[10px]">{m.name.slice(0, 10)}</span>}
                      {ad.mediaIds.includes(m.id) && <Check className="absolute right-1 top-1 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" />}
                    </button>))}
                  </div>
                )}
              </div>
            </div>
          </Section>

          <Section title="2 · Words" description="Pick a draft, then make it yours">
            <div className="space-y-3 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Chip on={ad.language === "en"} onClick={() => set({ language: "en" })}>English</Chip>
                <Chip on={ad.language === "pcm"} onClick={() => set({ language: "pcm" })}>Pidgin</Chip>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {drafts.map((d) => (
                  <button key={d.angle} type="button" onClick={() => set({ primaryText: d.primaryText, headline: d.headline })} className="rounded-md border p-2 text-left text-xs hover:border-primary/60" aria-label={`Use draft: ${d.angle}`}>
                    <span className="mb-1 flex items-center gap-1 font-semibold"><Sparkles className="size-3.5 text-primary" aria-hidden="true" /> {d.angle}</span>
                    <span className="line-clamp-4 text-muted-foreground">{d.primaryText}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-1.5"><Label htmlFor="ad-text">Main text</Label><Textarea id="ad-text" rows={4} value={ad.primaryText} onChange={(e) => set({ primaryText: e.target.value })} /><p className="text-xs text-muted-foreground">{ad.primaryText.length} characters · the first 125 show before "See more"</p></div>
              <div className="space-y-1.5"><Label htmlFor="ad-head">Headline</Label><Input id="ad-head" maxLength={60} value={ad.headline} onChange={(e) => set({ headline: e.target.value })} /></div>
              {flags.length > 0 ? (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs" role="alert" aria-label="Policy check">
                  <p className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="size-3.5" aria-hidden="true" /> Meta may reject this wording</p>
                  <ul className="list-disc space-y-0.5 pl-4">{flags.map((f) => <li key={f.phrase}><span className="font-medium">“{f.phrase}”</span> — {f.why}</li>)}</ul>
                </div>
              ) : ad.primaryText && <p className="flex items-center gap-1 text-xs text-success" aria-label="Policy check"><Check className="size-3.5" /> No common policy problems found. Meta still reviews every ad.</p>}
            </div>
          </Section>

          <Section title="3 · Where buyers go">
            <div className="space-y-3 p-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Chip on={ad.destination === "whatsapp"} onClick={() => set({ destination: "whatsapp", cta: "send_whatsapp" })}>WhatsApp chat</Chip>
                <Chip on={ad.destination === "order_form"} onClick={() => set({ destination: "order_form", cta: "order_now", ...(db.orderForms[0] ? { formId: db.orderForms[0].id } : {}) })}>Order form</Chip>
              </div>
              {ad.destination === "whatsapp" ? <p className="text-xs text-muted-foreground">Opens a chat with {db.settings.whatsappNumber}. The ad's name arrives with the first message, so Bizriva knows which ad brought the buyer.</p> : (
                <Select value={ad.formId ?? ""} onValueChange={(v) => set({ formId: v })}>
                  <SelectTrigger aria-label="Order form"><SelectValue>{db.orderForms.find((f) => f.id === ad.formId)?.name ?? "Pick a form"}</SelectValue></SelectTrigger>
                  <SelectContent>{db.orderForms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          </Section>

          <Section title="4 · Who sees it">
            <div className="space-y-3 p-4 text-sm">
              <div><p className="mb-1.5 font-medium">Locations</p><div className="flex flex-wrap gap-1.5" role="group" aria-label="Locations">{NG_LOCATIONS.map((l) => <Chip key={l} on={ad.audience.locations.includes(l)} onClick={() => set({ audience: { ...ad.audience, locations: toggle(ad.audience.locations, l) } })}>{l}</Chip>)}</div></div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5"><Label htmlFor="age-min">Age from</Label><Input id="age-min" type="number" min={18} max={65} className="w-20" value={ad.audience.ageMin} onChange={(e) => set({ audience: { ...ad.audience, ageMin: Number(e.target.value) } })} /></div>
                <div className="space-y-1.5"><Label htmlFor="age-max">to</Label><Input id="age-max" type="number" min={18} max={65} className="w-20" value={ad.audience.ageMax} onChange={(e) => set({ audience: { ...ad.audience, ageMax: Number(e.target.value) } })} /></div>
                <div className="flex gap-1.5">{(["all", "women", "men"] as const).map((g) => <Chip key={g} on={ad.audience.gender === g} onClick={() => set({ audience: { ...ad.audience, gender: g } })}>{g === "all" ? "Everyone" : g === "women" ? "Women" : "Men"}</Chip>)}</div>
              </div>
              <div><p className="mb-1.5 font-medium">Interests (optional)</p><div className="flex flex-wrap gap-1.5">{INTERESTS.map((i) => <Chip key={i} on={ad.audience.interests.includes(i)} onClick={() => set({ audience: { ...ad.audience, interests: toggle(ad.audience.interests, i) } })}>{i}</Chip>)}</div></div>
            </div>
          </Section>

          <Section title="5 · Budget and placements">
            <div className="space-y-3 p-4 text-sm">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5"><Label htmlFor="budget">Daily budget</Label><Input id="budget" type="number" min={1000} step={1000} className="w-36" value={ad.dailyBudget} onChange={(e) => set({ dailyBudget: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label htmlFor="days">Days</Label><Input id="days" type="number" min={1} max={90} className="w-20" value={ad.days} onChange={(e) => set({ days: Number(e.target.value) })} /></div>
                <p className="pb-2">Up to <span className="num font-semibold">{money(total)}</span> in total, charged by Meta to your ad account.</p>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Placements">{(Object.keys(PLACEMENT_LABEL) as AdPlacement[]).map((p) => <Chip key={p} on={ad.placements.includes(p)} onClick={() => set({ placements: toggle(ad.placements, p) })}>{PLACEMENT_LABEL[p]}</Chip>)}</div>
            </div>
          </Section>
        </fieldset>

        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <Section title="Preview">
            <div className="space-y-3 p-3">
              <div className="flex flex-wrap gap-1.5">{(Object.keys(PLACEMENT_LABEL) as AdPlacement[]).map((p) => <Chip key={p} on={place === p} onClick={() => setPlace(p)} label={`Preview ${PLACEMENT_LABEL[p]}`}>{PLACEMENT_LABEL[p]}</Chip>)}</div>
              <Preview ad={ad} place={place} imageUrl={db.media.find((m) => m.id === ad.mediaIds[0])?.url} business={ws.name} />
            </div>
          </Section>
          {!locked && (
            <div className="space-y-2">
              <Button className="w-full" onClick={() => {
                const id = save(); if (!id) return;
                if (!connected) return setNote({ tone: "err", text: "Saved as a draft. Connect Meta Ads on the Ads page to create it in Meta." });
                publishAd(id); navigate({ to: "/ads" });
              }}>Create in Meta (paused)</Button>
              <Button variant="outline" className="w-full" onClick={() => { if (save()) setNote({ tone: "ok", text: "Draft saved." }); }}>Save draft</Button>
              <p className="text-xs text-muted-foreground">Ads are created paused — nothing spends until you press Start on the Ads page.</p>
            </div>
          )}
          {note && <p className={`text-sm ${note.tone === "err" ? "text-destructive" : "text-success"}`} role={note.tone === "err" ? "alert" : "status"}>{note.text}</p>}
        </div>
      </div>
    </div>
  );
}
