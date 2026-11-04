import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import type { KnowledgeEntry } from "@/domain/types";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/knowledge")({
  head: () => ({ meta: [{ title: "Knowledge Base · Bizriva CRM" }] }),
  component: Knowledge,
});

const TOPICS: Record<KnowledgeEntry["topic"], string> = { company: "Company", faq: "FAQ", delivery: "Delivery", payment: "Payment", returns: "Returns", promotion: "Promotions", terms: "Terms", script: "Sales scripts" };

function EntryDialog({ entry, onClose }: { entry: KnowledgeEntry | "new"; onClose: () => void }) {
  const { saveRecord } = useActions();
  const [e, setE] = useState(entry === "new" ? { topic: "faq" as KnowledgeEntry["topic"], question: "", answer: "", keywords: [] as string[] } : entry);
  const [kw, setKw] = useState(e.keywords.join(", "));
  const [error, setError] = useState("");
  const save = () => {
    if (!e.question.trim() || !e.answer.trim()) return setError("Add both the question and the answer.");
    const keywords = kw.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!keywords.length) return setError("Add at least one keyword — it's how the agent finds this answer.");
    saveRecord("knowledge", { ...e, question: e.question.trim(), answer: e.answer.trim(), keywords, updatedAt: new Date().toISOString() });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{entry === "new" ? "New answer" : "Edit answer"}</DialogTitle><DialogDescription>Write it exactly as a customer should read it. The agent repeats it word for word.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label>Topic</Label>
            <Select value={e.topic} onValueChange={(v) => setE({ ...e, topic: v as KnowledgeEntry["topic"] })}>
              <SelectTrigger aria-label="Topic"><SelectValue>{TOPICS[e.topic]}</SelectValue></SelectTrigger>
              <SelectContent>{(Object.keys(TOPICS) as KnowledgeEntry["topic"][]).map((t) => <SelectItem key={t} value={t}>{TOPICS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="kq">Customer question</Label><Input id="kq" value={e.question} onChange={(x) => setE({ ...e, question: x.target.value })} placeholder="Do you deliver to Port Harcourt?" /></div>
          <div className="space-y-1.5"><Label htmlFor="ka">Answer</Label><Textarea id="ka" rows={4} value={e.answer} onChange={(x) => setE({ ...e, answer: x.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="kk">Keywords, separated by commas</Label><Input id="kk" value={kw} onChange={(x) => setKw(x.target.value)} placeholder="port harcourt, ph, rivers" /></div>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Knowledge() {
  const db = useDb();
  const { removeRecord, addPolicyStarters } = useActions();
  const [added, setAdded] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<"all" | KnowledgeEntry["topic"]>("all");
  const [editing, setEditing] = useState<KnowledgeEntry | "new" | null>(null);
  const n = q.trim().toLowerCase();
  const rows = db.knowledge.filter((k) => (topic === "all" || k.topic === topic) && (!n || `${k.question} ${k.answer} ${k.keywords.join(" ")}`.toLowerCase().includes(n)));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Automation</p>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="mt-1 text-sm text-muted-foreground">The only answers the AI agent may give, besides prices from Products. <Link to="/ai-agent" className="underline">Test them in the agent</Link>.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdded(addPolicyStarters())}>Add policy starters</Button>
          <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" /> New answer</Button>
        </div>
      </div>
      {added !== null && <p className="text-sm" role="status">{added ? `${added} policy starters added: returns, delivery areas, deposits, missed deliveries and privacy. Edit them to match your business.` : "Policy starters are already in your Knowledge Base."}</p>}
      <Section>
        <div className="flex flex-wrap gap-2 border-b p-3">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions, answers, keywords" className="pl-8" aria-label="Search knowledge" />
          </div>
          <Select value={topic} onValueChange={(v) => setTopic(v as typeof topic)}>
            <SelectTrigger className="h-9 w-40" aria-label="Topic"><SelectValue>{topic === "all" ? "All topics" : TOPICS[topic]}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="all">All topics</SelectItem>{(Object.keys(TOPICS) as KnowledgeEntry["topic"][]).map((t) => <SelectItem key={t} value={t}>{TOPICS[t]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {rows.length === 0 ? <EmptyState title="No answers match" /> : (
          <ul className="divide-y">
            {rows.map((k) => (
              <li key={k.id} className="flex gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{k.question}</p><StatusBadge tone="brand">{TOPICS[k.topic]}</StatusBadge></div>
                  <p className="mt-1 text-muted-foreground">{k.answer}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Keywords: {k.keywords.join(", ")} · updated {relativeTime(k.updatedAt)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(k)} aria-label={`Edit ${k.question}`}><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => removeRecord("knowledge", k.id)} aria-label={`Delete ${k.question}`}><Trash2 className="size-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {editing && <EntryDialog entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
