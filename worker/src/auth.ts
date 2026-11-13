// The linked device's session keys, kept in Supabase encrypted with WA_SESSION_KEY
// (AES-256-GCM). Everything is loaded into memory when the link starts; changes are
// written back in small batches, in order.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { BufferJSON, initAuthCreds, proto, type AuthenticationState, type SignalDataTypeMap } from "baileys";
import type { SupabaseClient } from "@supabase/supabase-js";

export function keyFrom(secret: string): Buffer {
  if (!secret || secret.length < 32) throw new Error("WA_SESSION_KEY must be at least 32 characters");
  return createHash("sha256").update(secret).digest();
}

export function seal(key: Buffer, text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

export function open(key: Buffer, sealed: string): string {
  const raw = Buffer.from(sealed, "base64");
  const d = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

export async function dbAuthState(db: SupabaseClient, linkId: string, key: Buffer): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void>; flush: () => Promise<void> }> {
  const { data, error } = await db.rpc("svc_wa_auth_all", { p_link: linkId });
  if (error) throw new Error(`Couldn't load the WhatsApp session: ${error.message}`);
  const mem = new Map<string, unknown>();
  for (const row of (data ?? []) as { k: string; v: string }[]) {
    try { mem.set(row.k, JSON.parse(open(key, row.v), BufferJSON.reviver)); } catch { /* wrong key or damaged row: start that key fresh */ }
  }
  const creds = (mem.get("creds") as AuthenticationState["creds"] | undefined) ?? initAuthCreds();

  let pending: Record<string, string | null> = {};
  let chain = Promise.resolve();
  const write = (items: Record<string, unknown | null>) => {
    for (const [k, v] of Object.entries(items)) pending[k] = v == null ? null : seal(key, JSON.stringify(v, BufferJSON.replacer));
    chain = chain.then(async () => {
      if (!Object.keys(pending).length) return;
      const batch = pending; pending = {};
      const { error: e } = await db.rpc("svc_wa_auth_put", { p_link: linkId, p_items: batch });
      if (e) { pending = { ...batch, ...pending }; console.error(`[${linkId}] session save failed: ${e.message}`); }
    });
    return chain;
  };

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const out: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          let v = mem.get(`${type}-${id}`) as unknown;
          if (v && type === "app-state-sync-key") v = proto.Message.AppStateSyncKeyData.fromObject(v as object);
          if (v !== undefined && v !== null) out[id] = v as SignalDataTypeMap[T];
        }
        return out;
      },
      set: async (data) => {
        const items: Record<string, unknown | null> = {};
        for (const type in data) {
          const group = (data as Record<string, Record<string, unknown>>)[type] ?? {};
          for (const id in group) {
            const k = `${type}-${id}`; const v = group[id];
            if (v) mem.set(k, v); else mem.delete(k);
            items[k] = v ?? null;
          }
        }
        await write(items);
      },
    },
  };
  return { state, saveCreds: () => write({ creds: state.creds }), flush: () => chain };
}
