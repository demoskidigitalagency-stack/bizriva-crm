import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section, StatusBadge } from "@/components/app/primitives";
import { useActions, useDb } from "@/domain/store";
import { SOURCE_LABELS, type AcquisitionSource } from "@/domain/types";

export const Route = createFileRoute("/crm/imports")({
  head: () => ({ meta: [{ title: "Imports · Bizriva CRM" }] }),
  component: Imports,
});

const FIELDS = ["firstName", "lastName", "fullName", "phone", "email", "city"] as const;
type Field = (typeof FIELDS)[number] | "skip";
const FIELD_LABEL: Record<Field, string> = { firstName: "First name", lastName: "Last name", fullName: "Full name", phone: "Phone", email: "Email", city: "City", skip: "Don't import" };

/** Small CSV parser: handles quoted values, commas and doubled quotes inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function guess(header: string): Field {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  if (h.includes("first")) return "firstName";
  if (h.includes("last") || h.includes("surname")) return "lastName";
  if (h === "name" || h.includes("fullname")) return "fullName";
  if (h.includes("phone") || h.includes("mobile") || h.includes("whatsapp")) return "phone";
  if (h.includes("email")) return "email";
  if (h.includes("city") || h.includes("location") || h.includes("town")) return "city";
  return "skip";
}

const normalise = (p: string) => p.replace(/[^\d+]/g, "");

function Imports() {
  const db = useDb();
  const { addContact } = useActions();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Field[]>([]);
  const [source, setSource] = useState<AcquisitionSource>("import");
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const [error, setError] = useState("");

  const header = rows[0] ?? [];
  const body = rows.slice(1);

  const onFile = async (file: File | undefined) => {
    setResult(null);
    setError("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Choose a .csv file. In Excel or Google Sheets, use Save as / Download → CSV."); return; }
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) { setError("That file has no rows under the header."); return; }
    setFileName(file.name);
    setRows(parsed);
    setMap(parsed[0]!.map(guess));
  };

  const col = (r: string[], f: Field) => { const i = map.indexOf(f); return i >= 0 ? (r[i] ?? "").trim() : ""; };
  const existing = new Set(db.contacts.map((c) => normalise(c.phone)));
  const prepared = body.map((r) => {
    const full = col(r, "fullName");
    const [fn, ...ln] = full.split(/\s+/);
    const firstName = col(r, "firstName") || fn || "";
    const lastName = col(r, "lastName") || ln.join(" ");
    const phone = col(r, "phone");
    const problem = !firstName ? "No name" : !phone ? "No phone" : existing.has(normalise(phone)) ? "Phone already in contacts" : "";
    return { firstName, lastName: lastName || "—", phone, email: col(r, "email"), city: col(r, "city") || "Lagos", problem };
  });
  const ok = prepared.filter((p) => !p.problem);
  const canImport = map.includes("phone") && (map.includes("firstName") || map.includes("fullName")) && ok.length > 0;

  const runImport = () => {
    const owner = db.team.find((t) => t.active)?.id ?? "";
    ok.forEach((p) => addContact({ firstName: p.firstName, lastName: p.lastName, phone: p.phone, ...(p.email ? { email: p.email } : {}), countryCode: "NG", city: p.city, lifecycle: "contact", source, ownerId: owner }));
    setResult({ added: ok.length, skipped: prepared.length - ok.length });
    setRows([]);
    setFileName("");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Imports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Bring contacts in from a spreadsheet. Phone numbers already in your contacts are skipped, so nobody is duplicated.</p>
      </div>

      {result && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm" role="status">
          Added {result.added} contact{result.added === 1 ? "" : "s"}{result.skipped ? `, skipped ${result.skipped}` : ""}. <Link to="/crm/contacts" className="font-medium underline">See contacts</Link>
        </div>
      )}

      <Section title="1. Choose a CSV file" description="First row must be column names, for example: Name, Phone, Email, City">
        <div className="p-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center hover:border-primary/50">
            <FileUp className="size-6 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">{fileName || "Select a .csv file"}</span>
            <span className="text-xs text-muted-foreground">Stays in this browser — nothing is uploaded in Practice Mode</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
        </div>
      </Section>

      {rows.length > 0 && (
        <>
          <Section title="2. Match the columns" description="Guessed from your column names — check them">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {header.map((h, i) => (
                <label key={`${h}-${i}`} className="space-y-1 text-sm">
                  <span className="block font-medium">{h || `Column ${i + 1}`}</span>
                  <Select value={map[i] ?? "skip"} onValueChange={(v) => setMap((m) => m.map((x, j) => (j === i ? (v as Field) : x)))}>
                    <SelectTrigger className="h-9"><SelectValue>{FIELD_LABEL[map[i] ?? "skip"]}</SelectValue></SelectTrigger>
                    <SelectContent>{(["skip", ...FIELDS] as Field[]).map((f) => <SelectItem key={f} value={f}>{FIELD_LABEL[f]}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
              ))}
              <label className="space-y-1 text-sm">
                <span className="block font-medium">Where these people came from</span>
                <Select value={source} onValueChange={(v) => setSource(v as AcquisitionSource)}>
                  <SelectTrigger className="h-9"><SelectValue>{SOURCE_LABELS[source]}</SelectValue></SelectTrigger>
                  <SelectContent>{(Object.keys(SOURCE_LABELS) as AcquisitionSource[]).map((s) => <SelectItem key={s} value={s}>{SOURCE_LABELS[s]}</SelectItem>)}</SelectContent>
                </Select>
              </label>
            </div>
          </Section>

          <Section title="3. Check and import" description={`${ok.length} ready · ${prepared.length - ok.length} will be skipped`} action={<Button size="sm" disabled={!canImport} onClick={runImport}>Import {ok.length}</Button>}>
            {!canImport && <p className="px-4 pt-3 text-sm text-warning-foreground dark:text-warning">Match at least a name column and a phone column.</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Phone</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">City</th><th className="px-4 py-2">Check</th></tr>
                </thead>
                <tbody className="divide-y">
                  {prepared.slice(0, 50).map((p, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">{p.firstName} {p.lastName !== "—" ? p.lastName : ""}</td>
                      <td className="px-4 py-2">{p.phone || "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.email || "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.city}</td>
                      <td className="px-4 py-2">{p.problem ? <StatusBadge tone="warning">{p.problem}</StatusBadge> : <StatusBadge tone="success">Ready</StatusBadge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {prepared.length > 50 && <p className="px-4 py-2 text-xs text-muted-foreground">Showing the first 50 of {prepared.length} rows.</p>}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
