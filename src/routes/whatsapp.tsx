/**
 * WhatsApp Growth — link the WhatsApp the business already uses (pairing code or
 * QR, no Meta approval), bring in the old chats, save every number as a lead,
 * tag chats by product and download the contacts for the phone.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Section } from "@/components/app/primitives";
import { SavedContacts, WhatsAppLink } from "@/components/app/WhatsAppLink";
import { useLive } from "@/domain/store";

export const Route = createFileRoute("/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp Growth · Bizriva CRM" }] }),
  component: WhatsAppGrowth,
});

const STEPS = [
  { t: "Link in a minute", d: "Enter your number, get a pairing code, type it into WhatsApp → Linked devices. Your phone keeps working as normal." },
  { t: "Old chats come in", d: "The chats WhatsApp shares with a new device arrive in the Inbox, each customer saved as a contact and a lead." },
  { t: "Tagged by product", d: "Bizriva reads each chat for your product names: “Asked about: Hair dryer”, “No order yet”." },
  { t: "Follow up and sell", d: "Reply from the Inbox, send a broadcast to a tag, or download the contacts so they see your Status." },
];

function WhatsAppGrowth() {
  const live = useLive();
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Growth" title="WhatsApp Growth" description="Connect the WhatsApp you already use and turn every past and new chat into a saved lead." />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <div key={s.t} className="rounded-lg border bg-card p-3">
            <p className="text-xs font-semibold text-primary">Step {i + 1}</p>
            <p className="font-semibold">{s.t}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </div>
      {live.on ? (
        <>
          <Section title="Link your WhatsApp" description="Works now, without Meta's approval. Same number, same phone app.">
            <WhatsAppLink />
          </Section>
          <Section title="Your WhatsApp customers" description="Everyone who has messaged you, saved and ready to follow up.">
            <SavedContacts />
          </Section>
          <p className="text-xs text-muted-foreground">Prefer the official Meta connection? It's under <Link to="/integrations" className="text-primary underline">Integrations → WhatsApp Cloud API</Link>. You can use both: Meta sends, the linked number brings in your chats.</p>
        </>
      ) : (
        <Section title="Link your WhatsApp">
          <p className="p-4 text-sm text-muted-foreground">You're in practice mode with sample data. Sign in to your business workspace to link your real WhatsApp number.</p>
        </Section>
      )}
    </div>
  );
}
