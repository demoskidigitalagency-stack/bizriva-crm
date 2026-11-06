/**
 * Real data only: who answers this chat — the AI or the team — and the AI's
 * last problem. Staff take over or hand back with one tap.
 */
import { useState } from "react";
import { Bot, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDb, useLive } from "@/domain/store";
import { supabase } from "@/lib/supabase";
import type { Conversation } from "@/domain/types";

export function AiChatBar({ conversation }: { conversation: Conversation }) {
  const live = useLive();
  const db = useDb();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ai = conversation.ai;
  if (!live.on || !ai) return null;
  const set = async (who: "ai" | "human") => {
    const sb = supabase(); if (!sb) return;
    setBusy(true); setError("");
    const { error: e } = await sb.from("conversations").update({ handled_by: who, ...(who === "ai" ? { ai_error: null } : {}) }).eq("id", conversation.id);
    setBusy(false);
    if (e) setError(e.message); else await live.reload();
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-xs" role="status" aria-label="Who answers this chat">
      {ai.handledBy === "ai" ? (
        <>
          <Bot className="size-3.5 text-primary" aria-hidden="true" />
          <span className="font-medium">AI is answering</span>
          {ai.error && <span className="text-destructive">· Couldn't answer: {ai.error}</span>}
          <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" disabled={busy} onClick={() => void set("human")}>Take over</Button>
        </>
      ) : (
        <>
          <UserRound className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">{ai.priority ? "Handed to the team — needs a reply" : "Team is answering"}</span>
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" disabled={busy} onClick={() => void set("ai")}>Let AI answer</Button>
        </>
      )}
      <label className="flex w-full items-center gap-2 text-muted-foreground sm:w-auto">
        <span>Assigned to</span>
        <select className="rounded border bg-background px-1.5 py-1 text-xs text-foreground" aria-label="Assign this chat to" value={conversation.assigneeId || ""} disabled={busy}
          onChange={async (e) => {
            const sb = supabase(); if (!sb) return;
            setBusy(true); setError("");
            const { error: er } = await sb.from("conversations").update({ assigned_to: e.target.value || null }).eq("id", conversation.id);
            setBusy(false);
            if (er) setError(er.message); else await live.reload();
          }}>
          <option value="">Nobody yet</option>
          {db.team.map((m) => <option key={m.id} value={m.id}>{m.name}{m.onDuty === false ? " (off duty)" : ""}</option>)}
        </select>
      </label>
      {error && <span className="w-full text-destructive" role="alert">{error}</span>}
    </div>
  );
}
