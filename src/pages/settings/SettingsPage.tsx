import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import {
  Mail,
  Phone,
  KeyRound,
  Bell,
  Shield,
  ShieldCheck,
  Check,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Download,
  ExternalLink,
  Lock,
  User,
  Smartphone,
} from "lucide-react";

export function SettingsPage() {
  const { user, profile, isDemoAccount, demoRole, refreshProfile } = useAuth();
  const isSLP = isDemoAccount ? demoRole === "SLP" : profile?.role === "SLP";
  const profileUrl = isSLP ? "/slp/profile" : "/profile";

  // Account section states
  // 1. Email
  const [email, setEmail] = useState("");
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // 2. Phone
  const [phone, setPhone] = useState("");
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneFeedback, setPhoneFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // 3. Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Preferences section: Notifications
  const [notifications, setNotifications] = useState({
    session_reminders: true,
    clinical_updates: true,
    connection_alerts: true,
  });
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

  // Privacy section: Data & Privacy
  const [privacy, setPrivacy] = useState({
    share_metrics_with_slp: true,
    allow_audio_analytics: true,
  });
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [privacySaved, setPrivacySaved] = useState(false);
  const [exportingData, setExportingData] = useState(false);

  // Initialize from authenticated user / profile
  useEffect(() => {
    if (profile || user) {
      const currentEmail = profile?.email || user?.email || "";
      setEmail(currentEmail);
      setNewEmail(currentEmail);

      const currentPhone = profile?.phone || (user?.user_metadata?.phone as string) || "";
      setPhone(currentPhone);
      setNewPhone(currentPhone);

      // Notification preferences
      const notifPrefs = profile?.notification_preferences || user?.user_metadata?.notification_preferences;
      if (notifPrefs) {
        setNotifications({
          session_reminders: notifPrefs.session_reminders ?? true,
          clinical_updates: notifPrefs.clinical_updates ?? true,
          connection_alerts: notifPrefs.connection_alerts ?? true,
        });
      }

      // Privacy settings
      const privSettings = profile?.privacy_settings || user?.user_metadata?.privacy_settings;
      if (privSettings) {
        setPrivacy({
          share_metrics_with_slp: privSettings.share_metrics_with_slp ?? true,
          allow_audio_analytics: privSettings.allow_audio_analytics ?? true,
        });
      }
    }
  }, [profile, user]);

  // Handle Email Update
  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      setEmailFeedback({ type: "error", message: "Please enter a valid email address." });
      return;
    }

    if (newEmail.trim().toLowerCase() === email.toLowerCase()) {
      setIsEditingEmail(false);
      return;
    }

    try {
      setEmailLoading(true);
      setEmailFeedback(null);

      const trimmedEmail = newEmail.trim().toLowerCase();

      // 1. Supabase Auth update
      const { error: authError } = await supabase.auth.updateUser({ email: trimmedEmail });
      if (authError) throw authError;

      // 2. Profile row update
      if (user?.id) {
        await (supabase.from("profiles") as any)
          .update({ email: trimmedEmail, updated_at: new Date().toISOString() })
          .eq("id", user.id);
        
        if (isSLP) {
          await (supabase.from("slps") as any)
            .update({ email: trimmedEmail, updated_at: new Date().toISOString() })
            .eq("user_id", user.id);
        }
      }

      setEmail(trimmedEmail);
      setIsEditingEmail(false);
      await refreshProfile();
      setEmailFeedback({
        type: "success",
        message: "Email update initiated. A confirmation link has been sent to your new address if required.",
      });
    } catch (err: any) {
      console.error("Email update error:", err);
      setEmailFeedback({ type: "error", message: err.message || "Failed to update email address." });
    } finally {
      setEmailLoading(false);
    }
  };

  // Handle Phone Update
  const handleUpdatePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    try {
      setPhoneLoading(true);
      setPhoneFeedback(null);

      const trimmedPhone = newPhone.trim() || null;

      // Update in profiles table
      const { error } = await (supabase.from("profiles") as any)
        .update({ phone: trimmedPhone, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (error) throw error;

      // If SLP, also sync to slps table
      if (isSLP) {
        await (supabase.from("slps") as any)
          .update({ phone: trimmedPhone, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
      }

      // Sync to user_metadata
      await supabase.auth.updateUser({
        data: { phone: trimmedPhone },
      });

      setPhone(trimmedPhone || "");
      setIsEditingPhone(false);
      await refreshProfile();
      setPhoneFeedback({ type: "success", message: "Phone number updated successfully." });
    } catch (err: any) {
      console.error("Phone update error:", err);
      setPhoneFeedback({ type: "error", message: err.message || "Failed to update phone number." });
    } finally {
      setPhoneLoading(false);
    }
  };

  // Handle Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);

    if (newPassword.length < 6) {
      setPasswordFeedback({ type: "error", message: "Password must be at least 6 characters long." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: "error", message: "Passwords do not match. Please re-enter." });
      return;
    }

    try {
      setPasswordLoading(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setPasswordFeedback({ type: "success", message: "Your password has been changed successfully." });
      setNewPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
    } catch (err: any) {
      console.error("Password update error:", err);
      setPasswordFeedback({ type: "error", message: err.message || "Failed to change password." });
    } finally {
      setPasswordLoading(false);
    }
  };

  // Toggle Notification Preference
  const handleToggleNotification = async (key: keyof typeof notifications) => {
    if (!user?.id) return;
    const updated = {
      ...notifications,
      [key]: !notifications[key],
    };
    setNotifications(updated);
    setSavingNotif(true);

    try {
      await (supabase.from("profiles") as any)
        .update({
          notification_preferences: updated,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      await supabase.auth.updateUser({
        data: { notification_preferences: updated },
      });

      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save notification preferences:", err);
    } finally {
      setSavingNotif(false);
    }
  };

  // Toggle Privacy Setting
  const handleTogglePrivacy = async (key: keyof typeof privacy) => {
    if (!user?.id) return;
    const updated = {
      ...privacy,
      [key]: !privacy[key],
    };
    setPrivacy(updated);
    setSavingPrivacy(true);

    try {
      await (supabase.from("profiles") as any)
        .update({
          privacy_settings: updated,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      await supabase.auth.updateUser({
        data: { privacy_settings: updated },
      });

      setPrivacySaved(true);
      setTimeout(() => setPrivacySaved(false), 2000);
    } catch (err) {
      console.error("Failed to save privacy settings:", err);
    } finally {
      setSavingPrivacy(false);
    }
  };

  // Handle Export Account Data
  const handleExportData = async () => {
    if (!user?.id) return;
    try {
      setExportingData(true);

      // Fetch user's sessions & metrics
      const { data: sessions } = await (supabase.from("sessions") as any)
        .select(`
          id,
          exercise_id,
          status,
          duration_seconds,
          created_at,
          speech_metrics (
            accuracy_score,
            fluency_score,
            pace_wpm,
            pitch_variance
          )
        `)
        .eq("user_id", user.id);

      const exportPayload = {
        speakease_version: "2.0",
        export_date: new Date().toISOString(),
        user_profile: {
          id: user.id,
          email: profile?.email || user.email,
          full_name: profile?.full_name,
          role: profile?.role,
          phone: profile?.phone,
          created_at: profile?.created_at,
        },
        preferences: notifications,
        privacy_settings: privacy,
        sessions_recorded: sessions || [],
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `speakease-account-data-${user.id.slice(0, 8)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting account data:", err);
    } finally {
      setExportingData(false);
    }
  };

  const accentRing = isSLP ? "focus:ring-teal-500" : "focus:ring-indigo-500";
  const accentBg = isSLP ? "bg-teal-600 hover:bg-teal-700" : "bg-indigo-600 hover:bg-indigo-700";

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6 space-y-8">
      {/* Header with Title and Profile Separation Banner */}
      <div className="border-b border-slate-200/80 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Manage your account security, communication preferences, and data privacy
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Account Type:</span>
            <span
              className={`font-semibold px-2 py-0.5 rounded-full ${
                isSLP
                  ? "bg-teal-50 text-teal-700 border border-teal-200"
                  : "bg-indigo-50 text-indigo-700 border border-indigo-200"
              }`}
            >
              {isSLP ? "Speech-Language Pathologist" : "Patient"}
            </span>
          </div>
        </div>

        {/* Informative banner distinguishing Profile vs Settings */}
        <div className="mt-4 flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Looking to update your profile photo, clinical bio, or practice goals?</span>
          </div>
          <Link
            to={profileUrl}
            className={`inline-flex items-center gap-1 font-semibold ${
              isSLP ? "text-teal-600 hover:text-teal-700" : "text-indigo-600 hover:text-indigo-700"
            } hover:underline shrink-0 ml-2`}
          >
            <span>View Profile</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* SECTION 1: ACCOUNT */}
      <section className="space-y-4" id="settings-section-account">
        <div className="flex items-center gap-2 text-slate-900 font-semibold text-lg">
          <div className={`p-1.5 rounded-md ${isSLP ? "bg-teal-50 text-teal-600" : "bg-indigo-50 text-indigo-600"}`}>
            <Lock className="w-4 h-4" />
          </div>
          <h2>Account</h2>
        </div>

        <Card className="shadow-2xs border-slate-200/80 divide-y divide-slate-100">
          {/* Email Item */}
          <div className="p-5 sm:p-6 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-900">Email Address</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Primary
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Used to sign in and receive critical notifications and session updates
                </p>
              </div>

              {!isEditingEmail && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditingEmail(true);
                    setNewEmail(email);
                    setEmailFeedback(null);
                  }}
                  className="self-start sm:self-center text-xs h-8"
                  id="btn-edit-email"
                >
                  Change Email
                </Button>
              )}
            </div>

            {!isEditingEmail ? (
              <p className="text-sm font-medium text-slate-800 bg-slate-50 py-2 px-3 rounded-md border border-slate-100 inline-block">
                {email || "No email address linked"}
              </p>
            ) : (
              <form onSubmit={handleUpdateEmail} className="space-y-3 pt-2">
                <div className="max-w-md">
                  <label htmlFor="new-email-input" className="block text-xs font-medium text-slate-700 mb-1">
                    New Email Address
                  </label>
                  <Input
                    id="new-email-input"
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Enter new email address"
                    className="text-sm"
                    autoFocus
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={emailLoading}
                    className={`h-8 text-xs text-white ${accentBg}`}
                    id="btn-save-email"
                  >
                    {emailLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        Saving...
                      </>
                    ) : (
                      "Update Email"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsEditingEmail(false);
                      setEmailFeedback(null);
                    }}
                    className="h-8 text-xs text-slate-600"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {emailFeedback && (
              <div
                className={`p-3 rounded-md text-xs flex items-center gap-2 ${
                  emailFeedback.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                {emailFeedback.type === "success" ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{emailFeedback.message}</span>
              </div>
            )}
          </div>

          {/* Phone Item */}
          <div className="p-5 sm:p-6 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-900">Phone Number</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Used for account security and urgent speech session appointment notifications
                </p>
              </div>

              {!isEditingPhone && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditingPhone(true);
                    setNewPhone(phone);
                    setPhoneFeedback(null);
                  }}
                  className="self-start sm:self-center text-xs h-8"
                  id="btn-edit-phone"
                >
                  {phone ? "Update Phone" : "Add Phone"}
                </Button>
              )}
            </div>

            {!isEditingPhone ? (
              <p className="text-sm font-medium text-slate-800 bg-slate-50 py-2 px-3 rounded-md border border-slate-100 inline-block">
                {phone || "Not provided"}
              </p>
            ) : (
              <form onSubmit={handleUpdatePhone} className="space-y-3 pt-2">
                <div className="max-w-md">
                  <label htmlFor="new-phone-input" className="block text-xs font-medium text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <Input
                    id="new-phone-input"
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="text-sm"
                    autoFocus
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Leave empty to remove phone number</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={phoneLoading}
                    className={`h-8 text-xs text-white ${accentBg}`}
                    id="btn-save-phone"
                  >
                    {phoneLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        Saving...
                      </>
                    ) : (
                      "Save Phone"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsEditingPhone(false);
                      setPhoneFeedback(null);
                    }}
                    className="h-8 text-xs text-slate-600"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {phoneFeedback && (
              <div
                className={`p-3 rounded-md text-xs flex items-center gap-2 ${
                  phoneFeedback.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                {phoneFeedback.type === "success" ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{phoneFeedback.message}</span>
              </div>
            )}
          </div>

          {/* Change Password Item */}
          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-900">Change Password</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Ensure your account is protected with a secure password at least 6 characters long
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
              <div>
                <label htmlFor="new-password-input" className="block text-xs font-medium text-slate-700 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <Input
                    id="new-password-input"
                    type={showPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="pr-10 text-sm"
                  />
                  <button
                    type="button"
                    id="btn-toggle-new-password"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center text-slate-400 hover:text-slate-600 focus:text-slate-700 cursor-pointer z-10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 rounded-r-md"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4 pointer-events-none" />
                    ) : (
                      <Eye className="w-4 h-4 pointer-events-none" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Input
                    id="confirm-password-input"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="pr-10 text-sm"
                  />
                  <button
                    type="button"
                    id="btn-toggle-confirm-password"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center text-slate-400 hover:text-slate-600 focus:text-slate-700 cursor-pointer z-10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 rounded-r-md"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    title={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4 pointer-events-none" />
                    ) : (
                      <Eye className="w-4 h-4 pointer-events-none" />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <Button
                  type="submit"
                  size="sm"
                  disabled={passwordLoading || !newPassword}
                  className={`h-8 text-xs text-white ${accentBg}`}
                  id="btn-change-password"
                >
                  {passwordLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      Updating Password...
                    </>
                  ) : (
                    "Update Password"
                  )}
                </Button>
              </div>

              {passwordFeedback && (
                <div
                  className={`p-3 rounded-md text-xs flex items-center gap-2 ${
                    passwordFeedback.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-rose-50 text-rose-800 border border-rose-200"
                  }`}
                >
                  {passwordFeedback.type === "success" ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{passwordFeedback.message}</span>
                </div>
              )}
            </form>
          </div>
        </Card>
      </section>

      {/* SECTION 2: PREFERENCES */}
      <section className="space-y-4" id="settings-section-preferences">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900 font-semibold text-lg">
            <div className={`p-1.5 rounded-md ${isSLP ? "bg-teal-50 text-teal-600" : "bg-indigo-50 text-indigo-600"}`}>
              <Bell className="w-4 h-4" />
            </div>
            <h2>Preferences</h2>
          </div>
          {notifSaved && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium animate-in fade-in">
              <Check className="w-3.5 h-3.5" />
              Saved to database
            </span>
          )}
        </div>

        <Card className="shadow-2xs border-slate-200/80 divide-y divide-slate-100">
          <div className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Control the frequency and types of alerts sent to your email and device
            </p>

            <div className="mt-5 space-y-4">
              {/* Reminder Toggle */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <label htmlFor="toggle-session-reminders" className="text-sm font-medium text-slate-900 cursor-pointer">
                    Daily Practice & Session Reminders
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Receive gentle prompts to stay consistent with your articulation and fluency routines
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-session-reminders"
                  role="switch"
                  aria-checked={notifications.session_reminders}
                  onClick={() => handleToggleNotification("session_reminders")}
                  disabled={savingNotif}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    notifications.session_reminders
                      ? isSLP
                        ? "bg-teal-600"
                        : "bg-indigo-600"
                      : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      notifications.session_reminders ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Clinical Updates Toggle */}
              <div className="flex items-start justify-between gap-4 pt-3 border-t border-slate-100">
                <div>
                  <label htmlFor="toggle-clinical-updates" className="text-sm font-medium text-slate-900 cursor-pointer">
                    Clinical Notes & Assignment Feedback
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isSLP
                      ? "Receive notifications when patients submit new recordings or complete assigned exercises"
                      : "Get notified as soon as your clinician reviews your recorded session and leaves feedback"}
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-clinical-updates"
                  role="switch"
                  aria-checked={notifications.clinical_updates}
                  onClick={() => handleToggleNotification("clinical_updates")}
                  disabled={savingNotif}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    notifications.clinical_updates
                      ? isSLP
                        ? "bg-teal-600"
                        : "bg-indigo-600"
                      : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      notifications.clinical_updates ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Connection Alerts Toggle */}
              <div className="flex items-start justify-between gap-4 pt-3 border-t border-slate-100">
                <div>
                  <label htmlFor="toggle-connection-alerts" className="text-sm font-medium text-slate-900 cursor-pointer">
                    Connection Requests & Invitations
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Alerts when a clinician or patient sends an invitation to link care accounts
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-connection-alerts"
                  role="switch"
                  aria-checked={notifications.connection_alerts}
                  onClick={() => handleToggleNotification("connection_alerts")}
                  disabled={savingNotif}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    notifications.connection_alerts
                      ? isSLP
                        ? "bg-teal-600"
                        : "bg-indigo-600"
                      : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      notifications.connection_alerts ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* SECTION 3: PRIVACY */}
      <section className="space-y-4" id="settings-section-privacy">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900 font-semibold text-lg">
            <div className={`p-1.5 rounded-md ${isSLP ? "bg-teal-50 text-teal-600" : "bg-indigo-50 text-indigo-600"}`}>
              <Shield className="w-4 h-4" />
            </div>
            <h2>Privacy</h2>
          </div>
          {privacySaved && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium animate-in fade-in">
              <Check className="w-3.5 h-3.5" />
              Settings updated
            </span>
          )}
        </div>

        <Card className="shadow-2xs border-slate-200/80 divide-y divide-slate-100">
          {/* Data & Privacy Controls */}
          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Data & Privacy</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Control how your clinical data and exercise audio recordings are processed and shared
              </p>
            </div>

            <div className="space-y-4 pt-2">
              {/* Share Metrics Toggle */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <label htmlFor="toggle-share-metrics" className="text-sm font-medium text-slate-900 cursor-pointer">
                    Share Practice Metrics with Connected Clinician
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Permits your assigned Speech-Language Pathologist to view session scores, accuracy graphs, and progress trends
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-share-metrics"
                  role="switch"
                  aria-checked={privacy.share_metrics_with_slp}
                  onClick={() => handleTogglePrivacy("share_metrics_with_slp")}
                  disabled={savingPrivacy}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    privacy.share_metrics_with_slp
                      ? isSLP
                        ? "bg-teal-600"
                        : "bg-indigo-600"
                      : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      privacy.share_metrics_with_slp ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Audio Analytics Toggle */}
              <div className="flex items-start justify-between gap-4 pt-3 border-t border-slate-100">
                <div>
                  <label htmlFor="toggle-audio-analytics" className="text-sm font-medium text-slate-900 cursor-pointer">
                    Audio Analytics & Signal Processing
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Allows real-time phonetic analysis to measure speech rate, decibel dynamics, and pitch modulation
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-audio-analytics"
                  role="switch"
                  aria-checked={privacy.allow_audio_analytics}
                  onClick={() => handleTogglePrivacy("allow_audio_analytics")}
                  disabled={savingPrivacy}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    privacy.allow_audio_analytics
                      ? isSLP
                        ? "bg-teal-600"
                        : "bg-indigo-600"
                      : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      privacy.allow_audio_analytics ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Export Practice Data */}
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-900">Export Your Account Data</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Download a machine-readable JSON copy of your profile info, settings, and recorded session histories
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportData}
              disabled={exportingData}
              className="text-xs h-8 shrink-0 bg-white"
              id="btn-export-data"
            >
              {exportingData ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Generating JSON...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                  Download Data (JSON)
                </>
              )}
            </Button>
          </div>

          {/* Security & Healthcare Compliance Note */}
          <div className="p-5 sm:p-6 bg-slate-50/30">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">Healthcare Privacy & Encryption Standard</p>
                <p>
                  SpeakEase secures audio recordings, clinical notes, and session metrics using row-level access controls and encrypted channels in transit and at rest.
                </p>
                <p className="text-slate-500 pt-1">
                  To request complete account erasure in accordance with health privacy regulations, contact your clinic administrator or email{" "}
                  <span className="font-medium text-slate-700">privacy@speakease.health</span>.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
