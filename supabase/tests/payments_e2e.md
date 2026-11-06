# Payment links end-to-end test (run 2026-11-06 against the live project)

Server checks (rolled-back transaction) — 13/13:
no provider → clear message ✓ · owner gets balance and key ✓ · support role and outsiders refused ✓ ·
link posted into the chat with amount ✓ · request recorded "sent" ✓ · Paystack payment with the order ref matched ✓ ·
order fully paid ✓ · request marked paid ✓ · paid order refuses another link ✓ · same notification twice applied once ✓ ·
team sees connection status, never the key ✓

Live functions (throwaway "Pay Test Shop", fake Paystack key; deleted afterwards — 0 keys, 0 events left):

| Request | Expected | Result |
| --- | --- | --- |
| Signed Paystack charge.success for BZ-1001 (HMAC-SHA512 with the key) | matched; order paid; request paid | `matched`; ₦8,500 of ₦8,500 paid, order auto-confirmed; request `paid` |
| Same, signed with a guessed key | refused, nothing recorded | 401 Bad signature; 1 payment event in total |
| payment-link with no sign-in | refused | 401 Missing authorization header |
