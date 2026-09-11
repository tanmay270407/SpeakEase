import { Navigate, Outlet, Link } from "react-router-dom";
import { Mic2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export function PublicLayout() {
  const { session, profile, isLoading } = useAuth();

  if (!isLoading && session && profile) {
    if (profile.email?.toLowerCase() === 'admin@gmail.com' || profile.role === 'ADMIN') {
      return <Navigate to="/demo-role" replace />;
    }
    if (profile.role === 'SLP') {
      return <Navigate to="/slp" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900">
      <header className="flex h-16 items-center justify-between px-6 lg:px-12 border-b border-slate-200 bg-white">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-lg">
          <Mic2 className="h-5 w-5 text-indigo-600" />
          <span>SpeakEase</span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link to="/login" className="text-sm font-medium hover:text-indigo-600 transition-colors">
            Log in
          </Link>
          <Link
            to="/signup"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
          >
            Sign up
          </Link>
        </nav>
      </header>
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
