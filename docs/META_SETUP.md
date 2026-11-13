# Switching on "Connect WhatsApp" for every business (one time, for Bizriva)

> Don't want to wait for Meta? Businesses can link the WhatsApp they already use with a pairing code
> today (WhatsApp Growth page). That needs Bizriva's WhatsApp server running — see `worker/README.md`.

Bizriva becomes a **Meta Tech Provider** once. After that, any business connects
WhatsApp from Bizriva in about 5 minutes: they log in with Facebook in Meta's window,
then pick a new number or scan a QR code to keep using the WhatsApp Business app
on their phone (Coexistence, with up to 6 months of chats brought in).
Businesses never do the steps below.

## 1. A Meta app for Bizriva
1. Go to developers.facebook.com → **My Apps → Create app**.
2. Choose the **WhatsApp** use case ("Connect with customers through WhatsApp").
3. Link the app to Bizriva's business portfolio (or create one).

## 2. Verify the business behind Bizriva
App Dashboard → **Use cases → WhatsApp → Customize → Tech Provider onboarding → Start verification**.
You'll need the registered business name, address, phone, email, website, and
documents if Meta can't find the business (CAC certificate, utility bill). This is the step that takes days.

## 3. App settings
App settings → Basic: app icon, **privacy policy URL**, terms URL, category, and app domain
`bizriva-crm.vercel.app` (and your own domain if you add one).

## 4. Sign-up window (Embedded Signup)
1. Add the product **Facebook Login for Business**.
2. Settings: turn on **Login with the JavaScript SDK**; under **Allowed domains for the JavaScript SDK** add
   `https://bizriva-crm.vercel.app` (and your own domain).
3. **Configurations → Create**: choose **WhatsApp Embedded Signup**, permissions
   `whatsapp_business_management` and `whatsapp_business_messaging`. Copy the **Configuration ID**.

## 5. Webhook
WhatsApp → Configuration → Webhook. Copy the **Callback URL** and **Verify token** from
Bizriva's **Super Admin** page (section "WhatsApp for every business"), then subscribe to:
`messages`, `history`, `smb_app_state_sync`, `smb_message_echoes`, `account_update`.

## 6. Save it in Bizriva
Super Admin → "WhatsApp for every business": paste the **App ID**, **Configuration ID** and
**App secret** (App settings → Basic). The secret is stored encrypted and never shown again.
The Connect buttons then appear for every owner under Integrations → WhatsApp.

## 7. App Review
Tech Provider onboarding → **Begin App Review** for `whatsapp_business_messaging` and
`whatsapp_business_management`. Meta asks for two screen recordings:
1. a message sent from Bizriva arriving in WhatsApp;
2. a message template being created (Bizriva → Templates → Submit to Meta).

Record them with your own Dxmart number connected. While the review is open, the sign-up
should work for people with a role on the app (you as admin), so you can connect Dxmart first.
When the review is approved, switch the app to **Live** — then any business can connect.

## Before inviting other businesses
- Vercel's login protection on bizriva-crm.vercel.app must be off, or nobody outside the Vercel team can open the app.
- Businesses that keep their phone app need WhatsApp Business **2.24.17 or newer**, must keep the app open while their chats come in, and should open it at least every 14 days or Meta disconnects the link.
- Messages a business sends from the phone show in Bizriva; the assistant steps back from that chat.
- What doesn't come across from the phone: group chats, broadcast lists (they become read-only), disappearing/view-once messages, calls, and photos from history older than 14 days.
