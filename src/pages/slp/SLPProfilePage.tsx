import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/ui/Button";
import { uploadAvatar } from "../../lib/avatarUpload";
import {
  Edit3,
  Camera,
  Check,
  Award,
  Clock,
  BookOpen,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";

export function SLPProfilePage() {
  const { user, profile, refreshProfile } = useAuth();

  const [slpRecord, setSlpRecord] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [professionalTitle, setProfessionalTitle] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [bio, setBio] = useState("");
  const [qualification, setQualification] = useState("");
  const [yearsOfExperience, setYearsOfExperience] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load SLP record
  const loadSLPRecord = async () => {
    if (!profile?.id) return;
    try {
      setLoading(true);
      const { data, error } = await (supabase.from("slps") as any)
        .select("*")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSlpRecord(data);
        setFullName(data.full_name || profile.full_name || "");
        setProfessionalTitle(data.professional_title || "Speech-Language Pathologist");
        setSpecialization(data.specialization || "Voice & Fluency Disorders");
        setBio(data.bio || "");
        setQualification(data.qualification || "");
        setYearsOfExperience(data.years_of_experience || "");
        setProfileImage(data.profile_image || profile.avatar_url || null);
      } else {
        // Fallback to profile
        setFullName(profile.full_name || "");
        setProfessionalTitle("Speech-Language Pathologist");
        setSpecialization("Voice & Fluency Disorders");
      }
    } catch (err: any) {
      console.error("Error loading SLP profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSLPRecord();
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
        setProfileImage(res.url);
        setFeedback({ type: "success", message: "Photo uploaded. Click Save Changes to keep." });
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

      const trimmedName = fullName.trim() || profile?.full_name || "Clinician";

      // 1. Update SLPs table
      const slpUpdates: any = {
        full_name: trimmedName,
        professional_title: professionalTitle.trim() || "Speech-Language Pathologist",
        specialization: specialization.trim() || "Voice & Fluency Disorders",
        bio: bio.trim(),
        qualification: qualification.trim(),
        years_of_experience: yearsOfExperience.trim(),
        profile_image: profileImage,
        updated_at: new Date().toISOString(),
      };

      if (slpRecord?.id) {
        const { error: slpErr } = await (supabase.from("slps") as any)
          .update(slpUpdates)
          .eq("id", slpRecord.id);
        if (slpErr) throw slpErr;
      } else {
        // Create SLP record if not exists
        const { data: newSlp, error: insertErr } = await (supabase.from("slps") as any)
          .insert({
            user_id: user.id,
            email: user.email || profile?.email || "",
            ...slpUpdates,
          })
          .select()
          .single();
        if (insertErr) throw insertErr;
        setSlpRecord(newSlp);
      }

      // 2. Sync to profiles table
      await (supabase
        .from("profiles") as any)
        .update({
          full_name: trimmedName,
          avatar_url: profileImage,
          bio: bio.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      await refreshProfile();
      await loadSLPRecord();

      setIsEditing(false);
      setFeedback({ type: "success", message: "Profile updated successfully." });
    } catch (err: any) {
      console.error("Save SLP profile error:", err);
      setFeedback({ type: "error", message: err.message || "Failed to save profile." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Clinician Profile</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your professional Speech-Language Pathologist credentials</p>
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
            id="edit-slp-profile-btn"
          >
            <Edit3 className="w-3.5 h-3.5 text-teal-600" />
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

      {/* Edit SLP Profile Form */}
      {isEditing ? (
        <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-semibold text-slate-900">Edit Professional Information</h2>
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
                src={profileImage}
                name={fullName || profile?.full_name}
                size="lg"
                theme="teal"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="absolute bottom-0 right-0 bg-teal-600 text-white p-1.5 rounded-full shadow-md hover:bg-teal-700 transition-colors disabled:opacity-50 cursor-pointer"
                title="Upload professional photo"
                id="slp-avatar-upload-btn"
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
                id="slp-avatar-file-input"
              />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">Professional Photo</p>
              <p className="text-xs text-slate-500 mt-0.5">PNG, JPG, or WebP up to 5MB</p>
            </div>
          </div>

          {/* Full Name */}
          <div className="space-y-1.5">
            <label htmlFor="slp-fullname" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Full Name
            </label>
            <input
              id="slp-fullname"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
              placeholder="e.g. Dibya Upadhyay"
            />
          </div>

          {/* Professional Title */}
          <div className="space-y-1.5">
            <label htmlFor="slp-title" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Professional Title
            </label>
            <input
              id="slp-title"
              type="text"
              value={professionalTitle}
              onChange={(e) => setProfessionalTitle(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
              placeholder="e.g. Speech-Language Pathologist"
            />
          </div>

          {/* Specialization */}
          <div className="space-y-1.5">
            <label htmlFor="slp-specialization" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Specialization
            </label>
            <input
              id="slp-specialization"
              type="text"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
              placeholder="e.g. Voice & Fluency Disorders"
            />
          </div>

          {/* Short Bio */}
          <div className="space-y-1.5">
            <label htmlFor="slp-bio" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              About / Bio
            </label>
            <textarea
              id="slp-bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
              placeholder="Helping people build confidence through structured speech practice."
            />
          </div>

          {/* Qualifications & Experience row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="slp-qualification" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Qualification
              </label>
              <input
                id="slp-qualification"
                type="text"
                value={qualification}
                onChange={(e) => setQualification(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                placeholder="e.g. MSc Speech-Language Pathology"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="slp-experience" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Years of Experience
              </label>
              <input
                id="slp-experience"
                type="text"
                value={yearsOfExperience}
                onChange={(e) => setYearsOfExperience(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                placeholder="e.g. 7+ years"
              />
            </div>
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
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5"
              id="save-slp-profile-btn"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save Changes
            </Button>
          </div>
        </form>
      ) : (
        /* Minimal View SLP Profile */
        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-2xs space-y-7">
          {/* Top Profile Header */}
          <div className="flex items-start gap-5">
            <Avatar
              src={slpRecord?.profile_image || profile?.avatar_url}
              name={slpRecord?.full_name || profile?.full_name}
              size="xl"
              theme="teal"
            />
            <div className="space-y-1 pt-1 min-w-0 flex-1">
              <h2 className="text-xl font-bold text-slate-900 leading-tight">
                {slpRecord?.full_name || profile?.full_name || "Speech-Language Pathologist"}
              </h2>
              <p className="text-sm font-medium text-teal-700">
                {slpRecord?.professional_title || "Speech-Language Pathologist"}
              </p>
              <p className="text-xs text-slate-500">
                {slpRecord?.specialization || "Voice & Fluency Disorders"}
              </p>
            </div>
          </div>

          {/* About Section */}
          <div className="pt-5 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">About</h3>
            <p className="text-sm text-slate-700 mt-2 leading-relaxed">
              {slpRecord?.bio || "Helping people build confidence through structured speech practice."}
            </p>
          </div>

          {/* Qualifications Section */}
          <div className="pt-5 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <BookOpen className="w-3.5 h-3.5 text-teal-600" />
              <span>Qualifications</span>
            </div>
            <p className="text-sm font-medium text-slate-800 mt-2">
              {slpRecord?.qualification || "MSc Speech-Language Pathology"}
            </p>
          </div>

          {/* Experience Section */}
          <div className="pt-5 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5 text-teal-600" />
              <span>Experience</span>
            </div>
            <p className="text-sm font-medium text-slate-800 mt-2">
              {slpRecord?.years_of_experience || "7+ years"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
