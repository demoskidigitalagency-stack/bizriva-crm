/**
 * Real accounts (backend phase 1): sign-up, sign-in, the business a user
 * belongs to, and team invitations. Screens still read Practice Mode data
 * until the data layer is switched over (phase 1, "saved for real").
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, backendConfigured } from "@/lib/supabase";

export type Role = "owner" | "manager" | "sales" | "support" | "dispatcher" | "finance";
export interface Membership { workspaceId: string; name: string; currency: string; role: Role }
export interface Invite { id: string; email: string; role: Role; token: string; acceptedAt: string | null; expiresAt: string }

interface AuthValue {
  configured: boolean;
  ready: boolean;
  session: Session | null;
  email: string | null;
  memberships: Membership[];
  current: Membership | null;
  selectWorkspace: (id: string) => void;
  signUp: (email: string, password: string) => Promise<{ error?: string; needsConfirm?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  createWorkspace: (name: string, currency: string) => Promise<{ error?: string }>;
  acceptInvite: (token: string) => Promise<{ error?: string }>;
  listInvites: () => Promise<Invite[]>;
  createInvite: (email: string, role: Role) => Promise<{ error?: string; token?: string }>;
  revokeInvite: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const WS_KEY = "bizriva.workspace";
const msg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Something went wrong");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!backendConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const loadMemberships = useCallback(async (s: Session | null) => {
    const sb = supabase();
    if (!sb || !s) { setMemberships([]); return; }
    const { data } = await sb.from("workspace_members").select("role, workspace_id, workspaces(name, currency)").eq("user_id", s.user.id);
    const list = (data ?? []).map((r) => {
      const w = (Array.isArray(r.workspaces) ? r.workspaces[0] : r.workspaces) as { name: string; currency: string } | null;
      return { workspaceId: r.workspace_id as string, name: w?.name ?? "Business", currency: w?.currency ?? "NGN", role: r.role as Role };
    });
    setMemberships(list);
  }, []);

  useEffect(() => {
    const sb = supabase();
    if (!sb) { setReady(true); return; }
    try { setSelected(localStorage.getItem(WS_KEY)); } catch { /* storage blocked */ }
    sb.auth.getSession().then(async ({ data }) => { setSession(data.session); await loadMemberships(data.session); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => { setSession(s); void loadMemberships(s); });
    return () => sub.subscription.unsubscribe();
  }, [loadMemberships]);

  const current = memberships.find((m) => m.workspaceId === selected) ?? memberships[0] ?? null;

  const value = useMemo<AuthValue>(() => ({
    configured: backendConfigured,
    ready,
    session,
    email: session?.user.email ?? null,
    memberships,
    current,
    selectWorkspace: (id) => { setSelected(id); try { localStorage.setItem(WS_KEY, id); } catch { /* blocked */ } },
    signUp: async (email, password) => {
      const sb = supabase(); if (!sb) return { error: "The backend isn't connected." };
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/account` } });
      if (error) return { error: error.message };
      return { needsConfirm: !data.session };
    },
    signIn: async (email, password) => {
      const sb = supabase(); if (!sb) return { error: "The backend isn't connected." };
      const { error } = await sb.auth.signInWithPassword({ email, password });
      return error ? { error: error.message === "Invalid login credentials" ? "Wrong email or password." : error.message } : {};
    },
    resetPassword: async (email) => {
      const sb = supabase(); if (!sb) return { error: "The backend isn't connected." };
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/account` });
      return error ? { error: error.message } : {};
    },
    signOut: async () => { await supabase()?.auth.signOut(); setMemberships([]); },
    createWorkspace: async (name, currency) => {
      const sb = supabase(); if (!sb) return { error: "The backend isn't connected." };
      const { data, error } = await sb.rpc("create_workspace", { p_name: name, p_currency: currency });
      if (error) return { error: msg(error) };
      await loadMemberships(session);
      setSelected(data as string);
      return {};
    },
    acceptInvite: async (token) => {
      const sb = supabase(); if (!sb) return { error: "The backend isn't connected." };
      const { data, error } = await sb.rpc("accept_invite", { p_token: token });
      if (error) return { error: msg(error) };
      await loadMemberships(session);
      setSelected(data as string);
      return {};
    },
    listInvites: async () => {
      const sb = supabase(); if (!sb || !current) return [];
      const { data } = await sb.from("workspace_invites").select("id, email, role, token, accepted_at, expires_at").eq("workspace_id", current.workspaceId).order("created_at", { ascending: false });
      return (data ?? []).map((r) => ({ id: r.id, email: r.email, role: r.role as Role, token: r.token, acceptedAt: r.accepted_at, expiresAt: r.expires_at }));
    },
    createInvite: async (email, role) => {
      const sb = supabase(); if (!sb || !current) return { error: "Sign in and pick a business first." };
      const { data, error } = await sb.from("workspace_invites")
        .upsert({ workspace_id: current.workspaceId, email: email.trim().toLowerCase(), role, invited_by: session?.user.id, accepted_at: null, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString() }, { onConflict: "workspace_id,email" })
        .select("token").single();
      if (error) return { error: error.code === "42501" ? "Only owners and managers can invite people." : msg(error) };
      return { token: data.token as string };
    },
    revokeInvite: async (id) => { await supabase()?.from("workspace_invites").delete().eq("id", id); },
    refresh: () => loadMemberships(session),
  }), [ready, session, memberships, current, loadMemberships]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", sales: "Sales", support: "Support", dispatcher: "Dispatcher", finance: "Finance" };
