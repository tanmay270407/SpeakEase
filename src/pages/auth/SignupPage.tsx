import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  HeartHandshake,
  Mic2,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { UserRole } from "../../types/supabase";

export function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<UserRole>("USER");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="relative isolate flex-1 overflow-hidden bg-[#f8f9fc] px-4 py-8 sm:px-6 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 -z-10 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />
      <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-xl shadow-slate-900/[0.06] lg:grid-cols-[0.82fr_1.18fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-700 to-violet-800 p-10 text-white lg:flex">
          <div aria-hidden="true" className="absolute -bottom-28 -left-28 h-80 w-80 rounded-full border-[48px] border-white/[0.07]" />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <Mic2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mt-10 text-sm font-semibold uppercase tracking-[0.16em] text-indigo-200">
              A more connected practice
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.04em]">
              Small steps can make a meaningful difference.
            </h1>
            <p className="mt-5 leading-7 text-indigo-100">
              Create your account to practice at your own pace and stay
              connected with your speech-language pathologist.
            </p>
          </div>
          <div className="relative space-y-4">
            <div className="flex items-center gap-3 text-sm text-indigo-50">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                <HeartHandshake className="h-4 w-4" aria-hidden="true" />
              </span>
              Built around your care team
            </div>
            <div className="flex items-center gap-3 text-sm text-indigo-50">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              Your clinician stays in the loop
            </div>
          </div>
        </aside>

        <div className="px-5 py-8 sm:px-9 sm:py-10 lg:px-12">
          <div className="mx-auto w-full max-w-xl">
            <div className="mb-7 flex items-center gap-3 lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                <Mic2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="font-semibold tracking-tight text-slate-950">SpeakEase</span>
            </div>

            <div className="mb-7">
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                Create your account
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Start your speech practice journey.
              </p>
            </div>

            {error && (
              <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                {error}
              </div>
            )}

            {infoMessage && (
              <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900">
                <div className="flex items-center gap-2 font-semibold">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </span>
                  Account created
                </div>
                <p className="mt-3">{infoMessage}</p>
                <Link to="/login" className="mt-4 inline-flex items-center gap-2 font-semibold text-indigo-700 hover:text-indigo-800">
                  Continue to sign in
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            )}

            {!infoMessage && (
              <form className="space-y-5" onSubmit={handleSignup}>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold text-slate-800">I’m joining as a...</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={`relative flex cursor-pointer gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 ${accountType === "USER" ? "border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
                      <input
                        type="radio"
                        name="accountType"
                        value="USER"
                        className="sr-only"
                        checked={accountType === "USER"}
                        onChange={() => setAccountType("USER")}
                      />
                      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accountType === "USER" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                        <UserRound className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">Patient</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">Practice and track progress</span>
                      </span>
                      {accountType === "USER" && <Check className="absolute right-3 top-3 h-4 w-4 text-indigo-700" aria-hidden="true" />}
                    </label>
                    <label className={`relative flex cursor-pointer gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 ${accountType === "SLP" ? "border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
                      <input
                        type="radio"
                        name="accountType"
                        value="SLP"
                        className="sr-only"
                        checked={accountType === "SLP"}
                        onChange={() => setAccountType("SLP")}
                      />
                      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accountType === "SLP" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                        <Stethoscope className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">Clinician (SLP)</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">Support your patients</span>
                      </span>
                      {accountType === "SLP" && <Check className="absolute right-3 top-3 h-4 w-4 text-indigo-700" aria-hidden="true" />}
                    </label>
                  </div>
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-semibold text-slate-800">Full name</label>
                    <Input
                      id="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Your name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="h-11 rounded-xl border-slate-200 px-3.5 placeholder:text-slate-400 focus-visible:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="phone" className="text-sm font-semibold text-slate-800">Phone <span className="font-normal text-slate-400">(optional)</span></label>
                    <Input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="Your phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-11 rounded-xl border-slate-200 px-3.5 placeholder:text-slate-400 focus-visible:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label htmlFor="email" className="text-sm font-semibold text-slate-800">Email address</label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-11 rounded-xl border-slate-200 px-3.5 placeholder:text-slate-400 focus-visible:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="password" className="text-sm font-semibold text-slate-800">Create a password</label>
                      <span className="text-xs text-slate-500">At least 6 characters</span>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Create a password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="h-11 rounded-xl border-slate-200 px-3.5 pr-12 placeholder:text-slate-400 focus-visible:ring-indigo-500"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((visible) => !visible)}
                        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="mt-1 h-12 w-full gap-2 rounded-xl bg-indigo-600 text-base font-semibold text-white shadow-md shadow-indigo-600/15 transition hover:bg-indigo-700 focus-visible:ring-indigo-500"
                >
                  {loading ? "Creating account..." : "Create account"}
                  {!loading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                </Button>
                <p className="text-center text-xs leading-5 text-slate-500">
                  By creating an account, you understand SpeakEase supports practice and does not replace care from a qualified professional.
                </p>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-slate-600">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-indigo-700 hover:text-indigo-800">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
