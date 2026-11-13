/** Top-bar pill on real data: "2 running", "1 problem" or "All good" — opens Live status. */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { headline, useActivityStatus } from "@/lib/activity";

export function ActivityIndicator() {
  const { data, allowed } = useActivityStatus(20_000);
  if (!allowed || !data) return null;
  const h = headline(data);
  const Icon = h.tone === "problem" ? AlertTriangle : h.tone === "running" ? Loader2 : CheckCircle2;
  return (
    <Link to="/activity" aria-label={`Live status: ${h.text}`} title="Live status"
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        h.tone === "problem" ? "bg-destructive/10 text-destructive" : h.tone === "running" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
      <Icon className={cn("size-3.5", h.tone === "running" && "animate-spin")} aria-hidden="true" />
      <span className={cn(h.tone === "ok" && "hidden sm:inline")}>{h.text}</span>
    </Link>
  );
}
