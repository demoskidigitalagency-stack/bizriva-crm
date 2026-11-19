/**
 * Store → Buyer requests near you: requests posted on the seller directory that match this store's
 * city, category or product names, with a button to reply on WhatsApp. Only for stores listed in the
 * directory.
 */
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Section } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";

interface Req { id: string; what: string; city: string | null; category: string | null; budget: string | null; name: string | null; phone: string; at: string }

export function BuyerRequestsPanel() {
  const { current } = useAuth();
  const [r, setR] = useState<{ listed: boolean; requests: Req[] } | null>(null);
  useEffect(() => {
    if (!current?.workspaceId) return;
    void supabase()?.rpc("my_buyer_requests", { p_workspace: current.workspaceId }).then(({ data }) => setR((data as typeof r) ?? null));
  }, [current?.workspaceId]);
  if (!r) return null;
  return (
    <Section title="Buyer requests near you" description="People who posted on the seller directory what they want to buy, in your city or category">
      {!r.listed ? <p className="p-4 text-sm text-muted-foreground">Publish your store and switch on “List me in the seller directory” above to see buyer requests.</p>
        : !r.requests.length ? <p className="p-4 text-sm text-muted-foreground">No matching requests right now. Requests that match your city, category or product names show here.</p>
        : (
          <ul className="divide-y text-sm">
            {r.requests.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <span className="min-w-0 flex-1"><b>{x.what}</b> <span className="text-muted-foreground">· {[x.name, x.city, x.category, x.budget && `budget ${x.budget}`].filter(Boolean).join(" · ")} · {new Date(x.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></span>
                <a className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white" target="_blank" rel="noopener noreferrer"
                  href={`https://wa.me/${x.phone}?text=${encodeURIComponent(`Hello${x.name ? ` ${x.name.split(" ")[0]}` : ""}, I saw your request on Bizriva for "${x.what}". We have it — `)}`}><MessageCircle className="size-3.5" /> Reply on WhatsApp</a>
              </li>
            ))}
          </ul>
        )}
    </Section>
  );
}
