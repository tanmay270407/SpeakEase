import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Practice",
    description: "Build a routine with exercises you can do at your own pace.",
    icon: AudioLines,
  },
  {
    number: "02",
    title: "Review",
    description: "Bring your practice into the conversation with your SLP.",
    icon: HeartHandshake,
  },
  {
    number: "03",
    title: "Keep going",
    description: "Notice your progress and choose what to work on next.",
    icon: TrendingUp,
  },
];

export function LandingPage() {
  return (
    <div id="top" className="relative isolate flex-1 overflow-hidden bg-[#f8f9fc] text-slate-900">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-48 -top-40 -z-10 h-[34rem] w-[34rem] rounded-full bg-indigo-200/30 blur-3xl"
      />

      <section className="mx-auto grid w-full max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:px-12 lg:pb-28 lg:pt-24">
        <div className="max-w-2xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3.5 py-2 text-sm font-medium text-indigo-700 shadow-sm shadow-indigo-950/[0.03]">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            A little practice goes a long way
          </div>

          <h1 className="text-[2.8rem] font-semibold leading-[1.06] tracking-[-0.055em] text-slate-950 sm:text-6xl lg:text-[4.5rem]">
            Your voice. Your pace. Your way.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl">
            Make space for speech practice in your day, with thoughtful tools
            and support from your speech-language pathologist.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/signup"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-600/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300"
            >
              Get started
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to="/slp"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-base font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
            >
              I’m a clinician
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              Your clinician stays in the loop
            </span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
            <Link
              to="/login"
              className="font-semibold text-indigo-700 underline decoration-indigo-200 underline-offset-4 transition hover:text-indigo-800 hover:decoration-indigo-500"
            >
              Already have an account? Log in
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:ml-auto">
          <div className="absolute -inset-5 -z-10 rounded-[2.5rem] bg-gradient-to-br from-indigo-200/70 via-sky-100/60 to-violet-200/70 blur-2xl" />
          <div className="overflow-hidden rounded-[1.75rem] border border-white/80 bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 p-5 shadow-2xl shadow-indigo-950/15 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-indigo-100">YOUR PRACTICE SPACE</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  Progress at your pace
                </h2>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20">
                <AudioLines className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>

            <div className="mt-7 rounded-2xl border border-white/70 bg-white p-5 shadow-xl shadow-indigo-950/10 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">A simple rhythm</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">Practice, reflect, repeat</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Your journey
                </span>
              </div>

              <div
                aria-label="Decorative sound wave"
                className="mt-6 flex h-24 items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-indigo-50/80 px-4"
              >
                {[22, 36, 52, 31, 66, 44, 76, 48, 34, 61, 40, 72, 47, 28, 56, 36, 64, 43, 25, 50, 34, 61, 41, 29, 54, 37].map(
                  (height, index) => (
                    <span
                      key={index}
                      aria-hidden="true"
                      className={`w-1.5 shrink-0 rounded-full ${
                        index < 15 ? "bg-indigo-500" : "bg-indigo-200"
                      }`}
                      style={{ height: `${height}%` }}
                    />
                  ),
                )}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {steps.map((step, index) => (
                  <div
                    key={step.number}
                    className={`rounded-xl p-3 ${
                      index === 0 ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-600"
                    }`}
                  >
                    <step.icon className="h-4 w-4" aria-hidden="true" />
                    <p className="mt-2 text-xs font-semibold sm:text-sm">{step.title}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3 px-1 text-sm leading-6 text-indigo-100">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
                <HeartHandshake className="h-4 w-4" aria-hidden="true" />
              </span>
              Practice is yours. Your care stays personal.
            </div>
          </div>
          <div className="absolute -bottom-5 -left-4 hidden items-center gap-2 rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-lg shadow-slate-900/5 sm:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            Clinician-guided care
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="border-t border-slate-200/80 bg-white/80 px-5 py-16 sm:px-8 sm:py-20 lg:px-12"
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">
                Made to fit real life
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
                Support for every step.
              </h2>
              <p className="mt-3 max-w-xl leading-7 text-slate-600">
                Keep practice approachable, connected, and focused on what
                matters to you.
              </p>
            </div>
            <a
              href="#top"
              className="hidden items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-800 sm:inline-flex"
            >
              Back to top
              <ArrowDown className="h-4 w-4 rotate-180" aria-hidden="true" />
            </a>
          </div>

          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {steps.map((step) => (
              <article
                key={step.number}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-950/[0.06]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 transition group-hover:bg-indigo-600 group-hover:text-white">
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold tracking-wide text-slate-300">
                    {step.number}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 leading-7 text-slate-600">{step.description}</p>
              </article>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-4 rounded-2xl bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                SpeakEase is a practice support tool, not a medical device or a
                substitute for care from a qualified professional.
              </p>
            </div>
            <Link
              to="/signup"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
            >
              Start practicing
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
