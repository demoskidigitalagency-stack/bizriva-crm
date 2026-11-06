import { AiChatBar } from "@/components/app/AiChatBar";
import { AttachFile, MessageMedia } from "@/components/app/ChatMedia";
import { LivePaymentLink } from "@/components/app/LivePaymentLink";
import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, CreditCard, FlaskConical, Megaphone, MessageSquareText, Package, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageHeader, Section, StatusBadge, EmptyState, PersonAvatar } from "@/components/app/primitives";
import { OrderDialog } from "@/components/app/dialogs";
import { CustomerMemory } from "@/components/app/CustomerMemory";
import { useActions, useDb, useWorkspace, useLive } from "@/domain/store";
import { CURRENT_USER_ID } from "@/domain/database";
import { INBOX_VIEWS, fullName, getMember, inboxMatches, type InboxView } from "@/domain/repositories";
import { extractDetails } from "@/domain/extract";
import { CHANNEL_LABELS, LEAD_STAGES, ORDER_STATUS_META, SOURCE_LABELS, type Conversation } from "@/domain/types";
import { formatCurrency, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const DELIVERY_LABEL = { queued: "Waiting to send", sent: "Sent ✓", delivered: "Delivered ✓✓", read: "Read ✓✓" } as const;

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox · Bizriva CRM" },
      { name: "description", content: "Answer customer conversations from WhatsApp, Instagram, TikTok and more — one identity per customer." },
    ],
  }),
  // ?c=<conversationId> opens that conversation (used by Customer 360 and Today).
  validateSearch: (s: Record<string, unknown>): { c?: string } => (typeof s["c"] === "string" ? { c: s["c"] } : {}),
  component: Inbox,
});

function SendProduct({ conversationId }: { conversationId: string }) {
  const db = useDb();
  const ws = useWorkspace();
  const { sendProductCard } = useActions();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = db.products.filter((p) => p.active !== false && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" aria-label="Send product"><Package className="size-4" /><span className="hidden sm:inline">Product</span></Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product" aria-label="Find a product" className="mb-2 h-8" />
        <ul className="max-h-64 overflow-y-auto">
          {list.map((p) => {
            const photos = db.media.filter((m) => m.productId === p.id).length;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => { sendProductCard(conversationId, p.id); setOpen(false); setQ(""); }}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0"><span className="block truncate">{p.name}</span><span className="text-xs text-muted-foreground">{p.stock > 0 ? `${p.stock} in stock` : "Out of stock"} · {photos} photo{photos === 1 ? "" : "s"}</span></span>
                  <span className="num shrink-0 text-xs font-semibold">{formatCurrency(p.price, ws.currency)}</span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="px-2 py-3 text-center text-xs text-muted-foreground">No visible products match</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

const PURPOSES = ["enquiry", "order", "payment", "delivery", "complaint", "objection", "follow_up", "reactivation", "referral", "birthday", "policy"] as const;

function QuickReplies({ conversation, onPick }: { conversation: Conversation; onPick: (text: string) => void }) {
  const db = useDb();
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState<string>(conversation.complaint?.status === "open" ? "complaint" : "all");
  const [lang, setLang] = useState<"all" | "en" | "pcm">("all");
  const first = db.contacts.find((c) => c.id === conversation.contactId)?.firstName ?? "";
  const list = db.templates.filter((t) => t.category !== "authentication" && (purpose === "all" || t.purpose === purpose) && (lang === "all" || t.language === lang));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" aria-label="Quick replies"><MessageSquareText className="size-4" /><span className="hidden sm:inline">Replies</span></Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] p-2">
        <div className="mb-2 flex flex-wrap gap-1">
          {(["all", ...PURPOSES] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPurpose(p)} className={cn("rounded-full border px-2 py-0.5 text-xs capitalize", purpose === p && "border-primary bg-primary/10 text-primary")}>{p.replace("_", "-")}</button>
          ))}
        </div>
        <div className="mb-2 flex gap-1 text-xs">
          {([["all", "Any language"], ["en", "English"], ["pcm", "Pidgin"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setLang(v)} className={cn("rounded border px-2 py-0.5", lang === v && "border-primary bg-primary/10 text-primary")}>{l}</button>
          ))}
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {list.map((t) => (
            <li key={t.id}>
              <button type="button" className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => { onPick(t.body.replace("{{1}}", first)); setOpen(false); }}>
                <span className="block font-mono text-[11px] font-semibold">{t.name}{t.language === "pcm" ? " · Pidgin" : ""}</span>
                <span className="line-clamp-2 text-muted-foreground">{t.body}</span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="px-2 py-3 text-center text-xs text-muted-foreground">No replies for this filter</li>}
        </ul>
        <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">Fill in the {"{{2}}"}, {"{{3}}"} parts before sending. Edit the library in Templates.</p>
      </PopoverContent>
    </Popover>
  );
}

function PaymentLinkButton({ conversationId }: { conversationId: string }) {
  const db = useDb();
  const { requestPayment, simulatePayment } = useActions();
  const ps = db.settings.payments;
  const [open, setOpen] = useState(false);
  const [methods, setMethods] = useState<("transfer" | "link" | "cod")[]>((["transfer", "link", "cod"] as const).filter((m) => ps.methods[m]));
  const [result, setResult] = useState<{ reference?: string; error?: string } | null>(null);
  const order = result?.reference ? db.orders.find((o) => o.reference === result.reference) : undefined;
  const label = { transfer: "Bank transfer (their own account number)", link: "Payment link (card, USSD, bank app)", cod: "Pay on delivery" } as const;
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" aria-label="Request payment"><CreditCard className="size-4" /><span className="hidden sm:inline">Payment</span></Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-3 text-xs">
        <p className="text-sm font-semibold">Request payment</p>
        {ps.status !== "connected" && <p className="rounded bg-warning/15 p-2">Connect Paystack, Flutterwave or Monnify on the <Link to="/payments" className="underline">Payments</Link> page to offer transfers and links. Pay on delivery works now.</p>}
        {(["transfer", "link", "cod"] as const).map((m) => (
          <label key={m} className="flex items-center gap-2"><input type="checkbox" checked={methods.includes(m)} onChange={() => setMethods(methods.includes(m) ? methods.filter((x) => x !== m) : [...methods, m])} aria-label={label[m]} /> {label[m]}</label>
        ))}
        <Button size="sm" className="w-full" onClick={() => setResult(requestPayment(conversationId, methods))}>Send in chat</Button>
        {result?.error && <p className="text-destructive" role="alert">{result.error}</p>}
        {result?.reference && (
          <div className="space-y-1.5" role="status">
            <p className="text-success">Payment details for {result.reference} sent (practice — nothing really sent).</p>
            {ps.status === "connected" && order && order.total - (order.amountPaid ?? 0) > 0 && (
              <Button size="sm" variant="outline" className="w-full" onClick={() => { simulatePayment({ orderId: order.id, method: "transfer", amount: order.total - (order.amountPaid ?? 0) }); setOpen(false); setResult(null); }}>Practice: customer pays by transfer</Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ComplaintBar({ conversation }: { conversation: Conversation }) {
  const { flagComplaint, resolveComplaint } = useActions();
  const [mode, setMode] = useState<"idle" | "flag" | "resolve">("idle");
  const [text, setText] = useState("");
  const c = conversation.complaint;
  const done = () => { setMode("idle"); setText(""); };
  if (mode !== "idle") {
    return (
      <form className="flex items-center gap-2 border-b bg-warning/10 px-3 py-2 text-sm" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; if (mode === "flag") flagComplaint(conversation.id, text); else resolveComplaint(conversation.id, text); done(); }}>
        <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} className="h-8" aria-label={mode === "flag" ? "Complaint reason" : "How it was resolved"} placeholder={mode === "flag" ? "What is the complaint?" : "How was it resolved?"} />
        <Button type="submit" size="sm" disabled={!text.trim()}>{mode === "flag" ? "Save complaint" : "Mark resolved"}</Button>
        <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Cancel" onClick={done}><X className="size-4" /></Button>
      </form>
    );
  }
  if (c?.status === "open") {
    return (
      <div className="flex items-center gap-2 border-b bg-warning/10 px-3 py-2 text-sm" role="status">
        <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="font-semibold">Open complaint:</span> {c.reason} <span className="text-xs text-muted-foreground">· {relativeTime(c.openedAt)}</span></span>
        <Button size="sm" variant="outline" onClick={() => setMode("resolve")}>Resolve</Button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
      {c?.status === "resolved" && <span className="mr-auto flex items-center gap-1"><CheckCircle2 className="size-3.5 text-success" aria-hidden="true" /> Complaint resolved: {c.resolution}</span>}
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMode("flag")}>Mark as complaint</Button>
    </div>
  );
}

function Thread({ conversation }: { conversation: Conversation }) {
  const db = useDb();
  const live = useLive();
  const { sendReply, simulateIncoming } = useActions();
  const [text, setText] = useState("");
  const [sim, setSim] = useState("");
  const [simOpen, setSimOpen] = useState(false);
  const tails = db.settings.chat.bubbleTails;
  const submit = () => {
    if (!text.trim()) return;
    sendReply(conversation.id, text);
    setText("");
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AiChatBar conversation={conversation} />
      <ComplaintBar conversation={conversation} />
      <ul className="scroll-thin flex-1 space-y-2 overflow-y-auto bg-chat p-4">
        {conversation.messages.map((m) => (
          <li key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[80%] rounded-lg px-3 py-2 text-sm",
              m.direction === "out" ? "bg-primary text-primary-foreground" : "bg-chat-in text-chat-in-foreground shadow-xs",
              tails && (m.direction === "out" ? "rounded-br-none" : "rounded-bl-none"),
            )}>
              {m.byAi && <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/80">AI reply</p>}
              <MessageMedia m={m} />
              {(!m.media || !/^\[(image|video|audio|document|sticker|Media)\]$/.test(m.body)) && <p className="whitespace-pre-wrap">{m.media ? m.body.replace(/^\[(image|video|audio|document|sticker|Media)\]\s*/, "") : m.body}</p>}
              <p className={cn("mt-1 text-[10px]", m.direction === "out" ? "text-primary-foreground/70" : "text-muted-foreground")}>{relativeTime(m.at)}{m.delivery && m.delivery !== "failed" ? ` · ${DELIVERY_LABEL[m.delivery]}` : ""}</p>
              {m.delivery === "failed" && <p className="mt-1 rounded bg-destructive/90 px-1.5 py-0.5 text-[11px] text-white" role="note">Not delivered{m.error ? `: ${m.error}` : ""}</p>}
            </div>
          </li>
        ))}
      </ul>
      {simOpen && (
        <form className="flex items-center gap-2 border-t bg-surface px-3 py-2" onSubmit={(e) => { e.preventDefault(); simulateIncoming(conversation.id, sim); setSim(""); }}>
          <FlaskConical className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input value={sim} onChange={(e) => setSim(e.target.value)} placeholder="Type as the customer (practice only)" aria-label="Simulated customer message" className="h-8" />
          <Button type="submit" size="sm" variant="outline" disabled={!sim.trim()}>Receive</Button>
          <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => setSimOpen(false)} aria-label="Close practice message"><X className="size-4" /></Button>
        </form>
      )}
      <div className="relative flex items-center gap-2 border-t p-3">
        {conversation.channel === "whatsapp" && <AttachFile conversationId={conversation.id} caption={text} onSent={() => setText("")} />}
        <SendProduct conversationId={conversation.id} />
        <QuickReplies conversation={conversation} onPick={setText} />
        {live.on ? <LivePaymentLink conversationId={conversation.id} /> : <PaymentLinkButton conversationId={conversation.id} />}
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={`Reply on ${CHANNEL_LABELS[conversation.channel]}…`}
          aria-label="Reply"
        />
        <Button size="sm" onClick={submit} disabled={!text.trim()}><Send className="size-4" /> Send</Button>
        {!simOpen && <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => setSimOpen(true)} title="Simulate a customer message (practice)" aria-label="Simulate a customer message"><FlaskConical className="size-4" /></Button>}
      </div>
    </div>
  );
}

/** Kobolink's customer sidebar + Sandala's auto-extracted contact card. */
function CustomerPanel({ conversation }: { conversation: Conversation }) {
  const db = useDb();
  const ws = useWorkspace();
  const { updateContactDetails } = useActions();
  const [ordering, setOrdering] = useState(false);
  const c = db.contacts.find((x) => x.id === conversation.contactId);
  const found = useMemo(() => extractDetails(conversation), [conversation]);
  if (!c) return null;
  const lead = db.leads.find((l) => l.contactId === c.id);
  const orders = db.orders.filter((o) => o.contactId === c.id).sort((a, b) => +new Date(b.placedAt) - +new Date(a.placedAt));
  const interest = db.productInterests.find((p) => p.contactId === c.id);

  const [first, ...rest] = (found.name ?? "").split(" ");
  const candidates: { key: "name" | "phone" | "address" | "landmark" | "city"; label: string; value: string | undefined; current: string | undefined }[] = [
    { key: "name", label: "Name", value: found.name, current: fullName(c) },
    { key: "phone", label: "Phone", value: found.phone, current: c.phone },
    { key: "address", label: "Address", value: found.address, current: c.address },
    { key: "landmark", label: "Landmark", value: found.landmark, current: c.landmark },
    { key: "city", label: "City", value: found.city, current: c.city },
  ];
  const newOnes = candidates.filter((x) => x.value && x.value.replace(/\s/g, "").toLowerCase() !== (x.current ?? "").replace(/\s/g, "").toLowerCase());
  const save = () => updateContactDetails(c.id, {
    ...(found.name && rest.length ? { firstName: first!, lastName: rest.join(" ") } : {}),
    ...(found.phone ? { phone: found.phone } : {}),
    ...(found.address ? { address: found.address } : {}),
    ...(found.landmark ? { landmark: found.landmark } : {}),
    ...(found.city ? { city: found.city } : {}),
  });

  return (
    <aside className="min-w-0 space-y-3 text-sm" aria-label="Customer details">
      <Section title="Customer" action={<Link to="/crm/contacts/$contactId" params={{ contactId: c.id }} className="text-xs text-primary hover:underline">Customer 360</Link>}>
        <dl className="space-y-1.5 p-3">
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Phone</dt><dd className="text-right">{c.phone}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Address</dt><dd className="text-right">{c.address ?? <span className="text-muted-foreground">Not saved</span>}</dd></div>
          {c.landmark && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Landmark</dt><dd className="text-right">{c.landmark}</dd></div>}
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">City</dt><dd>{c.city}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Owner</dt><dd>{getMember(db, c.ownerId)?.name ?? "Unassigned"}</dd></div>
          {lead && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Lead stage</dt><dd><StatusBadge tone="brand">{LEAD_STAGES.find((s) => s.id === lead.stage)?.label}</StatusBadge></dd></div>}
          {interest && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Interested in</dt><dd className="text-right">{interest.productName}</dd></div>}
        </dl>
      </Section>

      <Section title="Found in this chat" description="Pulled from the customer's messages">
        <div className="space-y-2 p-3">
          {candidates.every((x) => !x.value) ? (
            <p className="text-xs text-muted-foreground">Nothing yet. Ask for their name, phone and full delivery address.</p>
          ) : (
            <>
              <dl className="space-y-1">
                {candidates.filter((x) => x.value).map((x) => (
                  <div key={x.key} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{x.label}</dt>
                    <dd className="text-right">{x.value}{newOnes.includes(x) && <StatusBadge tone="info" className="ml-1">New</StatusBadge>}</dd>
                  </div>
                ))}
              </dl>
              <Button size="sm" className="w-full" disabled={!newOnes.length} onClick={save}><Sparkles className="size-3.5" /> {newOnes.length ? `Save ${newOnes.length} to contact` : "Already saved"}</Button>
            </>
          )}
        </div>
      </Section>

      <CustomerMemory contactId={c.id} compact />

      <Section title="Orders" action={<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOrdering(true)}>New order</Button>}>
        {orders.length === 0 ? <p className="p-3 text-xs text-muted-foreground">No orders yet.</p> : (
          <ul className="divide-y">
            {orders.slice(0, 4).map((o) => (
              <li key={o.id}>
                <Link to="/orders" search={{ o: o.id }} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40">
                  <span className="num font-medium">{o.reference}</span>
                  <StatusBadge tone={ORDER_STATUS_META[o.status].tone}>{ORDER_STATUS_META[o.status].label}</StatusBadge>
                  <span className="num text-xs">{formatCurrency(o.total, ws.currency, { compact: true })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {ordering && <OrderDialog open onOpenChange={(o) => !o && setOrdering(false)} contactId={c.id} />}
    </aside>
  );
}

function Inbox() {
  const db = useDb();
  const navigate = useNavigate();
  const { c: requested } = Route.useSearch();
  const [view, setView] = useState<InboxView>(requested ? "all" : "needs_reply");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(requested ?? null);
  useEffect(() => { if (requested) setSelectedId(requested); }, [requested]);

  const counts = useMemo(() => Object.fromEntries(INBOX_VIEWS.map((v) => [v.id, db.conversations.filter((c) => inboxMatches(db, c, v.id, CURRENT_USER_ID)).length])) as Record<InboxView, number>, [db]);

  const conversations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return db.conversations
      .filter((c) => inboxMatches(db, c, view, CURRENT_USER_ID))
      .filter((c) => {
        if (!needle) return true;
        const contact = db.contacts.find((x) => x.id === c.contactId);
        return `${contact ? `${fullName(contact)} ${contact.phone}` : ""} ${c.subject} ${c.messages.map((m) => m.body).join(" ")}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));
  }, [db, view, search]);

  const selected = conversations.find((c) => c.id === selectedId) ?? db.conversations.find((c) => c.id === selectedId) ?? conversations[0];
  const contact = selected ? db.contacts.find((c) => c.id === selected.contactId) : undefined;
  const ad = contact ? db.attributions.find((a) => a.contactId === contact.id) : undefined;
  const missingDetails = (cid: string) => {
    const p = db.contacts.find((x) => x.id === cid);
    return db.settings.chat.flagMissingDetails && !!p && !p.address;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Customers"
        title="Inbox"
        description="Every conversation is tied to the customer's single identity — no duplicate threads across channels."
        actions={<Button asChild size="sm" variant="outline"><Link to="/crm/imports" search={{ t: "chats" }}>Import old WhatsApp chats</Link></Button>}
      />
      <div className="scroll-thin -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Inbox filters">
        {INBOX_VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors", view === v.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {v.label} <span className="num opacity-75">{counts[v.id]}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone or message" aria-label="Search conversations" />
          <Section bodyClassName="p-0" className="overflow-hidden">
            {conversations.length === 0 ? (
              <EmptyState title="Nothing here" description={view === "needs_reply" ? "Every customer has an answer." : "No conversations match this filter."} />
            ) : (
              <ul className="max-h-[600px] overflow-y-auto">
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
                            <span className={cn("truncate text-sm", c.unread ? "font-bold" : "font-semibold")}>{person ? fullName(person) : "Unknown contact"}</span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(c.lastMessageAt)}</span>
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{last?.body}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-1">
                            <StatusBadge tone="neutral">{CHANNEL_LABELS[c.channel]}</StatusBadge>
                            {c.awaitingReply && <StatusBadge tone="warning">Awaiting reply</StatusBadge>}
                            {missingDetails(c.contactId) && <StatusBadge tone="neutral">No address</StatusBadge>}
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

        <Section bodyClassName="flex h-[680px] flex-col p-0" className="min-w-0 overflow-hidden">
          {selected && contact ? (
            <>
              <header className="border-b px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <PersonAvatar name={fullName(contact)} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{fullName(contact)}</p>
                      <p className="truncate text-xs text-muted-foreground">{contact.phone} · {CHANNEL_LABELS[selected.channel]} · {contact.city}</p>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="xl:hidden">
                    <Link to="/crm/contacts/$contactId" params={{ contactId: contact.id }}>Open Customer 360</Link>
                  </Button>
                </div>
                {ad && (
                  <p className="mt-2 flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-xs text-muted-foreground" title="Ad source">
                    <Megaphone className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">From {SOURCE_LABELS[ad.source]}{ad.campaign ? ` · ${ad.campaign}` : ""}{ad.adSet ? ` · ${ad.adSet}` : ""}{ad.creative ? ` · ${ad.creative}` : ""}</span>
                  </p>
                )}
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

        {selected && contact && (
          <div className="lg:col-span-2 xl:col-span-1">
            <CustomerPanel conversation={selected} />
          </div>
        )}
      </div>
    </div>
  );
}
