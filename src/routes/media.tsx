import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Film, ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, KpiCard, Section } from "@/components/app/primitives";
import { useActions, useDb, useLive } from "@/domain/store";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { MAX_FILE, safeName } from "@/components/app/ChatMedia";
import type { MediaAsset } from "@/domain/types";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/media")({
  head: () => ({ meta: [{ title: "Media Library · Bizriva CRM" }] }),
  component: Media,
});

// Practice Mode keeps images inside the browser's saved data, which is small. Real storage comes with the backend.
const MAX_INLINE = 350 * 1024;
const PRACTICE_BUDGET = 3 * 1024 * 1024;
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78);
}

function Media() {
  const db = useDb();
  const { saveRecord, removeRecord } = useActions();
  const live = useLive();
  const { current } = useAuth();
  const [busy, setBusy] = useState(false);
  const [productFilter, setProductFilter] = useState("all");
  const [message, setMessage] = useState("");
  const inlineBytes = db.media.reduce((s, m) => s + (m.url?.length ?? 0), 0);
  const totalBytes = db.media.reduce((s, m) => s + m.bytes, 0);
  const shown = db.media.filter((m) => productFilter === "all" || (productFilter === "none" ? !m.productId : m.productId === productFilter));

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (live.on) return uploadLive(Array.from(files));
    let added = 0;
    const notes: string[] = [];
    for (const f of Array.from(files)) {
      const isImage = f.type.startsWith("image/");
      const isVideo = f.type.startsWith("video/");
      if (!isImage && !isVideo) { notes.push(`${f.name}: only images and videos`); continue; }
      if (db.media.some((m) => m.name === f.name && m.bytes === f.size)) { notes.push(`${f.name}: already uploaded`); continue; }
      let url: string | undefined;
      if (isImage) {
        try { url = await shrink(f); } catch { notes.push(`${f.name}: couldn't read the image`); continue; }
        if (url.length > MAX_INLINE || inlineBytes + url.length > PRACTICE_BUDGET) { url = undefined; notes.push(`${f.name}: saved without preview (practice storage is small)`); }
      }
      const asset: Omit<MediaAsset, "id"> = { name: f.name, kind: isImage ? "image" : "video", bytes: f.size, ...(url ? { url } : {}), ...(productFilter !== "all" && productFilter !== "none" ? { productId: productFilter } : {}), addedAt: new Date().toISOString() };
      saveRecord("media", asset);
      added++;
    }
    setMessage([added ? `Added ${added} file${added > 1 ? "s" : ""}.` : "", ...notes].filter(Boolean).join(" "));
  };

  /** Real data: files go to the business's private storage; the AI and product cards send them from there. */
  const uploadLive = async (files: File[]) => {
    const sb = supabase();
    if (!sb || !current) return;
    setBusy(true);
    let added = 0;
    const notes: string[] = [];
    const productId = productFilter !== "all" && productFilter !== "none" ? productFilter : null;
    for (const f of files) {
      const kind = f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : null;
      if (!kind) { notes.push(`${f.name}: only images and videos`); continue; }
      if (f.size > MAX_FILE) { notes.push(`${f.name}: files can be up to 16 MB`); continue; }
      if (db.media.some((m) => m.name === f.name && m.bytes === f.size)) { notes.push(`${f.name}: already uploaded`); continue; }
      const path = `${current.workspaceId}/out/media/${crypto.randomUUID()}-${safeName(f.name)}`;
      const up = await sb.storage.from("chat-media").upload(path, f, { contentType: f.type });
      if (up.error) { notes.push(`${f.name}: ${up.error.message.includes("mime") ? "WhatsApp can't send this kind of file (use JPG, PNG, WEBP or MP4)" : up.error.message}`); continue; }
      const { error } = await sb.from("media_assets").insert({ workspace_id: current.workspaceId, product_id: productId, kind, storage_path: path, bytes: f.size, name: f.name.slice(0, 200) });
      if (error) { notes.push(`${f.name}: ${error.message}`); continue; }
      added++;
    }
    setBusy(false);
    setMessage([added ? `Uploaded ${added} file${added > 1 ? "s" : ""}.` : "", ...notes].filter(Boolean).join(" "));
    await live.reload();
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Commerce</p>
        <h1 className="text-2xl font-bold">Media Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">Upload product photos and videos once, link them to a product, and send them from the inbox instead of a phone gallery.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Files" value={String(db.media.length)} />
        <KpiCard label="Linked to products" value={String(db.media.filter((m) => m.productId).length)} tone="success" />
        <KpiCard label="Original size" value={size(totalBytes)} tone="info" />
        {live.on ? <KpiCard label="Photos the AI can send" value={String(db.media.filter((m) => m.productId && m.kind === "image").length)} tone="brand" />
          : <KpiCard label="Practice storage used" value={`${Math.round((inlineBytes / PRACTICE_BUDGET) * 100)}%`} hint="of 3 MB in this browser" tone={inlineBytes > PRACTICE_BUDGET * 0.8 ? "warning" : "brand"} />}
      </div>
      <Section
        title="Files"
        action={
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="h-8 w-56" aria-label="Product"><SelectValue>{productFilter === "all" ? "All products" : productFilter === "none" ? "Not linked" : db.products.find((p) => p.id === productFilter)?.name}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              <SelectItem value="none">Not linked</SelectItem>
              {db.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      >
        <div className="p-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center hover:border-primary/50">
            <ImageUp className="size-6 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">{busy ? "Uploading…" : "Upload photos or videos"}{productFilter !== "all" && productFilter !== "none" ? " for this product" : ""}</span>
            <span className="text-xs text-muted-foreground">{live.on ? "Kept in your private storage, up to 16 MB each. When a customer asks to see a product, the AI sends its first photo." : "Images are resized for WhatsApp. Duplicates are skipped."}</span>
            <input type="file" accept="image/*,video/*" multiple disabled={busy} className="sr-only" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {message && <p className="mt-2 text-sm text-muted-foreground" role="status">{message}</p>}
        </div>
        {shown.length === 0 ? <EmptyState title="No files yet" description="Pick a product above, then upload its photos so the AI agent can send them." /> : (
          <ul className="grid grid-cols-2 gap-3 p-4 pt-0 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((m) => (
              <li key={m.id} className="overflow-hidden rounded-lg border bg-card">
                <div className="grid aspect-square place-items-center bg-muted">
                  {m.url ? <img src={m.url} alt={m.name} className="size-full object-cover" /> : m.kind === "video" ? <Film className="size-8 text-muted-foreground" aria-hidden="true" /> : <ImageUp className="size-8 text-muted-foreground" aria-hidden="true" />}
                </div>
                <div className="space-y-1.5 p-2 text-xs">
                  <p className="truncate font-medium" title={m.name}>{m.name}</p>
                  <p className="text-muted-foreground">{size(m.bytes)} · {formatDate(m.addedAt)}</p>
                  <Select value={m.productId ?? "none"} onValueChange={(v) => { const { productId: _p, ...rest } = m; saveRecord("media", v === "none" ? rest : { ...rest, productId: v }); }}>
                    <SelectTrigger className="h-7 text-xs" aria-label={`Product for ${m.name}`}><SelectValue>{db.products.find((p) => p.id === m.productId)?.name ?? "Link to product"}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not linked</SelectItem>
                      {db.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" className="h-7 w-full text-xs text-destructive" onClick={() => removeRecord("media", m.id)}><Trash2 className="size-3.5" /> Remove</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
