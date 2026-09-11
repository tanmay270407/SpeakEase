import React from "react";
import { Check, FileText, Mic, Award } from "lucide-react";

export type FlowStep = "instructions" | "record" | "results";

interface ExerciseProgressTrackerProps {
  currentStep: FlowStep;
  className?: string;
  onStepClick?: (step: FlowStep) => void;
  allowStepClick?: boolean;
}

interface StepItem {
  id: FlowStep;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: StepItem[] = [
  { id: "instructions", label: "Instructions", sublabel: "Clinical guidelines", icon: FileText },
  { id: "record", label: "Record", sublabel: "Audio capture", icon: Mic },
  { id: "results", label: "Results", sublabel: "Analysis & feedback", icon: Award },
];

export function ExerciseProgressTracker({
  currentStep,
  className = "",
  onStepClick,
  allowStepClick = false,
}: ExerciseProgressTrackerProps) {
  const stepIndexMap: Record<FlowStep, number> = {
    instructions: 0,
    record: 1,
    results: 2,
  };

  const currentIndex = stepIndexMap[currentStep];

  return (
    <div className={`w-full bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-sm ${className}`}>
      <nav aria-label="Exercise Progress">
        <ol className="flex items-center justify-between w-full">
          {STEPS.map((step, idx) => {
            const isCompleted = idx < currentIndex;
            const isCurrent = idx === currentIndex;
            const isUpcoming = idx > currentIndex;
            const Icon = step.icon;

            const isClickable = allowStepClick && (isCompleted || isCurrent);

            return (
              <li
                key={step.id}
                className={`relative flex items-center flex-1 ${
                  idx !== STEPS.length - 1 ? "pr-2 sm:pr-4" : ""
                }`}
              >
                <div
                  role={isClickable ? "button" : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onClick={() => {
                    if (isClickable && onStepClick) {
                      onStepClick(step.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (isClickable && (e.key === "Enter" || e.key === " ") && onStepClick) {
                      e.preventDefault();
                      onStepClick(step.id);
                    }
                  }}
                  className={`flex items-center gap-2 sm:gap-3 group select-none text-left transition-colors ${
                    isClickable ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  {/* Step Icon / Circle */}
                  <div
                    className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm flex-shrink-0 transition-all ${
                      isCompleted
                        ? "bg-emerald-600 text-white shadow-sm"
                        : isCurrent
                        ? "bg-indigo-600 text-white ring-4 ring-indigo-50 shadow-sm"
                        : "bg-slate-100 text-slate-400 border border-slate-200"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                    ) : (
                      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                  </div>

                  {/* Step Labels */}
                  <div className="min-w-0">
                    <p
                      className={`text-xs sm:text-sm font-semibold truncate leading-tight ${
                        isCurrent
                          ? "text-indigo-600"
                          : isCompleted
                          ? "text-slate-800"
                          : "text-slate-400"
                      }`}
                    >
                      {step.label}
                    </p>
                    <p className="hidden md:block text-[11px] text-slate-400 truncate mt-0.5">
                      {step.sublabel}
                    </p>
                  </div>
                </div>

                {/* Connector Line to next step */}
                {idx !== STEPS.length - 1 && (
                  <div className="flex-1 ml-2 sm:ml-4 h-0.5 bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        idx < currentIndex ? "bg-emerald-500 w-full" : "w-0"
                      }`}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
