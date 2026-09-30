import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Shield, Building2, Users, Activity, CreditCard } from "lucide-react";
import { useAuth } from "@/state/AuthContext";
import { useAppData } from "@/state/AppData";
import { supabase } from "@/lib/supabase";
import { KpiCard, PageHeader, Pill, SectionCard } from "@/components/Common";

export function PlatformAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const { db } = useAppData();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    async function check() {
      if (!user || !supabase) {
        if (active) setAuthorized(false);
        return;
      }
      const { data, error } = await supabase.rpc("is_platform_admin");
      if (active) setAuthorized(!error && data === true);
    }
    void check();
    return () => { active = false; };
  }, [user]);

  if (authLoading || authorized === null) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Checking platform authorization…</div>;
  if (!authorized) return <Navigate to="/dashboard" replace />;

  return <div className="min-h-screen bg-background">
    <PageHeader eyebrow="Bizriva Platform" title="Platform Administration" description="Private operator console. Authorization is enforced by the server database function." actions={<Shield className="h-6 w-6 text-primary"/>}/>
    <div className="space-y-5 p-4 md:p-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Workspaces" value={String(db.workspaces.length)}/>
        <KpiCard label="Users" value={String(db.team.length)}/>
        <KpiCard label="Active contacts" value={String(db.contacts.length)}/>
        <KpiCard label="Integration alerts" value={String(db.adCampaigns.filter(c=>c.status==="review_needed").length)} tone="warning"/>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Tenant workspaces" subtitle="Platform-level workspace registry">
          <div className="space-y-2">{db.workspaces.map(w=><div key={w.id} className="flex items-center gap-3 rounded-lg border p-3"><Building2 className="h-4 w-4 text-primary"/><div className="min-w-0 flex-1"><div className="font-semibold">{w.name}</div><div className="text-xs text-muted-foreground">{w.industry} · {w.country} · {w.currency}</div></div><Pill tone="success">{w.plan}</Pill></div>)}</div>
        </SectionCard>
        <SectionCard title="Platform controls" subtitle="Sensitive controls remain server-authoritative">
          <div className="space-y-2">
            <AdminRow icon={<Users className="h-4 w-4"/>} title="Users & access" text="Review platform membership and privileged access."/>
            <AdminRow icon={<CreditCard className="h-4 w-4"/>} title="Plans & usage" text="Subscriptions, quotas and entitlements."/>
            <AdminRow icon={<Activity className="h-4 w-4"/>} title="System health" text="Connector health, failed jobs and audit events."/>
          </div>
        </SectionCard>
      </div>
    </div>
  </div>;
}

function AdminRow({icon,title,text}:{icon:React.ReactNode;title:string;text:string}) {
  return <div className="flex gap-3 rounded-lg border p-3"><div className="mt-0.5 text-primary">{icon}</div><div><div className="font-medium">{title}</div><div className="text-xs text-muted-foreground">{text}</div></div></div>;
}
