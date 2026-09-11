import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/ui/Button";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Award,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
} from "lucide-react";

export function ViewSLPProfilePage() {
  const { slpId } = useParams<{ slpId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [slp, setSlp] = useState<any | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "pending" | "none">("none");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSLPData() {
      if (!slpId) return;
      try {
        setLoading(true);

        // 1. Fetch SLP profile by id or user_id
        let query = (supabase.from("slps") as any)
          .select("id, user_id, full_name, professional_title, specialization, organization, profile_image, bio, qualification, years_of_experience");

        // Check if slpId is a UUID
        const { data: slpData, error: slpError } = await query
          .or(`id.eq.${slpId},user_id.eq.${slpId}`)
          .maybeSingle();

        if (slpError) throw slpError;
        setSlp(slpData);

        // 2. Check connection status if patient is logged in
        if (profile?.id && slpData?.id) {
          // Check active assignment
          const { data: assignment } = await (supabase.from("patient_assignments") as any)
            .select("id, status")
            .eq("patient_id", profile.id)
            .eq("slp_id", slpData.id)
            .eq("status", "ACTIVE")
            .maybeSingle();

          if (assignment) {
            setConnectionStatus("connected");
          } else {
            // Check pending request
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
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-2xs space-y-6">
        {/* Header: Photo, Name, Specialization & Status */}
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
              <p className="text-xs text-indigo-600 font-medium">
                {slp.specialization || "Voice & Fluency Disorders"}
              </p>
            </div>
          </div>

          {/* Connection Status Badge */}
          <div className="sm:self-start">
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
      </div>
    </div>
  );
}
