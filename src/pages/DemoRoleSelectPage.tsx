import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Mic2, User, Stethoscope, ArrowRight, CheckCircle2, Sparkles, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/Button";

export function DemoRoleSelectPage() {
  const { setDemoRole, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSelect = (role: 'USER' | 'SLP') => {
    setDemoRole(role);
    if (role === 'USER') {
      navigate('/dashboard');
    } else {
      navigate('/slp');
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto w-full">
        {/* Top Header */}
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100/80 border border-amber-300 text-amber-900 text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="h-3.5 w-3.5 text-amber-700" />
            Hack & Build 2026 Demo
          </div>

          <div className="flex items-center justify-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
              <Mic2 className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              SpeakEase
            </h1>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-4">
            How would you like to explore SpeakEase?
          </h2>
          <p className="text-base text-slate-600 max-w-xl mx-auto">
            Select an interactive clinical perspective below. You can switch between roles at any time during your presentation without signing out.
          </p>
        </div>

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          {/* Patient Card */}
          <div className="relative flex flex-col justify-between rounded-2xl border-2 border-slate-200 bg-white p-7 shadow-sm hover:border-indigo-500 hover:shadow-md transition-all duration-200">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <User className="h-6 w-6" />
                </div>
                <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full">
                  Patient View
                </span>
              </div>

              <h3 className="text-xl font-bold text-slate-900 mb-2">
                Patient Experience
              </h3>
              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Experience guided self-practice, speech recording, AI fluency analysis, and personal progress tracking.
              </p>

              <div className="space-y-2.5 mb-8 border-t border-slate-100 pt-5">
                <div className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span>Interactive audio recorder with real-time biofeedback</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span>Instant speech metrics (WPM, pause count, prolongations)</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span>Clinician-approved speech exercise routines</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span>Weekly practice analytics and session history</span>
                </div>
              </div>
            </div>

            <Button
              onClick={() => handleSelect('USER')}
              className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>Patient Experience</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {/* SLP Card */}
          <div className="relative flex flex-col justify-between rounded-2xl border-2 border-slate-200 bg-white p-7 shadow-sm hover:border-teal-500 hover:shadow-md transition-all duration-200">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <Stethoscope className="h-6 w-6" />
                </div>
                <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
                  Clinician View
                </span>
              </div>

              <h3 className="text-xl font-bold text-slate-900 mb-2">
                SLP Experience
              </h3>
              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Review assigned caseloads, inspect recorded sessions and AI observations, author clinical notes, and run workflows.
              </p>

              <div className="space-y-2.5 mb-8 border-t border-slate-100 pt-5">
                <div className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                  <span>Caseload management and patient profile reviews</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                  <span>Session audio review with AI observations & metrics</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                  <span>Clinician feedback & note authoring interface</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                  <span>AI Assistant powered by Corsair MCP integration</span>
                </div>
              </div>
            </div>

            <Button
              onClick={() => handleSelect('SLP')}
              className="w-full h-11 bg-teal-600 hover:bg-teal-700 text-white font-medium flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>SLP Experience</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="max-w-xl mx-auto w-full mt-10 pt-6 border-t border-slate-200 text-center space-y-3">
        <p className="text-xs text-slate-500">
          Demo Presentation Account: <span className="font-semibold text-slate-700">admin@gmail.com</span>
        </p>
        <div className="flex items-center justify-center gap-4 text-xs">
          <Link
            to="/admin/users"
            className="inline-flex items-center gap-1.5 text-purple-700 hover:text-purple-900 font-medium hover:underline underline-offset-2"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin User Management
          </Link>
          <span className="text-slate-300">•</span>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out of demo account
          </button>
        </div>
      </div>
    </div>
  );
}
