import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, RotateCcw, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import { agentReply, type AgentReply } from "@/domain/agent";
import type { AgentConfig } from "@/domain/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ai-agent")({
  head: () => ({ meta: [{ title: "AI Sales Agent · Bizriva CRM" }] }),
  component: AiAgent,
});

type Line = { from: "customer" | "agent"; text: string; meta?: AgentReply };
const SAMPLES = ["Hello, I'm interested", "How much is the body wave?", "Can I see pictures of the frontal?", "How long does delivery take to Abuja?", "Can I pay on delivery?", "Is it real human hair?", "Do you have the pixie curl wig?", "I want to speak to a person", "Do you sell perfume?"];

function Settings() {
  const db = useDb();
  const { updateAgent } = useActions();
  const [draft, setDraft] = useState<AgentConfig>(db.agent);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(db.agent); }, [db.agent]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(db.agent);
  return (
    <Section title="Agent setup" description="How the agent introduces itself and when it hands over.">
      <div className="space-y-3 p-4">
        <label className="flex items-center gap-2 text-sm"><Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} /> Agent answers new chats first</label>
        <div className="space-y-1.5"><Label htmlFor="an">Name customers see</Label><Input id="an" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="ag">Greeting</Label><Textarea id="ag" rows={3} value={draft.greeting} onChange={(e) => setDraft({ ...draft, greeting: e.target.value })} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Tone</Label>
            <Select value={draft.tone} onValueChange={(v) => setDraft({ ...draft, tone: v as AgentConfig["tone"] })}>
              <SelectTrigger aria-label="Tone"><SelectValue>{draft.tone}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="friendly">Friendly</SelectItem><SelectItem value="formal">Formal</SelectItem><SelectItem value="playful">Playful</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="mi">Most photos per reply</Label><Input id="mi" inputMode="numeric" value={draft.maxImages} onChange={(e) => setDraft({ ...draft, maxImages: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="hk">Hand over to a person when the customer says</Label><Input id="hk" value={draft.handoffKeywords.join(", ")} onChange={(e) => setDraft({ ...draft, handoffKeywords: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></div>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!dirty} onClick={() => { updateAgent(draft); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>Save</Button>
          {saved && <span className="text-xs text-success" role="status">Saved</span>}
        </div>
        <p className="text-xs text-muted-foreground">The agent's facts come only from <Link to="/products" className="underline">Products</Link>, <Link to="/knowledge" className="underline">Knowledge Base</Link> and <Link to="/media" className="underline">Media Library</Link>. Change those to change what it says.</p>
      </div>
    </Section>
  );
}

function TestChat() {
  const db = useDb();
  const [ad, setAd] = useState<string>("none");
  const [who, setWho] = useState<string>("new");
  const known = db.contacts.filter((c) => (c.facts ?? []).length > 0);
  const [text, setText] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [lines]);

  const send = (msg: string) => {
    const m = msg.trim();
    if (!m) return;
    const reply = agentReply(db, m, { ...(ad !== "none" ? { adProductId: ad } : {}), ...(who !== "new" ? { contactId: who } : {}), firstMessage: lines.length === 0 });
    setLines((l) => [...l, { from: "customer", text: m }, { from: "agent", text: reply.text, meta: reply }]);
    setText("");
  };

  return (
    <Section
      title="Test chat"
      description="Type as a customer. Nothing is sent to anyone."
      action={<Button size="sm" variant="ghost" onClick={() => setLines([])}><RotateCcw className="size-3.5" /> Clear</Button>}
    >
      <div className="flex flex-wrap items-center gap-2 border-b p-3 text-sm">
        <span className="text-muted-foreground">Customer came from an ad for</span>
        <Select value={ad} onValueChange={setAd}>
          <SelectTrigger className="h-8 w-56" aria-label="Advertised product"><SelectValue>{ad === "none" ? "No ad (direct message)" : db.products.find((p) => p.id === ad)?.name}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No ad (direct message)</SelectItem>
            {db.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">as</span>
        <Select value={who} onValueChange={(v) => { setWho(v); setLines([]); }}>
          <SelectTrigger className="h-8 w-56" aria-label="Customer"><SelectValue>{who === "new" ? "A new customer" : (() => { const c = known.find((x) => x.id === who); return c ? `${c.firstName} ${c.lastName} (known)` : "A new customer"; })()}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="new">A new customer</SelectItem>
            {known.map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName} — {(c.facts ?? []).map((f) => f.value).slice(0, 2).join(", ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="h-[380px] space-y-2 overflow-y-auto bg-chat p-4" aria-live="polite">
        {lines.length === 0 && <p className="pt-16 text-center text-sm text-muted-foreground">Try one of the examples below.</p>}
        {lines.map((l, i) => (
          <div key={i} className={cn("flex", l.from === "customer" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", l.from === "customer" ? "bg-primary text-primary-foreground" : "bg-chat-in text-chat-in-foreground shadow-xs")}>
              <p className="mb-0.5 flex items-center gap-1 text-[10px] opacity-70">{l.from === "customer" ? <UserRound className="size-3" /> : <Bot className="size-3" />}{l.from === "customer" ? "Customer" : db.agent.name}</p>
              <p>{l.text}</p>
              {l.meta && l.meta.photos > 0 && <p className="mt-1 text-xs opacity-80">[{l.meta.photos} photo{l.meta.photos > 1 ? "s" : ""} attached]</p>}
              {l.meta && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <StatusBadge>{l.meta.intent.replace("_", " ")}</StatusBadge>
                  {l.meta.handoff && <StatusBadge tone="warning">Handed to a person</StatusBadge>}
                  {l.meta.sources.map((s) => <StatusBadge key={s} tone="brand">{s}</StatusBadge>)}
                  {l.meta.sources.length === 0 && !l.meta.handoff && <StatusBadge tone="neutral">Asked a question back</StatusBadge>}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a customer message" aria-label="Customer message" />
        <Button type="submit" disabled={!text.trim()}><Send className="size-4" /> Send</Button>
      </form>
      <div className="flex flex-wrap gap-1.5 border-t p-3">
        {SAMPLES.map((s) => <Button key={s} size="sm" variant="outline" className="h-7 text-xs" onClick={() => send(s)}>{s}</Button>)}
      </div>
    </Section>
  );
}

function AiAgent() {
  const db = useDb();
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Automation</p>
          <h1 className="text-2xl font-bold">AI Sales Agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">Answers the first messages from ads: greets, quotes prices from the catalogue, sends photos and hands over to a person when needed.</p>
        </div>
        <StatusBadge tone={db.agent.enabled ? "info" : "neutral"}>{db.agent.enabled ? "On · practice rules" : "Off"}</StatusBadge>
      </div>
      <p className="rounded-md border bg-surface p-3 text-xs text-muted-foreground">
        Practice Mode uses fixed rules that follow the same limits as the real AI: it never invents a price, stock level or promise, and anything it can't answer goes to a person. The real language model replaces these rules when the backend is connected.
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Settings />
        <TestChat />
      </div>
    </div>
  );
}
