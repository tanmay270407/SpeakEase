import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/ui/Button";
import { reviewService, SLPRatingSummary } from "../../services/reviewService";
import { SLPRatingBadge } from "../../components/slp/SLPRatingBadge";
import { RateSLPModal } from "../../components/slp/RateSLPModal";
import { SLPReview } from "../../types/supabase";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Award,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  Star,
  MessageSquare,
  Sparkles,
} from "lucide-react";

export function ViewSLPProfilePage() {
  const { slpId } = useParams<{ slpId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [slp, setSlp] = useState<any | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "pending" | "none">("none");
  const [loading, setLoading] = useState(true);

  // Ratings & Reviews state
  const [ratingSummary, setRatingSummary] = useState<SLPRatingSummary | null>(null);
  const [reviews, setReviews] = useState<SLPReview[]>([]);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [ratableSessionId, setRatableSessionId] = useState<string | null>(null);

  const loadRatingsAndReviews = async (currentSlpId: string) => {
    try {
      const summary = await reviewService.getSLPRatingSummary(currentSlpId);
      setRatingSummary(summary);

      const list = await reviewService.getSLPReviews(currentSlpId);
      setReviews(list);
    } catch (err) {
      console.error("Error loading ratings:", err);
    }
  };

  useEffect(() => {
    async function loadSLPData() {
      if (!slpId) return;
      try {
        setLoading(true);

        // 1. Fetch SLP profile by id or user_id
        let query = (supabase.from("slps") as any)
          .select("id, user_id, full_name, professional_title, specialization, organization, profile_image, bio, qualification, years_of_experience");

        const { data: slpData, error: slpError } = await query
          .or(`id.eq.${slpId},user_id.eq.${slpId}`)
          .maybeSingle();

        if (slpError) throw slpError;
        setSlp(slpData);

        if (slpData?.id) {
          await loadRatingsAndReviews(slpData.id);

          // 2. Check connection status & check if patient has completed sessions to rate
          if (profile?.id) {
            const { data: assignment } = await (supabase.from("patient_assignments") as any)
              .select("id, status")
              .eq("patient_id", profile.id)
              .eq("slp_id", slpData.id)
              .eq("status", "ACTIVE")
              .maybeSingle();

            if (assignment) {
              setConnectionStatus("connected");

              // Check for completed live session for rating
              const { data: completedLiveSess } = await (supabase.from("live_sessions") as any)
                .select("id")
                .eq("patient_id", profile.id)
                .eq("slp_id", slpData.id)
                .eq("status", "completed")
                .order("scheduled_start", { ascending: false })
                .limit(5);

              if (completedLiveSess && completedLiveSess.length > 0) {
                // Find one that hasn't been rated yet
                for (const s of completedLiveSess) {
                  const existingRev = await reviewService.getReviewForSession(s.id);
                  if (!existingRev) {
                    setRatableSessionId(s.id);
                    break;
                  }
                }
              }
            } else {
              const { data: pendingReq } = await (supabase.from("connection_requests") as any)
                .select("id, status")
                .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${slpData.user_id}),and(sender_id.eq.${slpData.user_id},receiver_id.eq.${profile.id})`)
                .eq("status", "pending")
                .maybeSingle();

              if (pendingReq) {
                setConnectionStatus("pending");
              } else {
                setConnectionStatus("none");
              }
            }
          }
        }
      } catch (err: any) {
        console.error("Error loading SLP profile:", err);
      } finally {
        setLoading(false);
      }
    }

    loadSLPData();
  }, [slpId, profile?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!slp) {
    return (
      <div className="max-w-2xl mx-auto py-8 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-slate-300 mx-auto" />
        <h2 className="text-lg font-semibold text-slate-800">Clinician Profile Not Found</h2>
        <p className="text-sm text-slate-500">The requested clinician profile could not be loaded.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="mt-2">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-6">
      {/* Back button */}
      <div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>
      </div>

      {/* Main SLP Profile Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-2xs space-y-6">
        {/* Header: Photo, Name, Specialization, Rating & Status */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar
              src={slp.profile_image}
              name={slp.full_name}
              size="xl"
              theme="teal"
            />
            <div className="space-y-1 pt-1">
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                {slp.full_name}
              </h1>
              <p className="text-sm font-medium text-slate-600">
                {slp.professional_title || "Speech-Language Pathologist"}
              </p>
              <p className="text-xs text-indigo-600 font-medium pb-1">
                {slp.specialization || "Voice & Fluency Disorders"}
              </p>

              {/* Real Overall Rating Display */}
              <SLPRatingBadge
                averageRating={ratingSummary?.averageRating ?? null}
                reviewCount={ratingSummary?.reviewCount ?? 0}
                badge={ratingSummary?.badge ?? null}
                size="md"
              />
            </div>
          </div>

          {/* Connection Status Badge & Rate Trigger */}
          <div className="sm:self-start flex flex-col items-end gap-2">
            {connectionStatus === "connected" ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Connected
              </span>
            ) : connectionStatus === "pending" ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Request Pending
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
                Available Clinician
              </span>
            )}

            {ratableSessionId && (
              <Button
                size="sm"
                onClick={() => setRateModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 px-3.5 shadow-xs font-semibold mt-1"
              >
                <Star className="w-3.5 h-3.5 mr-1 fill-amber-300 text-amber-300" />
                Rate Recent Session
              </Button>
            )}
          </div>
        </div>

        {/* About / Bio */}
        <div className="pt-5 border-t border-slate-100">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">About</h2>
          <p className="text-sm text-slate-700 mt-2 leading-relaxed">
            {slp.bio || "Helping people build confidence through structured speech practice."}
          </p>
        </div>

        {/* Qualifications */}
        <div className="pt-5 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <BookOpen className="w-3.5 h-3.5 text-teal-600" />
            <span>Qualifications</span>
          </div>
          <p className="text-sm font-medium text-slate-800 mt-2">
            {slp.qualification || "MSc Speech-Language Pathology"}
          </p>
        </div>

        {/* Experience */}
        <div className="pt-5 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5 text-teal-600" />
            <span>Experience</span>
          </div>
          <p className="text-sm font-medium text-slate-800 mt-2">
            {slp.years_of_experience || "7+ years"}
          </p>
        </div>

        {/* Patient Reviews Section */}
        <div className="pt-6 border-t border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                Patient Feedback & Reviews
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ratings represent authentic patient experience and completed session feedback.
              </p>
            </div>
            {ratingSummary && ratingSummary.reviewCount > 0 && (
              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100">
                ⭐ {ratingSummary.averageRating} / 5.0
              </span>
            )}
          </div>

          {reviews.length === 0 ? (
            <div className="p-6 rounded-xl bg-slate-50/80 border border-slate-100 text-center space-y-1">
              <p className="text-xs font-semibold text-slate-700">No ratings yet</p>
              <p className="text-[11px] text-slate-400">
                Be the first patient to complete a session and share feedback for {slp.full_name}.
              </p>
            </div>
          ) : (
            <div className="space-y-3 divide-y divide-slate-100">
              {reviews.map((rev) => {
                const patientName = rev.patient?.full_name || "Verified Patient";
                const dateStr = new Date(rev.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
                return (
                  <div key={rev.id} className="pt-3 first:pt-0 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-semibold text-slate-800">
                        <Avatar src={rev.patient?.avatar_url} name={patientName} size="sm" />
                        <span>{patientName}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">{dateStr}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${
                            star <= rev.rating
                              ? "fill-amber-400 text-amber-400"
                              : "text-slate-200"
                          }`}
                        />
                      ))}
                    </div>

                    {rev.review && (
                      <p className="text-xs text-slate-600 leading-relaxed bg-slate-50/60 p-2.5 rounded-lg border border-slate-100 italic">
                        "{rev.review}"
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Rate SLP Modal */}
      {rateModalOpen && ratableSessionId && (
        <RateSLPModal
          isOpen={rateModalOpen}
          onClose={() => setRateModalOpen(false)}
          slpId={slp.id}
          slpName={slp.full_name}
          slpTitle={slp.professional_title}
          slpImage={slp.profile_image}
          sessionId={ratableSessionId}
          onSuccess={() => {
            if (slp.id) loadRatingsAndReviews(slp.id);
          }}
        />
      )}
    </div>
  );
}

