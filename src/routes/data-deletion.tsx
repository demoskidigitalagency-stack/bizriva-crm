import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_EMAIL, LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/data-deletion")({
  head: () => ({ meta: [{ title: "Delete your data · Bizriva" }] }),
  component: DataDeletion,
});

function DataDeletion() {
  return (
    <LegalPage title="How to delete your data">
      <h2>If you run a business on Bizriva</h2>
      <ul>
        <li>To disconnect WhatsApp: in Bizriva go to Integrations → WhatsApp → Disconnect, or on your phone open the WhatsApp Business app → Settings → Account → Business Platform and remove Bizriva. Your access token is deleted straight away.</li>
        <li>To delete your whole account and all its data (customers, messages, orders), email <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the owner's email address with the subject "Delete my Bizriva account". We confirm and delete within 30 days, except records the law requires us to keep.</li>
      </ul>

      <h2>If you are a customer of a business that uses Bizriva</h2>
      <ul>
        <li>Ask the business directly to delete your details — they control your information.</li>
        <li>Or email <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with your phone number and the business's name, and we will pass on and carry out the request.</li>
        <li>Reply STOP to a business's messages to stop marketing messages.</li>
      </ul>

      <h2>If you signed in with Facebook</h2>
      <p>Remove Bizriva in Facebook → Settings & privacy → Settings → Apps and websites, then email us as above to delete anything Bizriva stored.</p>
    </LegalPage>
  );
}
