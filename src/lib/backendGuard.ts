import { backendConfigured } from "@/lib/supabase";

/**
 * Production-sensitive actions must not silently fall back to browser-only
 * state. This guard makes the cutover boundary explicit until repository
 * mutations are fully server-backed.
 */
export function requireServerBackend(action: string) {
  if (!backendConfigured) {
    throw new Error(`${action} requires the Bizriva CRM server backend to be configured.`);
  }
}
