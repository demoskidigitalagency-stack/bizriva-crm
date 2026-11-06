# Email end-to-end test (run 2026-11-06 against the live project)

Throwaway business "Email Test Shop" with Brevo and a fake key; deleted afterwards with its key.

| Step | Expected | Result |
| --- | --- | --- |
| Order confirmed, Notifications → order_confirmed = email, customer has an email | order email queued with lines and total | "Your order BZ-1001 is confirmed" with "• Glow Body Cream / Total: ₦12,000" |
| Email campaign scheduled now | only customers with an email whose latest marketing consent is yes; {{name}} filled | 1 recipient (Ada): "New for you, Ada"; Bola (said no) and Chi (no email) skipped |
| Every-minute sender | reaches Brevo; a refused key is permanent (not retried) | `401 Key not found`, failed after 1 try; campaign closed |
| Unsubscribe link | 200 page, opt-out recorded | "You're unsubscribed"; latest marketing consent = no (source "unsubscribe link") |
| Broken / unknown link | polite page | 400 / 404 "Link not recognised" |
| Sender called without the job secret | refused | 401 |
