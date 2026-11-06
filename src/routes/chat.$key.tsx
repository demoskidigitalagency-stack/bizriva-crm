/**
 * Public website chat (/chat/<key>): what a visitor sees in the bubble on the
 * business's website, or on the shared link. Talks to the webchat function;
 * the visitor's secret token stays in their own browser.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/chat/$key")({
  head: () => ({ meta: [{ title: "Chat with us" }, { name: "robots", content: "noindex" }] }),
  component: WebChat,
});

const FN = `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ""}/functions/v1/webchat`;
interface Info { business: string; greeting: string; color: string; askPhone: boolean }
interface Msg { id: string; from: "you" | "us"; text: string | null; at: string; media?: { kind: string; name?: string; url: string | null } | null; pending?: boolean }

async function call<T>(body: Record<string, unknown>): Promise<T & { error?: string }> {
  try {
    const r = await fetch(FN, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  } catch { return { error: "No connection — check your internet" } as T & { error: string }; }
}
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* private window */ } },
};
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");

function WebChat() {
  const { key } = Route.useParams();
  const slot = `bizriva.webchat.${key}`;
  const [info, setInfo] = useState<Info | null>(null);
  const [off, setOff] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [f, setF] = useState({ name: "", phone: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const last = useRef<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void call<Info>({ action: "info", key }).then((r) => { if (r.error) setOff(r.error); else setInfo(r); });
    setToken(store.get(slot));
  }, [key, slot]);

  const poll = useCallback(async () => {
    if (!token) return;
    const r = await call<{ messages: Msg[] }>({ action: "poll", token, after: last.current });
    if (r.error === "expired") { store.del(slot); setToken(null); setMsgs([]); last.current = null; return; }
    if (r.messages?.length) {
      last.current = r.messages[r.messages.length - 1]!.at;
      setMsgs((m) => [...m.filter((x) => !x.pending && !r.messages.some((y) => y.id === x.id)), ...r.messages]);
    }
  }, [token, slot]);
  useEffect(() => {
    if (!token) return;
    void poll();
    const t = setInterval(() => { if (document.visibilityState === "visible") void poll(); }, 3000);
    return () => clearInterval(t);
  }, [token, poll]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  const start = async () => {
    if (!f.name.trim()) return setError("Please tell us your name.");
    if (info?.askPhone && f.phone.replace(/\D/g, "").length < 10) return setError("Please enter your phone number so we can reach you.");
    setBusy(true); setError("");
    const t = newToken();
    const r = await call({ action: "start", key, token: t, name: f.name.trim(), phone: f.phone.trim() || undefined });
    setBusy(false);
    if (r.error) return setError(r.error);
    store.set(slot, t); setToken(t);
  };
  const send = async () => {
    const body = text.trim();
    if (!body || !token) return;
    setText("");
    const temp: Msg = { id: `p${Date.now()}`, from: "you", text: body, at: new Date().toISOString(), pending: true };
    setMsgs((m) => [...m, temp]);
    const r = await call({ action: "send", token, text: body });
    if (r.error) { setMsgs((m) => m.filter((x) => x.id !== temp.id)); setText(body); setError(r.error === "expired" ? "This chat has ended — please start again." : r.error); return; }
    setError("");
    void poll();
  };

  const color = info?.color ?? "#16a34a";
  if (off) return <main className="flex min-h-screen items-center justify-center p-4 text-sm text-muted-foreground">{off}</main>;
  return (
    <main className="flex h-[100dvh] flex-col bg-background">
      <header className="px-4 py-3 text-white" style={{ background: color }}>
        <h1 className="font-semibold">{info?.business ?? "…"}</h1>
        <p className="text-xs opacity-90">We usually reply in a few minutes</p>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite" aria-label="Messages">
        {info && <p className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm">{info.greeting}</p>}
        {msgs.map((m) => (
          <div key={m.id} className={m.from === "you" ? "flex justify-end" : "flex"}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.from === "you" ? "text-white" : "bg-muted"} ${m.pending ? "opacity-70" : ""}`} style={m.from === "you" ? { background: color } : undefined}>
              {m.media?.url && m.media.kind === "image" && <img src={m.media.url} alt={m.media.name ?? "Photo"} className="mb-1 max-h-60 rounded" />}
              {m.text}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {error && <p className="px-3 pb-1 text-xs text-destructive" role="alert">{error}</p>}
      {token ? (
        <form className="flex gap-2 border-t p-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" aria-label="Message" maxLength={2000} autoFocus />
          <Button type="submit" size="icon" aria-label="Send" style={{ background: color }}><Send className="size-4" /></Button>
        </form>
      ) : info ? (
        <form aria-label="Start chat" className="space-y-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void start(); }}>
          <div className="space-y-1"><Label htmlFor="wc-name">Your name</Label><Input id="wc-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></div>
          {info.askPhone && <div className="space-y-1"><Label htmlFor="wc-phone">Phone number</Label><Input id="wc-phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" /></div>}
          <Button type="submit" className="w-full text-white" disabled={busy} style={{ background: color }}>Start chat</Button>
          <p className="text-[11px] text-muted-foreground">By chatting you agree that {info.business} may contact you about your enquiry.</p>
        </form>
      ) : null}
    </main>
  );
}
