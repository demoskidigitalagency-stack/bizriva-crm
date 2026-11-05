import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, LogOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section, StatusBadge } from "@/components/app/primitives";
import { ROLE_LABEL, useAuth, type Invite, type Role } from "@/app/auth";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account · Bizriva CRM" }] }),
  component: Account,
});

function SignInForms() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const run = async (fn: () => Promise<{ error?: string; needsConfirm?: boolean }>, ok?: string) => {
    setBusy(true); setNote(null);
    const r = await fn();
    setBusy(false);
    if (r.error) setNote({ tone: "error", text: r.error });
    else if (r.needsConfirm) setNote({ tone: "ok", text: `Check ${email} for a confirmation link, then come back and sign in.` });
    else if (ok) setNote({ tone: "ok", text: ok });
  };
  const fields = (
    <>
      <div className="space-y-1.5"><Label htmlFor="acc-email">Email</Label><Input id="acc-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="acc-pass">Password</Label><Input id="acc-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
    </>
  );
  return (
    <Section className="mx-auto max-w-md">
      <Tabs defaultValue="signin" className="p-4">
        <TabsList className="w-full"><TabsTrigger value="signin" className="flex-1">Sign in</TabsTrigger><TabsTrigger value="signup" className="flex-1">Create account</TabsTrigger></TabsList>
        <TabsContent value="signin">
          <form className="space-y-3 pt-3" onSubmit={(e) => { e.preventDefault(); void run(() => signIn(email, password)); }}>
            {fields}
            <Button type="submit" className="w-full" disabled={busy || !email || !password}>Sign in</Button>
            <button type="button" className="text-xs text-primary underline" disabled={!email} onClick={() => void run(() => resetPassword(email), `Password reset link sent to ${email}.`)}>Forgot password?</button>
          </form>
        </TabsContent>
        <TabsContent value="signup">
          <form className="space-y-3 pt-3" onSubmit={(e) => { e.preventDefault(); if (password.length < 8) return setNote({ tone: "error", text: "Use at least 8 characters for the password." }); void run(() => signUp(email, password)); }}>
            {fields}
            <Button type="submit" className="w-full" disabled={busy || !email || !password}>Create account</Button>
            <p className="text-xs text-muted-foreground">After you confirm your email you'll set up your business. Staff join through an invite instead.</p>
          </form>
        </TabsContent>
      </Tabs>
      {note && <p className={`px-4 pb-4 text-sm ${note.tone === "error" ? "text-destructive" : "text-success"}`} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
    </Section>
  );
}

function CreateBusiness() {
  const { createWorkspace } = useAuth();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Set up your business" description="You'll be its owner. You can invite your team next." className="mx-auto max-w-md">
      <form className="space-y-3 p-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await createWorkspace(name, currency); setBusy(false); if (r.error) setError(r.error); }}>
        <div className="space-y-1.5"><Label htmlFor="biz-name">Business name</Label><Input id="biz-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Luxe Hair Collective" /></div>
        <div className="space-y-1.5"><Label>Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger aria-label="Business currency"><SelectValue>{currency}</SelectValue></SelectTrigger>
            <SelectContent>{["NGN", "GHS", "KES", "ZAR", "USD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || !name.trim()}>Create business</Button>
      </form>
    </Section>
  );
}

function TeamInvites() {
  const { current, listInvites, createInvite, revokeInvite } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("sales");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const canInvite = current?.role === "owner" || current?.role === "manager";
  const load = async () => setInvites(await listInvites());
  useEffect(() => { if (canInvite) void load(); }, [current?.workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  const link = (t: string) => `${typeof window === "undefined" ? "" : window.location.origin}/invite/${t}`;
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(link(t)); } catch { /* blocked */ } setCopied(t); };
  if (!canInvite) return null;
  return (
    <Section title="Invite your team" description="Send each person their invite link on WhatsApp or email. It works once, for that email address, for 7 days.">
      <form className="grid gap-2 p-4 sm:grid-cols-[1fr_160px_auto]" onSubmit={async (e) => {
        e.preventDefault(); setError("");
        const r = await createInvite(email, role);
        if (r.error) return setError(r.error);
        setEmail(""); await load(); if (r.token) void copy(r.token);
      }}>
        <Input type="email" aria-label="Invite email" placeholder="staff@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger aria-label="Invite role"><SelectValue>{ROLE_LABEL[role]}</SelectValue></SelectTrigger>
          <SelectContent>{(Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== "owner").map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="submit" disabled={!email.includes("@")}>Create invite</Button>
        {error && <p className="text-sm text-destructive sm:col-span-3" role="alert">{error}</p>}
      </form>
      {invites.length > 0 && (
        <ul className="divide-y border-t text-sm">
          {invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <span className="min-w-0 flex-1 truncate">{i.email}</span>
              <StatusBadge>{ROLE_LABEL[i.role]}</StatusBadge>
              {i.acceptedAt ? <StatusBadge tone="success">Joined</StatusBadge> : new Date(i.expiresAt) < new Date() ? <StatusBadge tone="warning">Expired</StatusBadge> : (
                <Button size="sm" variant="outline" onClick={() => void copy(i.token)}><Copy className="size-4" /> {copied === i.token ? "Link copied" : "Copy link"}</Button>
              )}
              {!i.acceptedAt && <Button size="icon" variant="ghost" aria-label={`Cancel invite for ${i.email}`} onClick={async () => { await revokeInvite(i.id); await load(); }}><Trash2 className="size-4" /></Button>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Account() {
  const auth = useAuth();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Workspace</p>
        <h1 className="text-2xl font-bold">Your account</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Real sign-in for you and your team. The screens still show Practice Mode sample data until your business data is switched over — that's the next backend step.</p>
      </div>
      {!auth.configured ? <p className="text-sm">The backend isn't connected on this copy of the app.</p>
        : !auth.ready ? <p className="text-sm text-muted-foreground">Loading…</p>
          : !auth.session ? <SignInForms />
            : (
              <>
                <Section title="Signed in" action={<Button size="sm" variant="outline" onClick={() => void auth.signOut()}><LogOut className="size-4" /> Sign out</Button>}>
                  <div className="space-y-3 p-4 text-sm">
                    <p>{auth.email}</p>
                    {auth.memberships.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your businesses</p>
                        <ul className="space-y-1">
                          {auth.memberships.map((m) => (
                            <li key={m.workspaceId} className="flex items-center gap-2">
                              <button type="button" className={`font-medium ${auth.current?.workspaceId === m.workspaceId ? "text-primary" : "hover:underline"}`} onClick={() => auth.selectWorkspace(m.workspaceId)}>{m.name}</button>
                              <StatusBadge>{ROLE_LABEL[m.role]}</StatusBadge>
                              {auth.current?.workspaceId === m.workspaceId && <StatusBadge tone="success">Current</StatusBadge>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Section>
                {auth.memberships.length === 0 ? <CreateBusiness /> : <TeamInvites />}
                <p className="text-xs text-muted-foreground">Practice data is still where you left it. <Link to="/" className="underline">Back to the app</Link></p>
              </>
            )}
    </div>
  );
}
