/**
 * Meta's WhatsApp sign-up window (Embedded Signup) through Bizriva's Meta app.
 * Opened directly as Meta's OAuth dialog (not the Facebook JS SDK) with Bizriva's own
 * return page (/meta/callback), so the one-time code is exchanged with the exact same
 * redirect_uri Meta issued it for.
 * keepPhoneApp = keep using the WhatsApp Business app on the same number (Coexistence).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type SignupResult = { ok: true; code: string; redirect_uri: string; waba_id?: string; phone_number_id?: string } | { ok: false; error: string; cancelled?: boolean };

export const callbackUrl = () => `${window.location.origin}/meta/callback`;

export function signupUrl(appId: string, configId: string, keepPhoneApp: boolean, state: string, redirectUri: string): string {
  const extras = { setup: {}, sessionInfoVersion: "3", ...(keepPhoneApp ? { featureType: "whatsapp_business_app_onboarding" } : {}) };
  const q = new URLSearchParams({
    client_id: appId, config_id: configId, redirect_uri: redirectUri, state, response_type: "code",
    override_default_response_type: "true", display: "popup", extras: JSON.stringify(extras),
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${q}`;
}

export function metaSignup(appId: string, configId: string, keepPhoneApp: boolean): Promise<SignupResult> {
  return new Promise((resolve) => {
    const state = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
    const redirectUri = callbackUrl();
    let waba: string | undefined, phone: string | undefined, settled = false;
    const w = 600, h = 760, left = Math.max(0, (window.screen.width - w) / 2), top = Math.max(0, (window.screen.height - h) / 2);
    const popup = window.open(signupUrl(appId, configId, keepPhoneApp, state, redirectUri), "bizriva_meta_signup", `width=${w},height=${h},left=${left},top=${top}`);
    if (!popup) return resolve({ ok: false, error: "Your browser blocked Meta's window. Allow pop-ups for this site and try again." });
    const finish = (r: SignupResult) => { if (settled) return; settled = true; window.removeEventListener("message", onMessage); clearInterval(poll); resolve(r); };
    const onMessage = (e: MessageEvent) => {
      let d: any = e.data;
      if (e.origin === window.location.origin && d?.type === "BIZRIVA_META_SIGNUP") {
        if (d.state !== state) return;
        if (!d.code) return finish({ ok: false, cancelled: !d.error, error: d.error || "The sign-up window was closed before it finished." });
        // Meta's account details message may land just before or after the return page.
        setTimeout(() => finish({ ok: true, code: String(d.code), redirect_uri: redirectUri, ...(waba ? { waba_id: waba } : {}), ...(phone ? { phone_number_id: phone } : {}) }), 800);
        return;
      }
      let host = ""; try { host = new URL(e.origin).hostname; } catch { return; }
      if (!/(^|\.)facebook\.com$/.test(host)) return;
      try { d = typeof d === "string" ? JSON.parse(d) : d; } catch { return; }
      if (d?.type === "WA_EMBEDDED_SIGNUP" && String(d.event ?? "").startsWith("FINISH")) {
        waba = d.data?.waba_id ? String(d.data.waba_id) : waba; phone = d.data?.phone_number_id ? String(d.data.phone_number_id) : phone;
      }
    };
    window.addEventListener("message", onMessage);
    // Closed without finishing → cancelled.
    const poll = setInterval(() => { if (popup.closed) setTimeout(() => finish({ ok: false, cancelled: true, error: "" }), 1500); }, 700);
  });
}
