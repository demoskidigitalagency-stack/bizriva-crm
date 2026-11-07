/**
 * Meta's WhatsApp sign-up window (Embedded Signup) through Bizriva's Meta app.
 * keepPhoneApp = the business keeps using the WhatsApp Business app on the same
 * number (Coexistence): Meta shows a QR code to scan and offers to share chat history.
 * Resolves with the one-time code and the WhatsApp Business Account id for whatsapp-onboard.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { FB?: any; fbAsyncInit?: () => void } }

export type SignupResult = { ok: true; code: string; waba_id: string; phone_number_id?: string } | { ok: false; error: string; cancelled?: boolean };

let loading: Promise<void> | null = null;
let loadedFor = "";

export function loadFacebook(appId: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Open this in a browser"));
  if (window.FB && loadedFor === appId) return Promise.resolve();
  if (loading && loadedFor === appId) return loading;
  loadedFor = appId;
  loading = new Promise<void>((resolve, reject) => {
    const init = () => { window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" }); resolve(); };
    if (window.FB) return init();
    window.fbAsyncInit = init;
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js"; s.async = true; s.defer = true; s.crossOrigin = "anonymous";
    s.onerror = () => { loading = null; reject(new Error("Couldn't open Facebook's sign-in. Check your internet, or turn off an ad blocker for this page.")); };
    document.body.appendChild(s);
  });
  return loading;
}

export function metaSignup(configId: string, keepPhoneApp: boolean): Promise<SignupResult> {
  return new Promise((resolve) => {
    let code: string | null = null, waba: string | undefined, phone: string | undefined, error: string | undefined;
    let settled = false;
    const finish = (r: SignupResult) => { if (settled) return; settled = true; window.removeEventListener("message", onMessage); resolve(r); };
    const tryDone = () => { if (code && waba) finish({ ok: true, code, waba_id: waba, ...(phone ? { phone_number_id: phone } : {}) }); };
    const onMessage = (e: MessageEvent) => {
      let host = ""; try { host = new URL(e.origin).hostname; } catch { return; }
      if (!/(^|\.)facebook\.com$/.test(host)) return;
      let d: any; try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
      if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (String(d.event ?? "").startsWith("FINISH")) { waba = d.data?.waba_id ? String(d.data.waba_id) : undefined; phone = d.data?.phone_number_id ? String(d.data.phone_number_id) : undefined; tryDone(); }
      else if (d.event === "CANCEL") error = d.data?.error_message ?? undefined;
      else if (d.event === "ERROR") error = d.data?.error_message ?? "Meta's sign-up stopped with an error";
    };
    window.addEventListener("message", onMessage);
    window.FB.login((resp: any) => {
      code = resp?.authResponse?.code ?? null;
      if (!code) return finish({ ok: false, cancelled: !error, error: error ?? "The sign-up window was closed before it finished." });
      tryDone();
      // The account details come in a separate message; give it a moment.
      setTimeout(() => finish({ ok: false, error: "Meta didn't say which WhatsApp account you picked. Try again." }), 5000);
    }, {
      config_id: configId, response_type: "code", override_default_response_type: true,
      extras: { setup: {}, sessionInfoVersion: "3", ...(keepPhoneApp ? { featureType: "whatsapp_business_app_onboarding" } : {}) },
    });
  });
}
