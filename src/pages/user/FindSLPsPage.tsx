import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { connectionService, SLPCardData } from '../../services/connectionService';
import { reviewService, SLPRatingSummary } from '../../services/reviewService';
import { SLPRatingBadge } from '../../components/slp/SLPRatingBadge';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/Avatar';
import {
  Search,
  CheckCircle2,
  Clock,
  UserPlus,
  Building2,
  Award,
  Stethoscope,
  HeartHandshake,
  AlertCircle,
  Inbox,
  XCircle,
} from 'lucide-react';

export function FindSLPsPage() {
  const { profile } = useAuth();
  const [slps, setSlps] = useState<SLPCardData[]>([]);
  const [ratingsMap, setRatingsMap] = useState<Record<string, SLPRatingSummary>>({});
  const [hasActiveSLP, setHasActiveSLP] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    if (!profile?.id) return;
    try {
      setLoading(true);
      const res = await connectionService.getAvailableSLPs(profile.id);
      setSlps(res.slps);
      setHasActiveSLP(res.hasActiveSLP);

      // Batch load rating summaries
      if (res.slps && res.slps.length > 0) {
        const slpIds = res.slps.map((s) => s.id);
        const map = await reviewService.getMultipleSLPRatings(slpIds);
        setRatingsMap(map);
      }
    } catch (err: any) {
      console.error('Failed to load SLPs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile?.id]);

  const handleSendRequest = async (slp: SLPCardData) => {
    if (!profile?.id) return;
    try {
      setActionLoadingId(slp.id);
      setFeedbackMessage(null);
      await connectionService.sendRequest({
        senderId: profile.id,
        receiverId: slp.user_id,
        senderType: 'PATIENT',
        receiverType: 'SLP',
      });
      setFeedbackMessage({
        type: 'success',
        text: `Connection request sent to ${slp.full_name}!`,
      });
      await loadData();
    } catch (err: any) {
      console.error('Error sending request:', err);
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Failed to send connection request. Please try again.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelRequest = async (requestId: string, slpName: string) => {
    try {
      setActionLoadingId(requestId);
      setFeedbackMessage(null);
      await connectionService.cancelRequest(requestId);
      setFeedbackMessage({
        type: 'success',
        text: `Connection request to ${slpName} cancelled.`,
      });
      await loadData();
    } catch (err: any) {
      console.error('Error cancelling request:', err);
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Failed to cancel request.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredSLPs = useMemo(() => {
    if (!searchQuery.trim()) return slps;
    const q = searchQuery.toLowerCase();
    return slps.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.specialization?.toLowerCase().includes(q) ||
        s.organization?.toLowerCase().includes(q) ||
        s.professional_title?.toLowerCase().includes(q)
    );
  }, [slps, searchQuery]);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Top Header & Navigation Sub-tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Find SLPs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Discover verified Speech-Language Pathologists and connect for clinical review.
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
            to="/connection-requests"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Inbox className="w-4 h-4 text-indigo-600" />
            Requests
          </Link>
        </div>
      </div>

      {/* Active SLP Alert if one is already active */}
      {hasActiveSLP && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-indigo-50/80 border border-indigo-100 text-indigo-900 text-sm">
          <HeartHandshake className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-indigo-950">You currently have an active SLP</span>
            <p className="text-indigo-800/90 text-xs">
              Patients can have one active clinician at a time. If you wish to switch clinicians, you can safely end your
              current relationship on the{' '}
              <Link to="/my-slp" className="underline font-medium hover:text-indigo-950">
                My SLP
              </Link>{' '}
              page.
            </p>
          </div>
        </div>
      )}

      {feedbackMessage && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by clinician name, specialization, or organization..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all shadow-sm"
        />
      </div>

      {/* Clinician Cards */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
        </div>
      ) : filteredSLPs.length === 0 ? (
        <Card className="border-dashed border-slate-200">
          <CardContent className="p-12 text-center space-y-3">
            <Stethoscope className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-base font-medium text-slate-700">No clinicians found</div>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              {searchQuery ? 'No speech pathologists match your search criteria.' : 'No registered SLPs are available in the directory right now.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredSLPs.map((slp) => {
            const isConnected = slp.relationshipStatus === 'connected';
            const isPendingSent = slp.relationshipStatus === 'pending_sent';
            const isPendingReceived = slp.relationshipStatus === 'pending_received';
            const isActing = actionLoadingId === slp.id || actionLoadingId === slp.pendingRequestId;

            return (
              <Card
                key={slp.id}
                className={`transition-all duration-200 overflow-hidden border ${
                  isConnected
                    ? 'border-emerald-200 bg-emerald-50/20 shadow-sm'
                    : isPendingSent
                    ? 'border-amber-200 bg-amber-50/20 shadow-sm'
                    : isPendingReceived
                    ? 'border-indigo-200 bg-indigo-50/20 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-md bg-white'
                }`}
              >
                <CardContent className="p-6 flex flex-col justify-between h-full space-y-5">
                  <div className="space-y-3.5">
                    {/* Header: Avatar, Name & Availability */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3.5">
                        <Avatar
                          src={slp.profile_image}
                          name={slp.full_name}
                          size="md"
                          theme="teal"
                        />
                        <div>
                          <h3 className="font-semibold text-slate-900 text-base leading-tight">
                            {slp.full_name}
                          </h3>
                          <p className="text-xs font-medium text-indigo-600 mt-0.5">
                            {slp.professional_title || 'Speech-Language Pathologist'}
                          </p>
                          <div className="mt-1">
                            <SLPRatingBadge
                              averageRating={ratingsMap[slp.id]?.averageRating ?? null}
                              reviewCount={ratingsMap[slp.id]?.reviewCount ?? 0}
                              badge={ratingsMap[slp.id]?.badge ?? null}
                              size="sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Availability Tag */}
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                        {slp.availability_status || 'Accepting Patients'}
                      </span>
                    </div>

                    {/* Metadata: Specialization & Organization */}
                    <div className="space-y-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>
                          Specialization: <strong className="text-slate-800">{slp.specialization || 'Voice & Fluency'}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>
                          Organization: <strong className="text-slate-800">{slp.organization || 'SpeakEase Clinical Care'}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Button Area */}
                  <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                    <div className="flex items-center gap-2 w-full">
                      <Link
                        to={`/slp-profile/${slp.id}`}
                        className="w-1/2 text-center py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-xs font-medium text-slate-700 transition-colors shadow-2xs"
                      >
                        View Profile
                      </Link>

                      <div className="w-1/2">
                        {isConnected ? (
                          <div className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-100/70 text-emerald-800 font-medium text-xs border border-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            Connected
                          </div>
                        ) : isPendingSent ? (
                          <div className="w-full flex items-center justify-between gap-1 py-1.5 px-2.5 rounded-lg bg-amber-100/70 text-amber-800 font-medium text-xs border border-amber-300">
                            <div className="flex items-center gap-1 truncate">
                              <Clock className="w-3 h-3 text-amber-700 shrink-0" />
                              <span className="truncate">Pending</span>
                            </div>
                            {slp.pendingRequestId && (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleCancelRequest(slp.pendingRequestId!, slp.full_name)}
                                className="text-amber-900 hover:text-red-700 text-xs underline shrink-0 cursor-pointer"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        ) : isPendingReceived ? (
                          <Link to="/connection-requests" className="w-full block">
                            <Button size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-1.5 h-auto">
                              Review
                            </Button>
                          </Link>
                        ) : hasActiveSLP ? (
                          <Button
                            disabled
                            className="w-full bg-slate-100 text-slate-400 cursor-not-allowed text-xs py-1.5 h-auto"
                            title="You already have an active connected SLP"
                          >
                            Connected Else
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleSendRequest(slp)}
                            disabled={isActing}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center justify-center gap-1.5 py-2 h-auto shadow-2xs transition-all"
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
                    </div>
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
