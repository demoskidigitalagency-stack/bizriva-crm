import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import type { IntegrationState } from "@/domain/types";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/integrations")({
  head: () => ({ meta: [{ title: "Integrations · Bizriva CRM" }] }),
  component: Integrations,
});

const INFO: Record<IntegrationState["id"], { name: string; what: string; needs: string[]; phase: string }> = {
  whatsapp: { name: "WhatsApp Cloud API", what: "Receive and send WhatsApp messages in the shared inbox, templates and media.", needs: ["Meta Business account, verified", "A phone number not in use on the WhatsApp Business app (or eligible for coexistence)", "Approved message templates"], phase: "MVP" },
  meta_ads: { name: "Meta Ads", what: "See which ad started each chat and pull spend for return on ad spend.", needs: ["Ad account access", "Click-to-WhatsApp ads running"], phase: "Later" },
  messenger: { name: "Facebook Messenger", what: "Messenger chats in the same inbox.", needs: ["Facebook Page admin access", "Meta app review for messaging"], phase: "Later" },
  instagram: { name: "Instagram Direct", what: "Instagram DMs in the same inbox.", needs: ["Instagram professional account linked to a Page"], phase: "Later" },
  sms: { name: "SMS", what: "Order and delivery updates by SMS, and fallback when WhatsApp fails.", needs: ["SMS provider account", "Registered sender ID"], phase: "Later" },
  email: { name: "Email", what: "Receipts and notifications by email.", needs: ["Email sending domain with SPF and DKIM"], phase: "Later" },
  paystack: { name: "Payments (Paystack or similar)", what: "Real payment links and card payments.", needs: ["Payment provider business account", "API keys stored on the server"], phase: "Later" },
  webchat: { name: "Website chat", what: "A chat bubble on your website that feeds the inbox.", needs: ["Paste one script tag on your site"], phase: "Later" },
};

function Integrations() {
  const db = useDb();
  const { setIntegration } = useActions();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Workspace</p>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Real connections need the backend and each provider's approval. Until then you can simulate one to test the flow — it's always labelled, and nothing is sent.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {db.integrations.map((s) => {
          const i = INFO[s.id];
          const sim = s.status === "simulated";
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
            </Section>
          );
        })}
      </div>
    </div>
  );
}
