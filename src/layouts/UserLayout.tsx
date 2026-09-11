import { Outlet, NavLink, Link, useNavigate } from "react-router-dom";
import { Mic2, LayoutDashboard, PlayCircle, BarChart3, Calendar, List, Settings, Menu, LogOut } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { useAuth } from "../contexts/AuthContext";
import { DemoRoleSwitcher } from "../components/DemoRoleSwitcher";

const navItems = [
  { name: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { name: "Practice", to: "/practice", icon: PlayCircle },
  { name: "Progress", to: "/progress", icon: BarChart3 },
  { name: "Sessions", to: "/sessions", icon: Calendar },
  { name: "Exercises", to: "/exercises", icon: List },
  { name: "Settings", to: "/settings", icon: Settings },
];

export function UserLayout() {
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
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight text-lg">
            <Mic2 className="h-5 w-5 text-indigo-600" />
            <span>SpeakEase</span>
          </Link>
        </div>
        <DemoRoleSwitcher currentRole="USER" />
        <nav className="flex-1 space-y-1 px-4 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
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
            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm uppercase">
              {profile?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium truncate max-w-[120px]">{profile?.full_name || 'User'}</span>
              <span className="text-xs text-slate-500">Patient</span>
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
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight text-lg">
            <Mic2 className="h-5 w-5 text-indigo-600" />
            <span>SpeakEase</span>
          </Link>
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <Menu className="h-5 w-5" />
          </Button>
        </header>

        {/* Mobile Demo Switcher Bar */}
        <div className="lg:hidden px-4 py-1.5 bg-amber-50/40 border-b border-amber-200/60">
          <DemoRoleSwitcher currentRole="USER" mobile />
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-slate-200 bg-white px-4 py-4 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-indigo-50 text-indigo-700"
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
