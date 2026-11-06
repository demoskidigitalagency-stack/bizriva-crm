// bun test tests/email_mail.test.ts — email formatting and provider requests.
import { describe, expect, test } from "bun:test";
import { providerId, render, request, UNSUB_BASE, type Job } from "../supabase/functions/email-send/mail";

const base: Job = { id: "1", provider: "brevo", from_email: "hello@glow.ng", from_name: "Glow Naturals", api_key: "xkeysib-" + "a".repeat(40),
  to_email: "ada@mail.ng", subject: "Your order BZ-1001 is confirmed", body: "Hi Ada,\n\nThanks <3 & see https://glow.ng/track.\nLine two", kind: "order", tracking_id: null };
const bc: Job = { ...base, kind: "broadcast", tracking_id: "11111111-2222-3333-4444-555555555555", subject: "New arrivals" };

describe("render", () => {
  test("escapes, keeps paragraphs and line breaks, links URLs", () => {
    const r = render(base);
    expect(r.html).toContain("Thanks &lt;3 &amp; see");
    expect(r.html).toContain('<a href="https://glow.ng/track"');
    expect(r.html).toContain("<br>Line two");
    expect(r.unsubscribe).toBeUndefined();
  });
  test("broadcasts carry a working unsubscribe link in text and HTML", () => {
    const r = render(bc);
    expect(r.unsubscribe).toBe(UNSUB_BASE + bc.tracking_id);
    expect(r.text).toContain("Unsubscribe: " + UNSUB_BASE);
    expect(r.html).toContain(`href="${UNSUB_BASE}${bc.tracking_id}"`);
  });
});

describe("provider requests", () => {
  test("Brevo", () => {
    const r = request(bc); if ("error" in r) throw new Error(r.error);
    expect(r.url).toBe("https://api.brevo.com/v3/smtp/email");
    const b = JSON.parse(String(r.init.body));
    expect(b.sender).toEqual({ email: "hello@glow.ng", name: "Glow Naturals" });
    expect(b.to).toEqual([{ email: "ada@mail.ng" }]);
    expect(b.headers["List-Unsubscribe"]).toContain(UNSUB_BASE);
  });
  test("Resend", () => {
    const r = request({ ...base, provider: "resend" }); if ("error" in r) throw new Error(r.error);
    expect(r.url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(r.init.body)).from).toBe("Glow Naturals <hello@glow.ng>");
  });
  test("Mailgun uses the sending domain and a form body", () => {
    const r = request({ ...bc, provider: "mailgun" }); if ("error" in r) throw new Error(r.error);
    expect(r.url).toBe("https://api.mailgun.net/v3/glow.ng/messages");
    const f = new URLSearchParams(String(r.init.body));
    expect(f.get("to")).toBe("ada@mail.ng"); expect(f.get("h:List-Unsubscribe")).toContain(UNSUB_BASE);
  });
  test("no key or unknown service is a clear permanent error", () => {
    expect(request({ ...base, api_key: null })).toEqual({ error: expect.stringMatching(/^400 /) });
    expect(request({ ...base, provider: "smtp" })).toEqual({ error: expect.stringMatching(/^400 /) });
  });
  test("message ids", () => { expect(providerId("brevo", { messageId: "<x@y>" })).toBe("<x@y>"); expect(providerId("resend", { id: "r1" })).toBe("r1"); });
});
