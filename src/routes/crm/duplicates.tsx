import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, PersonAvatar, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { findDuplicates, fullName, type DuplicateGroup } from "@/domain/repositories";
import { LIFECYCLE_META } from "@/domain/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/crm/duplicates")({
  head: () => ({ meta: [{ title: "Duplicates · Bizriva CRM" }] }),
  component: Duplicates,
});

function Group({ g }: { g: DuplicateGroup }) {
  const ws = useWorkspace();
  const { mergeContacts } = useActions();
  // Default to keeping the record with the most orders, then the oldest.
  const best = [...g.contacts].sort((a, b) => b.totalOrders - a.totalOrders || +new Date(a.createdAt) - +new Date(b.createdAt))[0]!;
  const [keep, setKeep] = useState(best.id);
  const [confirming, setConfirming] = useState(false);
  const keepName = fullName(g.contacts.find((c) => c.id === keep)!);

  return (
    <Section title={g.contacts.map((c) => fullName(c)).join(" · ")} description={g.reason} action={<Button size="sm" onClick={() => setConfirming(true)}><GitMerge className="size-4" /> Merge</Button>}>
      <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Record to keep">
        {g.contacts.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={keep === c.id}
            onClick={() => setKeep(c.id)}
            className={cn("rounded-md border p-3 text-left text-sm hover:border-primary/50", keep === c.id && "border-primary bg-accent/40")}
          >
            <span className="flex items-center gap-2">
              <PersonAvatar name={fullName(c)} />
              <span className="min-w-0 flex-1 truncate font-medium">{fullName(c)}</span>
              {keep === c.id && <StatusBadge tone="brand">Keep</StatusBadge>}
            </span>
            <span className="mt-2 block text-xs text-muted-foreground">{c.phone} · {c.email ?? "no email"} · {c.city}</span>
            <span className="mt-1 flex flex-wrap gap-1">
              <StatusBadge tone={LIFECYCLE_META[c.lifecycle].tone}>{LIFECYCLE_META[c.lifecycle].label}</StatusBadge>
              <StatusBadge>{c.totalOrders} orders</StatusBadge>
              <StatusBadge>{formatCurrency(c.lifetimeValue, ws.currency, { compact: true })}</StatusBadge>
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">Added {formatDate(c.createdAt)}</span>
          </button>
        ))}
      </div>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">
        Not the same person? <Link to="/crm/contacts/$contactId" params={{ contactId: g.contacts[0]!.id }} className="underline">Open the records</Link> and leave them separate.
      </p>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge into {keepName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Orders, conversations, leads, tasks and history from the other {g.contacts.length - 1 === 1 ? "record" : `${g.contacts.length - 1} records`} move onto {keepName}, and the others are removed. In Practice Mode you can undo this with Reset sample data in Settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => mergeContacts(keep, g.contacts.map((c) => c.id))}>Merge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

function Duplicates() {
  const db = useDb();
  const groups = findDuplicates(db);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Duplicates</h1>
        <p className="mt-1 text-sm text-muted-foreground">Possible duplicate people. Pick the record to keep, then merge — everything attached moves across.</p>
      </div>
      {groups.length === 0 ? (
        <Section><EmptyState title="No likely duplicates" description="New matches show up here as contacts are added or imported." /></Section>
      ) : groups.map((g) => <Group key={g.key} g={g} />)}
    </div>
  );
}
