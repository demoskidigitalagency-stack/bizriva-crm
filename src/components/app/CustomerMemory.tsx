import { useMemo, useState } from "react";
import { Brain, Cake, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import { NOW } from "@/domain/database";
import { FACT_LABEL, daysToBirthday, extractFacts, newFacts } from "@/domain/memory";
import type { FactKind } from "@/domain/types";

/** What we know about a customer: learned from their chats, confirmed by staff. */
export function CustomerMemory({ contactId, compact = false }: { contactId: string; compact?: boolean }) {
  const db = useDb();
  const { saveFacts, removeFact } = useActions();
  const contact = db.contacts.find((c) => c.id === contactId);
  const conversations = db.conversations.filter((c) => c.contactId === contactId);
  const found = useMemo(() => conversations.flatMap((c) => extractFacts(c)), [conversations]);
  const fresh = newFacts(found, contact?.facts);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<FactKind>("likes");
  const [value, setValue] = useState("");
  if (!contact) return null;
  const facts = contact.facts ?? [];
  const birthday = facts.find((f) => f.kind === "birthday" && f.monthDay);
  const inDays = birthday ? daysToBirthday(birthday.monthDay!, NOW) : null;

  return (
    <Section title="What we know" {...(compact ? {} : { description: "Learned from their chats. The AI agent uses this to speak to them personally." })} action={<Brain className="size-4 text-primary" aria-hidden="true" />}>
      <div className="space-y-3 p-3 text-sm" aria-label="Customer memory" role="group">
        {inDays !== null && inDays <= 7 && (
          <p className="flex items-center gap-2 rounded-md bg-success/10 px-2 py-1.5 text-xs" role="status"><Cake className="size-4 text-success" aria-hidden="true" /> Birthday {inDays === 0 ? "today" : inDays === 1 ? "tomorrow" : `in ${inDays} days`} — send the birthday greeting from Replies.</p>
        )}
        {facts.length === 0 ? <p className="text-xs text-muted-foreground">Nothing saved yet.</p> : (
          <ul className="flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <li key={f.id} className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs">
                <span className="text-muted-foreground">{FACT_LABEL[f.kind]}:</span> <span className="font-medium">{f.value}</span>
                <button type="button" className="rounded-full p-0.5 hover:bg-muted" aria-label={`Forget ${FACT_LABEL[f.kind]} ${f.value}`} onClick={() => removeFact(contactId, f.id)}><X className="size-3" /></button>
              </li>
            ))}
          </ul>
        )}
        {fresh.length > 0 && (
          <div className="rounded-md border border-dashed p-2">
            <p className="mb-1 text-xs font-semibold">Spotted in chats</p>
            <ul className="space-y-1 text-xs">
              {fresh.map((f) => <li key={`${f.kind}-${f.value}`} title={f.quote}><StatusBadge tone="info">{FACT_LABEL[f.kind]}</StatusBadge> {f.value} <span className="text-muted-foreground">— “{f.quote.slice(0, 60)}{f.quote.length > 60 ? "…" : ""}”</span></li>)}
            </ul>
            <Button size="sm" className="mt-2 w-full" onClick={() => saveFacts(contactId, fresh.map((f) => ({ kind: f.kind, value: f.value, ...(f.monthDay ? { monthDay: f.monthDay } : {}) })), "chat")}>Remember {fresh.length}</Button>
          </div>
        )}
        {adding ? (
          <form className="flex gap-1.5" onSubmit={(e) => {
            e.preventDefault();
            const md = kind === "birthday" ? /^(\d{1,2})[/.-](\d{1,2})$/.exec(value.trim()) : null;
            saveFacts(contactId, [{ kind, value: md ? new Date(2000, Number(md[2]) - 1, Number(md[1])).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : value, ...(md ? { monthDay: `${md[2]!.padStart(2, "0")}-${md[1]!.padStart(2, "0")}` } : {}) }], "staff");
            setValue(""); setAdding(false);
          }}>
            <Select value={kind} onValueChange={(v) => setKind(v as FactKind)}>
              <SelectTrigger className="h-8 w-28" aria-label="Fact type"><SelectValue>{FACT_LABEL[kind]}</SelectValue></SelectTrigger>
              <SelectContent>{(Object.keys(FACT_LABEL) as FactKind[]).map((k) => <SelectItem key={k} value={k}>{FACT_LABEL[k]}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="h-8" autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label="Fact" placeholder={kind === "birthday" ? "DD/MM" : "e.g. burgundy colour"} />
            <Button type="submit" size="sm" className="h-8" disabled={!value.trim()}>Save</Button>
          </form>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 px-1 text-xs" onClick={() => setAdding(true)}><Plus className="size-3.5" /> Add something you know</Button>
        )}
      </div>
    </Section>
  );
}
