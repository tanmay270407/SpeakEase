import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { ArrowRight, Eye, EyeOff, Mic2, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { session, profile } = useAuth();
  
  const from = location.state?.from?.pathname;

  useEffect(() => {
    if (session && profile) {
      if (from) {
        navigate(from, { replace: true });
      } else if (profile.role === 'ADMIN') {
        navigate('/demo-role', { replace: true });
      } else if (profile.role === 'SLP') {
        navigate('/slp', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [session, profile, from, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;
      
      if (!data.session) {
        throw new Error("Unable to establish session. Please verify your email or credentials.");
      }

      // Query role
      let role = 'USER';
      try {
        const { data: userProfile } = await (supabase.from('profiles') as any)
          .select('role')
          .eq('id', data.user.id)
          .single();
        if (userProfile?.role) {
          role = userProfile.role;
        }
      } catch {
        // Fallback to metadata
      }
      
      const isDemo = role === 'ADMIN';

      if (from) {
        navigate(from, { replace: true });
      } else if (isDemo) {
        navigate('/demo-role', { replace: true });
      } else if (role === 'SLP') {
        navigate('/slp', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }

    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative isolate flex-1 overflow-hidden bg-[#f8f9fc] px-4 py-10 sm:px-6 sm:py-14">
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 -z-10 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-xl shadow-slate-900/[0.06] lg:min-h-[590px] lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-700 to-violet-800 p-10 text-white lg:flex">
          <div aria-hidden="true" className="absolute -bottom-28 -right-28 h-80 w-80 rounded-full border-[48px] border-white/[0.07]" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <Mic2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mt-10 text-sm font-semibold uppercase tracking-[0.16em] text-indigo-200">
              Welcome back
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.04em]">
              Your practice is here when you’re ready.
            </h1>
            <p className="mt-5 max-w-sm leading-7 text-indigo-100">
              Pick up where you left off and stay connected with your speech
              practice journey.
            </p>
          </div>
          <div className="relative flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-4 text-sm leading-6 text-indigo-50">
            <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
            Your clinician remains part of your care team.
          </div>
        </aside>

        <div className="flex flex-col justify-center px-6 py-9 sm:px-10 sm:py-12 lg:px-14">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                <Mic2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="font-semibold tracking-tight text-slate-950">SpeakEase</span>
            </div>

            <div className="mb-8">
              <div className="mb-4 hidden h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 lg:flex">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                Sign in to SpeakEase
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Welcome back. Enter your details to continue.
              </p>
            </div>

            {error && (
              <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                {error}
              </div>
            )}

            <form className="space-y-5" onSubmit={handleLogin}>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-semibold text-slate-800">Email address</label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-xl border-slate-200 px-3.5 text-base placeholder:text-slate-400 focus-visible:ring-indigo-500"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="password" className="text-sm font-semibold text-slate-800">Password</label>
                  <Link to="/reset-password" className="text-sm font-semibold text-indigo-700 transition hover:text-indigo-800">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 rounded-xl border-slate-200 px-3.5 pr-12 text-base placeholder:text-slate-400 focus-visible:ring-indigo-500"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="mt-2 h-12 w-full gap-2 rounded-xl bg-indigo-600 text-base font-semibold text-white shadow-md shadow-indigo-600/15 transition hover:bg-indigo-700 focus-visible:ring-indigo-500"
              >
                {loading ? "Signing in..." : "Sign in"}
                {!loading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </form>

            <p className="mt-7 text-center text-sm text-slate-600">
              Don’t have an account?{" "}
              <Link to="/signup" className="font-semibold text-indigo-700 hover:text-indigo-800">
                Create one
              </Link>
            </p>
            <p className="mt-8 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-500">
              SpeakEase supports practice and does not replace care from a qualified professional.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
