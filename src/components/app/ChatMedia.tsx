/**
 * Real data: photos, videos, voice notes and documents in a chat.
 * Files sit in the business's private storage; the team views them through
 * links that last ten minutes. The paperclip sends a file to the customer.
 */
import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/auth";
import { useLive } from "@/domain/store";
import { supabase } from "@/lib/supabase";
import type { Message } from "@/domain/types";

export const MAX_FILE = 16 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/ogg,audio/mpeg,audio/mp4,audio/aac,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain";

export function kindOf(mime: string): "image" | "video" | "audio" | "document" {
  return mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
}
export function safeName(name: string): string {
  const clean = name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (clean || "file").slice(-80);
}

const LABEL = { image: "Photo", video: "Video", audio: "Voice note", document: "Document", sticker: "Sticker" } as const;

export function MessageMedia({ m }: { m: Message }) {
  const [url, setUrl] = useState<string | null>(null);
  const media = m.media;
  useEffect(() => {
    let off = false;
    const sb = supabase();
    if (sb && media?.path) void sb.storage.from("chat-media").createSignedUrl(media.path, 600).then(({ data }) => { if (!off) setUrl(data?.signedUrl ?? null); });
    return () => { off = true; };
  }, [media?.path]);
  if (!media) return null;
  const label = LABEL[media.kind] ?? "File";
  if (!media.path) {
    return media.error
      ? <p className="mb-1 rounded bg-black/10 px-2 py-1 text-[11px]" role="note">{label} couldn't be saved: {media.error}</p>
      : <p className="mb-1 text-[11px] opacity-80" role="status">Saving {label.toLowerCase()}…</p>;
  }
  if (!url) return <div className="mb-1 h-24 w-40 animate-pulse rounded bg-black/10" aria-label={`Loading ${label.toLowerCase()}`} />;
  if (media.kind === "image" || media.kind === "sticker") return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={media.name ?? label} className="mb-1 max-h-64 max-w-full rounded" /></a>;
  if (media.kind === "video") return <video src={url} controls className="mb-1 max-h-64 max-w-full rounded" aria-label={label} />;
  if (media.kind === "audio") return <audio src={url} controls className="mb-1 max-w-full" aria-label={label} />;
  return <a href={url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-1.5 rounded bg-black/10 px-2 py-1.5 text-xs underline"><FileText className="size-4 shrink-0" aria-hidden="true" />{media.name ?? "Document"}</a>;
}

/** Paperclip: upload a file to this business's folder and queue it with the typed text as its caption. */
export function AttachFile({ conversationId, caption, onSent }: { conversationId: string; caption: string; onSent: () => void }) {
  const live = useLive();
  const { current } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!live.on || !current) return null;
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE) { setError("Files can be up to 16 MB."); return; }
    const sb = supabase(); if (!sb) return;
    setBusy(true); setError("");
    const path = `${current.workspaceId}/out/${crypto.randomUUID()}-${safeName(f.name)}`;
    const up = await sb.storage.from("chat-media").upload(path, f, { contentType: f.type || "application/octet-stream" });
    if (up.error) { setBusy(false); setError(up.error.message.includes("mime") ? "That kind of file can't be sent on WhatsApp." : up.error.message); return; }
    const { error: e } = await sb.from("messages").insert({
      workspace_id: current.workspaceId, conversation_id: conversationId, direction: "out", status: "queued",
      body: caption.trim() || null, media_path: path, media_kind: kindOf(f.type), media_name: f.name.slice(0, 200),
    });
    setBusy(false);
    if (input.current) input.current.value = "";
    if (e) { setError(e.message); return; }
    onSent();
    await live.reload();
  };
  return (
    <>
      <input ref={input} type="file" accept={ACCEPT} className="hidden" aria-label="Choose a file to send" onChange={(e) => void pick(e.target.files?.[0])} />
      <Button size="icon" variant="ghost" className="size-8 shrink-0" disabled={busy} onClick={() => input.current?.click()} title="Send a photo, video, voice note or document" aria-label="Attach a file">
        <Paperclip className="size-4" />
      </Button>
      {error && <span className="sr-only" role="alert">{error}</span>}
      {error && <span className="absolute -top-6 left-3 rounded bg-destructive px-2 py-0.5 text-[11px] text-white" aria-hidden="true">{error}</span>}
    </>
  );
}
