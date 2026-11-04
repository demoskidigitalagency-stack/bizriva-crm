import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Copy, Download, Gift, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, KpiCard, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { campaignNames, fullName } from "@/domain/repositories";
import { ORDER_STATUS_META, type OrderForm, type OrderFormField } from "@/domain/types";
import { formatCurrency, formatDateTime, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/order-forms")({
  head: () => ({ meta: [{ title: "Order Forms · Bizriva CRM" }] }),
  validateSearch: (s: Record<string, unknown>): { f?: string } => (typeof s["f"] === "string" ? { f: s["f"] } : {}),
  component: OrderForms,
});

const FIELD_LABEL: Record<OrderFormField, string> = { name: "Full name", phone: "Phone number", address: "Delivery address", city: "City or state", landmark: "Nearest landmark", note: "Note for us" };
const ALL_FIELDS: OrderFormField[] = ["name", "phone", "address", "city", "landmark", "note"];
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function Bars({ rows, format = String }: { rows: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="p-4 text-sm text-muted-foreground">No data yet.</p>;
  return (
    <ul className="space-y-2 p-4">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between gap-2"><span className="truncate">{r.label}</span><span className="num font-semibold">{format(r.value)}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Builder({ form }: { form: OrderForm }) {
  const db = useDb();
  const ws = useWorkspace();
  const { saveRecord } = useActions();
  const [d, setD] = useState(form);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setD(form); }, [form.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<OrderForm>) => { setD({ ...d, ...patch }); setSaved(false); };
  const product = db.products.find((p) => p.id === d.productId);

  const save = () => {
    if (!d.name.trim()) return setError("Give the form a name.");
    if (!d.packages.length || d.packages.some((p) => !p.label.trim() || p.qty < 1 || p.price <= 0)) return setError("Each package needs a label, a quantity and a price.");
    setError("");
    saveRecord("orderForms", d);
    setSaved(true);
  };

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="of-name">Form name (only you see this)</Label><Input id="of-name" value={d.name} onChange={(e) => set({ name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Product</Label>
          <Select value={d.productId} onValueChange={(v) => set({ productId: v })}>
            <SelectTrigger aria-label="Form product"><SelectValue>{product?.name ?? "Pick a product"}</SelectValue></SelectTrigger>
            <SelectContent>{db.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="of-head">Headline buyers see</Label><Input id="of-head" value={d.headline} onChange={(e) => set({ headline: e.target.value })} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="of-banner">Offer banner (optional)</Label><Input id="of-banner" value={d.banner ?? ""} placeholder="Buy 2 Get 1 Free" onChange={(e) => set({ banner: e.target.value })} /></div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Packages</p>
        <ul className="space-y-2">
          {d.packages.map((p, i) => (
            <li key={p.id} className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-[1fr_80px_140px_1fr_auto]">
              <Input aria-label={`Package ${i + 1} label`} value={p.label} onChange={(e) => set({ packages: d.packages.map((x) => (x.id === p.id ? { ...x, label: e.target.value } : x)) })} />
              <Input aria-label={`Package ${i + 1} quantity`} type="number" min={1} value={p.qty} onChange={(e) => set({ packages: d.packages.map((x) => (x.id === p.id ? { ...x, qty: Number(e.target.value) } : x)) })} />
              <Input aria-label={`Package ${i + 1} price`} type="number" min={0} value={p.price} onChange={(e) => set({ packages: d.packages.map((x) => (x.id === p.id ? { ...x, price: Number(e.target.value) } : x)) })} />
              <Input aria-label={`Package ${i + 1} gift`} placeholder="Free gift (optional)" value={p.gift ?? ""} onChange={(e) => set({ packages: d.packages.map((x) => (x.id === p.id ? { ...x, gift: e.target.value } : x)) })} />
              <Button size="icon" variant="ghost" aria-label={`Remove package ${i + 1}`} disabled={d.packages.length === 1} onClick={() => set({ packages: d.packages.filter((x) => x.id !== p.id) })}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => { const n = d.packages.length + 1; set({ packages: [...d.packages, { id: `pk_${Date.now().toString(36)}`, label: `Buy ${n}`, qty: n, price: (product?.price ?? 0) * n }] }); }}><Plus className="size-4" /> Add package</Button>
        {product && <p className="mt-1 text-xs text-muted-foreground">Catalogue price: {formatCurrency(product.price, ws.currency)} each. Package prices are fixed here, so a buyer can't change them in the browser.</p>}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Questions on the form</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {ALL_FIELDS.map((f) => (
            <label key={f} className="flex items-center gap-2">
              <Checkbox checked={d.fields.includes(f)} disabled={f === "name" || f === "phone"} onCheckedChange={(v) => set({ fields: v ? [...d.fields, f] : d.fields.filter((x) => x !== f) })} aria-label={FIELD_LABEL[f]} />
              {FIELD_LABEL[f]}{f === "name" || f === "phone" ? <span className="text-xs text-muted-foreground">(always)</span> : null}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3"><Switch checked={d.payOnDelivery} onCheckedChange={(v) => set({ payOnDelivery: v })} aria-label="Pay on delivery" /> Pay on delivery</label>
        <label className="flex items-center gap-3"><Switch checked={d.active} onCheckedChange={(v) => set({ active: v })} aria-label="Form accepting orders" /> Accepting orders</label>
        <label className="flex items-center gap-3"><Switch checked={d.pixels.meta} onCheckedChange={(v) => set({ pixels: { ...d.pixels, meta: v } })} aria-label="Meta purchase event" /> Send purchase event to Meta</label>
        <label className="flex items-center gap-3"><Switch checked={d.pixels.tiktok} onCheckedChange={(v) => set({ pixels: { ...d.pixels, tiktok: v } })} aria-label="TikTok purchase event" /> Send purchase event to TikTok</label>
      </div>
      <p className="text-xs text-muted-foreground">One event per order, with its value, never twice — even if the buyer refreshes the thank-you page. Events are recorded here now and sent for real once the backend is connected.</p>
      <div className="space-y-1.5"><Label htmlFor="of-thanks">Thank-you message</Label><Input id="of-thanks" value={d.thankYou} onChange={(e) => set({ thankYou: e.target.value })} /></div>

      {error && <p className="text-destructive" role="alert">{error}</p>}
      <div className="flex items-center gap-3"><Button onClick={save}>Save form</Button>{saved && <span className="text-success" role="status">Saved.</span>}</div>
    </div>
  );
}

function Preview({ form }: { form: OrderForm }) {
  const db = useDb();
  const ws = useWorkspace();
  const { trackForm, submitOrderForm } = useActions();
  const product = db.products.find((p) => p.id === form.productId);
  const [pkg, setPkg] = useState(form.packages[1]?.id ?? form.packages[0]?.id ?? "");
  const [values, setValues] = useState<Partial<Record<OrderFormField, string>>>({});
  const [adSource, setAdSource] = useState("Direct");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dupes, setDupes] = useState(0);
  const started = useRef(false);
  const viewed = useRef(false);
  useEffect(() => { if (!viewed.current) { viewed.current = true; trackForm(form.id, "view"); } }, [form.id, trackForm]);

  const chosen = form.packages.find((p) => p.id === pkg);
  const order = orderId ? db.orders.find((o) => o.id === orderId) : undefined;
  const sources = ["Direct", ...campaignNames(db).slice(0, 6), "TikTok ad", "Instagram bio"];

  const change = (f: OrderFormField, v: string) => {
    if (!started.current) { started.current = true; trackForm(form.id, "start"); }
    setValues({ ...values, [f]: v });
  };
  const submit = () => {
    if (!form.active) return setError("This form is switched off.");
    const id = submitOrderForm(form.id, { packageId: pkg, name: values.name ?? "", phone: values.phone ?? "", address: values.address ?? "", city: values.city ?? "", landmark: values.landmark ?? "", note: values.note ?? "", adSource });
    if (!id) {
      const firstEmpty = form.fields.find((f) => !values[f]?.trim());
      if (firstEmpty) trackForm(form.id, "start", firstEmpty);
      return setError("Enter your full name and an 11-digit phone number.");
    }
    setError(""); setOrderId(id);
  };

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]">
      <div className="mx-auto w-full max-w-md rounded-xl border bg-background p-4 shadow-sm" aria-label="Order form preview" role="region">
        {order ? (
          <div className="space-y-3 text-center text-sm" role="status">
            <p className="text-lg font-bold">Order received</p>
            <p>{form.thankYou}</p>
            <p className="num font-semibold">{order.reference} · {formatCurrency(order.total, ws.currency)}</p>
            <Button size="sm" variant="outline" onClick={() => { trackForm(form.id, "duplicate"); setDupes(dupes + 1); }}>Refresh thank-you page</Button>
            {dupes > 0 && <p className="text-xs text-muted-foreground">Duplicate purchase event blocked ({dupes}). The ad platform still sees one order.</p>}
            <div className="flex justify-center gap-2 pt-2">
              <Link to="/orders" search={{ o: order.id }} className="text-xs font-medium text-primary underline">Open the order</Link>
              <button type="button" className="text-xs font-medium text-primary underline" onClick={() => { setOrderId(null); setValues({}); started.current = false; setDupes(0); }}>Place another test order</button>
            </div>
          </div>
        ) : (
          <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <p className="text-base font-bold leading-snug">{form.headline}</p>
            {form.banner && <p className="rounded-md bg-primary px-3 py-1.5 text-center text-xs font-semibold text-primary-foreground">{form.banner}</p>}
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Choose a package</legend>
              {form.packages.map((p) => (
                <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-md border p-2 ${pkg === p.id ? "border-primary bg-primary/5" : ""}`}>
                  <input type="radio" name="pkg" value={p.id} checked={pkg === p.id} onChange={() => setPkg(p.id)} className="accent-[var(--primary)]" />
                  <span className="flex-1"><span className="font-medium">{p.label}</span> <span className="text-muted-foreground">· {p.qty}× {product?.name}</span>{p.gift && <span className="mt-0.5 flex items-center gap-1 text-xs text-success"><Gift className="size-3" aria-hidden="true" /> {p.gift}</span>}</span>
                  <span className="num font-semibold">{formatCurrency(p.price, ws.currency)}</span>
                </label>
              ))}
            </fieldset>
            {form.fields.map((f) => (
              <div key={f} className="space-y-1"><Label htmlFor={`pf-${f}`}>{FIELD_LABEL[f]}</Label><Input id={`pf-${f}`} value={values[f] ?? ""} onChange={(e) => change(f, e.target.value)} inputMode={f === "phone" ? "tel" : undefined} /></div>
            ))}
            <div className="flex items-center justify-between rounded-md bg-muted p-3"><span>Total {form.payOnDelivery ? "(pay on delivery)" : ""}</span><span className="num text-lg font-bold" aria-label="Form total">{formatCurrency(chosen?.price ?? 0, ws.currency)}</span></div>
            {error && <p className="text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full">Place order</Button>
          </form>
        )}
      </div>
      <div className="space-y-2 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Practice controls</p>
        <div className="space-y-1.5"><Label>Pretend the visitor came from</Label>
          <Select value={adSource} onValueChange={setAdSource}>
            <SelectTrigger aria-label="Visitor source"><SelectValue>{adSource}</SelectValue></SelectTrigger>
            <SelectContent>{sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">On a real page the ad source is read from the link the buyer clicked. Each order is saved first, then emailed and sent to the ad platform, so a failed email never loses it.</p>
      </div>
    </div>
  );
}

function Report({ form }: { form: OrderForm }) {
  const db = useDb();
  const { simulateFormTraffic } = useActions();
  const subs = db.formSubmissions.filter((s) => s.formId === form.id);
  const orders = db.orders.filter((o) => o.formId === form.id);
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const cancelled = orders.filter((o) => o.status === "cancelled" || o.status === "returned").length;
  const group = (key: "region" | "adSource") => {
    const m = new Map<string, number>();
    subs.forEach((s) => m.set(s[key], (m.get(s[key]) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  };
  const st = form.stats;
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Visitors" value={String(st.views)} />
        <KpiCard label="Started the form" value={String(st.starts)} hint={pct(st.starts, st.views)} tone="info" />
        <KpiCard label="Orders" value={String(st.submits)} hint={`${pct(st.submits, st.views)} of visitors`} tone="success" />
        <KpiCard label="Delivered / cancelled" value={orders.length ? `${pct(delivered, orders.length)} / ${pct(cancelled, orders.length)}` : "—"} hint="orders made here in Practice Mode" />
        <KpiCard label="Duplicate events blocked" value={String(st.duplicatesBlocked)} tone="warning" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Where people stop" description="The question they were on when they left"><Bars rows={form.fields.filter((f) => st.dropOff[f]).map((f) => ({ label: FIELD_LABEL[f], value: st.dropOff[f] ?? 0 })).sort((a, b) => b.value - a.value)} /></Section>
        <Section title="Orders by region"><Bars rows={group("region")} /></Section>
        <Section title="Orders by ad source"><Bars rows={group("adSource")} /></Section>
      </div>
      <Button size="sm" variant="outline" onClick={() => simulateFormTraffic(form.id)}>Simulate 60 visitors</Button>
    </div>
  );
}

function Submissions({ form }: { form: OrderForm }) {
  const db = useDb();
  const ws = useWorkspace();
  const subs = db.formSubmissions.filter((s) => s.formId === form.id);
  const exportCsv = () => {
    const head = ["Placed", "Order", "Customer", "Phone", "Package", "Total", "Region", "Ad source", "Status", "Email sent", "Ad event sent"];
    const rows = subs.map((s) => {
      const o = db.orders.find((x) => x.id === s.orderId);
      const c = db.contacts.find((x) => x.id === s.contactId);
      const p = form.packages.find((x) => x.id === s.packageId);
      return [s.at, o?.reference ?? "", c ? fullName(c) : "", c?.phone ?? "", p?.label ?? "", String(s.total), s.region, s.adSource, o ? ORDER_STATUS_META[o.status].label : "", s.emailSent ? "yes" : "no", s.eventSent ? "yes" : "no"];
    });
    const csv = [head, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `${form.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-orders.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div>
      <div className="flex items-center justify-between border-b p-3 text-sm">
        <span className="text-muted-foreground">{subs.length} order{subs.length === 1 ? "" : "s"} saved from this form in Practice Mode</span>
        <Button size="sm" variant="outline" disabled={!subs.length} onClick={exportCsv}><Download className="size-4" /> Export to spreadsheet</Button>
      </div>
      {subs.length === 0 ? <EmptyState title="No orders yet" description="Place a test order in Preview." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Package</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Region</th><th className="px-3 py-2">Ad source</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Saved</th></tr></thead>
            <tbody className="divide-y">
              {subs.map((s) => {
                const o = db.orders.find((x) => x.id === s.orderId);
                const c = db.contacts.find((x) => x.id === s.contactId);
                return (
                  <tr key={s.id}>
                    <td className="px-3 py-2">{o ? <Link to="/orders" search={{ o: o.id }} className="num font-semibold hover:underline">{o.reference}</Link> : "—"}</td>
                    <td className="px-3 py-2">{c ? fullName(c) : "—"}</td>
                    <td className="px-3 py-2">{form.packages.find((p) => p.id === s.packageId)?.label}</td>
                    <td className="num px-3 py-2 text-right">{formatCurrency(s.total, ws.currency)}</td>
                    <td className="px-3 py-2">{s.region}</td>
                    <td className="px-3 py-2">{s.adSource}</td>
                    <td className="px-3 py-2">{o && <StatusBadge tone={ORDER_STATUS_META[o.status].tone}>{ORDER_STATUS_META[o.status].label}</StatusBadge>}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{formatDateTime(s.at)} · email {s.emailSent ? "sent" : "not set up"} · ad event {s.eventSent ? "recorded" : "off"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Embed({ form }: { form: OrderForm }) {
  const db = useDb();
  const [copied, setCopied] = useState("");
  const link = `https://bizriva.shop/${db.settings.storeSlug}/order/${form.id}`;
  const snippet = `<script src="https://app.bizriva.com/embed.js" data-form="${form.id}" async></script>`;
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); } catch { /* blocked */ } setCopied(what); };
  return (
    <div className="space-y-4 p-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Form link — use it in ads, bio and WhatsApp status</p>
        <div className="mt-1 flex gap-2"><code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{link}</code><Button size="sm" variant="outline" onClick={() => copy(link, "link")}><Copy className="size-4" /> {copied === "link" ? "Copied" : "Copy"}</Button></div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Embed code — paste on any website, WordPress included</p>
        <div className="mt-1 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-muted px-2 py-1.5 text-xs">{snippet}</code><Button size="sm" variant="outline" onClick={() => copy(snippet, "code")}><Copy className="size-4" /> {copied === "code" ? "Copied" : "Copy"}</Button></div>
      </div>
      <p className="text-xs text-muted-foreground">Practice addresses. They go live with the backend.</p>
    </div>
  );
}

function OrderForms() {
  const db = useDb();
  const ws = useWorkspace();
  const { saveRecord } = useActions();
  const navigate = useNavigate({ from: "/order-forms" });
  const { f } = Route.useSearch();
  const form = f ? db.orderForms.find((x) => x.id === f) : undefined;
  const totals = useMemo(() => new Map(db.orderForms.map((x) => [x.id, db.formSubmissions.filter((s) => s.formId === x.id).reduce((s, v) => s + v.total, 0)])), [db.orderForms, db.formSubmissions]);

  const create = () => {
    const p = db.products.find((x) => x.active !== false) ?? db.products[0];
    if (!p) return;
    const id = saveRecord("orderForms", {
      name: `${p.name} order form`, productId: p.id, headline: `${p.name} — pay on delivery`, packages: [
        { id: "pk_a", label: "Buy 1", qty: 1, price: p.price },
        { id: "pk_b", label: "Buy 2", qty: 2, price: Math.round(p.price * 1.9) },
      ], fields: ["name", "phone", "address", "city"], payOnDelivery: true, pixels: { meta: true, tiktok: false }, thankYou: "Thank you! We'll call you shortly to confirm.", active: true,
      createdAt: new Date().toISOString(), stats: { views: 0, starts: 0, submits: 0, duplicatesBlocked: 0, dropOff: {} },
    });
    navigate({ search: { f: id } });
  };

  if (form) {
    return (
      <div className="space-y-4">
        <Link to="/order-forms" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All order forms</Link>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{form.name}</h1><StatusBadge tone={form.active ? "success" : "neutral"}>{form.active ? "Accepting orders" : "Off"}</StatusBadge></div>
        <Tabs defaultValue="preview">
          <TabsList><TabsTrigger value="preview">Preview</TabsTrigger><TabsTrigger value="build">Build</TabsTrigger><TabsTrigger value="orders">Orders</TabsTrigger><TabsTrigger value="report">Report</TabsTrigger><TabsTrigger value="embed">Link and embed</TabsTrigger></TabsList>
          <Section className="mt-3">
            <TabsContent value="preview"><Preview form={form} /></TabsContent>
            <TabsContent value="build"><Builder form={form} /></TabsContent>
            <TabsContent value="orders"><Submissions form={form} /></TabsContent>
            <TabsContent value="report"><Report form={form} /></TabsContent>
            <TabsContent value="embed"><Embed form={form} /></TabsContent>
          </Section>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Sales</p>
          <h1 className="text-2xl font-bold">Order Forms</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Checkout forms for your ad landing pages. Every order is saved the moment it's placed, lands in Orders and the Inbox, and shows which ad and region it came from.</p>
        </div>
        <Button size="sm" onClick={create}><Plus className="size-4" /> New order form</Button>
      </div>
      {db.orderForms.length === 0 ? <EmptyState title="No order forms yet" action={<Button size="sm" onClick={create}>Create one</Button>} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {db.orderForms.map((x) => (
            <Section key={x.id} title={x.name} description={db.products.find((p) => p.id === x.productId)?.name ?? ""} action={<StatusBadge tone={x.active ? "success" : "neutral"}>{x.active ? "On" : "Off"}</StatusBadge>}>
              <div className="space-y-3 p-4 text-sm">
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div><dt className="text-xs text-muted-foreground">Visitors</dt><dd className="num font-semibold">{x.stats.views}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Orders</dt><dd className="num font-semibold">{x.stats.submits}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Conversion</dt><dd className="num font-semibold">{pct(x.stats.submits, x.stats.views)}</dd></div>
                </dl>
                <p className="text-xs text-muted-foreground">{x.packages.length} packages · created {relativeTime(x.createdAt)}{totals.get(x.id) ? ` · ${formatCurrency(totals.get(x.id)!, ws.currency)} ordered in practice` : ""}</p>
                <Button size="sm" className="w-full" onClick={() => navigate({ search: { f: x.id } })}>Open {x.name}</Button>
              </div>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
