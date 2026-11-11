/** Where Meta's WhatsApp sign-up window returns (redirect_uri). Hands the one-time code back to the Bizriva tab that opened it, then closes. */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/meta/callback")({
  head: () => ({ meta: [{ title: "Connecting WhatsApp · Bizriva" }, { name: "robots", content: "noindex" }] }),
  component: MetaCallback,
});

function MetaCallback() {
  const [text, setText] = useState("Finishing…");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const msg = { type: "BIZRIVA_META_SIGNUP", code: q.get("code"), state: q.get("state"), error: q.get("error_description") ?? q.get("error_reason") ?? q.get("error") };
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(msg, window.location.origin);
      setText(msg.code ? "Done — you can close this window." : "Sign-up was cancelled. You can close this window.");
      setTimeout(() => window.close(), 400);
    } else setText("Go back to the Bizriva tab to finish connecting WhatsApp.");
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <p className="rounded-lg border bg-card p-6 text-sm shadow-sm" role="status">{text}</p>
    </main>
  );
}
