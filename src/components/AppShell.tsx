import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, CalendarCheck, MessageSquareText, UsersRound, ShoppingBag,
  Package, Boxes, Store, Truck, Megaphone, BadgeDollarSign, Workflow,
  WalletCards, BarChart3, UserCog, Plug, Settings, CircleHelp, Search,
  Bell, Sparkles, Plus, PanelLeftClose, PanelLeftOpen, Command, X
} from "lucide-react";
import { useAppData } from "@/state/AppData";
import { globalSearch } from "@/domain/repositories";

type NavItem = { label: string; to: string; icon: React.ComponentType<{ className?: string }> };
type NavGroup = { label: string; items: NavItem[] };

const nav: NavGroup[] = [
  { label: "OVERVIEW", items: [
    { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
    { label: "Today", to: "/today", icon: CalendarCheck },
  ]},
  { label: "CUSTOMERS", items: [
    { label: "Inbox", to: "/inbox", icon: MessageSquareText },
    { label: "CRM", to: "/crm", icon: UsersRound },
  ]},
  { label: "SALES", items: [{ label: "Orders", to: "/orders", icon: ShoppingBag }]},
  { label: "COMMERCE", items: [
    { label: "Products", to: "/products", icon: Package },
    { label: "Inventory", to: "/inventory", icon: Boxes },
    { label: "Store", to: "/store", icon: Store },
  ]},
  { label: "OPERATIONS", items: [{ label: "Delivery", to: "/delivery", icon: Truck }]},
  { label: "GROWTH", items: [
    { label: "Marketing", to: "/marketing", icon: Megaphone },
    { label: "Ads", to: "/ads", icon: BadgeDollarSign },
    { label: "Automation", to: "/automation", icon: Workflow },
  ]},
  { label: "MONEY", items: [{ label: "Finance", to: "/finance", icon: WalletCards }]},
  { label: "INSIGHTS", items: [{ label: "Analytics", to: "/analytics", icon: BarChart3 }]},
  { label: "WORKSPACE", items: [{ label: "Team", to: "/team", icon: UserCog }]},
];

const bottom: NavItem[] = [
  { label: "Integrations", to: "/integrations", icon: Plug },
  { label: "Settings", to: "/settings", icon: Settings },
  { label: "Help", to: "/help", icon: CircleHelp },
];

export function AppShell() {
  const { db } = useAppData();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [workspace, setWorkspace] = useState(db.workspaces[0]?.id ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(v => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => query.trim() ? globalSearch(db, query).slice(0, 8) : [], [db, query]);

  const Sidebar = () => (
    <aside className={`flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all ${collapsed ? "w-[72px]" : "w-[236px]"}`}>
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">B</div>
        {!collapsed && <div><div className="font-semibold text-white">Bizriva CRM</div><div className="text-[11px] text-sidebar-foreground/60">Commerce CRM</div></div>}
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-2 py-3">
        {nav.map(group => (
          <div key={group.label} className="mb-4">
            {!collapsed && <div className="px-2 pb-1 text-[10px] font-semibold tracking-[.14em] text-sidebar-foreground/45">{group.label}</div>}
            <div className="space-y-0.5">
              {group.items.map(item => <SideLink key={item.to} item={item} collapsed={collapsed} onClick={() => setMobileOpen(false)} />)}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-sidebar-border p-2">
        {bottom.map(item => <SideLink key={item.to} item={item} collapsed={collapsed} onClick={() => setMobileOpen(false)} />)}
        <button onClick={() => setCollapsed(v => !v)} className="mt-2 hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent lg:flex">
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden lg:block"><Sidebar /></div>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/35 lg:hidden" onClick={() => setMobileOpen(false)}><div className="h-full w-[260px]" onClick={e => e.stopPropagation()}><Sidebar /></div></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-3 md:px-5">
          <button className="rounded-lg p-2 hover:bg-muted lg:hidden" onClick={() => setMobileOpen(true)}><PanelLeftOpen className="h-5 w-5" /></button>
          <select value={workspace} onChange={e => setWorkspace(e.target.value)} className="hidden max-w-48 rounded-lg border bg-background px-3 py-2 text-sm font-medium sm:block">
            {db.workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button onClick={() => setCommandOpen(true)} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border bg-background px-3 py-2 text-left text-sm text-muted-foreground md:max-w-xl">
            <Search className="h-4 w-4" /><span className="truncate">Search customers, orders, messages...</span><span className="ml-auto hidden rounded border px-1.5 py-0.5 text-[10px] sm:inline">⌘K</span>
          </button>
          <button className="hidden items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium sm:flex"><Plus className="h-4 w-4" /> Create</button>
          <button className="rounded-lg p-2 hover:bg-muted" title="Bizriva AI"><Sparkles className="h-5 w-5" /></button>
          <button className="relative rounded-lg p-2 hover:bg-muted"><Bell className="h-5 w-5" /><span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-warning" /></button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">AA</div>
        </header>
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto"><Outlet /></main>
      </div>

      {commandOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-4 pt-[10vh]" onClick={() => setCommandOpen(false)}>
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b px-4 py-3"><Command className="h-5 w-5 text-muted-foreground" /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Bizriva CRM..." className="min-w-0 flex-1 bg-transparent outline-none" /><button onClick={() => setCommandOpen(false)}><X className="h-5 w-5" /></button></div>
            <div className="max-h-96 overflow-y-auto p-2">
              {!query && <div className="px-3 py-6 text-center text-sm text-muted-foreground">Search contacts, orders and CRM records.</div>}
              {query && results.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No results found.</div>}
              {results.map((r) => (
                <button key={r.id} onClick={() => {
                  const target = r.params?.contactId ? "/contacts/" + r.params.contactId : r.to;
                  navigate(target);
                  setCommandOpen(false);
                  setQuery("");
                }} className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-muted">
                  <div><div className="font-medium">{r.label}</div><div className="text-xs text-muted-foreground">{r.sublabel}</div></div><span className="rounded-full bg-muted px-2 py-1 text-[10px] uppercase">{r.group}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SideLink({ item, collapsed, onClick }: { item: NavItem; collapsed: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <NavLink to={item.to} onClick={onClick} className={({isActive}) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
    <Icon className="h-4 w-4 shrink-0" />{!collapsed && <span>{item.label}</span>}
  </NavLink>;
}
