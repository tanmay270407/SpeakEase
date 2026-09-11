import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";

export function LandingPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 lg:py-32">
      <div className="max-w-3xl text-center space-y-8">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-tight">
          Practice your speech. <br className="hidden md:block" />
          <span className="text-slate-500">At your own pace.</span>
        </h1>
        
        <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto">
          AI-assisted practice with clinician oversight.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            to="/login"
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-700 transition-colors w-full sm:w-auto justify-center shadow-sm"
          >
            Start Practicing
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/slp"
            className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors w-full sm:w-auto justify-center"
          >
            I'm an SLP
          </Link>
        </div>

        <div className="pt-16 pb-8">
          <div className="flex items-center justify-center gap-2 md:gap-4 text-sm font-medium text-slate-500">
            <span className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs">1</span> Practice</span>
            <ArrowRight className="h-3 w-3 text-slate-300" />
            <span className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs">2</span> Analyze</span>
            <ArrowRight className="h-3 w-3 text-slate-300" />
            <span className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs">3</span> Track</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-full py-2 px-4 w-fit mx-auto border border-slate-200">
          <ShieldCheck className="h-4 w-4 text-slate-400" />
          <span>AI assists. Your SLP remains in control.</span>
        </div>
      </div>
    </div>
  );
}
