// Which number from the WhatsApp Business Account to connect (unit-tested in tests/whatsapp_coexist.test.ts).
export interface WaNumber { id: string; display_phone_number?: string; verified_name?: string; platform_type?: string; is_on_biz_app?: boolean }

/** The number Meta's window reported, else the one on the phone app, else the only/first one. */
export function pickNumber(list: WaNumber[], wanted: string | null): WaNumber | null {
  const ok = list.filter((n) => /^\d{6,25}$/.test(String(n?.id ?? "")));
  if (wanted) { const hit = ok.find((n) => n.id === wanted); if (hit) return hit; }
  return ok.find((n) => n.is_on_biz_app) ?? ok[0] ?? null;
}
