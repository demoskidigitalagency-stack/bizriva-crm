/**
 * Live WhatsApp broadcast / automatic nudge (linked number).
 *   Send to: people who asked about a product · everyone who messaged us · everyone with marketing consent
 *   Within: 24 hours … 1 year (from what they wrote, including chats loaded from the phone)
 *   Message: typed, or picked from Saved messages (and saved for next time)
 *   Once (now / at a time) or Automatically: every new person in the audience gets it once, after
 *   they've been quiet for a while; people who ordered in the last 7 days are skipped.
 *   When they reply: an optional answer sent once, and they're tagged "Replied to broadcast".
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDb, useLive } from "@/domain/store";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";

export const WINDOWS = [
  { h: 24, label: "the last 24 hours" }, { h: 72, label: "the last 3 days" }, { h: 168, label: "the last 7 days" },
  { h: 720, label: "the last 30 days" }, { h: 2160, label: "the last 3 months" }, { h: 4392, label: "the last 6 months" }, { h: 8784, label: "the last year" },
];
const WAITS = [{ h: 0, label: "straight away" }, { h: 1, label: "1 hour" }, { h: 2, label: "2 hours" }, { h: 6, label: "6 hours" }, { h: 12, label: "12 hours" }, { h: 24, label: "1 day" }];
type Kind = "product" | "messaged" | "consent";
interface Saved { id: string; name: string; body: string }

export function NudgeForm({ onClose, preset }: { onClose: () => void; preset?: { productId: string; hours: number } }) {
  const db = useDb();
  const live = useLive();
  const { current } = useAuth();
  const ws = current?.workspaceId;
  const [kind, setKind] = useState<Kind>(preset ? "product" : "product");
  const [productId, setProduct] = useState(preset?.productId ?? db.products[0]?.id ?? "");
  const [hours, setHours] = useState(preset?.hours ?? 24);
  const [mode, setMode] = useState<"once" | "auto">("once");
  const [wait, setWait] = useState(2);
  const [name, setName] = useState(preset ? `${db.products.find((p) => p.id === preset.productId)?.name ?? "Product"} follow-up` : "");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [when, setWhen] = useState("");
  const [saved, setSaved] = useState<Saved[]>([]);
  const [count, setCount] = useState<{ total: number; in_24h: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const audience = kind === "consent" ? {} : { kind, hours, ...(kind === "product" ? { product_id: productId } : {}), ...(mode === "auto" ? { wait_hours: wait } : {}) };
  const key = JSON.stringify(audience);

  useEffect(() => {
    const sb = supabase(); if (!sb || !ws) return;
    void sb.from("saved_messages").select("id, name, body").eq("workspace_id", ws).order("created_at", { ascending: false }).then(({ data }) => setSaved((data ?? []) as Saved[]));
  }, [ws]);
  useEffect(() => {
    const sb = supabase(); if (!sb || !ws || (kind === "product" && !productId)) return;
    setCount(null);
    void sb.rpc("audience_count", { p_workspace: ws, p_audience: JSON.parse(key) }).then(({ data }) => setCount((data as { total: number; in_24h: number }) ?? null));
  }, [ws, key, kind, productId]);

  const saveMessage = async () => {
    if (!body.trim()) return setError("Write the message first.");
    const label = name.trim() || body.trim().slice(0, 40);
    const { data, error: e } = await supabase()!.from("saved_messages").insert({ workspace_id: ws, name: label, body: body.trim() }).select("id, name, body").single();
    if (e) return setError(e.message);
    setSaved([data as Saved, ...saved]); setError("");
  };
  const submit = async (status: "draft" | "scheduled" | "auto") => {
    if (!name.trim()) return setError("Give it a name, e.g. \"Game table nudge\".");
    if (!body.trim()) return setError("Write the message.");
    if (kind === "product" && !productId) return setError("Pick the product.");
    if (status === "scheduled" && when && new Date(when) <= new Date()) return setError("Pick a time in the future, or leave it empty to send now.");
    setBusy(true);
    const { error: e } = await supabase()!.from("campaigns").insert({
      workspace_id: ws, name: name.trim(), channel: "whatsapp", body: body.trim(), reply_body: reply.trim() || null, audience,
      status, scheduled_for: status === "scheduled" ? (when ? new Date(when).toISOString() : new Date().toISOString()) : null,
    });
    setBusy(false);
    if (e) return setError(e.message);
    await live.reload(); onClose();
  };

  const product = db.products.find((p) => p.id === productId)?.name;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New WhatsApp broadcast</DialogTitle>
          <DialogDescription>Sent from your linked WhatsApp number. Each person gets it once.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label>Send to</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger aria-label="Send to"><SelectValue>{kind === "product" ? "People who asked about a product" : kind === "messaged" ? "Everyone who messaged us" : "Everyone who agreed to marketing"}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="product">People who asked about a product</SelectItem>
                <SelectItem value="messaged">Everyone who messaged us</SelectItem>
                <SelectItem value="consent">Everyone who agreed to marketing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {kind !== "consent" && (
            <div className="grid gap-2 sm:grid-cols-2">
              {kind === "product" && (
                <div className="space-y-1.5"><Label>Asked about</Label>
                  <Select value={productId} onValueChange={setProduct}>
                    <SelectTrigger aria-label="Product"><SelectValue>{product ?? "Pick a product"}</SelectValue></SelectTrigger>
                    <SelectContent>{db.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5"><Label>Wrote to us within</Label>
                <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
                  <SelectTrigger aria-label="Time window"><SelectValue>{WINDOWS.find((w) => w.h === hours)?.label}</SelectValue></SelectTrigger>
                  <SelectContent>{WINDOWS.map((w) => <SelectItem key={w.h} value={String(w.h)}>{w.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}
          <p className="rounded-md bg-muted px-3 py-2 text-sm" role="status">
            {count === null ? "Counting…" : <><b>{count.total}</b> {count.total === 1 ? "person" : "people"} right now.{count.total > count.in_24h ? ` ${count.in_24h} wrote in the last 24 hours and get it straight away; the other ${count.total - count.in_24h} go out slowly, a few each day, to keep your number safe.` : ""}</>}
            <span className="block text-xs text-muted-foreground">Skips anyone who said STOP and contacts tagged Personal or Not a customer.</span>
          </p>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2"><Label htmlFor="nb">Message</Label>
              {saved.length > 0 && (
                <Select value="" onValueChange={(id) => { const m = saved.find((x) => x.id === id); if (m) { setBody(m.body); if (!name.trim()) setName(m.name); } }}>
                  <SelectTrigger className="h-7 w-auto text-xs" aria-label="Use a saved message"><SelectValue placeholder="Use a saved message" /></SelectTrigger>
                  <SelectContent>{saved.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <Textarea id="nb" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Hi {{name}}, you asked us about the ${product ?? "game table"}. It's available now — reply YES and we'll arrange delivery.`} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{"{{name}}"} becomes their first name (or "there").</p>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void saveMessage()}>Save as template</Button>
            </div>
          </div>

          <div className="space-y-1.5"><Label htmlFor="nr">When they reply, send (optional)</Label>
            <Textarea id="nr" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Thanks {{name}}! Please send your location and phone number and we'll confirm delivery." />
            <p className="text-xs text-muted-foreground">Sent once, the first time they answer within 3 days. They're also tagged "Replied to broadcast" so you can find them in the Inbox.</p>
          </div>

          <div className="space-y-1.5"><Label>How often</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "once" | "auto")}>
              <SelectTrigger aria-label="How often"><SelectValue>{mode === "once" ? "Once" : "Automatically, to every new person"}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="once">Once</SelectItem>
                <SelectItem value="auto">Automatically, to every new person</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "once" ? (
            <div className="space-y-1.5"><Label htmlFor="nw">Send at (leave empty to send now)</Label><Input id="nw" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
          ) : (
            <div className="space-y-1.5"><Label>After they've been quiet for</Label>
              <Select value={String(wait)} onValueChange={(v) => setWait(Number(v))}>
                <SelectTrigger aria-label="Wait"><SelectValue>{WAITS.find((w) => w.h === wait)?.label}</SelectValue></SelectTrigger>
                <SelectContent>{WAITS.map((w) => <SelectItem key={w.h} value={String(w.h)}>{w.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Checks every 10 minutes. Anyone who placed an order in the last 7 days is skipped. Pause it any time from the list.</p>
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="nn">Name (for you)</Label><Input id="nn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Game table nudge" /></div>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => void submit("draft")}>Save draft</Button>
          {mode === "auto"
            ? <Button disabled={busy} onClick={() => void submit("auto")}>Start automatic nudges</Button>
            : <Button disabled={busy} onClick={() => void submit("scheduled")}>{when ? "Schedule" : "Send now"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
