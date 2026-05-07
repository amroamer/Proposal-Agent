import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, FileText, Sparkles, History,
  BookOpen, FileStack, Users, Settings, SlidersHorizontal,
  LogOut, Menu, X,
} from "lucide-react";
import { api } from "../api/client";
import { useAuthStore } from "../stores/auth";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  hidden?: boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard",         label: "Dashboard",       icon: LayoutDashboard, hidden: true },
  { to: "/proposals/review",  label: "Review proposal", icon: Sparkles },
  { to: "/frameworks",        label: "Frameworks",      icon: SlidersHorizontal },
  { to: "/reviews",           label: "Review history",  icon: History },
  { to: "/proposals",         label: "Proposals",       icon: FileText, hidden: true },
  { to: "/templates",         label: "Templates",       icon: FileStack, hidden: true },
  { to: "/knowledge",         label: "Knowledge",       icon: BookOpen, hidden: true },
  { to: "/users",             label: "Users",           icon: Users, adminOnly: true, hidden: true },
  { to: "/settings",          label: "Settings",        icon: Settings },
];

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { user, setUser, clear } = useAuthStore();

  // Hydrate user from /auth/me on first render so we know if they're admin
  // for sidebar gating. Cheap call, non-blocking.
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
    <div className="min-h-screen flex flex-col bg-kpmg-gray-50">
      <header className="bg-kpmg-blue text-white h-14 flex items-center px-4 shadow-card">
        <button
          className="md:hidden p-2 -ml-2"
          onClick={() => setMobileOpen(v => !v)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link to="/proposals/review" className="flex items-baseline gap-2 ml-2 md:ml-0">
          <span className="text-xl font-bold">KPMG</span>
          <span className="text-sm text-blue-200">Proposal Agent</span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-blue-100 hidden sm:inline">{user?.email}</span>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1 px-3 py-1.5 rounded hover:bg-white/10 text-sm"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex">
        <aside className="w-60 bg-white border-r border-kpmg-gray-100 hidden md:block">
          <nav className="py-4">
            {items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/dashboard"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-kpmg-blue/5 text-kpmg-blue border-l-4 border-kpmg-blue font-semibold"
                      : "text-kpmg-gray-600 hover:bg-kpmg-gray-50 border-l-4 border-transparent"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {mobileOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setMobileOpen(false)}
          >
            <aside
              className="w-64 bg-white h-full shadow-raise"
              onClick={e => e.stopPropagation()}
            >
              <nav className="py-4">
                {items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/dashboard"}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-6 py-3 text-sm ${
                        isActive
                          ? "bg-kpmg-blue/5 text-kpmg-blue font-semibold"
                          : "text-kpmg-gray-700"
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </aside>
          </div>
        )}

        <main className="flex-1 p-4 md:p-8 overflow-x-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
