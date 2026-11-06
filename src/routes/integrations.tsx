import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useLive, useWorkspace } from "@/domain/store";
import { WhatsAppConnect } from "@/components/app/WhatsAppConnect";
import { EmailConnect } from "@/components/app/EmailConnect";
import { WebChatConnect } from "@/components/app/WebChatConnect";
import { SmsConnect } from "@/components/app/SmsConnect";
import { MetaPageConnect } from "@/components/app/MetaPageConnect";
import type { IntegrationState } from "@/domain/types";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/integrations")({
  head: () => ({ meta: [{ title: "Integrations · Bizriva CRM" }] }),
  component: Integrations,
});

const INFO: Record<IntegrationState["id"], { name: string; what: string; needs: string[]; phase: string }> = {
  whatsapp: { name: "WhatsApp Cloud API", what: "Receive and send WhatsApp messages in the shared inbox, templates and media.", needs: ["Meta Business account, verified", "A phone number not in use on the WhatsApp Business app (or eligible for coexistence)", "Approved message templates"], phase: "MVP" },
  meta_ads: { name: "Meta Ads", what: "See which ad started each chat and pull spend for return on ad spend.", needs: ["Ad account access", "Click-to-WhatsApp ads running"], phase: "Later" },
  tiktok: { name: "TikTok Business Messaging", what: "TikTok DMs in the same inbox, so buyers from TikTok ads and videos get answered like everyone else.", needs: ["TikTok Business account", "Approval for TikTok's business messaging API (availability in Nigeria may lag other platforms)"], phase: "Later" },
  messenger: { name: "Facebook Messenger", what: "Messenger chats in the same inbox.", needs: ["Facebook Page admin access", "Meta app review for messaging"], phase: "Later" },
  instagram: { name: "Instagram Direct", what: "Instagram DMs in the same inbox.", needs: ["Instagram professional account linked to a Page"], phase: "Later" },
  sms: { name: "SMS", what: "Order and delivery updates by SMS, and fallback when WhatsApp fails.", needs: ["SMS provider account", "Registered sender ID"], phase: "Later" },
  email: { name: "Email", what: "Receipts and notifications by email.", needs: ["Email sending domain with SPF and DKIM"], phase: "Later" },
  paystack: { name: "Payments (Paystack or similar)", what: "Real payment links and card payments.", needs: ["Payment provider business account", "API keys stored on the server"], phase: "Later" },
  webchat: { name: "Website chat", what: "A chat bubble on your website that feeds the inbox.", needs: ["Paste one script tag on your site"], phase: "Ready" },
  couriers: { name: "Delivery partners (GIG, Fez, Kwik, Topship)", what: "Book pickups and get tracking updates from courier companies on the dispatch board.", needs: ["Business account with each courier", "API keys stored on the server", "Pickup address and package sizes"], phase: "Later" },
  lead_form: { name: "Landing page or WordPress form", what: "Form submissions from your website arrive as new leads with a chat in the Inbox.", needs: ["Add the form link or webhook to your page or WordPress plugin", "A secret so only your site can post"], phase: "Later" },
};

function LeadFormTester() {
  const db = useDb();
  const ws = useWorkspace();
  const { submitLeadForm } = useActions();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [product, setProduct] = useState(db.products[0]?.id ?? "");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const url = `https://app.bizriva.com/api/forms/${ws.handle}`;
  const sample = JSON.stringify({ name: "Ada Okafor", phone: "08031234567", product: "p_1", message: "Interested in 20 inch" }, null, 2);
  return (
    <div className="space-y-3 border-t p-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Form link (practice address)</p>
        <div className="mt-1 flex gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{url}</code>
          <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked */ } setCopied(true); }}>{copied ? "Copied" : "Copy link"}</Button>
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">Form data format</summary>
        <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">{sample}</pre>
      </details>
      <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        const id = submitLeadForm({ name, phone, productId: product, message: msg });
        if (!id) return setError("Enter a name and a full phone number.");
        setError(""); setDone(id); setName(""); setPhone(""); setMsg("");
      }}>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:col-span-2">Send a test submission</p>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" aria-label="Test name" />
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" aria-label="Test phone" />
        <Select value={product} onValueChange={setProduct}>
          <SelectTrigger aria-label="Test product"><SelectValue>{db.products.find((p) => p.id === product)?.name ?? "Product"}</SelectValue></SelectTrigger>
          <SelectContent>{db.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message (optional)" aria-label="Test message" />
        <Button type="submit" size="sm" className="sm:col-span-2">Submit test form</Button>
        {error && <p className="text-xs text-destructive sm:col-span-2" role="alert">{error}</p>}
        {done && <p className="text-xs text-success sm:col-span-2" role="status">Lead created. <Link to="/crm/contacts/$contactId" params={{ contactId: done }} className="underline">Open it</Link> or see it in the <Link to="/inbox" className="underline">Inbox</Link>.</p>}
      </form>
    </div>
  );
}

function Integrations() {
  const db = useDb();
  const { setIntegration } = useActions();
  const live = useLive();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Workspace</p>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Real connections need the backend and each provider's approval. Until then you can simulate one to test the flow — it's always labelled, and nothing is sent.</p>
        <p className="mt-2 rounded-md border bg-muted/40 p-2 text-sm">Using WordPress forms, WooCommerce, Shopify, Google Forms or Typeform? Connect them in <Link to="/connections" className="font-medium text-primary underline">Website &amp; Forms</Link>.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {db.integrations.map((s) => {
          const i = INFO[s.id];
          const sim = s.status === "simulated";
          if (s.id === "email" && live.on) return <div key={s.id} className="md:col-span-2"><EmailConnect /></div>;
          if (s.id === "webchat" && live.on) return <div key={s.id} className="md:col-span-2"><WebChatConnect /></div>;
          if (s.id === "sms" && live.on) return <div key={s.id} className="md:col-span-2"><SmsConnect /></div>;
          if (s.id === "messenger" && live.on) return <div key={s.id} className="md:col-span-2"><MetaPageConnect /></div>;
          if (s.id === "instagram" && live.on) return null; // part of the Facebook Page connection
          if (s.id === "whatsapp" && live.on) {
            return (
              <Section key={s.id} title={i.name} description={i.what} className="md:col-span-2">
                <WhatsAppConnect />
              </Section>
            );
          }
          return (
            <Section key={s.id} title={i.name} description={i.what} action={<StatusBadge tone={sim ? "info" : "neutral"}>{sim ? "Simulated" : "Not connected"}</StatusBadge>}>
              <div className="space-y-3 p-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">To connect for real</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">{i.needs.map((n) => <li key={n}>{n}</li>)}</ul>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={i.phase === "MVP" ? "brand" : "neutral"}>{i.phase === "MVP" ? "First release" : "Later release"}</StatusBadge>
                  {sim && s.connectedAt && <span className="text-xs text-muted-foreground">Simulated {relativeTime(s.connectedAt)}</span>}
                  <Button size="sm" variant={sim ? "outline" : "default"} className="ml-auto" onClick={() => setIntegration(s.id, sim ? "not_connected" : "simulated")}>{sim ? "Stop simulating" : "Simulate"}</Button>
                </div>
              </div>
              {s.id === "lead_form" && <LeadFormTester />}
            </Section>
          );
        })}
      </div>
    </div>
  );
}
