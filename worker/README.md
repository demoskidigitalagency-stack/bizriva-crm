# Bizriva WhatsApp server (Linked Device)

Holds each business's linked WhatsApp number open around the clock, the way WhatsApp
Web does. It brings in old chats, saves every number as a lead, receives new messages
and sends Bizriva's replies from the business's own number. Supabase stores everything;
this server only holds the line.

Run **one copy only**. Two copies would fight over the same numbers.

## Railway (recommended)

1. railway.com → sign in with GitHub → **New project → Deploy from GitHub repo** → `bizriva-crm`.
2. Service **Settings → Source → Root directory**: `worker`. Railway reads `worker/railway.json`
   and builds the `Dockerfile`.
3. **Variables** (you type these; never paste them in a chat):
   - `SUPABASE_URL` = `https://xjhzkciowmklxrtwsikm.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = Supabase → Project settings → API keys → `service_role` secret
   - `WA_SESSION_KEY` = `${{ secret(64) }}` (Railway makes a random one). **Never change it later**,
     or every business has to link again.
4. Deploy. In Bizriva, WhatsApp Growth stops saying "server isn't switched on" within 30 seconds.

Cost: about $5/month on Railway's Hobby plan for a few businesses.

## Local run

```bash
cd worker && npm ci
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… WA_SESSION_KEY=… npm start
```

`npm run typecheck` checks the code. Unit tests live in `../tests/wa_linked.test.ts` (`bun test`).

## How it works

- Every 15 s: heartbeat (`svc_wa_worker_beat`) → the list of links to hold.
- New link → WhatsApp gives a pairing code (or QR) → saved for the owner's screen.
- Linked → old chats arrive in chunks → `svc_wa_history` (imported history); when WhatsApp
  says it's done (or nothing arrives for 3 minutes) the chats are tagged by product.
- New messages → `svc_whatsapp_inbound`; replies typed on the phone → `svc_whatsapp_echo`.
- Every 3 s: queued replies → `svc_wa_claim` → sent, paced → `svc_whatsapp_result`.
- Unlink in Bizriva → logs out of WhatsApp and deletes the session.
- `GET /` is the health check.
