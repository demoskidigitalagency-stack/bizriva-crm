import { createFileRoute } from "@tanstack/react-router";
import { CONTACT_EMAIL, LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of service · Bizriva" }] }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Terms of service">
      <p>These terms apply when a business signs up for and uses Bizriva. By creating an account you agree to them on behalf of your business.</p>

      <h2>Your account</h2>
      <ul>
        <li>Give accurate details and keep your sign-in safe. You are responsible for what your team does in your account.</li>
        <li>The account owner decides who joins the team and what each role can do.</li>
      </ul>

      <h2>Using WhatsApp and other channels</h2>
      <ul>
        <li>You must follow the WhatsApp Business Terms, WhatsApp Business Messaging Policy and Meta's Commerce Policy, and the rules of any other channel you connect.</li>
        <li>Only message people who have agreed to hear from you, and honour requests to stop.</li>
        <li>Messages Meta charges for are billed to your business by Meta or through your own Meta payment method.</li>
        <li>Meta may limit or block a number for policy breaches; Bizriva can't override Meta's decisions.</li>
      </ul>

      <h2>Not allowed</h2>
      <p>Spam, scams, illegal or restricted products, misleading claims, harassment, or trying to access another business's data or break Bizriva's security. We may suspend accounts that do this.</p>

      <h2>Your data</h2>
      <p>Your business owns its customers, messages and orders. We handle them as described in our <a className="underline" href="/privacy">privacy policy</a>. You are responsible for having a lawful reason to process your customers' information.</p>

      <h2>Plans and payment</h2>
      <p>New businesses get a free trial. After that, paid plans are billed in advance; prices are shown on the Billing page. If a plan ends, sending pauses until it is renewed, and your data stays available.</p>

      <h2>The assistant</h2>
      <p>The sales assistant answers from the products, prices and answers you add. Check that this information is correct. It hands customers to your team when it isn't sure, and orders are confirmed by your team before delivery.</p>

      <h2>Availability and liability</h2>
      <p>We work to keep Bizriva running, but it is provided "as is" and may sometimes be unavailable, including when Meta or another provider has a problem. To the extent the law allows, Bizriva is not liable for indirect losses or lost profits, and our total liability is limited to what you paid us in the 3 months before the claim.</p>

      <h2>Ending</h2>
      <p>You can stop using Bizriva at any time and ask us to delete your data. We may end or suspend an account that breaks these terms, with notice where we can.</p>

      <h2>Changes and law</h2>
      <p>We will tell account owners about important changes. These terms are governed by the laws of the Federal Republic of Nigeria. Questions: <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </LegalPage>
  );
}
