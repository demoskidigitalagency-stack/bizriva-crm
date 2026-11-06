// Unsubscribe link in every broadcast email — GET or POST /functions/v1/email-unsub?t=<tracking id>
// Records the opt-out (no more broadcasts to this customer) and shows a short confirmation page.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const page = (status: number, title: string, text: string) => new Response(
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="font:16px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f9fafb;margin:0;padding:48px 16px"><div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px"><h1 style="font-size:20px;margin:0 0 8px">${esc(title)}</h1><p style="margin:0;color:#4b5563">${esc(text)}</p></div></body></html>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return page(400, "Link not recognised", "This unsubscribe link isn't complete. Please use the link from the email.");
  const { data, error } = await db.rpc("svc_email_unsubscribe", { p_tracking: t });
  if (error) return page(500, "Something went wrong", "Please try the link again in a minute.");
  if (!data) return page(404, "Link not recognised", "We couldn't find this email. You may already be unsubscribed.");
  return page(200, "You're unsubscribed", `You won't get marketing emails from ${data} any more. Order updates still reach you.`);
});
