import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Brain,
  ShieldAlert,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  FileText,
  Activity,
  Layers,
  Sparkles,
  Award,
  ChevronRight
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import {
  DatasetInfo,
  EvaluationReport,
  DISFLUENCY_SPEECH_METADATA
} from "../../types/evaluation";

export function DisfluencyEvaluationPage() {
  const [datasetInfo, setDatasetInfo] = useState<DatasetInfo>(DISFLUENCY_SPEECH_METADATA);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningEval, setRunningEval] = useState(false);
  const [sampleLimit, setSampleLimit] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const fetchDatasetInfo = async () => {
    try {
      const res = await fetch("/api/dev/eval/dataset-info");
      if (res.ok) {
        const json = await res.json();
        if (json.dataset) setDatasetInfo(json.dataset);
      }
    } catch (err: any) {
      console.warn("Using local dataset info:", err);
    }
  };

  const fetchLatestReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/eval/latest-report");
      if (res.ok) {
        const json = await res.json();
        if (json.report) {
          setReport(json.report);
        }
      } else {
        throw new Error("Failed to load evaluation report.");
      }
    } catch (err: any) {
      setError(err.message || "Could not retrieve evaluation report.");
    } finally {
      setLoading(false);
    }
  };

  const handleRunEvaluation = async () => {
    setRunningEval(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/eval/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: sampleLimit }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.report) {
          setReport(json.report);
        }
      } else {
        throw new Error("Evaluation run failed.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to execute evaluation run.");
    } finally {
      setRunningEval(false);
    }
  };

  useEffect(() => {
    fetchDatasetInfo();
    fetchLatestReport();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Link to="/slp/workflows" className="hover:text-indigo-600 transition-colors">
            SLP Workflows
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to="/admin/users" className="hover:text-indigo-600 transition-colors">
            Admin
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-slate-800 font-semibold">Hugging Face DisfluencySpeech Evaluation</span>
        </div>

        {/* Page Header */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 shrink-0">
              <Brain className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900">
                  ML Evaluation: DisfluencySpeech Benchmark
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Apache-2.0
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  Dev/Eval Only
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed max-w-3xl">
                Development-only benchmarking pipeline for <code className="text-indigo-600 font-mono">amaai-lab/DisfluencySpeech</code>.
                Evaluates SpeakEase's transcription Word Error Rate (WER) and disfluency event detection against reference annotations.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1 border border-slate-200 text-xs font-medium">
              {[3, 5, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSampleLimit(num)}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    sampleLimit === num
                      ? "bg-white text-indigo-600 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {num} samples
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchLatestReport}
              disabled={loading || runningEval}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Button
              size="sm"
              onClick={handleRunEvaluation}
              disabled={runningEval}
              className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {runningEval ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Running Pipeline...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Run Benchmark
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Safety & Clinical Separation Banner */}
        <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3 text-amber-900 text-xs">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-950">Safety &amp; Clinical Data Isolation</p>
            <p className="text-amber-800 leading-relaxed">
              Research dataset samples and evaluation labels are strictly isolated in memory and development structures.
              Under no circumstances are external research samples written to patient session history, clinical progress, or used as patient diagnoses.
              No patient data is ever transmitted to Hugging Face.
            </p>
          </div>
        </div>

        {/* Practice Library Assessment Banner */}
        <div className="bg-indigo-50/70 border border-indigo-200/70 rounded-2xl p-4 flex items-start gap-3 text-indigo-950 text-xs">
          <Info className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-indigo-900">Practice Library Integration Assessment</p>
            <p className="text-indigo-800 leading-relaxed">
              <strong>Patient-Facing Practice Status: DEFERRED.</strong> While the Apache-2.0 license permits redistribution,
              DisfluencySpeech consists of informal 1990s telephone chit-chat containing intentional simulated speech errors.
              Presenting simulated stumbles to patients disrupts fluency-shaping therapy targets. SpeakEase retains its curated therapeutic passages
              (<code className="font-mono text-indigo-700">src/lib/practiceContent.ts</code>) focused on gentle vocal onset, relaxed breathing, and continuous phrasing.
            </p>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Dataset Metadata Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-1">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <Layers className="h-4 w-4 text-indigo-600" />
              Dataset &amp; Provenance
            </div>
            <p className="text-base font-bold text-slate-900">{datasetInfo.name}</p>
            <p className="text-xs text-slate-500">
              {datasetInfo.speechType === "recreated_studio_actor"
                ? "Recreated speech (single studio actor reciting Switchboard utterances)"
                : "Spontaneous speech"}
            </p>
            <p className="text-[11px] text-slate-400 font-mono mt-1">arXiv:{datasetInfo.arxivId}</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-1">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <Activity className="h-4 w-4 text-emerald-600" />
              Audio Specs &amp; Splits
            </div>
            <p className="text-base font-bold text-slate-900">
              {datasetInfo.samplingRateHz.toLocaleString()} Hz .WAV
            </p>
            <p className="text-xs text-slate-500">
              ~{datasetInfo.totalHours} hrs total ({datasetInfo.splits.train.toLocaleString()} train / {datasetInfo.splits.validation} val / {datasetInfo.splits.test} test)
            </p>
            <p className="text-[11px] text-emerald-600 font-semibold mt-1">Single Samson Q2U microphone</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-1">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <FileText className="h-4 w-4 text-indigo-600" />
              Multi-Tier Ground Truth
            </div>
            <p className="text-base font-bold text-slate-900">4 Reference Transcripts</p>
            <p className="text-xs text-slate-500">
              Annotated tags ({`{F }`}, {`{D }`}, [ + ]), Verbatim (A), Filtered (B), Fluent Target (C)
            </p>
            <p className="text-[11px] text-indigo-600 font-semibold mt-1">Full paralanguage annotations</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-1">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <Clock className="h-4 w-4 text-amber-600" />
              Timestamp Schema Status
            </div>
            <p className="text-base font-bold text-amber-900">Unavailable in Tabular</p>
            <p className="text-xs text-slate-500">
              Row records lack millisecond event boundaries. Timestamp alignment requires external MFA TextGrids.
            </p>
            <p className="text-[11px] text-amber-700 font-semibold mt-1">Documented limitation</p>
          </div>
        </div>

        {/* Aggregate Benchmark Results */}
        {report && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Award className="h-5 w-5 text-indigo-600" />
                  SpeakEase Pipeline Benchmark Metrics ({report.sampleCount} Samples)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Last evaluated: {new Date(report.timestamp).toLocaleString()}
                </p>
              </div>

              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                Whisper Turbo + Groq + Acoustic Frame Analyzer
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-center">
                <span className="text-[11px] font-semibold uppercase text-slate-500">WER vs Raw (A)</span>
                <p className="text-2xl font-black text-slate-900">
                  {(report.aggregateMetrics.meanWerRawA * 100).toFixed(1)}%
                </p>
                <p className="text-[11px] text-slate-500">Verbatim with disfluencies</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-center">
                <span className="text-[11px] font-semibold uppercase text-slate-500">WER vs Fluent Target (C)</span>
                <p className="text-2xl font-black text-indigo-600">
                  {(report.aggregateMetrics.meanWerFluentC * 100).toFixed(1)}%
                </p>
                <p className="text-[11px] text-slate-500">Cleaned target comparison</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-center">
                <span className="text-[11px] font-semibold uppercase text-slate-500">Disfluency Precision</span>
                <p className="text-2xl font-black text-emerald-600">
                  {(report.aggregateMetrics.overallPrecision * 100).toFixed(1)}%
                </p>
                <p className="text-[11px] text-slate-500">
                  TP: {report.aggregateMetrics.totalTruePositives} | FP: {report.aggregateMetrics.totalFalsePositives}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-center">
                <span className="text-[11px] font-semibold uppercase text-slate-500">Disfluency F1 Score</span>
                <p className="text-2xl font-black text-indigo-700">
                  {(report.aggregateMetrics.overallF1 * 100).toFixed(1)}%
                </p>
                <p className="text-[11px] text-slate-500">
                  Recall: {(report.aggregateMetrics.overallRecall * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Per-Sample Comparison Table */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Sample-Level Ground Truth vs. Pipeline Predictions
              </h3>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-3 px-4">Sample</th>
                      <th className="py-3 px-4">Ground Truth Transcript</th>
                      <th className="py-3 px-4">Pipeline Hypothesis</th>
                      <th className="py-3 px-4 text-center">WER (A / C)</th>
                      <th className="py-3 px-4 text-center">GT Events</th>
                      <th className="py-3 px-4 text-center">Detected</th>
                      <th className="py-3 px-4 text-center">F1</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.sampleResults.map((s, idx) => (
                      <tr key={s.sampleId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-slate-600 whitespace-nowrap">
                          #{idx + 1}
                        </td>
                        <td className="py-3 px-4 max-w-xs leading-relaxed">
                          <p className="font-mono text-[11px] text-indigo-900 bg-indigo-50/50 p-1.5 rounded-lg border border-indigo-100/60">
                            {s.referenceTextA}
                          </p>
                          {s.groundTruthDisfluencies.totalCount > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1 text-[10px]">
                              {s.groundTruthDisfluencies.filledPauses.map((fp, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">
                                  {`{F ${fp}}`}
                                </span>
                              ))}
                              {s.groundTruthDisfluencies.discourseMarkers.map((dm, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800">
                                  {`{D ${dm}}`}
                                </span>
                              ))}
                              {s.groundTruthDisfluencies.restarts.map((rst, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-800">
                                  restart
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-xs leading-relaxed">
                          <p className="text-slate-800">
                            {s.hypothesisTranscript}
                          </p>
                          {s.observations.length > 0 && (
                            <p className="text-[10px] text-slate-400 mt-0.5 italic">
                              {s.observations[0]}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap font-mono font-semibold">
                          <span className="text-slate-700">{(s.werVsRawA * 100).toFixed(0)}%</span>
                          <span className="text-slate-300 mx-1">/</span>
                          <span className="text-indigo-600">{(s.werVsFluentC * 100).toFixed(0)}%</span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-700">
                          {s.groundTruthDisfluencies.totalCount}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-indigo-600">
                          {s.detectedRepetitions + (s.detectedPauses > 0 ? 1 : 0)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            s.f1 >= 0.7
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : s.f1 >= 0.4
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}>
                            {(s.f1 * 100).toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Technical Findings & Limitations Section */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            Engineering Evaluation Findings &amp; Next Steps
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 leading-relaxed">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <p className="font-bold text-slate-900">ASR Normalization vs. Disfluency Preservation</p>
              <p>
                Standard Whisper models frequently perform implicit text normalization, automatically omitting filled pauses
                like "uh" and "um". This increases WER against verbatim reference <code className="font-mono">transcript_a</code>,
                while yielding lower WER against <code className="font-mono">transcript_c</code> (fluent target).
                SpeakEase's acoustic frame analyzer bridges this gap by directly measuring pauses and syllable repetitions from raw audio frames.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <p className="font-bold text-slate-900">Clinical Non-Equivalence &amp; Next Steps</p>
              <p>
                Because DisfluencySpeech relies on simulated actor speech, it cannot replace spontaneous stuttering evaluation sets
                (such as SEP-28k or FluencyBank). For Phase 2, we recommend:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Evaluating real clinical stuttering corpora (SEP-28k) for pathological disfluency types.</li>
                <li>Integrating Montreal Forced Aligner (MFA) TextGrids if millisecond timestamp benchmarks are required.</li>
                <li>Maintaining the separate therapeutic passage library for patient practice.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
