import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { 
  ArrowLeft, 
  Clock, 
  Mic, 
  CheckCircle2, 
  Lightbulb, 
  HelpCircle,
  BookOpen,
  FileText,
  Volume2,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { ExerciseProgressTracker, FlowStep } from "../../components/ExerciseProgressTracker";
import { getExerciseDetailsById, ExerciseDetail } from "../../data/exerciseDetailsData";
import { supabase } from "../../lib/supabase";

export function ExerciseDetailPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const navigate = useNavigate();

  const [exercise, setExercise] = useState<ExerciseDetail>(() => getExerciseDetailsById(exerciseId));
  const [activeStep, setActiveStep] = useState<"instructions" | "practice">("instructions");
  const [fontSizeClass, setFontSizeClass] = useState<"standard" | "large" | "extra">("large");

  // Load from database if needed to sync title/description
  useEffect(() => {
    let isMounted = true;
    async function syncExercise() {
      if (!exerciseId) return;
      try {
        const { data } = await (supabase.from("exercises") as any)
          .select("*")
          .eq("id", exerciseId)
          .maybeSingle();

        if (data && isMounted) {
          const detail = getExerciseDetailsById(exerciseId);
          setExercise({
            ...detail,
            title: data.name || detail.title,
            clinicalPurpose: detail.clinicalPurpose,
          });
        }
      } catch (err) {
        console.warn("Could not sync exercise from DB:", err);
      }
    }
    syncExercise();
    return () => {
      isMounted = false;
    };
  }, [exerciseId]);

  const handleStartRecording = () => {
    navigate(`/exercises/${exercise.id}/record`);
  };

  const handleProgressStepClick = (step: FlowStep) => {
    if (step === "instructions") setActiveStep("instructions");
    if (step === "record") handleStartRecording();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          to="/exercises"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Exercises
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-teal-700 bg-teal-50 border-teal-200 gap-1.5 py-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            Clinician Approved Routine
          </Badge>
        </div>
      </div>

      {/* Progress Indicator */}
      <ExerciseProgressTracker
        currentStep="instructions"
        allowStepClick={true}
        onStepClick={handleProgressStepClick}
      />

      {/* Hero Overview Card */}
      <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50/50 via-white to-teal-50/30 p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  {exercise.title}
                </h1>
              </div>
              <p className="text-slate-600 text-base leading-relaxed">
                <span className="font-semibold text-slate-800">Clinical Purpose: </span>
                {exercise.clinicalPurpose}
              </p>
            </div>

            {/* Quick Action & Duration */}
            <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>Est. Duration: <strong>{exercise.estimatedDuration}</strong></span>
              </div>
              <Button
                onClick={handleStartRecording}
                size="lg"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium gap-2 shadow-sm rounded-lg px-6"
              >
                <Mic className="w-4 h-4" />
                Start Recording
              </Button>
            </div>
          </div>
        </div>

        {/* View Switcher Tabs (Instructions vs. Practice Content) */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-6">
          <button
            onClick={() => setActiveStep("instructions")}
            className={`flex items-center gap-2 py-3 px-4 font-semibold text-sm border-b-2 transition-colors ${
              activeStep === "instructions"
                ? "border-indigo-600 text-indigo-700 bg-white rounded-t-md"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileText className="w-4 h-4" />
            1. Instructions & Guidelines
          </button>
          <button
            onClick={() => setActiveStep("practice")}
            className={`flex items-center gap-2 py-3 px-4 font-semibold text-sm border-b-2 transition-colors ${
              activeStep === "practice"
                ? "border-indigo-600 text-indigo-700 bg-white rounded-t-md"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            2. Practice Content (Read Aloud)
          </button>
        </div>
      </Card>

      {/* STEP 1: INSTRUCTIONS VIEW */}
      {activeStep === "instructions" && (
        <div className="space-y-6">
          {/* Step-by-Step Instructions */}
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
                <FileText className="w-4 h-4" />
                <span>Preparation Protocol</span>
              </div>
              <CardTitle className="text-xl font-bold text-slate-900">
                Step-by-Step Instructions
              </CardTitle>
              <CardDescription>
                Follow these clinician guidelines carefully prior to initiating your recording session.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <ol className="space-y-3">
                {exercise.instructions.map((inst, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-4 p-3.5 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                  >
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-slate-700 text-base leading-relaxed">{inst}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Practice Content Preview Box */}
          <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50/40 via-white to-teal-50/20 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-700 font-semibold text-sm">
                  <Volume2 className="w-4 h-4" />
                  <span>Assigned Practice Material</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveStep("practice")}
                  className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                >
                  View Large Text Mode <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
              <CardTitle className="text-lg font-bold text-slate-900">
                Practice Script Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-white rounded-xl p-5 border border-indigo-100 shadow-2xs">
                <pre className="font-mono text-lg sm:text-xl font-semibold text-indigo-950 whitespace-pre-wrap leading-relaxed">
                  {exercise.plainPracticeText}
                </pre>
              </div>
            </CardContent>
          </Card>

          {/* Tips Before Recording */}
          <Card className="border-amber-200/80 bg-amber-50/40 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                <Lightbulb className="w-4 h-4 text-amber-600" />
                <span>Clinical Recommendations</span>
              </div>
              <CardTitle className="text-lg font-bold text-slate-900">
                Tips Before Recording
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {exercise.tipsBeforeRecording.map((tip, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-sm text-slate-700 bg-white/80 p-3 rounded-lg border border-amber-100"
                  >
                    <CheckCircle2 className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Bottom Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200">
            <Button
              variant="outline"
              onClick={() => setActiveStep("practice")}
              className="w-full sm:w-auto text-slate-700 gap-2"
            >
              <BookOpen className="w-4 h-4" />
              Continue to Practice Content
            </Button>
            <Button
              onClick={handleStartRecording}
              size="lg"
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium gap-2 px-8"
            >
              <Mic className="w-4 h-4" />
              Start Recording
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: PRACTICE CONTENT VIEW (LARGE READABLE TEXT) */}
      {activeStep === "practice" && (
        <div className="space-y-6">
          {/* Practice Header & Readability Controls */}
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
                    <BookOpen className="w-4 h-4" />
                    <span>Read Aloud Practice Material</span>
                  </div>
                  <CardTitle className="text-xl font-bold text-slate-900 mt-1">
                    Large Practice Material
                  </CardTitle>
                  <CardDescription>
                    Read through these items aloud to rehearse your articulation and breathing before recording.
                  </CardDescription>
                </div>

                {/* Font Size Adjuster for Accessibility */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
                  <span className="text-xs text-slate-500 px-2 font-medium">Text Size:</span>
                  <button
                    onClick={() => setFontSizeClass("standard")}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                      fontSizeClass === "standard"
                        ? "bg-white text-indigo-700 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    A
                  </button>
                  <button
                    onClick={() => setFontSizeClass("large")}
                    className={`px-2.5 py-1 text-sm font-semibold rounded-md transition-colors ${
                      fontSizeClass === "large"
                        ? "bg-white text-indigo-700 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    A+
                  </button>
                  <button
                    onClick={() => setFontSizeClass("extra")}
                    className={`px-2.5 py-1 text-base font-semibold rounded-md transition-colors ${
                      fontSizeClass === "extra"
                        ? "bg-white text-indigo-700 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    A++
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-2">
              {exercise.practiceSections.map((section, sIdx) => (
                <div key={sIdx} className="space-y-3">
                  {section.heading && (
                    <div className="border-b border-slate-100 pb-2">
                      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-500" />
                        {section.heading}
                      </h2>
                      {section.subheading && (
                        <p className="text-xs text-slate-500 mt-0.5">{section.subheading}</p>
                      )}
                    </div>
                  )}

                  <div className="grid gap-3">
                    {section.items.map((item, iIdx) => (
                      <div
                        key={iIdx}
                        className="bg-slate-50 border border-slate-200/80 rounded-xl p-5 sm:p-7 hover:border-indigo-300 transition-colors shadow-2xs flex items-center justify-between"
                      >
                        <span
                          className={`font-semibold text-slate-900 tracking-wide select-all ${
                            fontSizeClass === "standard"
                              ? "text-xl sm:text-2xl"
                              : fontSizeClass === "large"
                              ? "text-2xl sm:text-3xl lg:text-4xl"
                              : "text-3xl sm:text-4xl lg:text-5xl"
                          }`}
                        >
                          {item}
                        </span>
                        <div className="hidden sm:flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full font-medium">
                          <Volume2 className="w-3.5 h-3.5" />
                          Speak Clearly
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Quick Review of Tips */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg flex-shrink-0">
                <Lightbulb className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Ready to record?</h3>
                <p className="text-xs text-slate-500">
                  Ensure a quiet environment, hold your device steadily, and speak at your natural volume.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => setActiveStep("instructions")}
                className="w-1/2 sm:w-auto"
              >
                Back to Instructions
              </Button>
              <Button
                onClick={handleStartRecording}
                size="lg"
                className="w-1/2 sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium gap-2 px-6"
              >
                <Mic className="w-4 h-4" />
                Start Recording
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
