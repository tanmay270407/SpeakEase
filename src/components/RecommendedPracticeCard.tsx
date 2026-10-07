import { Link } from "react-router-dom";
import { Sparkles, ArrowRight, Target, Clock, Dumbbell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/Card";
import { Button } from "./ui/Button";
import { getExerciseDetailsById } from "../data/exerciseDetailsData";

export interface RecommendedPracticeProps {
  practiceFocus?: string | null;
  recommendedExercise?: string | null;
  suggestedDurationMinutes?: number | null;
  explanation?: string | null;
  patientFeedback?: string | null;
  observations?: Array<{ type: string; description: string }> | null;
}

export function RecommendedPracticeCard({
  practiceFocus = "Smooth Pacing",
  recommendedExercise = "Easy Onset & Gentle Voicing",
  suggestedDurationMinutes = 3,
  explanation,
  patientFeedback,
}: RecommendedPracticeProps) {
  const targetExercise = getExerciseDetailsById(recommendedExercise);
  const effectiveFocus = practiceFocus || "Smooth Pacing";
  const effectiveExerciseTitle = targetExercise?.title || recommendedExercise || "Easy Onset & Gentle Voicing";
  const effectiveDuration = suggestedDurationMinutes || 3;
  const effectiveReason = explanation || "Continuing with gentle onset exercises helps build steady breath support and smooth phrasing.";

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/60 via-white to-sky-50/40 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b border-indigo-100/70">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">Recommended Next Practice</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Personalized practice focus based on your recent session observations.
              </CardDescription>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
            What's Next?
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-5">
        {patientFeedback && (
          <div className="p-3.5 bg-white/90 rounded-xl border border-indigo-100 shadow-2xs">
            <p className="text-xs text-slate-700 leading-relaxed italic">
              "{patientFeedback}"
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Focus */}
          <div className="p-3 bg-white/80 rounded-xl border border-slate-200/80 shadow-2xs flex items-start gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0 mt-0.5">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Practice Focus</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{effectiveFocus}</p>
            </div>
          </div>

          {/* Recommended Exercise */}
          <div className="p-3 bg-white/80 rounded-xl border border-slate-200/80 shadow-2xs flex items-start gap-2.5">
            <div className="p-2 bg-teal-50 text-teal-600 rounded-lg shrink-0 mt-0.5">
              <Dumbbell className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Exercise</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5 leading-snug">{effectiveExerciseTitle}</p>
            </div>
          </div>

          {/* Suggested Duration */}
          <div className="p-3 bg-white/80 rounded-xl border border-slate-200/80 shadow-2xs flex items-start gap-2.5">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg shrink-0 mt-0.5">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Suggested Duration</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{effectiveDuration} minutes</p>
            </div>
          </div>
        </div>

        {/* Why / Explanation */}
        <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/70">
          <p className="text-xs font-semibold text-slate-700 mb-1">Why this practice:</p>
          <p className="text-xs text-slate-600 leading-relaxed">
            {effectiveReason}
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-1 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500 text-center sm:text-left">
            Continuous short practices help reinforce smooth vocal pacing.
          </p>
          <Link
            to={`/exercises/${targetExercise.id}`}
            className="w-full sm:w-auto"
          >
            <Button
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-10 px-5 rounded-full shadow-xs gap-2"
            >
              <span>Start Recommended Practice</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
