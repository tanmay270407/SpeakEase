import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { connectionService, PatientCardData } from '../../services/connectionService';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  Search,
  CheckCircle2,
  Clock,
  UserPlus,
  Users,
  Inbox,
  AlertCircle,
  Calendar,
  XCircle,
  User,
} from 'lucide-react';

export function FindPatientsPage() {
  const { profile } = useAuth();
  const [patients, setPatients] = useState<PatientCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    if (!profile?.id) return;
    try {
      setLoading(true);
      const list = await connectionService.getAvailablePatients(profile.id);
      setPatients(list);
    } catch (err: any) {
      console.error('Failed to load patients:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile?.id]);

  const handleSendRequest = async (patient: PatientCardData) => {
    if (!profile?.id) return;
    try {
      setActionLoadingId(patient.id);
      setFeedback(null);
      await connectionService.sendRequest({
        senderId: profile.id,
        receiverId: patient.id,
        senderType: 'SLP',
        receiverType: 'PATIENT',
      });
      setFeedback({
        type: 'success',
        text: `Connection request sent to ${patient.full_name}!`,
      });
      await loadData();
    } catch (err: any) {
      console.error('Error sending request:', err);
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to send request.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelRequest = async (requestId: string, patientName: string) => {
    try {
      setActionLoadingId(requestId);
      setFeedback(null);
      await connectionService.cancelRequest(requestId);
      setFeedback({
        type: 'success',
        text: `Request to ${patientName} cancelled.`,
      });
      await loadData();
    } catch (err: any) {
      console.error('Error cancelling request:', err);
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to cancel request.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredPatients = useMemo(() => {
    if (!searchQuery.trim()) return patients;
    const q = searchQuery.toLowerCase();
    return patients.filter((p) => p.full_name.toLowerCase().includes(q));
  }, [patients, searchQuery]);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header & Sub-nav */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Find Patients</h1>
          <p className="text-sm text-slate-500 mt-1">
            Discover registered SpeakEase patients and invite them to clinical care and session monitoring.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/slp/patients"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Users className="w-4 h-4 text-teal-600" />
            My Patients
          </Link>
          <Link
            to="/slp/requests"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Inbox className="w-4 h-4 text-teal-600" />
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

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search registered patients by name..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition-all shadow-sm"
        />
      </div>

      {/* Patients Grid */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent"></div>
        </div>
      ) : filteredPatients.length === 0 ? (
        <Card className="border-dashed border-slate-200">
          <CardContent className="p-12 text-center space-y-3">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-base font-medium text-slate-700">No patients found</div>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              {searchQuery ? 'No registered patients match your search.' : 'No registered patients are currently available.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPatients.map((patient) => {
            const isConnected = patient.relationshipStatus === 'connected';
            const isPendingSent = patient.relationshipStatus === 'pending_sent';
            const isPendingReceived = patient.relationshipStatus === 'pending_received';
            const isActing = actionLoadingId === patient.id || actionLoadingId === patient.pendingRequestId;

            return (
              <Card
                key={patient.id}
                className={`transition-all duration-200 overflow-hidden border ${
                  isConnected
                    ? 'border-emerald-200 bg-emerald-50/20 shadow-sm'
                    : isPendingSent
                    ? 'border-amber-200 bg-amber-50/20 shadow-sm'
                    : isPendingReceived
                    ? 'border-teal-200 bg-teal-50/20 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-md bg-white'
                }`}
              >
                <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-base shadow-inner">
                        {patient.full_name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 text-sm leading-tight">
                          {patient.full_name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Joined {new Date(patient.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Button / Status */}
                  <div className="pt-3 border-t border-slate-100">
                    {isConnected ? (
                      <div className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-emerald-100/70 text-emerald-800 font-medium text-xs border border-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        Connected
                      </div>
                    ) : isPendingSent ? (
                      <div className="w-full flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-amber-100/70 text-amber-800 font-medium text-xs border border-amber-300">
                          <Clock className="w-3 h-3 text-amber-700" />
                          Request Pending
                        </div>
                        {patient.pendingRequestId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isActing}
                            onClick={() => handleCancelRequest(patient.pendingRequestId!, patient.full_name)}
                            className="text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 py-1 h-auto"
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    ) : isPendingReceived ? (
                      <div className="w-full flex items-center justify-between gap-2">
                        <span className="text-xs text-teal-700 font-medium">Patient sent request</span>
                        <Link to="/slp/requests">
                          <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs">
                            Review
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <Button
                        onClick={() => handleSendRequest(patient)}
                        disabled={isActing}
                        className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs py-2 flex items-center justify-center gap-2 shadow-sm transition-all"
                      >
                        {isActing ? (
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <>
                            <UserPlus className="w-3.5 h-3.5" />
                            Send Request
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
