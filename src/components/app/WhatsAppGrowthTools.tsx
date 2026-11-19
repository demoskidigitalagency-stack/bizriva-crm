/**
 * WhatsApp Growth tools on the linked number (from the WhatsApp automation build spec):
 *   • Auto-save — each new customer goes into the phone's contacts as soon as they write.
 *   • Status — text, photo or video, now or later, once/daily/weekly; reach, views and viewers.
 *   • Groups — the business's groups, saved collections, posts now or later, paced.
 *   • Broadcast — one message to customers who wrote first; personal and opted-out left out.
 * The screens save rows in wa_posts; Bizriva's WhatsApp server sends them (worker/src/link.ts).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, StatusBadge } from "@/components/app/primitives";
import { safeName } from "@/components/app/ChatMedia";
import { useAuth } from "@/app/auth";
import { useDb } from "@/domain/store";
import { supabase } from "@/lib/supabase";
import { formatDateTime, relativeTime } from "@/lib/format";

type Kind = "status" | "group" | "broadcast";
type Who = "all" | "asked" | "no_order" | "tag";
interface PostRow {
  id: string; kind: Kind; body: string | null; media_path: string | null; media_kind: "image" | "video" | null; bg_color: string | null;
  audience: { who?: Who; tag?: string; groups?: string[]; collection?: string; mentionAll?: boolean }; scheduled_for: string; repeat: "none" | "daily" | "weekly";
  state: "scheduled" | "sending" | "sent" | "failed" | "cancelled"; recipients: number; sent: number; failed: number; views: number; error: string | null; sent_at: string | null;
}
interface GroupRow { jid: string; name: string | null; size: number; is_admin: boolean; announce: boolean }
interface Collection { id: string; name: string; jids: string[] }

const STATE_TONE = { scheduled: "info", sending: "warning", sent: "success", failed: "danger", cancelled: "neutral" } as const;
const STATE_LABEL = { scheduled: "Scheduled", sending: "Sending", sent: "Sent", failed: "Failed", cancelled: "Cancelled" } as const;
const COLORS = ["#128C7E", "#075E54", "#25D366", "#8E44AD", "#C0392B", "#D35400", "#2C3E50", "#1F6FEB"];
const MAX_MB = 16;

function useWs() {
  const { current } = useAuth();
  return { ws: current?.workspaceId, canEdit: current?.role === "owner" || current?.role === "manager" };
}

/** Customers' tags that make sense as an audience (product tags first). */
function useTags(ws: string | undefined) {
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => {
    const sb = supabase(); if (!sb || !ws) return;
    void sb.from("contacts").select("tags").eq("workspace_id", ws).limit(5000).then(({ data }) => {
      const n = new Map<string, number>();
      for (const r of (data ?? []) as { tags: string[] | null }[]) for (const t of r.tags ?? []) if (t !== "Personal") n.set(t, (n.get(t) ?? 0) + 1);
      setTags([...n.entries()].sort((a, b) => Number(b[0].startsWith("Asked about")) - Number(a[0].startsWith("Asked about")) || b[1] - a[1]).map(([t]) => t).slice(0, 40));
    });
  }, [ws]);
  return tags;
}

// ───────────── auto-save ─────────────
export function AutoSave() {
  const { ws, canEdit } = useWs();
  const [row, setRow] = useState<{ auto_save: boolean; save_template: string; status: string } | null>(null);
  const [template, setTemplate] = useState("{name} - {product}");
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const { data } = await sb.from("wa_links").select("auto_save, save_template, status").eq("workspace_id", ws).maybeSingle();
    const r = data as typeof row;
    setRow(r);
    if (r?.save_template) setTemplate(r.save_template);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  if (!row) return null;
  const set = async (on: boolean) => {
    const sb = supabase(); if (!sb || !ws) return;
    setMsg("");
    const { error } = await sb.rpc("set_wa_auto_save", { p_workspace: ws, p_on: on, p_template: template });
    if (error) return setMsg(error.message);
    setMsg(on ? "On — new customers are saved to your phone as they write." : "Off.");
    await load();
  };
  return (
    <div className="space-y-2 p-4 text-sm">
      <label className="flex items-center gap-2 font-medium">
        <Switch checked={row.auto_save} disabled={!canEdit} onCheckedChange={(v) => void set(v)} aria-label="Auto-save new customers" />
        Save every new customer to my phone automatically
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" value={template} disabled={!canEdit} onChange={(e) => setTemplate(e.target.value)} onBlur={() => row.auto_save && void set(true)} aria-label="Name format for saved customers" />
        <span className="text-xs text-muted-foreground">{"{name}"}, {"{product}"}, {"{last4}"}</span>
      </div>
      <p className="text-xs text-muted-foreground">Saved customers can see your Status. Personal contacts are never saved. Customers already in Bizriva: use “Save to my phone” below.</p>
      {msg && <p className="text-xs" role="status">{msg}</p>}
    </div>
  );
}

// ───────────── composer ─────────────
function Composer({ kind, groups, collections, onSaved }: { kind: Kind; groups?: GroupRow[]; collections?: Collection[]; onSaved: () => void }) {
  const { ws, canEdit } = useWs();
  const tags = useTags(kind === "group" ? undefined : ws);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [color, setColor] = useState(COLORS[0]!);
  const [who, setWho] = useState<Who>("all");
  const [tag, setTag] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [mentionAll, setMentionAll] = useState(false);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly">("none");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const audience = useMemo(() => (kind === "group" ? { groups: picked, mentionAll } : { who, ...(who === "tag" ? { tag } : {}) }), [kind, picked, mentionAll, who, tag]);
  useEffect(() => {
    if (kind === "group") { setCount(picked.length); return; }
    const sb = supabase(); if (!sb || !ws) return;
    let off = false;
    void sb.rpc("wa_audience_count", { p_workspace: ws, p_audience: audience, p_kind: kind }).then(({ data }) => { if (!off) setCount(typeof data === "number" ? data : null); });
    return () => { off = true; };
  }, [ws, kind, audience, picked.length]);

  if (!canEdit) return <p className="p-4 text-sm text-muted-foreground">Owners and managers post from here.</p>;

  const save = async () => {
    const sb = supabase(); if (!sb || !ws) return;
    setMsg("");
    if (!body.trim() && !file) return setMsg(kind === "status" ? "Write something or add a photo or video." : "Write a message or add a photo or video.");
    if (kind === "group" && !picked.length) return setMsg("Pick at least one group.");
    if (kind !== "group" && who === "tag" && !tag) return setMsg("Pick a tag.");
    if (when === "later" && (!at || new Date(at) <= new Date())) return setMsg("Pick a time in the future.");
    if (file && file.size > MAX_MB * 1024 * 1024) return setMsg(`Files can be up to ${MAX_MB} MB.`);
    setBusy(true);
    let media_path: string | null = null, media_kind: "image" | "video" | null = null;
    if (file) {
      media_kind = file.type.startsWith("video/") ? "video" : "image";
      media_path = `${ws}/out/${crypto.randomUUID()}-${safeName(file.name)}`;
      const up = await sb.storage.from("chat-media").upload(media_path, file, { contentType: file.type || "application/octet-stream" });
      if (up.error) { setBusy(false); return setMsg(up.error.message); }
    }
    const { error } = await sb.from("wa_posts").insert({
      workspace_id: ws, kind, body: body.trim() || null, media_path, media_kind, bg_color: kind === "status" && !file ? color : null,
      audience, scheduled_for: when === "later" ? new Date(at).toISOString() : new Date().toISOString(), repeat,
    });
    setBusy(false);
    if (error) return setMsg(error.message);
    setBody(""); setFile(null); setPicked([]); setWhen("now"); setAt(""); setRepeat("none");
    setMsg(when === "now" ? "Queued — it goes out within a minute." : "Scheduled.");
    onSaved();
  };

  const label = kind === "status" ? "Post Status" : kind === "group" ? "Post to groups" : "Send broadcast";
  return (
    <div className="space-y-3 p-4 text-sm">
      {kind === "status" && !file && (
        <div className="rounded-lg p-4 text-center text-white" style={{ backgroundColor: color }}>
          <p className="whitespace-pre-wrap text-lg font-semibold">{body || "Your Status text"}</p>
        </div>
      )}
      <Textarea rows={kind === "status" ? 3 : 4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000}
        placeholder={kind === "broadcast" ? "Hi {{name}}, the 6ft table is now GH₵ 6,700 with free delivery…" : kind === "status" ? "New price this week…" : "Message for your groups"}
        aria-label={kind === "status" ? "Status text or caption" : "Message"} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
          <ImagePlus className="size-4" aria-hidden="true" /> {file ? "Change photo/video" : "Add photo or video"}
          <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {file && <span className="inline-flex items-center gap-1 text-xs">{file.name} <button type="button" onClick={() => setFile(null)} aria-label="Remove file"><X className="size-3.5" /></button></span>}
        {kind === "status" && !file && (
          <div className="flex gap-1" role="radiogroup" aria-label="Background colour">
            {COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={`size-6 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: c }} />)}
          </div>
        )}
      </div>

      {kind === "group" ? (
        <GroupPicker groups={groups ?? []} collections={collections ?? []} picked={picked} setPicked={setPicked} mentionAll={mentionAll} setMentionAll={setMentionAll} />
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{kind === "status" ? "Who sees it" : "Who gets it"}</p>
          <div className="flex flex-wrap overflow-hidden rounded-md border text-xs" role="radiogroup" aria-label="Audience">
            {([["all", "Everyone who messaged you"], ["asked", "Asked about a product"], ["no_order", "No order yet"], ["tag", "A tag"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={who === k} onClick={() => setWho(k)} className={`flex-1 px-2 py-2 ${who === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>
            ))}
          </div>
          {who === "tag" && (
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger className="h-8 max-w-sm" aria-label="Tag"><SelectValue placeholder="Pick a tag" /></SelectTrigger>
              <SelectContent>{tags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border text-xs" role="radiogroup" aria-label="When">
          {([["now", "Now"], ["later", "Later"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={when === k} onClick={() => setWhen(k)} className={`px-3 py-1.5 ${when === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>
          ))}
        </div>
        {when === "later" && <Input type="datetime-local" className="h-8 w-auto" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Send at" />}
        <Select value={repeat} onValueChange={(v) => setRepeat(v as typeof repeat)}>
          <SelectTrigger className="h-8 w-36" aria-label="Repeat"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">Once</SelectItem><SelectItem value="daily">Every day</SelectItem><SelectItem value="weekly">Every week</SelectItem></SelectContent>
        </Select>
        <Button size="sm" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : label}</Button>
        {count !== null && <span className="text-xs text-muted-foreground">{kind === "group" ? `${count} group${count === 1 ? "" : "s"}` : `${count.toLocaleString()} customer${count === 1 ? "" : "s"}`}</span>}
      </div>
      {kind === "broadcast" && <p className="text-xs text-muted-foreground">Only customers who messaged you first; personal and opted-out contacts are left out. “Reply STOP to stop these messages.” is added. {"{{name}}"} becomes their first name. Sent one by one, about 6–15 seconds apart, within the daily safe limit.</p>}
      {kind === "status" && <p className="text-xs text-muted-foreground">Shown to customers who have your number saved and whose number you've saved. Up to 20 Status posts a day.</p>}
      {msg && <p className="text-xs" role="status">{msg}</p>}
    </div>
  );
}

function GroupPicker({ groups, collections, picked, setPicked, mentionAll, setMentionAll }: {
  groups: GroupRow[]; collections: Collection[]; picked: string[]; setPicked: (x: string[]) => void; mentionAll: boolean; setMentionAll: (b: boolean) => void;
}) {
  const [q, setQ] = useState("");
  if (!groups.length) return <p className="text-xs text-muted-foreground">Your groups appear here a minute after WhatsApp connects.</p>;
  const shown = groups.filter((g) => !q || (g.name ?? "").toLowerCase().includes(q.toLowerCase()));
  const toggle = (jid: string) => setPicked(picked.includes(jid) ? picked.filter((x) => x !== jid) : [...picked, jid]);
  return (
    <div className="space-y-2">
      {collections.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground">Collections:</span>
          {collections.map((c) => <button key={c.id} type="button" onClick={() => setPicked([...new Set([...picked, ...c.jids])])} className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted">{c.name} ({c.jids.length})</button>)}
        </div>
      )}
      <Input className="h-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups" aria-label="Search groups" />
      <ul className="scroll-thin max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
        {shown.map((g) => (
          <li key={g.jid}>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={picked.includes(g.jid)} disabled={g.announce && !g.is_admin} onCheckedChange={() => toggle(g.jid)} />
              <span className="flex-1 truncate">{g.name || "Unnamed group"}</span>
              <span className="text-muted-foreground">{g.size}</span>
              {g.is_admin && <StatusBadge tone="info">Admin</StatusBadge>}
              {g.announce && !g.is_admin && <StatusBadge>Admins only</StatusBadge>}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" className="underline" onClick={() => setPicked(groups.filter((g) => !g.announce || g.is_admin).map((g) => g.jid))}>Select all</button>
        <button type="button" className="underline" onClick={() => setPicked([])}>Clear</button>
        <label className="flex items-center gap-1.5"><Checkbox checked={mentionAll} onCheckedChange={(v) => setMentionAll(v === true)} /> Tag everyone in each group</label>
      </div>
    </div>
  );
}

// ───────────── list of posts ─────────────
function Posts({ kind, posts, reload }: { kind: Kind; posts: PostRow[]; reload: () => void }) {
  const { canEdit } = useWs();
  const [open, setOpen] = useState<string | null>(null);
  const [viewers, setViewers] = useState<{ phone: string; viewed_at: string; contacts: { name: string | null } | null }[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const mine = posts.filter((p) => p.kind === kind);
  useEffect(() => {
    const sb = supabase(); if (!sb) return;
    const paths = mine.filter((p) => p.media_path && p.media_kind === "image" && !urls[p.media_path]).map((p) => p.media_path!);
    if (!paths.length) return;
    void sb.storage.from("chat-media").createSignedUrls(paths, 3600).then(({ data }) => setUrls((u) => ({ ...u, ...Object.fromEntries((data ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path!, x.signedUrl])) })));
  }, [mine.map((p) => p.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const showViewers = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    const sb = supabase(); if (!sb) return;
    const { data } = await sb.from("wa_post_views").select("phone, viewed_at, contacts(name)").eq("post_id", id).order("viewed_at", { ascending: false }).limit(500);
    setViewers((data ?? []) as unknown as typeof viewers);
    setOpen(id);
  };
  const cancel = async (id: string) => {
    const sb = supabase(); if (!sb) return;
    await sb.rpc("cancel_wa_post", { p_post: id });
    reload();
  };
  if (!mine.length) return <EmptyState title="Nothing yet" description={kind === "status" ? "Your Status posts and their views show here." : kind === "group" ? "Your group posts show here." : "Your broadcasts show here."} />;
  return (
    <ul className="divide-y text-sm">
      {mine.map((p) => (
        <li key={p.id} className="space-y-1.5 px-4 py-3">
          <div className="flex flex-wrap items-start gap-3">
            {p.media_path && p.media_kind === "image" && urls[p.media_path] ? <img src={urls[p.media_path]} alt="" className="size-12 rounded object-cover" />
              : p.media_kind === "video" ? <span className="grid size-12 place-items-center rounded bg-muted text-[10px]">Video</span>
              : kind === "status" ? <span className="size-12 rounded" style={{ backgroundColor: p.bg_color ?? "#128C7E" }} aria-hidden="true" /> : null}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 whitespace-pre-wrap">{p.body || (p.media_kind === "video" ? "Video" : "Photo")}</p>
              <p className="text-xs text-muted-foreground">
                {p.state === "scheduled" ? `Goes out ${formatDateTime(p.scheduled_for)}` : p.sent_at ? `Sent ${relativeTime(p.sent_at)}` : `Created for ${formatDateTime(p.scheduled_for)}`}
                {p.repeat !== "none" ? ` · repeats ${p.repeat === "daily" ? "every day" : "every week"}` : ""}
                {kind === "group" && p.audience.groups ? ` · ${p.audience.groups.length} group${p.audience.groups.length === 1 ? "" : "s"}` : ""}
                {kind !== "group" && p.audience.who && p.audience.who !== "all" ? ` · ${p.audience.who === "tag" ? p.audience.tag : p.audience.who === "asked" ? "asked about a product" : "no order yet"}` : ""}
              </p>
            </div>
            <StatusBadge tone={STATE_TONE[p.state]}>{STATE_LABEL[p.state]}</StatusBadge>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {p.state !== "scheduled" && p.state !== "cancelled" && (
              <span>{kind === "status" ? `Shown to ${p.recipients.toLocaleString()}` : kind === "group" ? `${p.sent} of ${p.recipients} groups` : `${p.sent.toLocaleString()} messages queued`}{p.failed ? ` · ${p.failed} failed` : ""}</span>
            )}
            {kind === "status" && p.state === "sent" && (
              <button type="button" className="font-medium text-primary underline" onClick={() => void showViewers(p.id)}>{p.views.toLocaleString()} view{p.views === 1 ? "" : "s"}{p.recipients ? ` (${Math.round((p.views / p.recipients) * 100)}%)` : ""}</button>
            )}
            {p.state === "scheduled" && canEdit && <button type="button" className="text-destructive underline" onClick={() => void cancel(p.id)}>{p.repeat !== "none" ? "Stop repeating" : "Cancel"}</button>}
          </div>
          {p.error && <p className="text-xs text-destructive" role="note">{p.error}</p>}
          {open === p.id && (
            <ul className="scroll-thin max-h-48 overflow-y-auto rounded-md border p-2 text-xs">
              {viewers.length ? viewers.map((v) => <li key={v.phone} className="flex justify-between gap-2 py-0.5"><span>{v.contacts?.name || `+${v.phone}`}</span><span className="text-muted-foreground">{relativeTime(v.viewed_at)}</span></li>)
                : <li className="text-muted-foreground">No views yet. Views come in as people watch it.</li>}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function usePosts() {
  const { ws } = useWs();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const { data, error: e } = await sb.from("wa_posts").select("*").eq("workspace_id", ws).order("scheduled_for", { ascending: false }).limit(100);
    if (e) setError(/wa_posts|PGRST205|42P01|schema cache/i.test(`${e.code ?? ""} ${e.message}`) ? "Status, groups and broadcasts are being switched on for your account — check back shortly." : e.message);
    else { setError(""); setPosts((data ?? []) as PostRow[]); }
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  const active = posts.some((p) => p.state === "sending" || (p.state === "scheduled" && new Date(p.scheduled_for) <= new Date(Date.now() + 60_000)));
  useEffect(() => { const t = setInterval(() => void load(), active ? 5000 : 30_000); return () => clearInterval(t); }, [active, load]);
  return { posts, error, load };
}

// ───────────── Status reach: saved contacts ─────────────
interface Reach { total: number; saved: number; linked: boolean; auto_save: boolean; template: string | null; run: string | null; done: number; of: number; ok: number; failed: number; error: string | null }
const saveOurNumber = (business: string) => `Hi {{name}}, please save this number as ${business || "our shop"} so you see our new arrivals and offers on our WhatsApp Status. Thank you!`;

/**
 * A Status only reaches customers saved in the linked phone's contacts — and they see it only if they
 * saved the business number too. Shows how many are saved, saves the rest, keeps saving new ones, and
 * gives a ready "please save our number" message for a broadcast.
 */
function StatusReach() {
  const { ws, canEdit } = useWs();
  const business = useDb().settings.businessName;
  const [r, setR] = useState<Reach | null>(null);
  const [template, setTemplate] = useState("{name} - {product} {city}");
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const { data } = await sb.rpc("wa_status_reach", { p_workspace: ws });
    const x = data as Reach | null;
    setR(x);
    if (x?.template && x.template !== "{name}") setTemplate(x.template);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  const running = r?.run === "queued" || r?.run === "running";
  useEffect(() => { if (!running) return; const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [running, load]);
  if (!r) return null;
  const left = Math.max(0, r.total - r.saved);
  const saveAll = async () => {
    setMsg("");
    const sb = supabase()!;
    const { error } = await sb.rpc("request_wa_save_contacts", { p_workspace: ws, p_template: template, p_who: "all" });
    if (error) return setMsg(error.message);
    if (!r.auto_save) await sb.rpc("set_wa_auto_save", { p_workspace: ws, p_on: true, p_template: template });
    setMsg("Saving — a few contacts at a time so WhatsApp stays happy. You can leave this page.");
    await load();
  };
  const autoSave = async (on: boolean) => {
    const { error } = await supabase()!.rpc("set_wa_auto_save", { p_workspace: ws, p_on: on, p_template: template });
    if (error) setMsg(error.message); else await load();
  };
  const askToSave = async () => {
    const sb = supabase()!;
    const { data } = await sb.from("saved_messages").select("id").eq("workspace_id", ws).eq("name", "Save our number").maybeSingle();
    if (!data) await sb.from("saved_messages").insert({ workspace_id: ws, name: "Save our number", body: saveOurNumber(business) });
    window.location.href = "/broadcasts";
  };
  const pct = r.total ? Math.round((r.saved / r.total) * 100) : 0;
  return (
    <div className="space-y-3 border-b p-4 text-sm" aria-label="Who can see your Status">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">Who can see your Status</p>
        <p><span className="num text-lg font-bold">{r.saved}</span> of <span className="num">{r.total}</span> customers saved on your phone ({pct}%)</p>
      </div>
      <div className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
      <p className="text-xs text-muted-foreground">WhatsApp shows your Status only to people saved in your phone's contacts, and they see it only if they've saved your number too. So: 1) save your customers, 2) keep saving new ones, 3) ask them to save you.</p>
      {canEdit && (
        <ol className="space-y-2">
          <li className="flex flex-wrap items-center gap-2">
            <span className="font-medium">1.</span>
            {running
              ? <span role="status">Saving… {r.done} of {r.of || left} done{r.failed ? ` (${r.failed} couldn't be saved)` : ""}</span>
              : left > 0
                ? <><Button size="sm" disabled={!r.linked} onClick={() => void saveAll()}>Save the {left} not saved yet</Button>
                    <Input className="h-8 max-w-[14rem]" value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Name format for saved customers" />
                    <span className="text-xs text-muted-foreground">e.g. “Customer 4567 - 6ft multi-game table Accra”. Use {"{name}"}, {"{product}"}, {"{city}"}, {"{last4}"}</span></>
                : <span>All customers are saved.</span>}
            {r.error && !running && <span className="text-xs text-destructive">{r.error}</span>}
          </li>
          <li className="flex items-center gap-2">
            <span className="font-medium">2.</span>
            <Switch checked={r.auto_save} disabled={!r.linked} onCheckedChange={(v) => void autoSave(v)} aria-label="Save every new customer automatically" />
            <span>Save every new customer to my phone as they write</span>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <span className="font-medium">3.</span>
            <Button size="sm" variant="outline" onClick={() => void askToSave()}>Ask customers to save our number</Button>
            <span className="text-xs text-muted-foreground">Adds a ready “please save our number” message to Saved messages and opens Broadcasts — send it to everyone who messaged you, or use it as an automatic nudge for new chats.</span>
          </li>
        </ol>
      )}
      {!r.linked && <p className="text-xs text-muted-foreground">Link your WhatsApp number first.</p>}
      {msg && <p className="text-xs" role="status">{msg}</p>}
    </div>
  );
}

export function StatusTool() {
  const { posts, error, load } = usePosts();
  if (error) return <p className="p-4 text-sm text-muted-foreground">{error}</p>;
  return (<><StatusReach /><Composer kind="status" onSaved={() => void load()} /><Posts kind="status" posts={posts} reload={() => void load()} /></>);
}

export function BroadcastTool() {
  const { posts, error, load } = usePosts();
  if (error) return <p className="p-4 text-sm text-muted-foreground">{error}</p>;
  return (<><Composer kind="broadcast" onSaved={() => void load()} /><Posts kind="broadcast" posts={posts} reload={() => void load()} /></>);
}

export function GroupsTool() {
  const { ws, canEdit } = useWs();
  const { posts, error, load } = usePosts();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [name, setName] = useState("");
  const [pick, setPick] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const loadGroups = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const [g, c] = await Promise.all([
      sb.from("wa_groups").select("jid, name, size, is_admin, announce").eq("workspace_id", ws).order("name"),
      sb.from("wa_group_collections").select("id, name, jids").eq("workspace_id", ws).order("name"),
    ]);
    setGroups((g.data ?? []) as GroupRow[]);
    setCollections((c.data ?? []) as Collection[]);
  }, [ws]);
  useEffect(() => { void loadGroups(); }, [loadGroups]);
  if (error) return <p className="p-4 text-sm text-muted-foreground">{error}</p>;
  const saveCollection = async () => {
    const sb = supabase(); if (!sb || !ws) return;
    if (!name.trim() || !pick.length) return setMsg("Name the collection and tick its groups.");
    const { error: e } = await sb.from("wa_group_collections").upsert({ workspace_id: ws, name: name.trim(), jids: pick }, { onConflict: "workspace_id,name" });
    if (e) return setMsg(e.message);
    setName(""); setPick([]); setMsg("Collection saved.");
    await loadGroups();
  };
  const remove = async (id: string) => {
    const sb = supabase(); if (!sb) return;
    await sb.from("wa_group_collections").delete().eq("id", id);
    await loadGroups();
  };
  return (
    <>
      <Composer kind="group" groups={groups} collections={collections} onSaved={() => void load()} />
      {canEdit && groups.length > 0 && (
        <details className="border-t px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Collections ({collections.length})</summary>
          <div className="mt-2 space-y-2">
            {collections.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                <span>{c.name} · {c.jids.length} group{c.jids.length === 1 ? "" : "s"}</span>
                <Button size="icon" variant="ghost" className="size-7" onClick={() => void remove(c.id)} aria-label={`Delete ${c.name}`}><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
            <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="New collection, e.g. Resellers" aria-label="Collection name" />
            <ul className="scroll-thin max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {groups.map((g) => (
                <li key={g.jid}><label className="flex items-center gap-2 text-xs"><Checkbox checked={pick.includes(g.jid)} onCheckedChange={() => setPick(pick.includes(g.jid) ? pick.filter((x) => x !== g.jid) : [...pick, g.jid])} />{g.name || "Unnamed group"}</label></li>
              ))}
            </ul>
            <Button size="sm" variant="outline" onClick={() => void saveCollection()}>Save collection</Button>
            {msg && <p className="text-xs" role="status">{msg}</p>}
          </div>
        </details>
      )}
      <Posts kind="group" posts={posts} reload={() => void load()} />
    </>
  );
}
