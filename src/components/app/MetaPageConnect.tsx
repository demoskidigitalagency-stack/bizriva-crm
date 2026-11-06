/**
 * Connect the business's Facebook Page (real data): Messenger and Instagram
 * DMs into the Inbox, and lead-form leads from Facebook/Instagram ads.
 * The Page token and app secret go to the encrypted vault and are never shown
 * again; the owner then pastes our callback address and verify token into Meta.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section, StatusBadge } from "@/components/app/primitives";
import { Copy } from "@/components/app/WhatsAppConnect";
import { useAuth } from "@/app/auth";
import { useLive } from "@/domain/store";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";

export const META_WEBHOOK = "https://xjhzkciowmklxrtwsikm.supabase.co/functions/v1/meta-webhook";
interface PageRow { page_id: string; page_name: string | null; ig_account_id: string | null; verify_token: string; active: boolean; connected_at: string; last_event_at: string | null; last_sent_at: string | null; last_error: string | null }
interface LeadRow { id: string; fields: Record<string, string>; platform: string | null; error: string | null; received_at: string }

export function MetaPageConnect() {
  const { current } = useAuth();
  const live = useLive();
  const ws = current?.workspaceId;
  const isOwner = current?.role === "owner";
  const [row, setRow] = useState<PageRow | null | undefined>(undefined);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ pageId: "", pageName: "", igId: "", token: "", secret: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const { data } = await sb.from("meta_pages").select("page_id, page_name, ig_account_id, verify_token, active, connected_at, last_event_at, last_sent_at, last_error").eq("workspace_id", ws).maybeSingle();
    const r = (data as PageRow | null) ?? null;
    setRow(r);
    if (r) setF((x) => ({ ...x, pageId: r.page_id, pageName: r.page_name ?? "", igId: r.ig_account_id ?? "" }));
    const l = await sb.from("meta_leads").select("id, fields, platform, error, received_at").eq("workspace_id", ws).order("received_at", { ascending: false }).limit(5);
    setLeads((l.data ?? []) as LeadRow[]);
  }, [ws]);
  useEffect(() => { void load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = supabase(); if (!sb || !ws) return;
    if (!/^\d{5,25}$/.test(f.pageId.trim())) return setError("The Page ID is a long number — Meta Business Suite → Settings → Page, or your Page's About → Page transparency.");
    if (!row?.active && (f.token.trim().length < 50 || f.secret.trim().length < 16)) return setError("Paste the Page access token and the app secret from your Meta app.");
    setBusy(true); setError("");
    const { error: er } = await sb.rpc("save_meta_page", { p_workspace: ws, p_page_id: f.pageId.trim(), p_page_name: f.pageName.trim(), p_ig_id: f.igId.trim(), p_token: f.token.trim(), p_app_secret: f.secret.trim() });
    setBusy(false);
    if (er) return setError(er.message);
    setF((x) => ({ ...x, token: "", secret: "" })); setEditing(false);
    await load(); await live.reload();
  };
  const disconnect = async () => {
    const sb = supabase(); if (!sb || !ws) return;
    setBusy(true);
    const { error: er } = await sb.rpc("disconnect_meta_page", { p_workspace: ws });
    setBusy(false);
    if (er) setError(er.message); else await load();
  };

  const connected = !!row?.active;
  return (
    <Section title="Facebook Page — Messenger, Instagram and lead forms" action={connected ? <StatusBadge tone={row?.last_event_at ? "success" : "warning"}>{row?.last_event_at ? "Connected" : "Waiting for Meta"}</StatusBadge> : <StatusBadge>Not connected</StatusBadge>}>
      <div className="space-y-3 p-4 text-sm">
        <p className="text-muted-foreground">Messenger and Instagram messages land in the Inbox (your AI assistant answers them too), and people who fill an instant form on your Facebook or Instagram ad become a lead with a call task.</p>
        {!current || (!isOwner && current.role !== "manager") ? <p className="text-xs text-muted-foreground">The owner connects the Page.</p>
          : row === undefined ? <p className="text-xs text-muted-foreground" role="status">Checking…</p>
          : connected && !editing ? (
            <>
              <dl className="grid gap-1 sm:grid-cols-3">
                <div><dt className="text-xs text-muted-foreground">Page</dt><dd className="font-medium">{row!.page_name ?? row!.page_id}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Instagram</dt><dd className="font-medium">{row!.ig_account_id ? "Linked" : "Not linked"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Last from Meta</dt><dd>{row!.last_event_at ? relativeTime(row!.last_event_at) : "Nothing yet"}</dd></div>
              </dl>
              <Copy label="Callback URL" value={META_WEBHOOK} />
              <Copy label="Verify token" value={row!.verify_token} />
              <p className="text-xs text-muted-foreground">In your Meta app → Webhooks: for <strong>Page</strong>, subscribe to <code>messages</code> and <code>leadgen</code>; for <strong>Instagram</strong>, subscribe to <code>messages</code>. Then subscribe the app to your Page. For lead forms, give the app "leads retrieval" access in Business Settings → Integrations → Leads access.</p>
              {row!.last_error && <p className="rounded bg-destructive/10 p-2 text-xs text-destructive" role="note">Last problem from Meta: {row!.last_error}</p>}
              {leads.length > 0 && (
                <ul className="divide-y rounded border text-xs" aria-label="Latest leads from ads">
                  {leads.map((l) => <li key={l.id} className="flex justify-between gap-2 p-2"><span className="truncate">{l.error ? `Couldn't read the lead: ${l.error}` : `${l.fields["full_name"] ?? "Lead"} · ${l.fields["phone_number"] ?? l.fields["email"] ?? ""}`}</span><span className="shrink-0 text-muted-foreground">{l.platform === "ig" ? "Instagram" : "Facebook"} · {relativeTime(l.received_at)}</span></li>)}
                </ul>
              )}
              {isOwner && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(true)}>Change</Button><Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void disconnect()}>Disconnect</Button></div>}
            </>
          ) : isOwner ? (
            <form aria-label="Connect Facebook Page" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => void save(e)}>
              <div className="space-y-1.5"><Label htmlFor="mp-id">Page ID</Label><Input id="mp-id" inputMode="numeric" value={f.pageId} onChange={(e) => setF({ ...f, pageId: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="mp-name">Page name</Label><Input id="mp-name" value={f.pageName} onChange={(e) => setF({ ...f, pageName: e.target.value })} placeholder="Glow Naturals" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="mp-ig">Instagram account ID (optional — the Instagram professional account linked to the Page)</Label><Input id="mp-ig" inputMode="numeric" value={f.igId} onChange={(e) => setF({ ...f, igId: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="mp-token">Page access token{connected ? " (empty = keep)" : ""}</Label><Input id="mp-token" type="password" autoComplete="off" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} placeholder="Long-lived Page token" /></div>
              <div className="space-y-1.5"><Label htmlFor="mp-secret">App secret{connected ? " (empty = keep)" : ""}</Label><Input id="mp-secret" type="password" autoComplete="off" value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} placeholder="Meta app → Settings → Basic" /></div>
              <div className="flex gap-2 sm:col-span-2"><Button type="submit" size="sm" disabled={busy}>{connected ? "Save" : "Connect Page"}</Button>{editing && <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}</div>
            </form>
          ) : <p className="text-xs text-muted-foreground">Not connected yet — the owner connects the Page.</p>}
        {error && <p className="text-destructive" role="alert">{error}</p>}
      </div>
    </Section>
  );
}
