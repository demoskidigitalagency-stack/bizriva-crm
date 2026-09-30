import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type LocalUser = { id: string; email: string };
type AuthUser = User | LocalUser;

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  mode: "supabase" | "local";
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const LOCAL_KEY = "bizriva.crm.localUser";
const localDevelopmentMode = import.meta.env.DEV && !supabase;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      if (localDevelopmentMode) {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (raw) {
          try { setUser(JSON.parse(raw) as LocalUser); } catch { localStorage.removeItem(LOCAL_KEY); }
        }
      }
      setLoading(false);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setUser(data.session?.user ?? null);
        setLoading(false);
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    mode: supabase ? "supabase" : "local",
    async signIn(email, password) {
      if (!email.trim() || password.length < 6) throw new Error("Enter a valid email and a password of at least 6 characters.");
      if (supabase) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return;
      }
      if (!localDevelopmentMode) throw new Error("Bizriva CRM authentication is not configured for this deployment.");
      const local = { id: "local-owner", email: email.trim().toLowerCase() };
      localStorage.setItem(LOCAL_KEY, JSON.stringify(local));
      setUser(local);
    },
    async signUp(email, password) {
      if (!email.trim() || password.length < 6) throw new Error("Enter a valid email and a password of at least 6 characters.");
      if (supabase) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        return;
      }
      if (!localDevelopmentMode) throw new Error("Bizriva CRM authentication is not configured for this deployment.");
      const local = { id: "local-owner", email: email.trim().toLowerCase() };
      localStorage.setItem(LOCAL_KEY, JSON.stringify(local));
      setUser(local);
    },
    async signOut() {
      if (supabase) await supabase.auth.signOut();
      localStorage.removeItem(LOCAL_KEY);
      setUser(null);
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
