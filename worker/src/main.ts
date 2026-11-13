// Bizriva WhatsApp worker — holds each business's linked WhatsApp number open around
// the clock (Railway / any always-on server; one copy only). Every 15 seconds it tells
// Supabase it's alive and picks up new links, unlinks and links that went away.
//
// Environment:
//   SUPABASE_URL               https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  Supabase → Settings → API → service_role (secret)
//   WA_SESSION_KEY             a long random secret; encrypts the WhatsApp sessions.
//                              Never change it, or every business must link again.
//   PORT                       optional; health check at GET /
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { keyFrom } from "./auth.ts";
import { Link, type LinkRow } from "./link.ts";

const VERSION = "bizriva-wa-worker/1.0";
const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) { console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const key = keyFrom(process.env.WA_SESSION_KEY ?? "");
const db = createClient(url, service, { auth: { persistSession: false } });
const links = new Map<string, Link>();
let lastBeat = 0;

async function beat(): Promise<void> {
  const { data, error } = await db.rpc("svc_wa_worker_beat", { p_version: VERSION, p_links: [...links.values()].filter((l) => l.sock).length });
  if (error) { console.error(`heartbeat failed: ${error.message}`); return; }
  lastBeat = Date.now();
  const rows = (data ?? []) as LinkRow[];
  const seen = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    const cur = links.get(r.id);
    if (r.status === "unlinking") {
      if (cur) { await cur.stop(true); links.delete(r.id); }
      await db.rpc("svc_wa_link_gone", { p_link: r.id });
      console.log(`unlinked ${r.id}`);
      continue;
    }
    // "pending" = the owner pressed Link (again): start fresh.
    if (cur && (r.status === "pending" || cur.stopped)) { await cur.stop(false); links.delete(r.id); }
    // Older messages asked for: start once the link is up.
    if (cur && !cur.stopped && r.status === "connected" && r.backfill_status === "queued") void cur.backfill();
    if (cur) cur.row = { ...cur.row, ...r };
    if (!links.has(r.id)) {
      const l = new Link(db, key, r);
      links.set(r.id, l);
      l.start().catch(async (e) => { console.error(`start ${r.id}: ${e}`); await db.rpc("svc_wa_link_patch", { p_link: r.id, p_patch: { status: "failed", last_error: `Bizriva couldn't start the link: ${e instanceof Error ? e.message : e}` } }); links.delete(r.id); });
    }
  }
  // Removed while this worker was off: log out so it disappears from the owner's phone too.
  for (const [id, l] of links) if (!seen.has(id)) { await l.stop(true); links.delete(id); }
}

async function loop() {
  try { await beat(); } catch (e) { console.error(`beat: ${e}`); }
  setTimeout(() => void loop(), 15_000);
}

createServer((_req, res) => {
  const ok = Date.now() - lastBeat < 60_000;
  res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok, version: VERSION, links: links.size, connected: [...links.values()].filter((l) => l.sock).length }));
}).listen(Number(process.env.PORT ?? 8080));

const shutdown = async () => { for (const l of links.values()) await l.stop(false); process.exit(0); };
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
console.log(`${VERSION} starting`);
void loop();
