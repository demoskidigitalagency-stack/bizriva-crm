/**
 * Live status of the business (activity_status in the database): connections, what's
 * running or waiting, problems in the last 24 hours, today's numbers and recent events.
 * Shown on /activity and as the top-bar indicator. Owners and managers on real data.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/auth";
import { useLive } from "@/domain/store";
import { supabase } from "@/lib/supabase";

export type ChannelState = "ok" | "working" | "problem" | "off";
export interface StatusChannel { key: string; name: string; state: ChannelState; detail: string; at: string | null }
export interface StatusJob { key: string; title: string; state: "running" | "waiting"; done: number | null; total: number | null; unit: string; detail: string; at: string | null; link?: string }
export interface StatusProblem { key: string; title: string; detail: string | null; at: string | null; link?: string }
export interface StatusEvent { action: string; entity: string; detail: Record<string, unknown> | null; at: string; by: string | null }
export interface ActivityStatus {
  checkedAt: string; channels: StatusChannel[]; running: StatusJob[]; problems: StatusProblem[];
  today: { messagesIn: number; messagesOut: number; newContacts: number; orders: number; followupsSent: number };
  recent: StatusEvent[];
}

/** Poll the live status while mounted. Returns null on sample data or for roles that can't see it. */
export function useActivityStatus(everyMs: number) {
  const { current } = useAuth();
  const live = useLive();
  const ws = current?.workspaceId;
  const allowed = live.on && (current?.role === "owner" || current?.role === "manager");
  const [data, setData] = useState<ActivityStatus | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const sb = supabase(); if (!sb || !ws || !allowed) return;
    const { data: d, error: e } = await sb.rpc("activity_status", { p_workspace: ws });
    if (e) { setError(e.message); return; }
    setError(""); setData(d as ActivityStatus);
  }, [ws, allowed]);
  useEffect(() => {
    if (!allowed) { setData(null); return; }
    void load();
    const t = setInterval(() => { if (typeof document === "undefined" || document.visibilityState === "visible") void load(); }, everyMs);
    return () => clearInterval(t);
  }, [allowed, load, everyMs]);
  return { data, error, allowed, reload: load };
}

const n = (v: unknown) => (typeof v === "number" ? v.toLocaleString() : String(v ?? ""));

/** One recent event in plain words. */
export function eventText(e: Pick<StatusEvent, "action" | "detail">): string {
  const d = e.detail ?? {};
  switch (e.action) {
    case "whatsapp_device_link_started": return `Started linking WhatsApp (${d["method"] === "qr" ? "QR code" : "pairing code"})`;
    case "whatsapp_history_imported": return `Old WhatsApp chats brought in: ${n(d["messages"])} messages from ${n(d["chats"])} chats${d["tagged"] != null ? `, ${n(d["tagged"])} customers tagged by product` : ""}`;
    case "ai_handoff": return "The assistant handed a chat to the team";
    case "ai_checkout": return "The assistant took an order in chat";
    case "moved_uncalled": return "An order nobody called moved to another agent";
    case "sent_to_partner": return "An order was sent to a delivery partner";
    case "plan_paid": return "Plan payment received";
    case "suspended": return "Business suspended";
    case "unsuspended": return "Business restored";
    case "meta_lead": return "New lead from a Facebook/Instagram form";
    default: {
      const words = e.action.replace(/_/g, " ");
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}

/** Short summary for the top-bar indicator. */
export function headline(s: Pick<ActivityStatus, "running" | "problems"> | null): { tone: "problem" | "running" | "ok"; text: string } {
  if (!s) return { tone: "ok", text: "" };
  const active = s.running.filter((j) => j.state === "running").length;
  if (s.problems.length) return { tone: "problem", text: `${s.problems.length} problem${s.problems.length > 1 ? "s" : ""}` };
  if (active) return { tone: "running", text: `${active} running` };
  return { tone: "ok", text: "All good" };
}
