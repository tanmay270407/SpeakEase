import React, { useState, useEffect } from 'react';
import { Star, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Avatar } from '../Avatar';
import { reviewService } from '../../services/reviewService';
import { useAuth } from '../../contexts/AuthContext';

interface RateSLPModalProps {
  isOpen: boolean;
  onClose: () => void;
  slpId: string;
  slpName: string;
  slpTitle?: string;
  slpImage?: string | null;
  sessionId: string;
  sessionTitle?: string;
  onSuccess?: () => void;
}

export function RateSLPModal({
  isOpen,
  onClose,
  slpId,
  slpName,
  slpTitle = 'Speech-Language Pathologist',
  slpImage,
  sessionId,
  sessionTitle,
  onSuccess,
}: RateSLPModalProps) {
  const { profile } = useAuth();
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [existingReview, setExistingReview] = useState<any>(null);
  const [checkingExisting, setCheckingExisting] = useState<boolean>(true);

  useEffect(() => {
    async function checkReview() {
      if (!isOpen || !sessionId) return;
      try {
        setCheckingExisting(true);
        setError(null);
        const existing = await reviewService.getReviewForSession(sessionId);
        if (existing) {
          setExistingReview(existing);
          setRating(existing.rating);
          setReviewText(existing.review || '');
          setSubmitted(true);
        } else {
          setExistingReview(null);
          setSubmitted(false);
          setRating(0);
          setReviewText('');
        }
      } catch (err) {
        console.error('Error checking existing review:', err);
      } finally {
        setCheckingExisting(false);
      }
    }

    checkReview();
  }, [isOpen, sessionId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) {
      setError('You must be logged in to submit a review.');
      return;
    }
    if (rating < 1 || rating > 5) {
      setError('Please select a star rating from 1 to 5.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const res = await reviewService.submitReview({
        slpId,
        patientId: profile.id,
        sessionId,
        rating,
        review: reviewText,
      });

      if (!res.success) {
        setError(res.error || 'Failed to submit review.');
        return;
      }

      setSubmitted(true);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Submit review error:', err);
      setError(err.message || 'An error occurred while submitting your review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 border border-slate-200 relative space-y-5">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 pr-8">
          <Avatar src={slpImage} name={slpName} size="md" theme="teal" />
          <div>
            <h3 className="text-base font-bold text-slate-900 leading-snug">{slpName}</h3>
            <p className="text-xs text-slate-500 font-medium">{slpTitle}</p>
            {sessionTitle && (
              <p className="text-[11px] text-indigo-600 font-semibold mt-0.5">
                Session: {sessionTitle}
              </p>
            )}
          </div>
        </div>

        {checkingExisting ? (
          <div className="py-8 text-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
            <p className="text-xs">Loading session review status...</p>
          </div>
        ) : submitted ? (
          /* Submitted state */
          <div className="py-6 text-center space-y-3 bg-emerald-50/60 rounded-xl border border-emerald-100 p-4">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-950">✓ Review submitted</h4>
              <p className="text-xs text-emerald-800/90 mt-1">
                Thank you for rating your session! Your feedback helps other patients and supports your clinician.
              </p>
            </div>

            <div className="flex justify-center gap-1 my-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-5 h-5 ${
                    star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                  }`}
                />
              ))}
            </div>

            {reviewText && (
              <p className="text-xs text-slate-600 italic bg-white p-3 rounded-lg border border-slate-200 text-left">
                "{reviewText}"
              </p>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={onClose}
              className="mt-2 text-xs h-8 px-4 border-slate-300"
            >
              Done
            </Button>
          </div>
        ) : (
          /* Form state */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Rate your experience with this SLP
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = star <= (hoverRating || rating);
                  return (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      className="p-1 text-slate-300 hover:text-amber-400 focus:outline-none transition-transform hover:scale-110 cursor-pointer"
                      title={`${star} star${star > 1 ? 's' : ''}`}
                    >
                      <Star
                        className={`w-7 h-7 transition-colors ${
                          active ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  );
                })}
                <span className="text-xs font-semibold text-slate-600 ml-2">
                  {hoverRating || rating ? `${hoverRating || rating} / 5` : ''}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Optional review
              </label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Write your feedback regarding your session experience..."
                rows={3}
                className="w-full text-xs p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 placeholder:text-slate-400 resize-none"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={submitting}
                className="text-xs h-9 px-4"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || rating === 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-5 font-semibold"
              >
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Submitting...
                  </span>
                ) : (
                  'Submit Review'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
