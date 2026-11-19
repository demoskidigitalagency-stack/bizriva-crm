/**
 * Segments → which products customers are asking about, and how many chats over time.
 * A chat counts for a product when a customer message names it (or one of its other names on the
 * Products page), or the customer is tagged "Asked about: <product>" and wrote in that window.
 * Each product links to a WhatsApp broadcast for exactly those people.
 */
import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";

interface Row { id: string; name: string; h24: number; d7: number; d30: number; y1: number; days: { day: string; chats: number }[] }

export function ProductInterest() {
  const { current } = useAuth();
  const ws = current?.workspaceId;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const sb = supabase(); if (!sb || !ws) return;
    void sb.rpc("product_interest", { p_workspace: ws, p_days: 14 }).then(({ data, error: e }) => {
      if (e) setError(e.message); else setRows((data ?? []) as Row[]);
    });
  }, [ws]);

  return (
    <Section title="Who's asking about each product" description="Chats that asked about a product, counted from what customers wrote. Add other names buyers use (e.g. 'snooker board') on the Products page to catch more.">
      {error && <p role="alert" className="p-4 text-sm text-destructive">{error}</p>}
      {!rows && !error && <p className="p-4 text-sm text-muted-foreground">Counting chats…</p>}
      {rows && rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Add your products first — then chats that mention them are counted here.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-2 font-medium">Product</th><th className="px-2 py-2 text-right font-medium">Last 24 h</th><th className="px-2 py-2 text-right font-medium">7 days</th><th className="px-2 py-2 text-right font-medium">30 days</th><th className="px-2 py-2 text-right font-medium">1 year</th><th className="px-4 py-2 font-medium">Last 14 days</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const max = Math.max(1, ...r.days.map((d) => d.chats));
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="num px-2 py-2 text-right font-semibold">{r.h24}</td>
                    <td className="num px-2 py-2 text-right">{r.d7}</td>
                    <td className="num px-2 py-2 text-right">{r.d30}</td>
                    <td className="num px-2 py-2 text-right">{r.y1}</td>
                    <td className="px-4 py-2">
                      <div className="flex h-6 items-end gap-0.5" role="img" aria-label={`Chats per day: ${r.days.map((d) => d.chats).join(", ")}`}>
                        {r.days.map((d) => <span key={d.day} title={`${d.day}: ${d.chats} chat${d.chats === 1 ? "" : "s"}`} className="w-1.5 rounded-sm bg-primary/70" style={{ height: `${Math.max(2, (d.chats / max) * 24)}px`, opacity: d.chats ? 1 : 0.25 }} />)}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.y1 > 0 && (
                        <Button asChild size="sm" variant="outline">
                          <a href={`/broadcasts?product=${r.id}&hours=${r.h24 ? 24 : r.d7 ? 168 : r.d30 ? 720 : 8784}`}><Send className="size-3.5" /> Broadcast</a>
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
