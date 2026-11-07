import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_EMAIL, LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy policy · Bizriva" }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>Bizriva is software that helps businesses sell and support their customers on WhatsApp, Facebook Messenger, Instagram, SMS, email and web chat, and manage their orders and deliveries. This policy explains what information Bizriva handles, why, and the choices you have. It is written to meet the Nigeria Data Protection Act 2023.</p>

      <h2>Who this applies to</h2>
      <ul>
        <li><strong>Businesses</strong> that sign up for Bizriva, and their team members.</li>
        <li><strong>Customers of those businesses</strong> who message them or place orders. For this information the business is in charge of it (the "data controller"); Bizriva handles it for them (the "data processor") and only as the business instructs.</li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> name, email address, phone number, business name and settings, and team members' roles.</li>
        <li><strong>Messages and contacts:</strong> messages sent and received through the channels a business connects, including photos, voice notes and files; contact names and phone numbers; and, when a business links its WhatsApp Business app, the contacts and up to 6 months of one-to-one chat history that the business chooses to share from the phone.</li>
        <li><strong>Orders and deliveries:</strong> products, prices, order details, delivery addresses, payment status and delivery outcomes.</li>
        <li><strong>Connection details:</strong> identifiers and access tokens that Meta and other services issue when a business connects them. Tokens and keys are stored encrypted.</li>
        <li><strong>Usage information:</strong> sign-ins, actions taken in the app and basic technical logs, used to keep the service secure and working.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To show a business its messages, customers and orders, and to send the replies, updates and reminders the business sets up.</li>
        <li>To run the business's sales assistant, which answers customers using the business's own products and answers. If the business adds its own AI key, message text is sent to that AI provider to write the reply.</li>
        <li>To process payments the business requests through its own payment provider.</li>
        <li>To keep accounts secure, prevent abuse, give support and improve Bizriva.</li>
      </ul>
      <p>We do not sell personal information, and we do not use customers' messages for advertising.</p>

      <h2>Meta platform data</h2>
      <p>Information received from Meta's WhatsApp Business Platform, Messenger and Instagram is used only to provide Bizriva's features to the business that connected the account. It is not sold, not shared with data brokers, and not used for any other purpose. A business can disconnect at any time from Bizriva or from its WhatsApp Business app.</p>

      <h2>Who we share it with</h2>
      <ul>
        <li><strong>Service providers that run Bizriva:</strong> hosting and database (Supabase, Vercel), Meta (to send and receive messages), and the SMS, email, payment and AI providers a business chooses to connect.</li>
        <li><strong>The business's own team and delivery partners</strong>, as the business sets up.</li>
        <li><strong>Authorities</strong>, only when the law requires it.</li>
      </ul>
      <p>Some providers store data outside Nigeria (for example in the United Kingdom, the European Union or the United States). We use providers that protect data with encryption and contracts.</p>

      <h2>How long we keep it</h2>
      <p>We keep a business's information while its account is active. When a business closes its account or asks us to delete its data, we delete it within 30 days, except what we must keep by law (such as payment records). Backups are cleared on their normal cycle.</p>

      <h2>Your rights</h2>
      <p>You can ask to see, correct, export or delete your personal information, or object to how it is used. If you are a customer of a business that uses Bizriva, you can also ask that business directly, and reply STOP to their messages to stop marketing. See <a className="underline" href="/data-deletion">how to delete your data</a>. You may also complain to the Nigeria Data Protection Commission.</p>

      <h2>Security</h2>
      <p>Data is encrypted in transit and access tokens are encrypted at rest. Each business can only see its own data, and team access follows the roles the owner sets.</p>

      <h2>Children</h2>
      <p>Bizriva is for businesses and is not meant for anyone under 18.</p>

      <h2>Changes and contact</h2>
      <p>We will update this page when our practices change and show the date at the top. Questions or requests: <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </LegalPage>
  );
}
