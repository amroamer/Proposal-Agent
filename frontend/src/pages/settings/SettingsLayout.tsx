import { NavLink, Outlet } from "react-router-dom";
import { User as UserIcon, KeyRound, Cpu } from "lucide-react";

const SUB_NAV = [
  { to: "/settings/profile",  label: "Profile",  icon: UserIcon },
  { to: "/settings/password", label: "Password", icon: KeyRound },
  { to: "/settings/llm",      label: "LLM",      icon: Cpu },
];

export function SettingsLayout() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <div className="eyebrow mb-2">Account</div>
        <h1 className="text-3xl md:text-[32px] font-bold text-pa-ink tracking-[-0.6px] leading-tight">
          Settings
        </h1>
        <p className="mt-2 text-sm text-pa-muted">Your account and AI preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-4 md:gap-6">
        {/* Tab nav: horizontal scroll on mobile, vertical sidebar on md+ */}
        <nav
          className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-1 px-1 md:mx-0 md:px-0 md:sticky md:top-4 self-start pb-1 md:pb-0"
          aria-label="Settings sections"
        >
          {SUB_NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] text-[13px] md:text-[13.5px] transition-colors shrink-0 md:shrink ${
                  isActive
                    ? "bg-kpmg-blue text-white font-bold shadow-accent-soft"
                    : "text-pa-body font-semibold hover:bg-pa-cream-soft hover:text-pa-ink"
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
