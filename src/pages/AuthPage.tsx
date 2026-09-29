import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/state/AuthContext";

export function AuthPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const [mode,setMode]=useState<"login"|"signup">("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if(mode==="login") await signIn(email,password);
      else await signUp(email,password);
    } catch(err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="flex min-h-screen items-center justify-center bg-background p-4">
    <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">B</div>
        <div><h1 className="text-xl font-bold">Bizriva CRM</h1><p className="text-sm text-muted-foreground">Commerce CRM</p></div>
      </div>
      <div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1">
        <button onClick={()=>setMode("login")} className={"rounded-md px-3 py-2 text-sm "+(mode==="login"?"bg-card font-semibold shadow-sm":"")}>Sign in</button>
        <button onClick={()=>setMode("signup")} className={"rounded-md px-3 py-2 text-sm "+(mode==="signup"?"bg-card font-semibold shadow-sm":"")}>Create account</button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block"><span className="mb-1 block text-xs font-medium">Email</span><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2.5"/></label>
        <label className="block"><span className="mb-1 block text-xs font-medium">Password</span><input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2.5"/></label>
        {error&&<div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <button disabled={busy} className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60">{busy?"Please wait…":mode==="login"?"Sign in":"Create account"}</button>
      </form>
      <div className="mt-5 flex items-start gap-2 rounded-lg border p-3 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary"/><span>Tenant data remains isolated by workspace membership and backend row-level security.</span></div>
    </div>
  </div>;
}
