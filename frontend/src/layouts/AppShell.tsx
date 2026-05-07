import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, FileText, Sparkles, History,
  BookOpen, FileStack, Users, Settings, SlidersHorizontal,
  LogOut, Menu, X, Check,
  type LucideIcon,
} from "lucide-react";
import { api } from "../api/client";
import { useAuthStore } from "../stores/auth";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  hidden?: boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard",         label: "Dashboard",       icon: LayoutDashboard, hidden: true },
  { to: "/proposals/review",  label: "Review",          icon: Sparkles },
  { to: "/frameworks",        label: "Frameworks",      icon: SlidersHorizontal },
  { to: "/reviews",           label: "History",         icon: History },
  { to: "/proposals",         label: "Proposals",       icon: FileText, hidden: true },
  { to: "/templates",         label: "Templates",       icon: FileStack, hidden: true },
  { to: "/knowledge",         label: "Knowledge",       icon: BookOpen, hidden: true },
  { to: "/users",             label: "Users",           icon: Users, adminOnly: true, hidden: true },
  { to: "/settings",          label: "Settings",        icon: Settings },
];

function initialsFor(user: { full_name?: string | null; email: string } | null): string {
  if (!user) return "··";
  const src = (user.full_name || user.email).trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SidebarBrand() {
  return (
    <div className="flex items-center gap-2.5 px-2.5 mb-6">
      <div className="w-[30px] h-[30px] rounded-[9px] bg-gradient-to-br from-pa-accent to-pa-accent-2 flex items-center justify-center shrink-0">
        <Check className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-pa-ink leading-tight tracking-[-0.2px]">
          Proposal Agent
        </div>
        <div className="text-[10.5px] text-pa-muted leading-tight mt-0.5">
          Workspace · T1 Strategy
        </div>
      </div>
    </div>
  );
}

function SidebarNav({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-[3px]">
      {items.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          end={item.to === "/dashboard"}
          className={({ isActive }) =>
            [
              "flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13.5px] transition-colors",
              isActive
                ? "bg-pa-accent text-white font-semibold shadow-accent-soft"
                : "text-pa-body font-medium hover:bg-pa-cream-soft hover:text-pa-ink",
            ].join(" ")
          }
        >
          {({ isActive }) => (
            <>
              <item.icon className="h-[16px] w-[16px] shrink-0" strokeWidth={1.7} />
              <span className="flex-1">{item.label}</span>
              {isActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarUserCard({
  user,
  onSignOut,
}: {
  user: { email: string; full_name?: string | null } | null;
  onSignOut: () => void;
}) {
  return (
    <div className="mt-auto rounded-xl bg-white border border-pa-line p-3.5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-pa-blush text-pa-accent flex items-center justify-center text-[13px] font-bold shrink-0">
          {initialsFor(user)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-pa-ink truncate">
            {user?.full_name || user?.email?.split("@")[0] || "Signed in"}
          </div>
          <div className="text-[11px] text-pa-muted truncate">
            {user?.email ?? ""}
          </div>
        </div>
        <button
          onClick={onSignOut}
          aria-label="Sign out"
          title="Sign out"
          className="text-pa-muted hover:text-pa-ink shrink-0 p-1.5 rounded hover:bg-pa-cream-soft"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { user, setUser, clear } = useAuthStore();

  useEffect(() => {
    if (user) return;
    api
      .get("/auth/me")
      .then(r => {
        const u = r.data;
        setUser({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          is_superadmin: u.is_superadmin,
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = !!user?.is_superadmin;
  const items = NAV.filter(n => !n.hidden && (!n.adminOnly || isAdmin));

  const handleSignOut = () => {
    clear();
    navigate("/signin");
  };

  return (
    <div className="min-h-screen flex bg-pa-cream text-pa-ink font-sans">
      {/* Mobile top bar — sidebar is hidden on small screens. */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-pa-cream border-b border-pa-line flex items-center px-4">
        <button
          className="p-2 -ml-2 text-pa-ink"
          onClick={() => setMobileOpen(v => !v)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link to="/proposals/review" className="flex items-center gap-2 ml-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pa-accent to-pa-accent-2 flex items-center justify-center">
            <Check className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[14px] font-semibold text-pa-ink tracking-[-0.2px]">Proposal Agent</span>
        </Link>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[236px] shrink-0 flex-col px-4 py-[22px]">
        <SidebarBrand />
        <SidebarNav items={items} />
        <SidebarUserCard user={user} onSignOut={handleSignOut} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="w-[260px] bg-pa-cream h-full p-4 flex flex-col shadow-raise"
            onClick={e => e.stopPropagation()}
          >
            <SidebarBrand />
            <SidebarNav items={items} onNavigate={() => setMobileOpen(false)} />
            <SidebarUserCard user={user} onSignOut={handleSignOut} />
          </aside>
        </div>
      )}

      {/* Main area: cream gutter wrapping a rounded white card. */}
      <main className="flex-1 min-w-0 overflow-x-auto pt-14 md:pt-[22px] pb-9 pr-4 md:pr-7">
        <div className="bg-white rounded-2xl border border-pa-line min-h-[calc(100vh-100px)] p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
