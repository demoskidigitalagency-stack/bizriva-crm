import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, ChevronsUpDown, Menu, Moon, Palette, Plus, Search, Sun } from "lucide-react";
import { ContactDialog, OrderDialog, PickCustomer, TaskDialog } from "./dialogs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { useActions, useDb, useWorkspace } from "@/domain/store";
import { globalSearch, getTodayQueues } from "@/domain/repositories";
import { currentUser } from "@/domain/seed";
import { PersonAvatar } from "./primitives";
import { GROUPS, MODULES } from "@/app/modules";
import { overallProgress } from "@/app/status";
import { THEMES, useAppearance } from "@/app/appearance";
import { ROLE_LABEL, useAuth } from "@/app/auth";

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const db = useDb();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const todayCount = getTodayQueues(db).reduce((s, q) => s + q.count, 0);
  const ws = useWorkspace();
  const { setWorkspace } = useActions();
  const overall = overallProgress();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 px-4">
        <span className="brand-gradient grid size-8 place-items-center rounded-lg text-sm font-extrabold text-primary-foreground">B</span>
        <div className="leading-tight">
          <p className="text-sm font-bold text-sidebar-accent-foreground">Bizriva</p>
          <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">Commerce CRM</p>
        </div>
      </div>
      <div className="px-3 pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-2.5 py-2 text-left text-xs hover:bg-sidebar-accent">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-sidebar-accent-foreground">{ws.name}</span>
                <span className="block truncate text-sidebar-foreground/60">{ws.plan} plan · {ws.currency}</span>
              </span>
              <ChevronsUpDown className="size-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
            {db.workspaces.map((w) => (
              <DropdownMenuItem key={w.id} onClick={() => setWorkspace(w.id)}>
                <span className="flex-1">{w.name}</span>
                {w.id === ws.id && <span className="text-xs text-primary">Active</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-2" aria-label="Main">
        {GROUPS.map((group) => (
          <div key={group} className="mb-3">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">{group}</p>
            {MODULES.filter((m) => m.group === group).map((item) => {
              const active = item.path === "/" ? path === "/" : path === item.path || path.startsWith(`${item.path}/`);
              const planned = item.state === "planned";
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  onClick={onNavigate}
                  title={planned ? `${item.label} — planned (${item.phase})` : item.label}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    planned && !active && "text-sidebar-foreground/60",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.id === "today" && todayCount > 0 && (
                    <span className={cn("num rounded px-1.5 text-[10px] font-bold", active ? "bg-sidebar/20" : "bg-sidebar-primary text-sidebar-primary-foreground")}>{todayCount}</span>
                  )}
                  {planned && <span className={cn("rounded px-1 text-[9px] font-semibold uppercase tracking-wide", active ? "bg-sidebar/20" : "bg-sidebar-accent text-sidebar-foreground/70")}>{item.phase === "Later" ? "Later" : "Soon"}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <Link to="/progress" onClick={onNavigate} className="block rounded-md px-2 py-1.5 text-xs hover:bg-sidebar-accent">
          <span className="flex items-center justify-between">
            <span className="font-semibold text-sidebar-accent-foreground">Frontend progress</span>
            <span className="num font-bold text-sidebar-primary">{Math.round(overall)}%</span>
          </span>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-sidebar-accent">
            <span className="block h-full rounded-full bg-sidebar-primary" style={{ width: `${overall}%` }} />
          </span>
        </Link>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const db = useDb();
  const navigate = useNavigate();
  const hits = globalSearch(db, term, 20);
  const groups = [...new Set(hits.map((h) => h.group))];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full min-w-0 max-w-md items-center gap-2 rounded-md border bg-surface px-3 text-sm text-muted-foreground hover:border-primary/40"
      >
        <Search className="size-4" />
        <span className="min-w-0 flex-1 truncate text-left">Search contacts, orders, products…</span>
        <kbd className="hidden rounded border bg-card px-1.5 text-[10px] font-semibold sm:inline">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Name, phone, order ref, product…" value={term} onValueChange={setTerm} />
        <CommandList>
          <CommandEmpty>{term ? "No matches in this workspace." : "Start typing to search."}</CommandEmpty>
          {groups.map((g) => (
            <CommandGroup key={g} heading={g}>
              {hits.filter((h) => h.group === g).map((h) => (
                <CommandItem
                  key={`${g}-${h.id}`}
                  value={`${h.label} ${h.sublabel} ${h.id}`}
                  onSelect={() => {
                    setOpen(false);
                    setTerm("");
                    navigate({ to: h.to, params: h.params, search: h.search } as never);
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{h.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{h.sublabel}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

function Notifications() {
  const db = useDb();
  const { markNotificationsRead } = useActions();
  const unread = db.notifications.filter((n) => !n.read).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          <button onClick={markNotificationsRead} className="text-xs font-medium text-primary hover:underline">Mark all read</button>
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {db.notifications.map((n) => (
            <li key={n.id} className={cn("border-b px-3 py-2.5 last:border-0", !n.read && "bg-accent/40")}>
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-xs text-muted-foreground">{n.body}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{relativeTime(n.at)}</p>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Kobolink's quick actions: start an order, contact or task from any page. */
function QuickCreate() {
  const [open, setOpen] = useState<"order" | "contact" | "task" | null>(null);
  const [orderFor, setOrderFor] = useState<string | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1"><Plus className="size-4" /><span className="hidden sm:inline">New</span></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpen("order")}>New order</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("contact")}>New contact</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("task")}>New task</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PickCustomer open={open === "order"} onOpenChange={(o) => !o && setOpen(null)} onPick={(id) => { setOpen(null); setOrderFor(id); }} />
      {orderFor && <OrderDialog open onOpenChange={(o) => !o && setOrderFor(null)} contactId={orderFor} />}
      <ContactDialog open={open === "contact"} onOpenChange={(o) => !o && setOpen(null)} />
      <TaskDialog open={open === "task"} onOpenChange={(o) => !o && setOpen(null)} />
    </>
  );
}

function AppearanceMenu() {
  const { theme, mode, setTheme, setMode } = useAppearance();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Appearance">
            <Palette className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          {THEMES.map((t) => (
            <DropdownMenuItem key={t.id} onClick={() => setTheme(t.id)} className="gap-2">
              <span className="flex gap-0.5" aria-hidden="true">
                {t.swatches.slice(0, 3).map((c) => <span key={c} className="size-3 rounded-sm border" style={{ background: c }} />)}
              </span>
              <span className="flex-1">{t.name}{t.recommended ? " (default)" : ""}</span>
              {theme === t.id && <span className="text-xs text-primary">Active</span>}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setMode(mode === "dark" ? "light" : "dark")} className="gap-2 sm:hidden">
            {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {mode === "dark" ? "Light mode" : "Dark mode"}
          </DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/settings">More appearance settings</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setMode(mode === "dark" ? "light" : "dark")}>
        {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    </>
  );
}

function AccountMenu() {
  const auth = useAuth();
  if (auth.configured && auth.ready && !auth.session) {
    return <Button asChild size="sm" variant="outline" className="ml-1"><Link to="/account">Sign in</Link></Button>;
  }
  const name = auth.email ?? currentUser.name;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="ml-1 rounded-full" aria-label="Account menu"><PersonAvatar name={name} tone="brand" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <p>{auth.session ? auth.current?.name ?? "No business yet" : currentUser.name}</p>
          <p className="text-xs font-normal text-muted-foreground">{auth.session ? `${auth.email}${auth.current ? ` · ${ROLE_LABEL[auth.current.role]}` : ""}` : currentUser.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {auth.configured && <DropdownMenuItem asChild><Link to="/account">{auth.session ? "Account and team invites" : "Sign in"}</Link></DropdownMenuItem>}
        <DropdownMenuItem asChild><Link to="/settings">Workspace settings</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/welcome">Public website</Link></DropdownMenuItem>
        {auth.session && <DropdownMenuItem onSelect={() => void auth.signOut()}>Sign out</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Public marketing pages render without the app's sidebar and top bar. */
const BARE = ["/welcome"];
const isBare = (path: string) => BARE.includes(path) || path.startsWith("/f/");

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (isBare(path)) return <>{children}</>;
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">
        <SidebarNav />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 border-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <QuickCreate />
            <AppearanceMenu />
            <Notifications />
            <AccountMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-5 sm:px-5 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
