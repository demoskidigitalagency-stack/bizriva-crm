/** Ads → AI ad copy: three variants for a product, written for local buyers, to copy into Meta or TikTok. */
import { useState } from "react";
import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/app/primitives";
import { useDb, useLive } from "@/domain/store";
import { useAuth } from "@/app/auth";
import { aiTool } from "@/lib/ai-tools";

interface Variant { headline: string; text: string; cta: string; angle: string }

export function AdCopy() {
  const db = useDb();
  const live = useLive();
  const { current } = useAuth();
  const products = db.products.filter((p) => p.active !== false);
  const [f, setF] = useState({ product: products[0]?.id ?? "", angle: "", platform: "Facebook and Instagram" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [out, setOut] = useState<Variant[]>([]);
  const [copied, setCopied] = useState(-1);
  if (!live.on || !products.length) return null;
  const go = async () => {
    if (!current || !f.product) return;
    setBusy(true); setErr("");
    const r = await aiTool<{ variants: Variant[] }>({ workspace_id: current.workspaceId, action: "ad_copy", product_id: f.product, angle: f.angle, platform: f.platform });
    setBusy(false);
    if (r.error) setErr(r.error); else setOut(r.data?.variants ?? []);
  };
  return (
    <Section title="AI ad copy" description="Three versions for a product, priced from your catalogue — copy one into Meta or TikTok" action={<Sparkles className="size-4 text-primary" aria-hidden="true" />}>
      <div className="grid gap-2 p-4 sm:grid-cols-[1fr_1fr_180px_auto]">
        <select aria-label="Product" className="h-9 rounded-md border bg-background px-2 text-sm" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <Input aria-label="Angle" placeholder="Angle (optional): Christmas gift, free delivery…" value={f.angle} onChange={(e) => setF({ ...f, angle: e.target.value })} />
        <select aria-label="Platform" className="h-9 rounded-md border bg-background px-2 text-sm" value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}><option>Facebook and Instagram</option><option>TikTok</option><option>WhatsApp Status</option></select>
        <Button disabled={busy} onClick={() => void go()}>{busy ? "Writing…" : "Write"}</Button>
      </div>
      {err && <p role="alert" className="px-4 pb-3 text-sm text-destructive">{err}</p>}
      {out.length > 0 && (
        <ul className="grid gap-3 border-t p-4 md:grid-cols-3">
          {out.map((v, i) => (
            <li key={i} className="space-y-1 rounded-md border p-3 text-sm">
              {v.angle && <p className="text-xs uppercase tracking-wide text-muted-foreground">{v.angle}</p>}
              <p className="font-semibold">{v.headline}</p>
              <p className="whitespace-pre-line">{v.text}</p>
              <p className="text-xs text-muted-foreground">Button: {v.cta}</p>
              <Button size="sm" variant="outline" className="mt-1" onClick={async () => { try { await navigator.clipboard.writeText(`${v.headline}\n\n${v.text}`); setCopied(i); } catch { /* blocked */ } }}><Copy className="size-3.5" /> {copied === i ? "Copied" : "Copy"}</Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
