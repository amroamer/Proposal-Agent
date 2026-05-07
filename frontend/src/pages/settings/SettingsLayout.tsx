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
        <h1 className="text-3xl md:text-[32px] font-semibold text-pa-ink tracking-[-0.6px] leading-tight">
          Settings
        </h1>
        <p className="mt-2 text-sm text-pa-muted">Your account and AI preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <nav className="flex md:flex-col gap-1 md:sticky md:top-4 self-start">
          {SUB_NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px] text-[13.5px] transition-colors ${
                  isActive
                    ? "bg-pa-accent text-white font-semibold shadow-accent-soft"
                    : "text-pa-body hover:bg-pa-cream-soft hover:text-pa-ink"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
