import { PRACTICE_LEVEL_STEPS, calculatePracticeLevel } from '../lib/practiceLevel';

interface PracticeLevelMeterProps {
  metrics?: {
    repetitions?: number | null;
    pauses?: number | null;
    prolongations?: number | null;
    speech_rate?: number | string | null;
  } | null;
  practiceLevel?: string | null;
  className?: string;
}

export function PracticeLevelMeter({ metrics, practiceLevel, className = '' }: PracticeLevelMeterProps) {
  let result = calculatePracticeLevel(metrics);

  // Fallback to restored practiceLevel from session record if metrics object isn't full
  if (!result && practiceLevel) {
    const stepIdx = PRACTICE_LEVEL_STEPS.indexOf(practiceLevel as any);
    if (stepIdx !== -1) {
      const score = stepIdx + 1;
      let desc = 'Based on automated speech parameters for this session.';
      if (score === 4) desc = 'Steady pacing and smooth speech flow observed during this practice session.';
      else if (score === 3) desc = 'Good speech control with minor hesitations observed.';
      else if (score === 2) desc = 'Consistent practice will help build pacing and reduce pauses.';
      else if (score === 1) desc = 'Focus on relaxed breathing and taking your time between sentences.';

      result = {
        level: practiceLevel as any,
        score,
        description: desc
      };
    }
  }

  // Strictly do not render if real analysis has not completed
  if (!result) {
    return null;
  }

  const activeIndex = Math.max(0, Math.min(3, result.score - 1));

  // Marker percentage along the horizontal track (0%, 33.33%, 66.67%, 100%)
  const positionPercentages = [0, 33.333, 66.667, 100];
  const activePercentage = positionPercentages[activeIndex];

  const getLevelTheme = (index: number) => {
    switch (index) {
      case 3: // Strong Progress
        return {
          markerBorder: 'border-emerald-500',
          markerDot: 'bg-emerald-500',
          badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          activeText: 'text-emerald-900 font-semibold',
          trackFill: 'from-amber-300 via-sky-300 via-indigo-400 to-emerald-500'
        };
      case 2: // Good Progress
        return {
          markerBorder: 'border-indigo-500',
          markerDot: 'bg-indigo-500',
          badge: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          activeText: 'text-indigo-900 font-semibold',
          trackFill: 'from-amber-300 via-sky-300 to-indigo-500'
        };
      case 1: // Developing
        return {
          markerBorder: 'border-sky-500',
          markerDot: 'bg-sky-500',
          badge: 'bg-sky-50 text-sky-800 border-sky-200',
          activeText: 'text-sky-900 font-semibold',
          trackFill: 'from-amber-300 to-sky-400'
        };
      case 0: // Needs Practice
      default:
        return {
          markerBorder: 'border-amber-500',
          markerDot: 'bg-amber-500',
          badge: 'bg-amber-50 text-amber-800 border-amber-200',
          activeText: 'text-amber-900 font-semibold',
          trackFill: 'bg-amber-400'
        };
    }
  };

  const currentTheme = getLevelTheme(activeIndex);

  return (
    <div 
      id="practice-level-meter" 
      className={`p-6 rounded-xl border border-slate-200 bg-white shadow-xs space-y-6 ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">Practice Level</h3>
          <p className="text-xs text-slate-500">Continuous progression based on this session's speech analysis.</p>
        </div>
        <span 
          id="practice-level-badge" 
          className={`self-start sm:self-auto inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${currentTheme.badge}`}
        >
          {result.level}
        </span>
      </div>

      {/* Horizontal Progress Meter */}
      <div className="space-y-4 pt-2 pb-1">
        {/* The Track Container */}
        <div className="relative px-2">
          {/* Base Background Track with subtle low-to-high color progression */}
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
            {/* Soft gradient background indicating low to high progression */}
            <div className="absolute inset-0 bg-gradient-to-r from-amber-100 via-sky-100 via-indigo-100 to-emerald-100 opacity-70" />
            
            {/* Active filled portion up to current level */}
            <div 
              className={`h-full bg-gradient-to-r ${currentTheme.trackFill} transition-all duration-500 rounded-full`}
              style={{ width: `${activePercentage}%` }}
            />
          </div>

          {/* Step Tick Marks along the track */}
          <div className="absolute top-1/2 -translate-y-1/2 left-2 right-2 flex justify-between pointer-events-none">
            {PRACTICE_LEVEL_STEPS.map((_, idx) => {
              const isPastOrCurrent = idx <= activeIndex;
              return (
                <div 
                  key={idx} 
                  className={`w-2 h-2 rounded-full transition-colors ${
                    isPastOrCurrent ? 'bg-white shadow-xs ring-1 ring-black/10' : 'bg-slate-300'
                  }`} 
                />
              );
            })}
          </div>

          {/* Active Level Marker / Indicator Pin */}
          <div 
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-500 pointer-events-none z-10"
            style={{ 
              left: `calc(${activePercentage}% + ${8 - (activePercentage * 16) / 100}px)` 
            }}
          >
            <div className={`w-6 h-6 rounded-full bg-white border-2 ${currentTheme.markerBorder} shadow-md flex items-center justify-center ring-4 ring-white`}>
              <div className={`w-2.5 h-2.5 rounded-full ${currentTheme.markerDot}`} />
            </div>
          </div>
        </div>

        {/* Labels below the horizontal track */}
        <div className="grid grid-cols-4 pt-2">
          {PRACTICE_LEVEL_STEPS.map((stepName, idx) => {
            const isCurrent = idx === activeIndex;
            const alignClass = 
              idx === 0 
                ? 'text-left' 
                : idx === 3 
                ? 'text-right' 
                : 'text-center';

            return (
              <div key={stepName} className={`${alignClass} flex flex-col`}>
                <span 
                  className={`text-xs transition-colors ${
                    isCurrent 
                      ? `${currentTheme.activeText} font-semibold` 
                      : 'text-slate-500 font-normal'
                  }`}
                >
                  {stepName}
                </span>
                {isCurrent && (
                  <span className="text-[10px] font-medium text-slate-400 mt-0.5">
                    Current
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Clinical Practice Description */}
      <div className="text-xs text-slate-600 bg-slate-50 p-3.5 rounded-lg border border-slate-100 leading-relaxed">
        {result.description}
      </div>
    </div>
  );
}
