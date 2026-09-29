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
  Stethoscope,
  Search,
  Building2,
  Award,
  RefreshCw,
} from 'lucide-react';

export function UserConnectionRequestsPage() {
  const { profile } = useAuth();
  const [receivedRequests, setReceivedRequests] = useState<EnrichedConnectionRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<EnrichedConnectionRequest[]>([]);
  const [hasActiveSLP, setHasActiveSLP] = useState(false);
  const [activeSLPName, setActiveSLPName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadRequests = async () => {
    if (!profile?.id) return;
    try {
      setLoading(true);
      const [reqs, activeSLP] = await Promise.all([
        connectionService.getConnectionRequests(profile.id),
        connectionService.getPatientActiveSLP(profile.id),
      ]);

      setReceivedRequests(reqs.received);
      setSentRequests(reqs.sent);
      setHasActiveSLP(Boolean(activeSLP));
      setActiveSLPName(activeSLP?.slps?.full_name || null);
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
        text: `Connection accepted! You are now connected with ${request.sender?.full_name || 'your clinician'}.`,
      });
      await loadRequests();
    } catch (err: any) {
      console.error('Error accepting request:', err);
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to accept request.',
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
      console.error('Error rejecting request:', err);
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
        text: `Connection request cancelled.`,
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
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Connection Requests</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage incoming invitations from speech pathologists and track your sent requests.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/my-slp"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Stethoscope className="w-4 h-4 text-indigo-600" />
            My SLP
          </Link>
          <Link
            to="/find-slps"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Search className="w-4 h-4 text-indigo-600" />
            Find SLPs
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
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Inbox className="w-4 h-4" />
            Received
            {pendingReceivedCount > 0 && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                {pendingReceivedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('sent')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'sent'
                ? 'border-indigo-600 text-indigo-600'
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
        </div>
      ) : activeTab === 'received' ? (
        /* Received Requests Tab */
        <div className="space-y-4">
          {hasActiveSLP && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-950">Active Clinician Connection: {activeSLPName}</span>
                <p className="mt-0.5 text-amber-800">
                  You already have an active SLP. You can view new requests below, but you cannot accept a new clinician
                  without first disconnecting from your current SLP.
                </p>
              </div>
            </div>
          )}

          {receivedRequests.length === 0 ? (
            <Card className="border-dashed border-slate-200 bg-white">
              <CardContent className="p-12 text-center space-y-3">
                <Inbox className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="text-base font-medium text-slate-700">No received requests</div>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  When a speech-language pathologist sends you an invitation to connect, it will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {receivedRequests.map((req) => {
                const isPending = req.status === 'pending';
                const isActing = actionLoadingId === req.id;
                const slpDetails = req.slp_info;

                return (
                  <Card
                    key={req.id}
                    className={`border ${
                      isPending ? 'border-indigo-100 bg-white shadow-sm' : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div className="h-11 w-11 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-base shrink-0">
                          {req.sender?.full_name?.charAt(0) || 'D'}
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
                          <p className="text-xs text-indigo-600 font-medium">
                            {slpDetails?.professional_title || 'Speech-Language Pathologist'}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-0.5">
                            {slpDetails?.specialization && (
                              <span className="flex items-center gap-1">
                                <Award className="w-3.5 h-3.5 text-slate-400" />
                                {slpDetails.specialization}
                              </span>
                            )}
                            {slpDetails?.organization && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                {slpDetails.organization}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {new Date(req.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
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
                            disabled={isActing || hasActiveSLP}
                            onClick={() => handleAccept(req)}
                            title={
                              hasActiveSLP
                                ? 'Disconnect your current active SLP before accepting another clinician.'
                                : 'Accept connection'
                            }
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs disabled:bg-slate-200 disabled:text-slate-400"
                          >
                            {isActing ? (
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                Accept
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Sent Requests Tab */
        <div className="space-y-3">
          {sentRequests.length === 0 ? (
            <Card className="border-dashed border-slate-200 bg-white">
              <CardContent className="p-12 text-center space-y-4">
                <Send className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="text-base font-medium text-slate-700">No sent requests</div>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  Browse our clinician directory to find speech therapists and request a connection.
                </p>
                <Link to="/find-slps">
                  <Button className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
                    Browse SLPs
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            sentRequests.map((req) => {
              const isPending = req.status === 'pending';
              const isActing = actionLoadingId === req.id;
              const slpDetails = req.slp_info;

              return (
                <Card key={req.id} className="border border-slate-200 bg-white">
                  <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-base shrink-0">
                        {req.receiver?.full_name?.charAt(0) || 'D'}
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
                        <p className="text-xs text-indigo-600 font-medium">
                          {slpDetails?.professional_title || 'Speech-Language Pathologist'}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          {slpDetails?.specialization && <span>{slpDetails.specialization}</span>}
                          <span>•</span>
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
                        Cancel Request
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
