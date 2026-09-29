import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, Settings, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Avatar } from "./Avatar";
import { supabase } from "../lib/supabase";

export function UserProfileMenu() {
  const [open, setOpen] = useState(false);
  const [slpAvatar, setSlpAvatar] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { profile, demoRole, isDemoAccount, signOut } = useAuth();
  const navigate = useNavigate();

  const isSLP = isDemoAccount ? demoRole === "SLP" : profile?.role === "SLP";
  const profileUrl = isSLP ? "/slp/profile" : "/profile";
  const settingsUrl = isSLP ? "/slp/settings" : "/settings";

  // Check if SLP has custom profile_image in slps table
  useEffect(() => {
    let isMounted = true;
    if (isSLP && profile?.id) {
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
  }, [isSLP, profile?.id]);

  const activeAvatar = profile?.avatar_url || slpAvatar || null;

  // Handle outside clicks to close the dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    await signOut();
    navigate("/");
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* Top-Right Circular Avatar Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 p-1 rounded-full text-slate-700 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
        aria-expanded={open}
        aria-haspopup="true"
        id="user-profile-menu-button"
      >
        <Avatar
          src={activeAvatar}
          name={profile?.full_name}
          size="sm"
          theme={isSLP ? "teal" : "indigo"}
          className="ring-2 ring-white shadow-2xs hover:ring-indigo-200 transition-all"
        />
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
      </button>

      {/* Profile Dropdown Menu */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl bg-white shadow-lg ring-1 ring-slate-900/5 focus:outline-none border border-slate-100 z-50 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-profile-menu-button"
        >
          {/* User Header */}
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Signed in as</p>
            <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">
              {profile?.full_name || "Account User"}
            </p>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 mt-1">
              {isSLP ? "Speech-Language Pathologist" : "Patient"}
            </span>
          </div>

          {/* Actions */}
          <div className="py-1">
            <Link
              to={profileUrl}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              role="menuitem"
              id="menu-view-profile"
            >
              <User className="w-4 h-4 text-slate-400" />
              <span>View Profile</span>
            </Link>

            <Link
              to={settingsUrl}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              role="menuitem"
              id="menu-settings"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>Settings</span>
            </Link>
          </div>

          {/* Logout */}
          <div className="py-1">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors text-left"
              role="menuitem"
              id="menu-logout"
            >
              <LogOut className="w-4 h-4 text-rose-500" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
