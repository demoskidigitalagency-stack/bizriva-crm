# WhatsApp end-to-end test (run 2026-11-06 against the live project)

Uses a throwaway business "WA Test Shop" with a fake number (phone_number_id 999000111222),
fake app secret and fake token, then deletes it (and its vault keys).

1. Setup (committed): business, whatsapp_numbers row with vault secrets and verify token
   `bizriva-test-verify-token`, one customer who wrote 1 hour ago and one 3 days ago, each
   with a queued outgoing message.
2. Requests through pg_net to the deployed functions (bodies signed with
   `extensions.hmac(body::text, app_secret, 'sha256')`):

| Request | Expected | Result |
| --- | --- | --- |
| GET verify, right token | 200, echoes challenge | 200 `12345abc` |
| GET verify, wrong token | 403 | 403 |
| Signed customer message (new number) | saved, contact + identity created | saved 1 |
| Same Meta message id again | duplicate, nothing saved | duplicates 1 |
| Signed "stop" | saved, marketing opt-out recorded | consent granted=false |
| Message signed with the wrong secret | 401, nothing saved | 401, 0 rows |
| whatsapp-send without the cron secret | 401 | 401 |
| Every-minute job (real) | in-window message reaches Meta; fake token refused and retried; out-of-window message failed with reason | Meta answered `190 Malformed access token`, message stays queued (try 1 of 3); other message failed "Outside the 24-hour window — needs an approved template" |

3. Cleanup: vault secrets and the business deleted; 0 left.
