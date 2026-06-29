import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  User,
  Settings,
  LogOut,
  Sparkles,
  Moon,
  Sun,
  Menu,
  MessageSquare,
  Presentation,
  Map,
  Download,
  BarChart3,
  Lightbulb,
  Gauge,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/ideas", label: "Idea Generator", icon: Lightbulb },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/investor", label: "Investor Readiness", icon: Gauge },
  { to: "/coach", label: "AI Co-Founder", icon: MessageSquare },
  { to: "/pitch", label: "Pitch Decks", icon: Presentation },
  { to: "/roadmap", label: "Roadmaps", icon: Map },
  { to: "/exports", label: "Exports", icon: Download },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar md:flex md:flex-col">
        <SidebarBody />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-background/60 px-4 backdrop-blur-xl backdrop-saturate-150 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 bg-sidebar p-0">
                <SidebarBody onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <Brand />
          </div>
          <div className="hidden md:block" />
          <HeaderRight />
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden animate-fade-in">{children}</main>
      </div>
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Brand />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {nav.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={[
                "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-all duration-200",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground hover:translate-x-0.5",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary transition-all duration-300",
                  active ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50",
                ].join(" ")}
              />
              <item.icon className={["h-4 w-4 transition-transform duration-200", active ? "text-primary" : "group-hover:scale-110"].join(" ")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <SignOutButton />
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-glow">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <span className="font-display text-sm font-semibold">VentureIQ AI</span>
    </Link>
  );
}

function HeaderRight() {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const initial = (user?.user_metadata?.full_name ?? user?.email ?? "?")
    .toString()
    .charAt(0)
    .toUpperCase();
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={toggle}
        aria-label="Toggle theme"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <Link
        to="/profile"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        aria-label="Profile"
      >
        {initial}
      </Link>
    </div>
  );
}

function SignOutButton() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <button
      onClick={async () => {
        await signOut();
        navigate({ to: "/", replace: true });
      }}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <LogOut className="h-4 w-4" /> Sign out
    </button>
  );
}
