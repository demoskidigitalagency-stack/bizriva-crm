import { useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Section, StatusBadge, EmptyState, PersonAvatar } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import { fullName } from "@/domain/repositories";
import { CHANNEL_LABELS, type Conversation } from "@/domain/types";
import { relativeTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox · Bizriva CRM" },
      { name: "description", content: "Answer customer conversations from WhatsApp, Instagram, TikTok and more — one identity per customer." },
      { property: "og:title", content: "Inbox · Bizriva CRM" },
      { property: "og:description", content: "Answer customer conversations from WhatsApp, Instagram, TikTok and more." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // ?c=<conversationId> opens that conversation (used by Customer 360 and Today).
  validateSearch: (s: Record<string, unknown>): { c?: string } => (typeof s["c"] === "string" ? { c: s["c"] } : {}),
  component: Inbox,
});

function Thread({ conversation }: { conversation: Conversation }) {
  const { sendReply } = useActions();
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    sendReply(conversation.id, text);
    setText("");
  };
  return (
    <div className="flex h-full flex-col">
      <ul className="scroll-thin flex-1 space-y-2 overflow-y-auto bg-chat p-4">
        {conversation.messages.map((m) => (
          <li key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", m.direction === "out" ? "bg-primary text-primary-foreground" : "bg-chat-in text-chat-in-foreground shadow-xs")}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={cn("mt-1 text-[10px]", m.direction === "out" ? "text-primary-foreground/70" : "text-muted-foreground")}>{relativeTime(m.at)}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 border-t p-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={`Reply on ${CHANNEL_LABELS[conversation.channel]}…`}
        />
        <Button size="sm" onClick={submit} disabled={!text.trim()}><Send className="size-4" /> Send</Button>
      </div>
    </div>
  );
}

function Inbox() {
  const db = useDb();
  const navigate = useNavigate();
  const { c: requested } = Route.useSearch();
  const [tab, setTab] = useState(requested ? "all" : "needs_reply");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(requested ?? null);

  const conversations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return db.conversations
      .filter((c) => (tab === "needs_reply" ? c.awaitingReply : true))
      .filter((c) => {
        if (!needle) return true;
        const contact = db.contacts.find((x) => x.id === c.contactId);
        return `${contact ? fullName(contact) : ""} ${c.subject} ${c.messages.map((m) => m.body).join(" ")}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));
  }, [db, tab, search]);

  const selected = conversations.find((c) => c.id === selectedId) ?? conversations[0];
  const contact = selected ? db.contacts.find((c) => c.id === selected.contactId) : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Customers"
        title="Inbox"
        description="Every conversation is tied to the customer's single identity — no duplicate threads across channels."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="space-y-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations…" />
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="needs_reply" className="flex-1">Needs reply</TabsTrigger>
              <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
            </TabsList>
          </Tabs>
          <Section bodyClassName="p-0" className="overflow-hidden">
            {conversations.length === 0 ? (
              <EmptyState title="Inbox zero" description={tab === "needs_reply" ? "Every customer has an answer. Switch to All to browse the history." : "No conversations match that search."} />
            ) : (
              <ul className="max-h-[560px] overflow-y-auto">
                {conversations.map((c) => {
                  const person = db.contacts.find((x) => x.id === c.contactId);
                  const last = c.messages[c.messages.length - 1];
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelectedId(c.id)}
                        className={cn("flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left last:border-0 hover:bg-accent/40", selected?.id === c.id && "bg-accent/40")}
                      >
                        <PersonAvatar name={person ? fullName(person) : "Unknown"} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold">{person ? fullName(person) : "Unknown contact"}</span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(c.lastMessageAt)}</span>
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{last?.body}</span>
                          <span className="mt-1 flex items-center gap-1.5">
                            <StatusBadge tone="neutral">{CHANNEL_LABELS[c.channel]}</StatusBadge>
                            {c.awaitingReply && <StatusBadge tone="warning">Awaiting reply</StatusBadge>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <Section bodyClassName="flex h-[640px] flex-col p-0" className="overflow-hidden">
          {selected && contact ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <PersonAvatar name={fullName(contact)} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{fullName(contact)}</p>
                    <p className="truncate text-xs text-muted-foreground">{contact.phone} · {CHANNEL_LABELS[selected.channel]} · {contact.city}</p>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/crm/contacts/$contactId" params={{ contactId: contact.id }}>Open Customer 360</Link>
                </Button>
              </header>
              <Thread conversation={selected} />
            </>
          ) : (
            <EmptyState
              title="Select a conversation"
              description="Pick a thread on the left to read and reply."
              action={<Button size="sm" variant="outline" onClick={() => navigate({ to: "/today" })}>Back to Today</Button>}
            />
          )}
        </Section>
      </div>
    </div>
  );
}
