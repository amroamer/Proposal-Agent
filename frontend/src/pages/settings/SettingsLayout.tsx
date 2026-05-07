import { NavLink, Outlet } from "react-router-dom";
import { User as UserIcon, KeyRound, Cpu } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";

const SUB_NAV = [
  { to: "/settings/profile",  label: "Profile",       icon: UserIcon },
  { to: "/settings/password", label: "Password",      icon: KeyRound },
  { to: "/settings/llm",      label: "LLM",           icon: Cpu },
];

export function SettingsLayout() {
  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="Settings" subtitle="Your account and AI preferences." />

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
        <nav className="flex md:flex-col gap-1 md:sticky md:top-4 self-start">
          {SUB_NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? "bg-kpmg-blue/10 text-kpmg-blue font-semibold"
                    : "text-kpmg-gray-600 hover:bg-kpmg-gray-50"
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
