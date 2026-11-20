/**
 * Books — record what the business spends and see profit by month:
 *   Sales (delivered orders) − cost of goods (product cost × quantity) − expenses = profit.
 * Each currency is kept apart. Download as a spreadsheet for an accountant or a lender.
 */
import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageHeader, Section } from "@/components/app/primitives";
import { useLive, useWorkspace } from "@/domain/store";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { CURRENCIES, formatCurrency, type CurrencyCode } from "@/lib/format";
import { downloadText } from "@/lib/vcard";

export const Route = createFileRoute("/books")({
  head: () => ({ meta: [{ title: "Books · Bizriva" }] }),
  component: Books,
});

const CATEGORIES = ["Stock / goods", "Adverts", "Delivery & transport", "Rent", "Salaries", "Data & airtime", "Packaging", "Fees & charges", "Other"];
interface Row { month: string; currency: string; sales: number; orders: number; cogs: number; expenses: number; byCategory: Record<string, number>; profit: number }
interface Expense { id: string; spent_on: string; category: string; amount: number; currency: string | null; note: string | null; paid_to: string | null }

function Books() {
  const live = useLive();
  const ws = useWorkspace();
  const { current } = useAuth();
  const wid = current?.workspaceId;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [list, setList] = useState<Expense[]>([]);
  const [e, setE] = useState({ spent_on: new Date().toISOString().slice(0, 10), category: CATEGORIES[0]!, amount: "", currency: ws.currency as string, note: "", paid_to: "" });
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !wid) return;
    const [pl, ex] = await Promise.all([
      sb.rpc("profit_and_loss", { p_workspace: wid, p_months: 6 }),
      sb.from("expenses").select("id, spent_on, category, amount, currency, note, paid_to").eq("workspace_id", wid).order("spent_on", { ascending: false }).limit(100),
    ]);
    if (pl.error) setMsg(pl.error.message);
    setRows((pl.data ?? []) as Row[]); setList((ex.data ?? []) as Expense[]);
  }, [wid]);
  useEffect(() => { void load(); }, [load]);
  const money = (n: number, c: string) => formatCurrency(n, c as CurrencyCode);

  if (!live.on) return (<><PageHeader title="Books" description="Expenses and profit by month" /><EmptyState title="Books work with your live business" description="Switch off Practice Mode to record expenses and see your real profit." /></>);

  const add = async () => {
    const amount = Number(e.amount.replace(/,/g, ""));
    if (!(amount > 0)) return setMsg("Enter the amount spent.");
    const { error } = await supabase()!.from("expenses").insert({ workspace_id: wid, spent_on: e.spent_on, category: e.category, amount, currency: e.currency === ws.currency ? null : e.currency, note: e.note.trim() || null, paid_to: e.paid_to.trim() || null });
    if (error) return setMsg(error.message);
    setE({ ...e, amount: "", note: "", paid_to: "" }); setMsg("Saved."); await load();
  };
  const exportCsv = () => {
    const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
    const head = ["Month", "Currency", "Delivered orders", "Sales", "Cost of goods", "Expenses", "Profit", ...CATEGORIES];
    const lines = (rows ?? []).map((r) => [r.month, r.currency, r.orders, r.sales, r.cogs, r.expenses, r.profit, ...CATEGORIES.map((c) => r.byCategory[c] ?? 0)].map(q).join(","));
    const exp = ["", "Expenses", "Date,Category,Amount,Currency,Paid to,Note", ...list.map((x) => [x.spent_on, x.category, x.amount, x.currency ?? ws.currency, x.paid_to ?? "", x.note ?? ""].map(q).join(","))];
    downloadText(`books-${new Date().toISOString().slice(0, 10)}.csv`, [head.map(q).join(","), ...lines, ...exp].join("\n") + "\n", "text/csv");
  };

  return (
    <>
      <PageHeader title="Books" description="What you sold, what it cost you and what you spent — profit by month" actions={<Button variant="outline" onClick={exportCsv}><Download className="size-4" /> Download</Button>} />
      <Section title="Profit and loss" description="Sales count only delivered orders. Add each product's cost on the Products page so cost of goods is right.">
        {!rows ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Month</th><th className="px-2 py-2 text-right font-medium">Sales</th><th className="px-2 py-2 text-right font-medium">Cost of goods</th><th className="px-2 py-2 text-right font-medium">Expenses</th><th className="px-4 py-2 text-right font-medium">Profit</th></tr></thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={`${r.month}-${r.currency}`}>
                    <td className="px-4 py-2">{new Date(`${r.month}-01T12:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}{r.currency !== ws.currency && <span className="ml-1 text-xs text-muted-foreground">{r.currency}</span>}<span className="block text-xs text-muted-foreground">{r.orders} delivered</span></td>
                    <td className="num px-2 py-2 text-right">{money(r.sales, r.currency)}</td>
                    <td className="num px-2 py-2 text-right text-muted-foreground">−{money(r.cogs, r.currency)}</td>
                    <td className="num px-2 py-2 text-right text-muted-foreground" title={Object.entries(r.byCategory).map(([k, v]) => `${k}: ${money(v, r.currency)}`).join("\n")}>−{money(r.expenses, r.currency)}</td>
                    <td className={`num px-4 py-2 text-right font-semibold ${r.profit < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>{money(r.profit, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section title="Add an expense" description="Rent, adverts, transport, stock you bought, salaries — anything the business paid for">
        <div className="grid gap-2 p-4 sm:grid-cols-6">
          <div className="space-y-1"><Label htmlFor="ex-d">Date</Label><Input id="ex-d" type="date" value={e.spent_on} onChange={(x) => setE({ ...e, spent_on: x.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="ex-c">Category</Label>
            <select id="ex-c" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={e.category} onChange={(x) => setE({ ...e, category: x.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="ex-a">Amount</Label><Input id="ex-a" inputMode="decimal" value={e.amount} onChange={(x) => setE({ ...e, amount: x.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="ex-cur">Currency</Label>
            <select id="ex-cur" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={e.currency} onChange={(x) => setE({ ...e, currency: x.target.value })}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="ex-p">Paid to</Label><Input id="ex-p" value={e.paid_to} onChange={(x) => setE({ ...e, paid_to: x.target.value })} placeholder="optional" /></div>
          <div className="space-y-1 sm:col-span-5"><Label htmlFor="ex-n">Note</Label><Input id="ex-n" value={e.note} onChange={(x) => setE({ ...e, note: x.target.value })} placeholder="e.g. Facebook ads for game tables" /></div>
          <div className="flex items-end"><Button className="w-full" onClick={() => void add()}>Add</Button></div>
          {msg && <p role="status" className="text-xs text-muted-foreground sm:col-span-6">{msg}</p>}
        </div>
        <ul className="divide-y border-t text-sm">
          {list.map((x) => (
            <li key={x.id} className="flex items-center gap-2 px-4 py-2">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{x.spent_on}</span>
              <span className="min-w-0 flex-1 truncate">{x.category}{x.paid_to ? ` · ${x.paid_to}` : ""}{x.note ? ` — ${x.note}` : ""}</span>
              <span className="num font-medium">{money(x.amount, x.currency ?? ws.currency)}</span>
              <Button size="icon" variant="ghost" className="size-7" aria-label="Delete expense" onClick={async () => { await supabase()!.from("expenses").delete().eq("id", x.id); await load(); }}><Trash2 className="size-4" /></Button>
            </li>
          ))}
          {!list.length && <li className="px-4 py-3 text-muted-foreground">No expenses recorded yet.</li>}
        </ul>
      </Section>
    </>
  );
}
