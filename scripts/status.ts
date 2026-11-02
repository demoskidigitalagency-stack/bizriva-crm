/**
 * Writes STATUS.md from src/app/status.ts and src/app/modules.ts,
 * so the repo report and the in-app Build Progress page always match.
 *
 *   bun run status
 */
import { writeFileSync } from "node:fs";
import { ACCEPTANCE_TESTS, FRONTEND_CHECKLIST, PHASES, backendProgress, frontendProgress, phaseProgress, type StatusItem } from "../src/app/status";
import { GROUPS, MODULES, STATE_LABEL } from "../src/app/modules";

const pct = (n: number) => `${Math.round(n)}%`;
const bar = (n: number) => {
  const filled = Math.round(n / 5);
  return "█".repeat(filled) + "░".repeat(20 - filled);
};
const tick = (i: StatusItem) => `- [${i.done ? "x" : " "}] ${i.label}${i.doneOn ? ` _(${i.doneOn})_` : ""}${i.note ? ` — ${i.note}` : ""}`;
const mark = { live: "✅", practice: "✅", partial: "🟡", planned: "⬜" } as const;

const fe = frontendProgress();
const be = backendProgress();
const out: string[] = [];

out.push("# Bizriva CRM — build status", "");
out.push("Generated from `src/app/status.ts` and `src/app/modules.ts` by `bun run status`. Edit those, not this file.", "");
out.push("| Track | Progress | |", "| --- | ---: | --- |");
out.push(`| **Frontend — Practice Mode** (every page and button works on sample data) | **${pct(fe.overall)}** | \`${bar(fe.overall)}\` |`);
out.push(`| **Backend — Live** (works for real: auth, database, WhatsApp, AI) | **${pct(be)}** | \`${bar(be)}\` |`);
out.push("");
out.push(`Modules: ${fe.practiceCount} of ${MODULES.length} practice ready · ${fe.partialCount} partly working · ${fe.plannedCount} planned.`, "");

out.push("## Frontend track", "");
out.push(`### Modules — ${pct(fe.modules)} (85% of the frontend)`, "");
out.push("✅ practice ready · 🟡 partly working · ⬜ planned", "");
out.push("| | Group | Module | Phase | Status | From |", "| --- | --- | --- | --- | --- | --- |");
for (const g of GROUPS) {
  for (const m of MODULES.filter((x) => x.group === g)) {
    out.push(`| ${mark[m.state]} | ${g} | ${m.label} | ${m.phase} | ${STATE_LABEL[m.state]} | ${m.sources.join(", ")} |`);
  }
}
out.push("");
out.push(`### Cross-cutting — ${pct(fe.checklist)} (15% of the frontend)`, "");
FRONTEND_CHECKLIST.forEach((i) => out.push(tick(i)));
out.push("");

out.push("## Backend track", "");
out.push("| Phase | Share | Done | Progress |", "| --- | ---: | ---: | --- |");
for (const p of PHASES) {
  const pr = phaseProgress(p);
  out.push(`| ${p.name} | ${p.share}% | ${pr.doneCount}/${pr.count} | ${pct(pr.pctOfPhase * 100)} |`);
}
out.push("");
for (const p of PHASES) {
  const pr = phaseProgress(p);
  out.push(`### ${p.name} — ${pct(pr.pctOfPhase * 100)}`, "", `_${p.goal}_`, "");
  p.items.forEach((i) => out.push(tick(i)));
  out.push("");
}

const passed = ACCEPTANCE_TESTS.filter((t) => t.passed).length;
out.push(`### Acceptance tests — ${passed}/${ACCEPTANCE_TESTS.length}`, "");
ACCEPTANCE_TESTS.forEach((t) => out.push(`- [${t.passed ? "x" : " "}] ${t.n}. ${t.label}`));
out.push("");

writeFileSync(new URL("../STATUS.md", import.meta.url), out.join("\n"));
console.log(`STATUS.md written — frontend ${pct(fe.overall)}, backend ${pct(be)}`);
