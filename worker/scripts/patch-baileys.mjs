// WhatsApp has rejected the old Windows (WIN32) and macOS (DARWIN) linked-device identities since
// ~30 June 2026: the socket closes with 428 before any QR. Baileys fixed it after 7.0.0-rc14
// (upstream #2741): Windows Desktop now advertises WIN_HYBRID. Apply the same one-line change
// until a release includes it. Runs after `npm ci` (postinstall).
import { readFileSync, writeFileSync } from "node:fs";
const file = new URL("../node_modules/baileys/lib/Utils/validate-connection.js", import.meta.url);
const src = readFileSync(file, "utf8");
if (src.includes("WebSubPlatform.WIN_HYBRID")) { console.log("baileys: already advertises WIN_HYBRID"); process.exit(0); }
const out = src.replace("Windows: proto.ClientPayload.WebInfo.WebSubPlatform.WIN32", "Windows: proto.ClientPayload.WebInfo.WebSubPlatform.WIN_HYBRID");
if (out === src) { console.error("baileys: platform map not found — check the upstream fix (#2741)"); process.exit(1); }
writeFileSync(file, out);
console.log("baileys: patched Windows Desktop to WIN_HYBRID");
