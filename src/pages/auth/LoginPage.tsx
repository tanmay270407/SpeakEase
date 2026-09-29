import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Mic2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      } else if (profile.email?.toLowerCase() === 'admin@gmail.com' || profile.role === 'ADMIN') {
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
      let role = data.user?.user_metadata?.role || 'USER';
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
      
      const isDemo = (data.user?.email?.toLowerCase() === 'admin@gmail.com') || role === 'ADMIN';

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
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center mb-2">
            <Mic2 className="h-6 w-6 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h2>
          <p className="text-sm text-slate-500">Enter your credentials to access your account</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 border border-red-200">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleLogin}>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-900">Email</label>
            <Input 
              id="email" 
              type="email" 
              placeholder="you@example.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium text-slate-900">Password</label>
              <Link to="/reset-password" className="text-xs font-medium text-indigo-600 hover:text-indigo-500">Forgot password?</Link>
            </div>
            <Input 
              id="password" 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>
          
          <Button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-2">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="text-center text-sm text-slate-500">
          Don't have an account?{" "}
          <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
