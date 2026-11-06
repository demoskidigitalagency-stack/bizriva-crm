/** Where customers land after paying by link (Paystack or Flutterwave sends them here). */
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/paid")({
  head: () => ({ meta: [{ title: "Payment received · Bizriva" }, { name: "robots", content: "noindex" }] }),
  component: Paid,
});

function Paid() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold">Thank you</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your payment is being confirmed. You'll get a message in your WhatsApp chat as soon as it lands — you can close this page.</p>
      </div>
    </main>
  );
}
