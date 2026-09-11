import { Outlet, NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import { 
  Mic2, 
  LayoutDashboard, 
  Users, 
  Calendar, 
  List, 
  Settings, 
  Menu, 
  X,
  Sparkles, 
  LogOut, 
  Activity, 
  UserPlus, 
  Inbox 
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { useAuth } from "../contexts/AuthContext";
import { DemoRoleSwitcher } from "../components/DemoRoleSwitcher";
import { UserProfileMenu } from "../components/UserProfileMenu";
import { Avatar } from "../components/Avatar";
import { supabase } from "../lib/supabase";

const slpNavItems = [
  { name: "Dashboard", to: "/slp", icon: LayoutDashboard, end: true },
  { name: "My Patients", to: "/slp/patients", icon: Users, end: true },
  { name: "Find Patients", to: "/slp/find-patients", icon: UserPlus },
  { name: "Requests", to: "/slp/requests", icon: Inbox },
  { name: "Sessions", to: "/slp/sessions", icon: Calendar },
  { name: "Exercises", to: "/slp/exercises", icon: List },
  { name: "Assistant", to: "/slp/assistant", icon: Sparkles },
  { name: "Workflows", to: "/slp/workflows", icon: Activity },
  { name: "Settings", to: "/slp/settings", icon: Settings },
];

export function SLPLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [slpAvatar, setSlpAvatar] = useState<string | null>(null);
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Check if SLP has custom profile_image in slps table
  useEffect(() => {
    let isMounted = true;
    if (profile?.id) {
      (supabase.from("slps") as any)
        .select("profile_image")
        .eq("user_id", profile.id)
        .maybeSingle()
        .then(({ data }: any) => {
          if (isMounted && data?.profile_image) {
            setSlpAvatar(data.profile_image);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [profile?.id]);

  const activeAvatar = profile?.avatar_url || slpAvatar || null;

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* 1. FIXED DESKTOP LEFT SIDEBAR */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col border-r border-slate-200 bg-white">
        {/* TOP: SpeakEase Logo & Name */}
        <div className="flex h-16 items-center px-6 border-b border-slate-100 shrink-0">
          <Link to="/slp" className="flex items-center gap-2 font-semibold tracking-tight text-lg">
            <Mic2 className="h-5 w-5 text-indigo-600" />
            <span>SpeakEase <span className="text-xs font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded ml-1">SLP</span></span>
          </Link>
        </div>

        {/* Demo Switcher for Presenter Demo Account */}
        <div className="shrink-0">
          <DemoRoleSwitcher currentRole="SLP" />
        </div>

        {/* MIDDLE: SLP Navigation (Internally scrollable if height is constrained) */}
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1 overscroll-contain">
          {slpNavItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors group",
                  isActive
                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600")} />
                  <span className="truncate">{item.name}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* BOTTOM: SLP User Profile & Real Log Out */}
        <div className="p-4 border-t border-slate-100 space-y-3 mt-auto shrink-0 bg-white">
          <div className="flex items-center gap-3 px-2 py-1">
            <Avatar
              src={activeAvatar}
              name={profile?.full_name}
              size="sm"
              theme="indigo"
            />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-slate-900 truncate max-w-[130px]">
                {profile?.full_name || 'SLP'}
              </span>
              <span className="text-xs text-slate-500 font-medium">SLP</span>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-slate-600 hover:text-slate-900 hover:bg-slate-100 h-9 px-2 text-sm font-medium cursor-pointer" 
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2.5 text-slate-400" />
            Log out
          </Button>
        </div>
      </aside>

      {/* 2. MOBILE RESPONSIVE DRAWER & OVERLAY */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
            onClick={() => setMobileMenuOpen(false)} 
          />

          {/* Drawer */}
          <aside className="relative w-72 max-w-[85vw] flex flex-col bg-white border-r border-slate-200 shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {/* Mobile Header */}
            <div className="flex h-16 items-center justify-between px-6 border-b border-slate-100 shrink-0">
              <Link to="/slp" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 font-semibold tracking-tight text-lg">
                <Mic2 className="h-5 w-5 text-indigo-600" />
                <span>SpeakEase <span className="text-xs font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded ml-1">SLP</span></span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Mobile Demo Switcher */}
            <div className="px-3 pt-2 shrink-0">
              <DemoRoleSwitcher currentRole="SLP" mobile />
            </div>

            {/* Mobile Navigation List */}
            <nav className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
              {slpNavItems.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors group",
                      isActive
                        ? "bg-indigo-50 text-indigo-700 font-semibold"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600")} />
                      <span className="truncate">{item.name}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* Mobile Bottom Profile */}
            <div className="p-4 border-t border-slate-100 space-y-3 mt-auto shrink-0 bg-white">
              <div className="flex items-center gap-3 px-2 py-1">
                <Avatar
                  src={activeAvatar}
                  name={profile?.full_name}
                  size="sm"
                  theme="indigo"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-slate-900 truncate">
                    {profile?.full_name || 'SLP'}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">SLP</span>
                </div>
              </div>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-slate-600 hover:text-slate-900 hover:bg-slate-100 h-9 px-2 text-sm font-medium cursor-pointer" 
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2.5 text-slate-400" />
                Log out
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* 3. MAIN PAGE CONTAINER WITH TOPBAR (OFFSET FOR DESKTOP SIDEBAR) */}
      <div className="flex flex-1 flex-col lg:pl-64 min-h-screen min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur px-4 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <Link to="/slp" className="flex items-center gap-2 font-semibold tracking-tight text-lg">
              <Mic2 className="h-5 w-5 text-indigo-600" />
              <span>SpeakEase</span>
            </Link>
          </div>

          <div className="hidden lg:block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Clinician Portal
          </div>

          {/* Top-Right Circular Profile Avatar */}
          <div className="flex items-center gap-4">
            <UserProfileMenu />
          </div>
        </header>

        {/* Main Content Area - Scrolls independently */}
        <main className="flex-1 w-full">
          <div className="mx-auto max-w-5xl p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

