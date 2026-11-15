/**
 * Ads → send sales back to Meta and TikTok, so ads are judged on real orders.
 * Meta: a dataset (pixel) ID and an access token from Events Manager → Settings → Conversions API.
 * TikTok: pixel code and access token from Events Manager → Settings. No app review needed.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useLive } from "@/domain/store";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";

type P = "meta" | "tiktok";
interface Link { platform: P; pixel_id: string; send_when: string; enabled: boolean; test_code: string | null; last_sent_at: string | null; last_error: string | null }
const NAME: Record<P, string> = { meta: "Meta (Facebook & Instagram)", tiktok: "TikTok" };
const HOW: Record<P, string> = {
  meta: "Events Manager → your dataset → Settings → Conversions API → Generate access token. The dataset ID is the number at the top.",
  tiktok: "TikTok Ads Manager → Assets → Events → your pixel → Settings → Generate access token. The pixel code is under the pixel name.",
};

export function SalesToAds() {
  const live = useLive();
  const { current } = useAuth();
  const ws = current?.workspaceId;
  const [links, setLinks] = useState<Link[]>([]);
  const [sent, setSent] = useState<Record<P, number>>({ meta: 0, tiktok: 0 });
  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const { data } = await sb.from("conversion_links").select("platform, pixel_id, send_when, enabled, test_code, last_sent_at, last_error").eq("workspace_id", ws);
    setLinks((data ?? []) as Link[]);
    const counts = await Promise.all((["meta", "tiktok"] as P[]).map((p) => sb.from("conversion_events").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("platform", p).eq("status", "sent")));
    setSent({ meta: counts[0]?.count ?? 0, tiktok: counts[1]?.count ?? 0 });
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  if (!live.on) return null;
  return (
    <Section title="Send sales back to Meta and TikTok" description="Confirmed or delivered orders are reported to the ad platforms (customer details hashed), so ads are judged on real sales. No app review needed">
      <div className="grid gap-4 p-4 md:grid-cols-2">{(["meta", "tiktok"] as P[]).map((p) => <Platform key={p} p={p} link={links.find((l) => l.platform === p)} sent={sent[p]} ws={ws!} onSaved={load} />)}</div>
    </Section>
  );
}

function Platform({ p, link, sent, ws, onSaved }: { p: P; link: Link | undefined; sent: number; ws: string; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({ pixel: link?.pixel_id ?? "", token: "", when: link?.send_when ?? "delivered", test: link?.test_code ?? "" });
  const [msg, setMsg] = useState("");
  useEffect(() => { setF((x) => ({ ...x, pixel: link?.pixel_id ?? x.pixel, when: link?.send_when ?? x.when, test: link?.test_code ?? x.test })); }, [link]);
  const on = !!link?.enabled;
  const save = async () => {
    const { error } = await supabase()!.rpc("save_conversion_link", { p_workspace: ws, p_platform: p, p_pixel: f.pixel.trim(), p_token: f.token.trim(), p_when: f.when, p_test_code: f.test.trim() });
    setMsg(error ? error.message : "Saved — sales are sent within a minute of reaching that step."); setF((x) => ({ ...x, token: "" })); await onSaved();
  };
  const off = async () => { const { error } = await supabase()!.rpc("remove_conversion_link", { p_workspace: ws, p_platform: p }); setMsg(error ? error.message : "Disconnected."); await onSaved(); };
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <p className="flex items-center justify-between gap-2 font-medium">{NAME[p]} <StatusBadge tone={on ? (link?.last_error ? "warning" : "success") : "neutral"}>{on ? (link?.last_error ? "Check settings" : "Connected") : "Not connected"}</StatusBadge></p>
      <p className="text-xs text-muted-foreground">{HOW[p]}</p>
      <Input aria-label={`${NAME[p]} ${p === "meta" ? "dataset ID" : "pixel code"}`} placeholder={p === "meta" ? "Dataset (pixel) ID" : "Pixel code"} value={f.pixel} onChange={(e) => setF({ ...f, pixel: e.target.value })} />
      <Input aria-label={`${NAME[p]} access token`} type="password" autoComplete="off" placeholder={on ? "Access token (saved — paste only to change)" : "Access token"} value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="When to send" className="h-9 rounded-md border bg-background px-2 text-sm" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })}><option value="delivered">When delivered</option><option value="confirmed">When confirmed</option></select>
        <Input aria-label="Test event code" placeholder="Test code (optional)" value={f.test} onChange={(e) => setF({ ...f, test: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={() => void save()}>{on ? "Save" : "Connect"}</Button>{on && <Button size="sm" variant="ghost" onClick={() => void off()}>Disconnect</Button>}</div>
      {on && <p className="text-xs text-muted-foreground">{sent} sale{sent === 1 ? "" : "s"} sent{link?.last_sent_at ? ` · last ${relativeTime(link.last_sent_at)}` : ""}</p>}
      {link?.last_error && <p className="text-xs text-destructive">Last error: {link.last_error}</p>}
      {msg && <p role="status" className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
