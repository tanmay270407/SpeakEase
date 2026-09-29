import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ArrowLeftRight, Stethoscope, User, Sparkles, SlidersHorizontal } from "lucide-react";
import { Button } from "./ui/Button";

interface DemoRoleSwitcherProps {
  currentRole: 'USER' | 'SLP';
  mobile?: boolean;
}

export function DemoRoleSwitcher({ currentRole, mobile = false }: DemoRoleSwitcherProps) {
  const { isDemoAccount, demoRole, setDemoRole } = useAuth();
  const navigate = useNavigate();

  if (!isDemoAccount) {
    return null;
  }

  const handleToggle = () => {
    if (demoRole === 'USER') {
      setDemoRole('SLP');
      navigate('/slp');
    } else {
      setDemoRole('USER');
      navigate('/dashboard');
    }
  };

  const handleSelectScreen = () => {
    navigate('/demo-role');
  };

  if (mobile) {
    return (
      <div className="flex items-center gap-2 p-2 bg-amber-50/80 rounded-lg border border-amber-200/80 text-xs">
        <span className="flex items-center gap-1 font-semibold text-amber-900">
          <Sparkles className="h-3.5 w-3.5 text-amber-600" />
          Demo:
        </span>
        <span className="font-medium text-amber-800">
          {demoRole === 'SLP' ? 'SLP Clinician' : 'Patient'}
        </span>
        <button
          onClick={handleToggle}
          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-xs"
        >
          <ArrowLeftRight className="h-3 w-3" />
          Switch to {demoRole === 'SLP' ? 'Patient' : 'SLP'}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-3 my-3 p-3.5 rounded-xl bg-gradient-to-b from-amber-50/90 to-amber-100/50 border border-amber-200/90 shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-amber-900 font-semibold text-xs tracking-wide uppercase">
          <Sparkles className="h-3.5 w-3.5 text-amber-600" />
          Hackathon Demo
        </div>
        <button
          onClick={handleSelectScreen}
          title="Open Role Selection screen"
          className="text-[11px] font-medium text-amber-700 hover:text-amber-900 flex items-center gap-0.5 hover:underline"
        >
          <SlidersHorizontal className="h-3 w-3" />
          Roles
        </button>
      </div>

      <div className="flex items-center gap-2 py-1 px-2 mb-2.5 rounded-lg bg-white/90 border border-amber-200/60 shadow-2xs">
        {demoRole === 'SLP' ? (
          <>
            <div className="h-6 w-6 rounded-md bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
              <Stethoscope className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 leading-tight">SLP Clinician</p>
              <p className="text-[10px] text-slate-500 truncate">Caseload & Analysis</p>
            </div>
          </>
        ) : (
          <>
            <div className="h-6 w-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <User className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 leading-tight">Patient Experience</p>
              <p className="text-[10px] text-slate-500 truncate">Practice & Progress</p>
            </div>
          </>
        )}
      </div>

      <Button
        onClick={handleToggle}
        size="sm"
        className="w-full h-8 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
        Switch to {demoRole === 'SLP' ? 'Patient' : 'SLP'}
      </Button>
    </div>
  );
}
