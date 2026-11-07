import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { unzipSync, strFromU8 } from "fflate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useLive } from "@/domain/store";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { fullName } from "@/domain/repositories";
import { extractDetails } from "@/domain/extract";
import { guessCustomer, parseWhatsAppExport, SAMPLE_EXPORT, type ParsedChat } from "@/domain/whatsapp-export";
import { formatDateTime } from "@/lib/format";

/** Read a .txt export, or the chat text inside a .zip export ("with media" / iPhone). */
async function readExport(file: File): Promise<string> {
  if (/\.zip$/i.test(file.name)) {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const name = Object.keys(files).find((n) => /(_chat|whatsapp chat).*\.txt$/i.test(n)) ?? Object.keys(files).find((n) => n.toLowerCase().endsWith(".txt"));
    if (!name) throw new Error("No chat text file inside that zip.");
    return strFromU8(files[name]!);
  }
  return file.text();
}

const digitsOf = (p: string) => p.replace(/\D/g, "").slice(-10);

function ChatCard({ chat, onDone, onRemove }: { chat: ParsedChat; onDone: (msg: string, contactId: string) => void; onRemove: () => void }) {
  const db = useDb();
  const { importChatHistory } = useActions();
  const live = useLive();
  const { current } = useAuth();
  const [busy, setBusy] = useState(false);
  const customerSender = guessCustomer(chat) ?? chat.senders[0]?.name ?? "";
  const [customer, setCustomer] = useState(customerSender);
  const business = chat.senders.find((s) => s.name !== customer)?.name ?? "";
  const found = extractDetails({ id: "x", contactId: "x", channel: "whatsapp", subject: "", unread: false, awaitingReply: false, assigneeId: "", lastMessageAt: "", messages: chat.messages.filter((m) => m.sender === customer).map((m, i) => ({ id: String(i), conversationId: "x", direction: "in" as const, body: m.body, at: m.at })) });
  const phoneGuess = /^\+?[\d\s-]{10,}$/.test(customer) ? customer : found.phone ?? "";
  const autoMatch = db.contacts.find((c) => (phoneGuess && digitsOf(c.phone) === digitsOf(phoneGuess)) || fullName(c).toLowerCase() === customer.toLowerCase());
  const [mode, setMode] = useState<"existing" | "new">(autoMatch ? "existing" : "new");
  const [contactId, setContactId] = useState(autoMatch?.id ?? "");
  const [q, setQ] = useState("");
  const [name, setName] = useState(/^\+?[\d\s-]{10,}$/.test(customer) ? found.name ?? "" : customer);
  const [phone, setPhone] = useState(phoneGuess);
  const [error, setError] = useState("");
  const matches = q.trim() ? db.contacts.filter((c) => `${fullName(c)} ${c.phone}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const picked = db.contacts.find((c) => c.id === contactId);
  const groupLike = chat.senders.length > 2;

  const done = (res: { added: number; duplicates: number }, cid: string) =>
    onDone(`${res.added} message${res.added === 1 ? "" : "s"} imported from ${chat.fileName}${res.duplicates ? ` (${res.duplicates} were already there)` : ""}.`, cid);

  /** Real data: the server adds the customer (or uses the one picked) and stores the history, marked imported. */
  const runLive = async () => {
    const sb = supabase(); if (!sb || !current) return;
    if (mode === "existing" && !contactId) return setError("Pick the customer this chat belongs to.");
    if (mode === "new" && (!name.trim() || phone.replace(/\D/g, "").length < 10)) return setError("Enter the customer's name and full phone number.");
    setBusy(true); setError("");
    const { data, error: e } = await sb.rpc("import_chat", {
      p_workspace: current.workspaceId, p_contact: mode === "existing" ? contactId : null,
      p_name: mode === "new" ? name.trim() : null, p_phone: mode === "new" ? phone : null, p_city: mode === "new" ? found.city ?? null : null,
      p_messages: chat.messages.map((m) => ({ at: m.at, out: m.sender === business, body: m.body })), p_file: chat.fileName,
    });
    setBusy(false);
    if (e) return setError(e.message);
    const r = data as { contact: string; added: number; duplicates: number };
    await live.reload();
    done(r, r.contact);
  };

  const run = () => {
    if (groupLike) return setError("This looks like a group chat. Only one-to-one chats can be imported.");
    if (live.on) return void runLive();
    const res = importChatHistory({
      ...(mode === "existing" && contactId ? { contactId } : { newContact: { name, phone, ...(found.city ? { city: found.city } : {}) } }),
      businessSender: business, messages: chat.messages, fileName: chat.fileName,
    });
    if (!res) return setError(mode === "existing" ? "Pick the customer this chat belongs to." : "Enter the customer's name and full phone number.");
    done(res, res.contactId);
  };

  return (
    <Section title={chat.fileName} description={`${chat.messages.length} messages${chat.firstAt ? ` · ${formatDateTime(chat.firstAt)} to ${formatDateTime(chat.lastAt!)}` : ""}${chat.mediaOmitted ? ` · ${chat.mediaOmitted} photos or files not included` : ""}`} action={<Button size="sm" variant="ghost" onClick={onRemove}>Remove</Button>}>
      <div className="grid gap-4 p-4 text-sm lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-3">
          {groupLike && <p className="rounded-md bg-warning/15 p-2 text-xs" role="alert">{chat.senders.length} people wrote in this chat. Group chats can't be imported.</p>}
          <div className="space-y-1.5"><Label>Who is the customer?</Label>
            <Select value={customer} onValueChange={setCustomer}>
              <SelectTrigger aria-label="Customer in this chat"><SelectValue>{customer}</SelectValue></SelectTrigger>
              <SelectContent>{chat.senders.map((s) => <SelectItem key={s.name} value={s.name}>{s.name} ({s.count} messages)</SelectItem>)}</SelectContent>
            </Select>
            {business && <p className="text-xs text-muted-foreground">Messages from <span className="font-medium">{business}</span> will show as sent by your business.</p>}
          </div>
          <div className="flex gap-2" role="group" aria-label="Match to">
            <Button size="sm" variant={mode === "existing" ? "default" : "outline"} aria-pressed={mode === "existing"} onClick={() => setMode("existing")}>Existing contact</Button>
            <Button size="sm" variant={mode === "new" ? "default" : "outline"} aria-pressed={mode === "new"} onClick={() => setMode("new")}>New contact</Button>
          </div>
          {mode === "existing" ? (
            <div className="space-y-2">
              {picked && <p>Goes to <span className="font-semibold">{fullName(picked)}</span> · {picked.phone} {autoMatch?.id === picked.id && <StatusBadge tone="success">Matched</StatusBadge>}</p>}
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" aria-label="Find contact for this chat" />
              {matches.length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded border">
                  {matches.map((c) => <li key={c.id}><button type="button" className="w-full px-2 py-1.5 text-left hover:bg-muted" onClick={() => { setContactId(c.id); setQ(""); }}>{fullName(c)} · {c.phone}</button></li>)}
                </ul>
              )}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor={`cn-${chat.fileName}`}>Customer name</Label><Input id={`cn-${chat.fileName}`} value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor={`cp-${chat.fileName}`}>Customer phone</Label><Input id={`cp-${chat.fileName}`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Not in the export — add it" /></div>
            </div>
          )}
          {error && <p className="text-destructive" role="alert">{error}</p>}
          <Button size="sm" onClick={run} disabled={groupLike || busy}>{busy ? "Importing…" : "Import chat"}</Button>
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview</p>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto rounded-md bg-chat p-2">
            {chat.messages.slice(-8).map((m, i) => (
              <li key={i} className={`flex ${m.sender === customer ? "justify-start" : "justify-end"}`}>
                <span className={`max-w-[85%] whitespace-pre-wrap rounded-md px-2 py-1 text-xs ${m.sender === customer ? "bg-chat-in text-chat-in-foreground" : "bg-primary text-primary-foreground"}`}>{m.body}</span>
              </li>
            ))}
          </ul>
          {(found.address || found.phone) && <p className="mt-2 text-xs text-muted-foreground">Details spotted: {[found.phone, found.address, found.city].filter(Boolean).join(" · ")}. Save them from the customer panel in the Inbox.</p>}
        </div>
      </div>
    </Section>
  );
}

export function ChatImport() {
  const live = useLive();
  const [chats, setChats] = useState<ParsedChat[]>([]);
  const [paste, setPaste] = useState("");
  const [done, setDone] = useState<{ msg: string; contactId: string }[]>([]);
  const [error, setError] = useState("");

  const add = (chat: ParsedChat) => {
    if (!chat.messages.length) return setError(`No messages found in ${chat.fileName}. Use WhatsApp's Export chat file as it is.`);
    setError("");
    setChats((c) => [...c.filter((x) => x.fileName !== chat.fileName), chat]);
  };
  const onFiles = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      try { add(parseWhatsAppExport(await readExport(f), f.name)); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't read that file."); }
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Bring in old WhatsApp chats" description="For numbers that can't share history with Bizriva automatically. One-to-one chats only.">
        <div className="space-y-3 p-4 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>On your phone, open the chat in WhatsApp Business.</li>
            <li>Tap the menu (⋮ or the contact name) → More → <span className="font-medium text-foreground">Export chat</span>. "Without media" is smaller.</li>
            <li>Send the file to yourself, then choose it here. You can pick several at once. .txt and .zip both work.</li>
          </ol>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center hover:border-primary/50">
            <MessageSquare className="size-6 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">Select exported chats</span>
            <span className="text-xs text-muted-foreground">{live.on ? "Saved to your real customer list. Old messages never wake the assistant or send reminders." : "Stays in this browser in Practice Mode"}</span>
            <input type="file" multiple accept=".txt,.zip,text/plain,application/zip" className="sr-only" aria-label="WhatsApp chat export files" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">Or paste the chat text</summary>
            <Textarea className="mt-2" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Pasted chat text" />
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" disabled={!paste.trim()} onClick={() => { add(parseWhatsAppExport(paste, `Pasted chat ${chats.length + 1}`)); setPaste(""); }}>Read pasted chat</Button>
              <Button size="sm" variant="ghost" onClick={() => add(parseWhatsAppExport(SAMPLE_EXPORT, "WhatsApp Chat with Chioma Eze.txt"))}>Try a sample chat</Button>
            </div>
          </details>
          {error && <p className="text-destructive" role="alert">{error}</p>}
        </div>
      </Section>

      {done.length > 0 && (
        <div className="space-y-1 rounded-lg border border-success/30 bg-success/10 p-4 text-sm" role="status">
          {done.map((d, i) => <p key={i}>{d.msg} <Link to="/crm/contacts/$contactId" params={{ contactId: d.contactId }} className="font-medium underline">Open customer</Link></p>)}
        </div>
      )}

      {chats.map((c) => (
        <ChatCard key={c.fileName} chat={c} onRemove={() => setChats((x) => x.filter((y) => y.fileName !== c.fileName))} onDone={(msg, contactId) => { setDone((d) => [...d, { msg, contactId }]); setChats((x) => x.filter((y) => y.fileName !== c.fileName)); }} />
      ))}
    </div>
  );
}
