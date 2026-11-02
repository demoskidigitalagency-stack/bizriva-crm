/**
 * Writes STATUS.md from src/app/status.ts and src/app/modules.ts,
 * so the repo report and the in-app Build Progress page always match.
 *
 *   bun run status
 */
import { writeFileSync } from "node:fs";
import { ACCEPTANCE_TESTS, PHASES, overallProgress, phaseProgress } from "../src/app/status";
import { GROUPS, MODULES, STATE_LABEL } from "../src/app/modules";

const pct = (n: number) => `${Math.round(n)}%`;
const bar = (n: number) => {
  const filled = Math.round(n / 5);
  return "█".repeat(filled) + "░".repeat(20 - filled);
};

const overall = overallProgress();
const lines: string[] = [];
lines.push("# Bizriva CRM — build status", "");
lines.push("Generated from `src/app/status.ts` by `bun run status`. Edit that file, not this one.", "");
lines.push(`**Overall: ${pct(overall)}**  \`${bar(overall)}\``, "");
lines.push("An item is ticked only when it works for real, not when its screen exists.", "");

lines.push("| Phase | Share | Done | Progress |", "| --- | ---: | ---: | --- |");
for (const p of PHASES) {
  const pr = phaseProgress(p);
  lines.push(`| ${p.name} | ${p.share}% | ${pr.doneCount}/${pr.count} | ${pct(pr.pctOfPhase * 100)} |`);
}
lines.push("");

for (const p of PHASES) {
  const pr = phaseProgress(p);
  lines.push(`## ${p.name} — ${pct(pr.pctOfPhase * 100)}`, "", `_${p.goal}_ Worth ${p.share}% of the build.`, "");
  for (const i of p.items) {
    const date = i.doneOn ? ` _(${i.doneOn})_` : "";
    const note = i.note ? ` — ${i.note}` : "";
    lines.push(`- [${i.done ? "x" : " "}] ${i.label}${date}${note}`);
  }
  lines.push("");
}

const passed = ACCEPTANCE_TESTS.filter((t) => t.passed).length;
lines.push(`## Acceptance tests — ${passed}/${ACCEPTANCE_TESTS.length}`, "");
for (const t of ACCEPTANCE_TESTS) lines.push(`- [${t.passed ? "x" : " "}] ${t.n}. ${t.label}`);
lines.push("");

lines.push("## Modules", "", "| Group | Module | Phase | Status | From |", "| --- | --- | --- | --- | --- |");
for (const g of GROUPS) {
  for (const m of MODULES.filter((x) => x.group === g)) {
    lines.push(`| ${g} | ${m.label} | ${m.phase} | ${STATE_LABEL[m.state]} | ${m.sources.join(", ")} |`);
  }
}
lines.push("");

writeFileSync(new URL("../STATUS.md", import.meta.url), lines.join("\n"));
console.log(`STATUS.md written — overall ${pct(overall)}`);
