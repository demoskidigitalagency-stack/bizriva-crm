import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import type { Workflow, WorkflowStep } from "@/domain/types";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/automation")({
  head: () => ({ meta: [{ title: "Automation Builder · Bizriva CRM" }] }),
  component: Automation,
});

const KIND: Record<WorkflowStep["kind"], { label: string; tone: "brand" | "info" | "warning" | "success" }> = {
  trigger: { label: "When", tone: "brand" },
  condition: { label: "If", tone: "warning" },
  wait: { label: "Wait", tone: "info" },
  action: { label: "Do", tone: "success" },
};
let seq = 0;
const stepId = () => `st_${Date.now().toString(36)}${seq++}`;

function Editor({ wf }: { wf: Workflow }) {
  const db = useDb();
  const { saveRecord } = useActions();
  const [d, setD] = useState(wf);
  const [error, setError] = useState("");
  useEffect(() => { setD(wf); setError(""); }, [wf]);
  const dirty = JSON.stringify(d) !== JSON.stringify(wf);
  const runs = db.workflowRuns.filter((r) => r.workflowId === wf.id);

  const setStep = (i: number, patch: Partial<WorkflowStep>) => setD({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, dir: -1 | 1) => {
    const steps = [...d.steps];
    const [s] = steps.splice(i, 1);
    steps.splice(i + dir, 0, s!);
    setD({ ...d, steps });
  };
  const save = () => {
    if (!d.name.trim()) return setError("Name the workflow.");
    if (d.steps[0]?.kind !== "trigger") return setError("The first step must be a 'When' trigger.");
    if (d.steps.some((s) => !s.label.trim())) return setError("Every step needs a description.");
    saveRecord("workflows", { ...d, name: d.name.trim(), updatedAt: new Date().toISOString() });
  };

  return (
    <Section
      title={wf.name}
      description={`${runs.length} runs · ${runs.filter((r) => r.status === "failed").length} failed`}
      action={<Link to="/workflow-history" className="text-xs text-primary hover:underline">History</Link>}
    >
      <div className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="wn">Name</Label><Input id="wn" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="wd">What it does</Label><Input id="wd" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></div>
        </div>
        <ol className="space-y-2">
          {d.steps.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2">
              <span className="num w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
              <Select value={s.kind} onValueChange={(v) => setStep(i, { kind: v as WorkflowStep["kind"] })}>
                <SelectTrigger className="h-8 w-24" aria-label={`Step ${i + 1} type`}><SelectValue>{KIND[s.kind].label}</SelectValue></SelectTrigger>
                <SelectContent>{(Object.keys(KIND) as WorkflowStep["kind"][]).map((k) => <SelectItem key={k} value={k}>{KIND[k].label}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="h-8 min-w-0 flex-1 basis-48" value={s.label} onChange={(e) => setStep(i, { label: e.target.value })} aria-label={`Step ${i + 1}`} />
              <span className="flex">
                <Button size="icon" variant="ghost" className="size-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="size-4" /></Button>
                <Button size="icon" variant="ghost" className="size-8" disabled={i === d.steps.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="size-4" /></Button>
                <Button size="icon" variant="ghost" className="size-8" disabled={d.steps.length <= 1} onClick={() => setD({ ...d, steps: d.steps.filter((_, j) => j !== i) })} aria-label="Remove step"><Trash2 className="size-4" /></Button>
              </span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(KIND) as WorkflowStep["kind"][]).map((k) => (
            <Button key={k} size="sm" variant="outline" onClick={() => setD({ ...d, steps: [...d.steps, { id: stepId(), kind: k, label: "" }] })}><Plus className="size-3.5" /> {KIND[k].label}</Button>
          ))}
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" disabled={!dirty} onClick={save}>Save workflow</Button>
          {dirty && <Button size="sm" variant="ghost" onClick={() => setD(wf)}>Discard changes</Button>}
        </div>
      </div>
    </Section>
  );
}

function Automation() {
  const db = useDb();
  const { saveRecord, removeRecord } = useActions();
  const [selected, setSelected] = useState(db.workflows[0]?.id);
  const wf = db.workflows.find((w) => w.id === selected) ?? db.workflows[0];

  const add = () => {
    const id = saveRecord("workflows", { name: "New workflow", description: "", active: false, updatedAt: new Date().toISOString(), steps: [{ id: stepId(), kind: "trigger", label: "New message received" }] });
    setSelected(id);
  };
  const clone = (w: Workflow) => {
    const { id: _id, ...rest } = w;
    const id = saveRecord("workflows", { ...rest, name: `${w.name} (copy)`, active: false, updatedAt: new Date().toISOString(), steps: w.steps.map((s) => ({ ...s, id: stepId() })) });
    setSelected(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Automation</p>
          <h1 className="text-2xl font-bold">Automation Builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">Step-by-step workflows: when something happens, check a condition, wait, then act. Follow-up timing rules live in <Link to="/follow-ups" className="underline">Follow-ups</Link>.</p>
        </div>
        <Button size="sm" onClick={add}><Plus className="size-4" /> New workflow</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Section title="Workflows">
          {db.workflows.length === 0 ? <EmptyState title="No workflows" /> : (
            <ul className="divide-y">
              {db.workflows.map((w) => (
                <li key={w.id} className={cn("space-y-2 px-4 py-3 text-sm", wf?.id === w.id && "bg-accent/40")}>
                  <button type="button" onClick={() => setSelected(w.id)} className="block w-full text-left">
                    <span className="block font-medium">{w.name}</span>
                    <span className="block text-xs text-muted-foreground">{w.steps.length} steps · edited {relativeTime(w.updatedAt)}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <Switch checked={w.active} onCheckedChange={(v) => saveRecord("workflows", { ...w, active: v })} aria-label={`${w.name} on or off`} />
                    <StatusBadge tone={w.active ? "success" : "neutral"}>{w.active ? "On" : "Off"}</StatusBadge>
                    <Button size="icon" variant="ghost" className="ml-auto size-8" onClick={() => clone(w)} aria-label={`Copy ${w.name}`}><Copy className="size-4" /></Button>
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => { removeRecord("workflows", w.id); if (selected === w.id) setSelected(undefined); }} aria-label={`Delete ${w.name}`}><Trash2 className="size-4" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {wf ? <Editor wf={wf} /> : <Section><EmptyState title="Create a workflow to start" /></Section>}
      </div>
      <p className="text-xs text-muted-foreground">Practice Mode saves the design. Workflows start running automatically once the backend's job runner is connected.</p>
    </div>
  );
}
