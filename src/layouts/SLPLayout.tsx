import { Outlet, NavLink, Link, useNavigate } from "react-router-dom";
import { Mic2, LayoutDashboard, Users, Calendar, List, Settings, Menu, Sparkles, LogOut, Activity } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { useAuth } from "../contexts/AuthContext";
import { DemoRoleSwitcher } from "../components/DemoRoleSwitcher";

const navItems = [
  { name: "Dashboard", to: "/slp", icon: LayoutDashboard },
  { name: "Patients", to: "/slp/patients", icon: Users },
  { name: "Sessions", to: "/slp/sessions", icon: Calendar },
  { name: "Exercises", to: "/slp/exercises", icon: List },
  { name: "Assistant", to: "/slp/assistant", icon: Sparkles },
  { name: "Workflows", to: "/slp/workflows", icon: Activity },
  { name: "Settings", to: "/slp/settings", icon: Settings },
];

export function SLPLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center px-6 border-b border-slate-100">
          <Link to="/slp" className="flex items-center gap-2 font-semibold tracking-tight text-lg">
            <Mic2 className="h-5 w-5 text-teal-600" />
            <span>SpeakEase <span className="text-sm font-normal text-slate-500 ml-1">for SLP</span></span>
          </Link>
        </div>
        <DemoRoleSwitcher currentRole="SLP" />
        <nav className="flex-1 space-y-1 px-4 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.to}
              end={item.to === '/slp'}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-teal-50 text-teal-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="h-8 w-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-sm uppercase">
              {profile?.full_name?.charAt(0) || 'S'}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium truncate max-w-[120px]">{profile?.full_name || 'SLP'}</span>
              <span className="text-xs text-slate-500">Clinician</span>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-slate-600 hover:text-slate-900 hover:bg-slate-100" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Log out
          </Button>
        </div>
      </aside>

      {/* Mobile Topbar */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
          <Link to="/slp" className="flex items-center gap-2 font-semibold tracking-tight text-lg">
            <Mic2 className="h-5 w-5 text-teal-600" />
            <span>SpeakEase</span>
          </Link>
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <Menu className="h-5 w-5" />
          </Button>
        </header>

        {/* Mobile Demo Switcher Bar */}
        <div className="lg:hidden px-4 py-1.5 bg-amber-50/40 border-b border-amber-200/60">
          <DemoRoleSwitcher currentRole="SLP" mobile />
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-slate-200 bg-white px-4 py-4 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.to}
                end={item.to === '/slp'}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-teal-50 text-teal-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </NavLink>
            ))}
            <button 
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
