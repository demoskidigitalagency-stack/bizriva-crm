/**
 * Connect the AI (real data): the owner pastes their own Anthropic API key once.
 * It goes straight to the encrypted vault and is never shown again.
 */
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useAuth } from "@/app/auth";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";

interface KeyRow { active: boolean; model: string | null; saved_at: string; last_used_at: string | null; last_error: string | null }

export function AiConnect() {
  const { current } = useAuth();
  const ws = current?.workspaceId;
  const isOwner = current?.role === "owner";
  const [row, setRow] = useState<KeyRow | null | undefined>(undefined);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws) return;
    const { data } = await sb.from("ai_keys").select("active, model, saved_at, last_used_at, last_error").eq("workspace_id", ws).maybeSingle();
    const r = (data as KeyRow | null) ?? null;
    setRow(r && r.active ? r : null); setModel(r?.model ?? "");
  }, [ws]);
  useEffect(() => { void load(); }, [load]);
  if (!current || (current.role !== "owner" && current.role !== "manager")) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = supabase(); if (!sb || !ws) return;
    if (!row && !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim())) return setError("Paste an Anthropic API key — it starts with sk-ant-.");
    setBusy(true); setError("");
    const { error: e2 } = await sb.rpc("save_ai_key", { p_workspace: ws, p_key: key.trim(), p_model: model.trim() });
    setBusy(false);
    if (e2) return setError(e2.message);
    setKey(""); setEditing(false); await load();
  };
  const remove = async () => {
    const sb = supabase(); if (!sb || !ws) return;
    setBusy(true);
    const { error: e2 } = await sb.rpc("remove_ai_key", { p_workspace: ws });
    setBusy(false);
    if (e2) setError(e2.message); else await load();
  };

  const form = (
    <form className="space-y-2" onSubmit={save} aria-label="Connect the AI">
      <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={row ? "New API key (leave blank to keep)" : "Anthropic API key (sk-ant-…)"} aria-label="Anthropic API key" />
      <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model (optional — leave blank for the standard one)" aria-label="Model" />
      <p className="text-xs text-muted-foreground">Create a key at console.anthropic.com → API keys. It's stored encrypted and never shown again. You pay Anthropic directly for what the AI uses.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : row ? "Save" : "Connect the AI"}</Button>
        {row && <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
      </div>
    </form>
  );

  return (
    <Section title="AI connection" description="The AI answers customers on WhatsApp from your products, prices, policies and each customer's orders.">
      <div className="space-y-3 p-4 text-sm">
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        {row === undefined ? <p className="text-muted-foreground" role="status">Checking…</p> : !row ? (
          isOwner ? form : <p className="text-muted-foreground">Not connected yet — the owner connects the AI here.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={row.last_error ? "warning" : "success"}>{row.last_error ? "Needs attention" : "Connected"}</StatusBadge>
              <span className="text-xs text-muted-foreground">since {relativeTime(row.saved_at)} · last answer {row.last_used_at ? relativeTime(row.last_used_at) : "none yet"}{row.model ? ` · ${row.model}` : ""}</span>
            </div>
            {row.last_error && <p className="text-xs text-destructive">Last problem: {row.last_error}</p>}
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              <li>Replies only from your data; any price that isn't yours is stopped and the chat goes to your team.</li>
              <li>Hands over when a customer asks for a person, complains, or the AI isn't sure — the chat is marked in the Inbox.</li>
              <li>Never asks for card details, PINs or OTPs. Doesn't reply to customers who sent STOP.</li>
            </ul>
            {isOwner && (editing ? form : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Change key</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove()}>Disconnect</Button>
              </div>
            ))}
          </>
        )}
      </div>
    </Section>
  );
}
