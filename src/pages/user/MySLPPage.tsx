import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { connectionService } from '../../services/connectionService';
import { PatientBookSessionModal } from '../../components/patient/PatientBookSessionModal';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/Avatar';
import {
  Stethoscope,
  Building2,
  Award,
  Calendar,
  Mail,
  Phone,
  ShieldAlert,
  Search,
  Inbox,
  AlertCircle,
  CheckCircle2,
  HeartHandshake,
  UserX,
  User,
  Video,
} from 'lucide-react';

export function MySLPPage() {
  const { profile } = useAuth();
  const [activeAssignment, setActiveAssignment] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [feedback, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadActiveSLP = async () => {
    if (!profile?.id) return;
    try {
      setLoading(true);
      const data = await connectionService.getPatientActiveSLP(profile.id);
      setActiveAssignment(data);
    } catch (err: any) {
      console.error('Error loading active SLP:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveSLP();
  }, [profile?.id]);

  const handleDisconnect = async () => {
    if (!profile?.id || !activeAssignment?.slp_id) return;
    try {
      setDisconnecting(true);
      setFeedbackMessage(null);
      await connectionService.disconnectConnection(profile.id, activeAssignment.slp_id);
      setFeedbackMessage({
        type: 'success',
        text: 'Clinical connection successfully ended. You can now connect with another SLP if desired.',
      });
      setDisconnectModalOpen(false);
      await loadActiveSLP();
    } catch (err: any) {
      console.error('Error ending connection:', err);
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Failed to disconnect from clinician.',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const slp = activeAssignment?.slps;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My SLP</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your dedicated Speech-Language Pathologist and clinical care connection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/find-slps"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Search className="w-4 h-4 text-indigo-600" />
            Find SLPs
          </Link>
          <Link
            to="/connection-requests"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Inbox className="w-4 h-4 text-indigo-600" />
            Requests
          </Link>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
        </div>
      ) : activeAssignment && slp ? (
        <div className="space-y-6">
          {/* Active Clinician Banner Card */}
          <Card className="border-indigo-100 bg-white shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 p-6 sm:p-8 text-white">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="flex items-center gap-4 min-w-0">
                  <Avatar
                    src={slp.profile_image}
                    name={slp.full_name}
                    size="xl"
                    theme="teal"
                    className="border-2 border-white/40 shadow-sm shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 mb-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                      Active Care Relationship
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{slp.full_name}</h2>
                    <p className="text-indigo-200 text-sm font-medium mt-0.5 truncate">
                      {slp.professional_title || 'Speech-Language Pathologist'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start md:self-center">
                  <Button
                    onClick={() => setBookModalOpen(true)}
                    className="bg-white text-indigo-950 hover:bg-indigo-50 font-semibold text-xs h-9 px-3.5 rounded-lg shadow-xs transition-all border border-white/30 shrink-0 inline-flex items-center"
                    id="my-slp-book-session-btn"
                  >
                    <Video className="w-3.5 h-3.5 mr-1.5 text-indigo-600 shrink-0" />
                    Book Live Session
                  </Button>
                  <Link
                    to={`/slp-profile/${slp.id}`}
                    className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/20 border border-white/20 transition-all shrink-0"
                    id="my-slp-view-profile-btn"
                  >
                    <User className="w-3.5 h-3.5 text-white/80 shrink-0" />
                    View Profile
                  </Link>
                  <Button
                    variant="ghost"
                    onClick={() => setDisconnectModalOpen(true)}
                    className="h-9 px-3.5 rounded-lg text-xs font-medium text-white/75 hover:text-red-200 hover:bg-red-500/20 border border-white/15 transition-all shrink-0 inline-flex items-center"
                  >
                    <UserX className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                    End Connection
                  </Button>
                </div>
              </div>
            </div>

            <CardContent className="p-6 space-y-6">
              {/* Clinician Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Award className="w-4 h-4 text-indigo-600" />
                    Specialization
                  </div>
                  <p className="text-slate-900 font-semibold text-sm">
                    {slp.specialization || 'Voice & Fluency Disorders'}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    Clinical Organization
                  </div>
                  <p className="text-slate-900 font-semibold text-sm">
                    {slp.organization || 'SpeakEase Telehealth Clinic'}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Mail className="w-4 h-4 text-indigo-600" />
                    Clinician Email
                  </div>
                  <p className="text-slate-900 font-semibold text-sm">
                    {slp.email || 'Contact via SpeakEase Portal'}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    Connected Since
                  </div>
                  <p className="text-slate-900 font-semibold text-sm">
                    {new Date(activeAssignment.assigned_at || activeAssignment.created_at).toLocaleDateString(undefined, {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              {/* Data Sharing & Privacy Notice */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 font-semibold">
                  <HeartHandshake className="w-4 h-4 text-indigo-600" />
                  What is shared with your SLP?
                </div>
                <p>
                  As an active connected patient, your recorded practice sessions, speech metrics (syllables per minute,
                  fluency rate, pauses), and exercise completion are accessible to {slp.full_name} for clinical review and
                  personalized feedback. If you end this connection, future session sharing stops immediately.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Empty State: No Active SLP */
        <Card className="border-dashed border-slate-200 bg-white">
          <CardContent className="p-12 text-center space-y-5 max-w-lg mx-auto">
            <div className="h-16 w-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto shadow-inner">
              <Stethoscope className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                No Active Speech-Language Pathologist
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Connect with a licensed speech-language pathologist to receive expert clinical notes, practice reviews,
                and targeted guidance on your exercises.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/find-slps" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-sm">
                  <Search className="w-4 h-4" />
                  Find an SLP
                </Button>
              </Link>
              <Link to="/connection-requests" className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto border-slate-200 text-slate-700 hover:bg-slate-50 text-sm flex items-center justify-center gap-2"
                >
                  <Inbox className="w-4 h-4" />
                  View Requests
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disconnection Confirmation Modal */}
      {disconnectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2 bg-red-100 rounded-xl">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">End Clinical Connection?</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Are you sure you want to end your clinical relationship with{' '}
              <strong className="text-slate-900">{slp?.full_name}</strong>?
              Future practice sessions will no longer be shared with this clinician. You can connect with another SLP at
              any time.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                disabled={disconnecting}
                onClick={() => setDisconnectModalOpen(false)}
                className="text-slate-700 border-slate-200 hover:bg-slate-50 text-sm"
              >
                Cancel
              </Button>
              <Button
                disabled={disconnecting}
                onClick={handleDisconnect}
                className="bg-red-600 hover:bg-red-700 text-white text-sm flex items-center gap-2"
              >
                {disconnecting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <UserX className="w-4 h-4" />
                    Confirm Disconnect
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Patient Book Session Modal */}
      <PatientBookSessionModal
        isOpen={bookModalOpen}
        onClose={() => setBookModalOpen(false)}
        onSuccess={() => {
          loadActiveSLP();
        }}
      />
    </div>
  );
}
