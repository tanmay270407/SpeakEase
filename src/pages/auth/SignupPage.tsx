import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Mic2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { UserRole } from "../../types/supabase";

export function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<UserRole>("USER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfoMessage(null);

    const formattedPhone = phone.trim() || null;

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: accountType,
            phone: formattedPhone,
          }
        }
      });

      if (signUpError) throw signUpError;

      // If email confirmation is required and no session was returned
      if (data.user && !data.session) {
        setInfoMessage("Account created! Check your email and confirm your account before logging in.");
        return;
      }

      if (data.user && data.session) {
        // Create user profile
        const { error: profileError } = await (supabase.from('profiles') as any).upsert([
          {
            id: data.user.id,
            user_id: data.user.id,
            email: data.user.email,
            full_name: fullName,
            role: accountType,
            phone: formattedPhone,
          }
        ]);

        if (profileError) console.warn("Profile creation note:", profileError.message);

        // Create SLP profile if applicable
        if (accountType === 'SLP') {
          const { error: slpError } = await (supabase.from('slps') as any).upsert([
            {
              user_id: data.user.id,
              email: data.user.email,
              full_name: fullName,
              phone: formattedPhone,
            }
          ]);
          if (slpError) console.warn("SLP profile note:", slpError.message);
        }

        // Navigate based on role
        if (accountType === 'SLP') {
          navigate('/slp');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (
        msg.toLowerCase().includes('rate limit') ||
        err?.status === 429 ||
        msg.toLowerCase().includes('email rate limit exceeded')
      ) {
        setError('Email sending limit reached. Please wait and try again later.');
      } else {
        setError(msg || 'An error occurred during signup');
      }
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
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Create an account</h2>
          <p className="text-sm text-slate-500">Start your speech practice journey</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 border border-red-200">
            {error}
          </div>
        )}

        {infoMessage && (
          <div className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-200 space-y-2">
            <p className="font-semibold text-emerald-900">Registration Successful</p>
            <p>{infoMessage}</p>
            <div className="pt-2">
              <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500 underline">
                Proceed to Sign in
              </Link>
            </div>
          </div>
        )}

        {!infoMessage && (
          <form className="space-y-4" onSubmit={handleSignup}>
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-slate-900">Full Name</label>
              <Input 
                id="name" 
                type="text" 
                placeholder="John Doe" 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required 
              />
            </div>
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
              <label htmlFor="phone" className="text-sm font-medium text-slate-900">Phone Number</label>
              <Input 
                id="phone" 
                type="tel" 
                placeholder="+1 (555) 000-0000" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-slate-900">Password</label>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
                minLength={6}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Account Type</label>
              <div className="grid grid-cols-2 gap-4">
                <label className={`flex cursor-pointer items-center justify-center rounded-md border p-3 text-sm font-medium transition-colors ${accountType === 'USER' ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <input 
                    type="radio" 
                    name="accountType" 
                    value="USER" 
                    className="sr-only"
                    checked={accountType === 'USER'}
                    onChange={() => setAccountType('USER')}
                  />
                  User / Patient
                </label>
                <label className={`flex cursor-pointer items-center justify-center rounded-md border p-3 text-sm font-medium transition-colors ${accountType === 'SLP' ? 'border-teal-600 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <input 
                    type="radio" 
                    name="accountType" 
                    value="SLP" 
                    className="sr-only"
                    checked={accountType === 'SLP'}
                    onChange={() => setAccountType('SLP')}
                  />
                  Clinician (SLP)
                </label>
              </div>
            </div>
            
            <Button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-2">
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>
        )}

        <div className="text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

