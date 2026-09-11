import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { connectionService, EnrichedConnectionRequest } from '../../services/connectionService';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  Inbox,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Users,
  Search,
  RefreshCw,
  User,
  Calendar,
} from 'lucide-react';

export function SLPConnectionRequestsPage() {
  const { profile } = useAuth();
  const [receivedRequests, setReceivedRequests] = useState<EnrichedConnectionRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<EnrichedConnectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadRequests = async () => {
    if (!profile?.id) return;
    try {
      setLoading(true);
      const reqs = await connectionService.getConnectionRequests(profile.id);
      setReceivedRequests(reqs.received);
      setSentRequests(reqs.sent);
    } catch (err: any) {
      console.error('Error loading requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [profile?.id]);

  const handleAccept = async (request: EnrichedConnectionRequest) => {
    try {
      setActionLoadingId(request.id);
      setFeedback(null);
      await connectionService.acceptRequest(request.id);
      setFeedback({
        type: 'success',
        text: `Connection accepted! ${request.sender?.full_name || 'Patient'} is now in your care list.`,
      });
      await loadRequests();
    } catch (err: any) {
      console.error('Error accepting request:', err);
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to accept connection request.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (request: EnrichedConnectionRequest) => {
    try {
      setActionLoadingId(request.id);
      setFeedback(null);
      await connectionService.rejectRequest(request.id);
      setFeedback({
        type: 'success',
        text: `Connection request declined.`,
      });
      await loadRequests();
    } catch (err: any) {
      console.error('Error declining request:', err);
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to decline request.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancel = async (request: EnrichedConnectionRequest) => {
    try {
      setActionLoadingId(request.id);
      setFeedback(null);
      await connectionService.cancelRequest(request.id);
      setFeedback({
        type: 'success',
        text: `Request to ${request.receiver?.full_name || 'patient'} cancelled.`,
      });
      await loadRequests();
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

  const pendingReceivedCount = receivedRequests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header & Sub-nav */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Connection Requests</h1>
          <p className="text-sm text-slate-500 mt-1">
            Review incoming connection requests from patients and track invitations you have sent.
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
            to="/slp/find-patients"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Search className="w-4 h-4 text-teal-600" />
            Find Patients
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

      {/* Tabs */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('received')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'received'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Inbox className="w-4 h-4" />
            Received
            {pendingReceivedCount > 0 && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-700">
                {pendingReceivedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('sent')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'sent'
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Send className="w-4 h-4" />
            Sent Requests
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              {sentRequests.length}
            </span>
          </button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={loadRequests}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent"></div>
        </div>
      ) : activeTab === 'received' ? (
        /* Received Requests Tab */
        <div className="space-y-3">
          {receivedRequests.length === 0 ? (
            <Card className="border-dashed border-slate-200 bg-white">
              <CardContent className="p-12 text-center space-y-3">
                <Inbox className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="text-base font-medium text-slate-700">No received requests</div>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  When patients invite you to become their speech-language pathologist, their requests will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            receivedRequests.map((req) => {
              const isPending = req.status === 'pending';
              const isActing = actionLoadingId === req.id;

              return (
                <Card
                  key={req.id}
                  className={`border ${
                    isPending ? 'border-teal-100 bg-white shadow-sm' : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="h-11 w-11 rounded-xl bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-base shrink-0">
                        {req.sender?.full_name?.charAt(0) || 'P'}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 text-sm">{req.sender?.full_name}</h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              req.status === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : req.status === 'accepted'
                                ? 'bg-emerald-100 text-emerald-800'
                                : req.status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {req.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 pt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            Requested {new Date(req.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isPending && (
                      <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isActing}
                          onClick={() => handleReject(req)}
                          className="text-xs text-slate-600 hover:text-red-600 border-slate-200"
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          disabled={isActing}
                          onClick={() => handleAccept(req)}
                          className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
                        >
                          {isActing ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Accept Patient
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        /* Sent Requests Tab */
        <div className="space-y-3">
          {sentRequests.length === 0 ? (
            <Card className="border-dashed border-slate-200 bg-white">
              <CardContent className="p-12 text-center space-y-4">
                <Send className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="text-base font-medium text-slate-700">No sent invitations</div>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  Browse registered patients and send invitations to add them to your practice.
                </p>
                <Link to="/slp/find-patients">
                  <Button className="bg-teal-600 hover:bg-teal-700 text-white text-xs">
                    Browse Patients
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            sentRequests.map((req) => {
              const isPending = req.status === 'pending';
              const isActing = actionLoadingId === req.id;

              return (
                <Card key={req.id} className="border border-slate-200 bg-white">
                  <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-base shrink-0">
                        {req.receiver?.full_name?.charAt(0) || 'P'}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 text-sm">{req.receiver?.full_name}</h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              req.status === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : req.status === 'accepted'
                                ? 'bg-emerald-100 text-emerald-800'
                                : req.status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {req.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span>Sent on {new Date(req.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {isPending && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isActing}
                        onClick={() => handleCancel(req)}
                        className="text-xs text-slate-600 hover:text-red-600 border-slate-200 self-end sm:self-center"
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        Cancel Invitation
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
