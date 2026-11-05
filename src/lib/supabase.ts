/**
 * Supabase client for the browser. The publishable key is safe to ship:
 * every table is protected by row-level security (supabase/migrations).
 * Without the two env vars the app stays in Practice Mode only.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

let client: SupabaseClient | null = null;

/** Null on the server and when the backend isn't configured. */
export function supabase(): SupabaseClient | null {
  if (typeof window === "undefined" || !url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

export const backendConfigured = Boolean(url && key);
