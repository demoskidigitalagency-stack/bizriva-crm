/**
 * Real data only: who answers this chat — the AI or the team — and the AI's
 * last problem. Staff take over or hand back with one tap.
 */
import { useState } from "react";
import { Bot, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLive } from "@/domain/store";
import { supabase } from "@/lib/supabase";
import type { Conversation } from "@/domain/types";

export function AiChatBar({ conversation }: { conversation: Conversation }) {
  const live = useLive();
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
      {error && <span className="w-full text-destructive" role="alert">{error}</span>}
    </div>
  );
}
