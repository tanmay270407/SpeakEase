import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Mic2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

export function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) throw error;
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred during password reset');
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
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Reset password</h2>
          <p className="text-sm text-slate-500">We'll send you a link to reset your password.</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 border border-red-200">
            {error}
          </div>
        )}

        {success ? (
          <div className="rounded-md bg-green-50 p-4 text-sm text-green-800 border border-green-200">
            Check your email for the reset link!
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleReset}>
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
            
            <Button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-2">
              {loading ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        )}

        <div className="text-center text-sm text-slate-500">
          Remember your password?{" "}
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
