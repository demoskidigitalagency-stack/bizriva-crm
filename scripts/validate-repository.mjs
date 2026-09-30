import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceRoots = ["src", "supabase", "tests"];
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".sql", ".md", ".json"]);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "playwright-report", "test-results"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (textExtensions.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const files = [];
for (const rootDir of sourceRoots) files.push(...await walk(path.join(root, rootDir)));

const errors = [];
const forbidden = [
  { pattern: /TODO|FIXME|XXX/, message: "unfinished marker" },
  { pattern: /sk-[A-Za-z0-9]{20,}/, message: "possible secret" },
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, message: "private key" },
];

for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(text)) errors.push(`${path.relative(root, file)}: ${rule.message}`);
  }
}

const migrationDir = path.join(root, "supabase", "migrations");
const migrationFiles = (await readdir(migrationDir)).filter((f) => f.endsWith(".sql")).sort();
const migrationNames = migrationFiles.map((f) => f.match(/^(\d{8}_\d{4})_/)?.[1]).filter(Boolean);
if (migrationNames.length !== migrationFiles.length) errors.push("supabase/migrations: invalid migration filename");
if (new Set(migrationNames).size !== migrationNames.length) errors.push("supabase/migrations: duplicate migration version");

if (errors.length) {
  console.error("Repository validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Repository validation passed: ${files.length} source/config files checked; ${migrationFiles.length} migrations ordered and unique.`);
