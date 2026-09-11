import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { connectionService } from "../../services/connectionService";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/ui/Button";
import { uploadAvatar } from "../../lib/avatarUpload";
import {
  Edit3,
  Camera,
  Check,
  Stethoscope,
  ChevronRight,
  Target,
  Sparkles,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";

export function PatientProfilePage() {
  const { user, profile, refreshProfile } = useAuth();

  const [connectedSLP, setConnectedSLP] = useState<any | null>(null);
  const [loadingSLP, setLoadingSLP] = useState(true);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [practiceGoal, setPracticeGoal] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state from profile
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setBio(profile.bio || "");
      setPracticeGoal(profile.practice_goal || "");
      setAvatarUrl(profile.avatar_url || null);
    }
  }, [profile]);

  // Load connected SLP
  useEffect(() => {
    let isMounted = true;
    async function loadSLP() {
      if (!profile?.id) return;
      try {
        setLoadingSLP(true);
        const data = await connectionService.getPatientActiveSLP(profile.id);
        if (isMounted) {
          setConnectedSLP(data?.slps || null);
        }
      } catch (e) {
        console.error("Error loading connected SLP:", e);
      } finally {
        if (isMounted) setLoadingSLP(false);
      }
    }
    loadSLP();
    return () => {
      isMounted = false;
    };
  }, [profile?.id]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    try {
      setUploadingImage(true);
      setFeedback(null);
      const res = await uploadAvatar(file, user.id);
      if (res.error) {
        setFeedback({ type: "error", message: res.error });
      } else {
        setAvatarUrl(res.url);
        setFeedback({ type: "success", message: "Profile picture uploaded. Click Save Changes to keep." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to upload image." });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    try {
      setSaving(true);
      setFeedback(null);

      const updates: any = {
        full_name: fullName.trim() || profile?.full_name || "User",
        bio: bio.trim(),
        practice_goal: practiceGoal.trim(),
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      };

      const { error } = await (supabase
        .from("profiles") as any)
        .update(updates)
        .eq("id", user.id);

      if (error) throw error;

      await refreshProfile();
      setIsEditing(false);
      setFeedback({ type: "success", message: "Profile updated successfully." });
    } catch (err: any) {
      console.error("Save profile error:", err);
      setFeedback({ type: "error", message: err.message || "Failed to save profile." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Patient Profile</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your personal speech practice information</p>
        </div>
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsEditing(true);
              setFeedback(null);
            }}
            className="text-xs h-9 gap-1.5 border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg"
            id="edit-profile-btn"
          >
            <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
            Edit Profile
          </Button>
        )}
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
          role="status"
        >
          {feedback.type === "success" ? (
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Edit Profile Form */}
      {isEditing ? (
        <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-semibold text-slate-900">Edit Your Information</h2>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-slate-400 hover:text-slate-600 p-1"
              aria-label="Close edit"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Picture Upload */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar
                src={avatarUrl}
                name={fullName || profile?.full_name}
                size="lg"
                theme="indigo"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="absolute bottom-0 right-0 bg-indigo-600 text-white p-1.5 rounded-full shadow-md hover:bg-indigo-700 transition-colors disabled:opacity-50 cursor-pointer"
                title="Upload profile picture"
                id="patient-avatar-upload-btn"
              >
                {uploadingImage ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleImageSelect}
                className="hidden"
                id="patient-avatar-file-input"
              />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">Profile Picture</p>
              <p className="text-xs text-slate-500 mt-0.5">PNG, JPG, or WebP up to 5MB</p>
            </div>
          </div>

          {/* Full Name */}
          <div className="space-y-1.5">
            <label htmlFor="patient-fullname" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Full Name
            </label>
            <input
              id="patient-fullname"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
              placeholder="e.g. Alex Morgan"
            />
          </div>

          {/* Short Bio */}
          <div className="space-y-1.5">
            <label htmlFor="patient-bio" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Short Bio
            </label>
            <textarea
              id="patient-bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
              placeholder="A brief note about your speech journey..."
            />
          </div>

          {/* Practice Goal */}
          <div className="space-y-1.5">
            <label htmlFor="patient-practice-goal" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Practice Goal
            </label>
            <input
              id="patient-practice-goal"
              type="text"
              value={practiceGoal}
              onChange={(e) => setPracticeGoal(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
              placeholder="e.g. Improve voice projection and decrease speaking pauses"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(false)}
              disabled={saving}
              className="text-slate-600 hover:text-slate-900"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || uploadingImage}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
              id="save-patient-profile-btn"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save Changes
            </Button>
          </div>
        </form>
      ) : (
        /* Minimal View Patient Profile */
        <div className="space-y-8">
          {/* Main Profile Info */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
            <div className="flex items-start gap-4">
              <Avatar
                src={profile?.avatar_url}
                name={profile?.full_name}
                size="lg"
                theme="indigo"
              />
              <div className="space-y-1 min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-slate-900 leading-tight">
                  {profile?.full_name || "Patient User"}
                </h2>
                <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100/80">
                  Patient
                </div>
              </div>
            </div>

            {/* Bio */}
            <div className="mt-6 pt-5 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">About</p>
              <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
                {profile?.bio || (
                  <span className="text-slate-400 italic">No bio added yet. Click Edit Profile to add one.</span>
                )}
              </p>
            </div>

            {/* Practice Goal */}
            <div className="mt-5 pt-5 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 uppercase tracking-wider">
                <Target className="w-3.5 h-3.5 text-indigo-500" />
                <span>Practice Goal</span>
              </div>
              <p className="text-sm text-slate-700 mt-1.5 font-medium">
                {profile?.practice_goal || (
                  <span className="text-slate-400 italic font-normal">
                    Improve fluency, pacing, and overall speech confidence.
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Connected SLP Section */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-semibold text-slate-900">My SLP</h3>
              </div>
              {connectedSLP && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Connected
                </span>
              )}
            </div>

            {loadingSLP ? (
              <div className="flex items-center justify-center py-6 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading connected SLP...
              </div>
            ) : connectedSLP ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3.5 min-w-0">
                  <Avatar
                    src={connectedSLP.profile_image}
                    name={connectedSLP.full_name}
                    size="md"
                    theme="teal"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {connectedSLP.full_name}
                    </p>
                    <p className="text-xs text-slate-600 truncate">
                      {connectedSLP.professional_title || "Speech-Language Pathologist"}
                    </p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {connectedSLP.specialization || "Voice & Fluency Disorders"}
                    </p>
                  </div>
                </div>

                <Link
                  to={`/slp-profile/${connectedSLP.id}`}
                  className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-indigo-700 border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 transition-colors shrink-0 shadow-2xs"
                  id="view-connected-slp-btn"
                >
                  <span>View Profile</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="text-center py-6 px-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <p className="text-sm text-slate-600">No clinician connected yet.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Connect with a licensed Speech-Language Pathologist to receive clinical feedback.
                </p>
                <div className="mt-3">
                  <Link
                    to="/find-slps"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Find Speech-Language Pathologists</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
