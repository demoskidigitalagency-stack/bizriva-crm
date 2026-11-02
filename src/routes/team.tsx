import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Minus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonAvatar, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import { CURRENT_USER_ID } from "@/domain/database";
import type { TeamMember } from "@/domain/types";

export const Route = createFileRoute("/team")({
  head: () => ({ meta: [{ title: "Team and Roles · Bizriva CRM" }] }),
  component: Team,
});

type Role = TeamMember["role"];
const ROLES: Record<Role, string> = { owner: "Owner", manager: "Manager", sales_rep: "Sales", support: "Support", fulfilment: "Dispatcher", finance: "Finance" };
const PERMS: { label: string; roles: Role[] }[] = [
  { label: "Reply in the inbox", roles: ["owner", "manager", "sales_rep", "support"] },
  { label: "See every conversation", roles: ["owner", "manager", "support"] },
  { label: "Create and edit orders", roles: ["owner", "manager", "sales_rep"] },
  { label: "Confirm COD orders", roles: ["owner", "manager", "sales_rep", "support"] },
  { label: "Dispatch and update deliveries", roles: ["owner", "manager", "fulfilment"] },
  { label: "Record payments and cash hand-ins", roles: ["owner", "manager", "finance"] },
  { label: "Edit products and prices", roles: ["owner", "manager"] },
  { label: "Change automations and the AI agent", roles: ["owner", "manager"] },
  { label: "Manage team and billing", roles: ["owner"] },
];

function Invite({ onClose }: { onClose: () => void }) {
  const db = useDb();
  const { saveRecord } = useActions();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("sales_rep");
  const [error, setError] = useState("");
  const save = () => {
    if (!name.trim()) return setError("Enter their name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email address.");
    if (db.team.some((t) => t.email.toLowerCase() === email.toLowerCase())) return setError("Someone with that email is already on the team.");
    saveRecord("team", { name: name.trim(), email: email.trim(), role, avatarColor: "info", active: false });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Invite a teammate</DialogTitle><DialogDescription>They show as invited until they accept. Practice Mode doesn't send the email.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="in">Name</Label><Input id="in" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ie">Email</Label><Input id="ie" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger aria-label="Role"><SelectValue>{ROLES[role]}</SelectValue></SelectTrigger>
              <SelectContent>{(Object.keys(ROLES) as Role[]).filter((r) => r !== "owner").map((r) => <SelectItem key={r} value={r}>{ROLES[r]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Send invite</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Team() {
  const db = useDb();
  const { saveRecord } = useActions();
  const [inviting, setInviting] = useState(false);
  const owners = db.team.filter((t) => t.role === "owner" && t.active).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Workspace</p>
          <h1 className="text-2xl font-bold">Team and Roles</h1>
          <p className="mt-1 text-sm text-muted-foreground">Who's on the team and what each role can do. With the backend, the server enforces these — not just the screens.</p>
        </div>
        <Button size="sm" onClick={() => setInviting(true)}><UserPlus className="size-4" /> Invite</Button>
      </div>
      <Section title="Members">
        <ul className="divide-y">
          {db.team.map((t) => {
            const lastOwner = t.role === "owner" && owners <= 1;
            const invited = !t.active && !db.contacts.some((c) => c.ownerId === t.id);
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <PersonAvatar name={t.name} />
                <span className="min-w-0 flex-1 basis-48"><span className="block font-medium">{t.name}{t.id === CURRENT_USER_ID ? " (you)" : ""}</span><span className="block text-xs text-muted-foreground">{t.email}</span></span>
                {invited && <StatusBadge tone="info">Invited</StatusBadge>}
                <Select value={t.role} disabled={lastOwner} onValueChange={(v) => saveRecord("team", { ...t, role: v as Role })}>
                  <SelectTrigger className="h-8 w-36" aria-label={`Role for ${t.name}`} title={lastOwner ? "A workspace needs at least one owner" : undefined}><SelectValue>{ROLES[t.role]}</SelectValue></SelectTrigger>
                  <SelectContent>{(Object.keys(ROLES) as Role[]).map((r) => <SelectItem key={r} value={r}>{ROLES[r]}</SelectItem>)}</SelectContent>
                </Select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><Switch checked={t.active} disabled={lastOwner || t.id === CURRENT_USER_ID} onCheckedChange={(v) => saveRecord("team", { ...t, active: v })} aria-label={`${t.name} active`} />Active</label>
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="What each role can do">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="px-4 py-2 text-left font-medium">Permission</th>{(Object.keys(ROLES) as Role[]).map((r) => <th key={r} className="px-2 py-2 text-center font-medium">{ROLES[r]}</th>)}</tr></thead>
            <tbody className="divide-y">
              {PERMS.map((p) => (
                <tr key={p.label}><td className="px-4 py-2">{p.label}</td>{(Object.keys(ROLES) as Role[]).map((r) => <td key={r} className="px-2 py-2 text-center">{p.roles.includes(r) ? <Check className="mx-auto size-4 text-success" aria-label="Allowed" /> : <Minus className="mx-auto size-4 text-muted-foreground" aria-label="Not allowed" />}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">Riders use the rider phone view from <Link to="/riders" className="underline">Riders</Link> and don't need a seat. Role names are still proposed in the crosswalk.</p>
      </Section>
      {inviting && <Invite onClose={() => setInviting(false)} />}
    </div>
  );
}
