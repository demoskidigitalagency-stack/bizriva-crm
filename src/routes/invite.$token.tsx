import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Join a business · Bizriva CRM" }] }),
  component: AcceptInvite,
});

function AcceptInvite() {
  const { token } = Route.useParams();
  const auth = useAuth();
  const [state, setState] = useState<{ error?: string; done?: boolean }>({});
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">You've been invited</h1>
      <Section>
        <div className="space-y-3 p-4 text-sm">
          {!auth.ready ? <p className="text-muted-foreground">Loading…</p>
            : !auth.session ? (
              <>
                <p>Sign in, or create an account with the email address the invite was sent to. Then open this link again.</p>
                <Button asChild><Link to="/account">Sign in or create account</Link></Button>
              </>
            ) : state.done ? (
              <>
                <p className="text-success" role="status">You've joined {auth.current?.name ?? "the business"}.</p>
                <Button asChild><Link to="/">Open Bizriva</Link></Button>
              </>
            ) : (
              <>
                <p>Signed in as <span className="font-medium">{auth.email}</span>.</p>
                <Button disabled={busy} onClick={async () => { setBusy(true); const r = await auth.acceptInvite(token); setBusy(false); setState(r.error ? { error: r.error } : { done: true }); }}>Accept invite</Button>
                {state.error && <p className="text-destructive" role="alert">{state.error}</p>}
              </>
            )}
        </div>
      </Section>
    </div>
  );
}
