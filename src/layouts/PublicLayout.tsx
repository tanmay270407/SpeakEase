import { Navigate, Outlet, Link } from "react-router-dom";
import { Mic2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export function PublicLayout() {
  const { session, profile, isLoading } = useAuth();

  if (!isLoading && session && profile) {
    if (profile.role === 'ADMIN') {
      return <Navigate to="/demo-role" replace />;
    }
    if (profile.role === 'SLP') {
      return <Navigate to="/slp" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900">
      <header className="relative z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link
            to="/"
            aria-label="SpeakEase home"
            className="flex items-center gap-2.5 rounded-lg font-semibold tracking-tight text-lg text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/20">
              <Mic2 className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span>SpeakEase</span>
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-3 sm:gap-6">
            <Link
              to="/#how-it-works"
              className="hidden text-sm font-medium text-slate-600 transition hover:text-indigo-700 sm:inline-flex"
            >
              How it works
            </Link>
            <Link
              to="/login"
              className="rounded-lg px-2 py-2 text-sm font-semibold text-slate-700 transition hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 sm:px-3"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
