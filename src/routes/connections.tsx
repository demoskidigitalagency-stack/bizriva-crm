import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Copy, Plug, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import { autoMap, FIELD_LABEL, flatten, GOOGLE_SCRIPT, normalise, PLATFORMS, type IntakeField, type PlatformId } from "@/domain/intake";
import type { Connection, ConnectionEvent } from "@/domain/types";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/connections")({
  head: () => ({ meta: [{ title: "Website & Forms · Bizriva CRM" }] }),
  validateSearch: (s: Record<string, unknown>): { c?: string } => (typeof s["c"] === "string" ? { c: s["c"] } : {}),
  component: Connections,
});

// Live intake runs as a Supabase Edge Function that checks the secret key first.
const FUNCTIONS = `${import.meta.env.VITE_SUPABASE_URL ?? "https://xjhzkciowmklxrtwsikm.supabase.co"}/functions/v1`;
const urlFor = (c: Connection) => `${FUNCTIONS}/intake/${c.id}`;
const STATUS: Record<ConnectionEvent["status"], { label: string; tone: "success" | "info" | "neutral" | "danger" }> = {
  created_order: { label: "Order created", tone: "success" }, created_lead: { label: "Lead created", tone: "info" },
  duplicate: { label: "Duplicate skipped", tone: "neutral" }, failed: { label: "Failed", tone: "danger" },
};
// 192 random bits from the browser's secure generator (not Math.random).
const newSecret = () => `bzk_${Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("")}`;

function CopyBox({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-start gap-2">
        {multiline ? <pre className="min-w-0 flex-1 overflow-x-auto rounded bg-muted p-2 text-xs">{value}</pre> : <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs" aria-label={label}>{value}</code>}
        <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(value); } catch { /* blocked */ } setCopied(true); }}><Copy className="size-4" /> {copied ? "Copied" : "Copy"}</Button>
      </div>
    </div>
  );
}

function Setup({ conn }: { conn: Connection }) {
  const p = PLATFORMS.find((x) => x.id === conn.platform)!;
  return (
    <div className="space-y-4 p-4 text-sm">
      <CopyBox label="Your intake address" value={urlFor(conn)} />
      <CopyBox label="Secret key (header X-Bizriva-Key, or add ?key= to the address)" value={conn.secret} />
      {p.needs && <p className="rounded-md bg-muted/60 p-2 text-xs"><span className="font-semibold">You'll need:</span> {p.needs}.</p>}
      <ol className="list-decimal space-y-1.5 pl-5">{p.steps.map((s) => <li key={s}>{s.replace("your Bizriva intake address", "the intake address above")}</li>)}</ol>
      {conn.platform === "google_forms" && <CopyBox label="Apps Script for the form's Google Sheet" value={GOOGLE_SCRIPT(urlFor(conn), conn.secret)} multiline />}
      <p className="text-xs text-muted-foreground">Practice address: it starts accepting real submissions when the backend is switched on. Use the Test tab to see exactly what Bizriva will do with a submission.</p>
    </div>
  );
}

function TestAndMatch({ conn }: { conn: Connection }) {
  const { receiveIntake, saveRecord } = useActions();
  const p = PLATFORMS.find((x) => x.id === conn.platform)!;
  const [text, setText] = useState(JSON.stringify(p.sample, null, 2));
  const [result, setResult] = useState<ConnectionEvent | null>(null);
  const [error, setError] = useState("");
  const [map, setMap] = useState(conn.fieldMap);
  const parsed = useMemo(() => { try { return JSON.parse(text) as unknown; } catch { return null; } }, [text]);
  const flat = useMemo(() => (parsed ? flatten(parsed, conn.platform) : {}), [parsed, conn.platform]);
  const effective = { ...autoMap(flat), ...map };
  const preview = normalise(flat, effective);
  const fields: IntakeField[] = ["name", "first_name", "last_name", "phone", "email", "address", "city", "landmark", "product", "quantity", "total", "note", "utm_source", "external_id"];
  return (
    <div className="grid gap-4 p-4 text-sm lg:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <Label htmlFor="payload">A submission, as {p.name} sends it</Label>
        <Textarea id="payload" rows={14} className="font-mono text-xs" value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} />
        {!parsed && <p className="text-xs text-destructive" role="alert">That isn't valid JSON.</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!parsed} onClick={() => { setError(""); const r = receiveIntake(conn.id, parsed); if (!r) setError("Connection not found."); setResult(r); }}>Send test</Button>
          <Button size="sm" variant="outline" onClick={() => { setText(JSON.stringify(p.sample, null, 2)); setResult(null); }}>Reset sample</Button>
        </div>
        {error && <p className="text-destructive">{error}</p>}
        {result && (
          <p className="rounded-md border p-2" role="status">
            <StatusBadge tone={STATUS[result.status].tone}>{STATUS[result.status].label}</StatusBadge> {result.summary}{" "}
            {result.orderId && <Link to="/orders" search={{ o: result.orderId }} className="text-primary underline">Open order</Link>}
            {!result.orderId && result.contactId && <Link to="/crm/contacts/$contactId" params={{ contactId: result.contactId }} className="text-primary underline">Open contact</Link>}
          </p>
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <p className="font-medium">Field matching</p>
        <p className="text-xs text-muted-foreground">Bizriva matches by name. If a field lands in the wrong place, pick the right one and save.</p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-left"><tr><th className="px-2 py-1.5">Bizriva field</th><th className="px-2 py-1.5">Their field</th><th className="px-2 py-1.5">Value</th></tr></thead>
            <tbody className="divide-y">
              {fields.map((f) => (
                <tr key={f}>
                  <td className="px-2 py-1">{FIELD_LABEL[f]}{(f === "name" || f === "phone") && <span className="text-destructive"> *</span>}</td>
                  <td className="px-2 py-1">
                    <Select value={effective[f] ?? "__none"} onValueChange={(v) => setMap({ ...map, [f]: v === "__none" ? "" : v })}>
                      <SelectTrigger className="h-7 text-xs" aria-label={`Their field for ${FIELD_LABEL[f]}`}><SelectValue>{effective[f] || "—"}</SelectValue></SelectTrigger>
                      <SelectContent><SelectItem value="__none">—</SelectItem>{Object.keys(flat).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="max-w-[160px] truncate px-2 py-1 text-muted-foreground">{effective[f] ? flat[effective[f]!] : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={`text-xs ${preview.missing.length ? "text-destructive" : "text-success"}`}>{preview.missing.length ? `Missing ${preview.missing.join(" and ")} — submissions will fail until it's matched.` : `Looks good: ${preview.name}, ${preview.phone}${preview.product ? `, ${preview.quantity}× ${preview.product}` : ""}.`}</p>
        <Button size="sm" variant="outline" onClick={() => saveRecord("connections", { ...conn, fieldMap: Object.fromEntries(Object.entries(map).filter(([, v]) => v)) })}>Save field matching</Button>
      </div>
    </div>
  );
}

function Activity({ conn }: { conn: Connection }) {
  const db = useDb();
  const [open, setOpen] = useState<string | null>(null);
  const list = db.connectionEvents.filter((e) => e.connectionId === conn.id);
  if (!list.length) return <EmptyState title="Nothing received yet" description="Send a test, or submit the real form once the backend is live." />;
  return (
    <ul className="divide-y text-sm">
      {list.map((e) => (
        <li key={e.id} className="px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</StatusBadge>
            <span className="min-w-0 flex-1">{e.summary}</span>
            <span className="text-xs text-muted-foreground">{relativeTime(e.at)}</span>
            <button type="button" className="text-xs text-primary underline" onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? "Hide" : "View data"}</button>
          </div>
          {open === e.id && <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted p-2 text-xs">{e.raw}</pre>}
        </li>
      ))}
    </ul>
  );
}

function ConnSettings({ conn }: { conn: Connection }) {
  const { saveRecord, removeRecord } = useActions();
  const navigate = useNavigate({ from: "/connections" });
  const [name, setName] = useState(conn.name);
  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="space-y-1.5"><Label htmlFor="cn-name">Name</Label><div className="flex gap-2"><Input id="cn-name" value={name} onChange={(e) => setName(e.target.value)} /><Button size="sm" variant="outline" disabled={!name.trim() || name === conn.name} onClick={() => saveRecord("connections", { ...conn, name: name.trim() })}>Save</Button></div></div>
      <div className="space-y-1.5"><Label>When a submission names a product</Label>
        <Select value={conn.createAs} onValueChange={(v) => saveRecord("connections", { ...conn, createAs: v as Connection["createAs"] })}>
          <SelectTrigger aria-label="Create as"><SelectValue>{conn.createAs === "order" ? "Create an order to confirm (COD)" : "Create a lead only"}</SelectValue></SelectTrigger>
          <SelectContent><SelectItem value="order">Create an order to confirm (COD)</SelectItem><SelectItem value="lead">Create a lead only</SelectItem></SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Submissions without a matching product always become leads. Orders start as Pending Verification, so your COD checks still happen.</p>
      </div>
      <label className="flex items-center gap-3"><Switch checked={conn.active} onCheckedChange={(v) => saveRecord("connections", { ...conn, active: v })} aria-label="Accept submissions" /> Accept submissions</label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => saveRecord("connections", { ...conn, secret: newSecret() })}><RefreshCw className="size-4" /> New secret key</Button>
        <Button size="sm" variant="outline" className="text-destructive" onClick={() => { removeRecord("connections", conn.id); navigate({ search: {} }); }}>Remove connection</Button>
      </div>
      <p className="text-xs text-muted-foreground">A new key stops the old one working — update it on your site straight after.</p>
    </div>
  );
}

function Picker({ onPick }: { onPick: (id: PlatformId) => void }) {
  const groups = ["WordPress", "Stores", "Form builders", "Automation", "Any website"] as const;
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORMS.filter((p) => p.group === g).map((p) => (
              <button key={p.id} type="button" onClick={() => onPick(p.id)} className="rounded-lg border bg-card p-3 text-left text-sm hover:border-primary/60">
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-xs text-muted-foreground">Sends: {p.sends}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Connections() {
  const db = useDb();
  const { saveRecord } = useActions();
  const navigate = useNavigate({ from: "/connections" });
  const { c } = Route.useSearch();
  const [picking, setPicking] = useState(false);
  const conn = c ? db.connections.find((x) => x.id === c) : undefined;
  const count = (id: string) => db.connectionEvents.filter((e) => e.connectionId === id && e.status !== "failed" && e.status !== "duplicate").length;

  const add = (platform: PlatformId) => {
    const p = PLATFORMS.find((x) => x.id === platform)!;
    const id = saveRecord("connections", { platform, name: p.name, secret: newSecret(), fieldMap: {}, createAs: p.sends === "lead" ? "lead" : "order", active: true, createdAt: new Date().toISOString() });
    setPicking(false);
    navigate({ search: { c: id } });
  };

  if (conn) {
    const p = PLATFORMS.find((x) => x.id === conn.platform)!;
    return (
      <div className="space-y-4">
        <Link to="/connections" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All connections</Link>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{conn.name}</h1><StatusBadge>{p.name}</StatusBadge><StatusBadge tone={conn.active ? "success" : "neutral"}>{conn.active ? "On" : "Off"}</StatusBadge></div>
        <Tabs defaultValue="setup">
          <TabsList><TabsTrigger value="setup">Setup</TabsTrigger><TabsTrigger value="test">Test and match fields</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger></TabsList>
          <Section className="mt-3">
            <TabsContent value="setup"><Setup conn={conn} /></TabsContent>
            <TabsContent value="test"><TestAndMatch conn={conn} /></TabsContent>
            <TabsContent value="activity"><Activity conn={conn} /></TabsContent>
            <TabsContent value="settings"><ConnSettings conn={conn} /></TabsContent>
          </Section>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Workspace</p>
          <h1 className="text-2xl font-bold">Website &amp; Forms</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Keep the tools you already use. WordPress forms (Elementor, Gravity Forms, WPForms, Contact Form 7, Fluent Forms), WooCommerce, Shopify, Google Forms, Typeform, Jotform, Tally — or anything through Zapier — send their submissions here. Each one becomes a lead or a COD order to confirm, with a chat in the Inbox.</p>
        </div>
        <Button size="sm" onClick={() => setPicking(!picking)}><Plus className="size-4" /> Connect a platform</Button>
      </div>
      {picking && <Section title="Choose what to connect"><div className="p-4"><Picker onPick={add} /></div></Section>}
      {db.connections.length === 0 && !picking ? <EmptyState title="Nothing connected yet" action={<Button size="sm" onClick={() => setPicking(true)}>Connect a platform</Button>} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {db.connections.map((x) => (
            <Section key={x.id} title={x.name} description={PLATFORMS.find((p) => p.id === x.platform)?.name ?? ""} action={<StatusBadge tone={x.active ? "success" : "neutral"}>{x.active ? "On" : "Off"}</StatusBadge>}>
              <div className="space-y-3 p-4 text-sm">
                <p className="text-xs text-muted-foreground"><Plug className="mr-1 inline size-3.5" aria-hidden="true" />{count(x.id)} received{x.lastEventAt ? ` · last ${relativeTime(x.lastEventAt)}` : " · nothing yet"} · creates {x.createAs === "order" ? "orders" : "leads"}</p>
                <Button size="sm" className="w-full" onClick={() => navigate({ search: { c: x.id } })}>Open {x.name}</Button>
              </div>
            </Section>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Coming later: a Bizriva WordPress plugin that catches every form and WooCommerce order on your site with one install, and Facebook Lead Ads directly. See <Link to="/roadmap" className="underline">Coming Later</Link>.</p>
    </div>
  );
}
