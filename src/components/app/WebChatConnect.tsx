/**
 * Website chat (real data): turn the chat bubble on, copy the one-line script
 * for the website (or the direct link), and set the greeting. Visitors' chats
 * land in the Inbox and the AI answers them like WhatsApp chats.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { useActions, useDb, useLive } from "@/domain/store";
import { supabase } from "@/lib/supabase";

export function WebChatConnect() {
  const { current } = useAuth();
  const db = useDb();
  const live = useLive();
  const { updateSettings } = useActions();
  const key = db.settings.webchatKey;
  const canEdit = current?.role === "owner" || current?.role === "manager";
  const w = db.settings.webchat ?? {};
  const [greeting, setGreeting] = useState(w.greeting ?? "Hi! How can we help you today?");
  const [askPhone, setAskPhone] = useState(w.askPhone !== false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = key ? `${origin}/chat/${key}` : "";
  const script = key ? `<script src="${origin}/webchat.js" data-key="${key}" async></script>` : "";

  const toggle = async (on: boolean) => {
    const sb = supabase(); if (!sb || !current) return;
    setBusy(true); setError("");
    const { error: e } = await sb.rpc("set_webchat", { p_workspace: current.workspaceId, p_on: on });
    setBusy(false);
    if (e) { setError(e.message); return; }
    await live.reload();
  };
  const copy = async (what: string, text: string) => { try { await navigator.clipboard.writeText(text); } catch { /* blocked */ } setCopied(what); };

  return (
    <Section title="Website chat" action={key ? <StatusBadge tone="success">On</StatusBadge> : <StatusBadge>Off</StatusBadge>}>
      <form aria-label="Website chat" className="space-y-3 p-4 text-sm" onSubmit={(e) => { e.preventDefault(); updateSettings({ webchat: { ...w, greeting: greeting.trim(), askPhone } }); }}>
        <p className="text-muted-foreground">A chat bubble on your website. Visitors' messages land in the Inbox, and your AI assistant answers them like WhatsApp chats.</p>
        <label className="flex items-center gap-2"><Switch checked={!!key} disabled={!canEdit || busy} onCheckedChange={(v) => void toggle(v)} aria-label="Website chat on" /> {key ? "Website chat is on" : "Turn on website chat"}</label>
        {!canEdit && <p className="text-xs text-muted-foreground">Only owners and managers can change this.</p>}
        {error && <p className="text-destructive" role="alert">{error}</p>}
        {key && (
          <>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Paste this before &lt;/body&gt; on your website</p>
              <div className="flex gap-2"><code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs" aria-label="Website script">{script}</code><Button type="button" size="sm" variant="outline" onClick={() => void copy("script", script)}>{copied === "script" ? "Copied" : "Copy"}</Button></div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Or share the chat link (bio, flyers, QR code)</p>
              <div className="flex gap-2"><code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs" aria-label="Chat link">{link}</code><Button type="button" size="sm" variant="outline" onClick={() => void copy("link", link)}>{copied === "link" ? "Copied" : "Copy"}</Button><Button type="button" size="sm" variant="ghost" asChild><a href={link} target="_blank" rel="noreferrer">Open</a></Button></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1.5"><Label htmlFor="wc-greet">Greeting</Label><Input id="wc-greet" value={greeting} maxLength={200} disabled={!canEdit} onChange={(e) => setGreeting(e.target.value)} /></div>
              <label className="flex items-center gap-2 pb-2"><Switch checked={askPhone} disabled={!canEdit} onCheckedChange={setAskPhone} aria-label="Ask for phone number" /> Ask for a phone number</label>
            </div>
            {canEdit && <Button type="submit" size="sm">Save greeting</Button>}
            <p className="text-xs text-muted-foreground">Turning it off stops the bubble straight away. Turning it on again keeps the same script.</p>
          </>
        )}
      </form>
    </Section>
  );
}
