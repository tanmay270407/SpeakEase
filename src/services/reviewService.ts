import { supabase } from '../lib/supabase';
import type { SLPReview } from '../types/supabase';

export interface SLPRatingSummary {
  slpId: string;
  averageRating: number | null; // e.g. 4.8 or null if 0 reviews
  reviewCount: number;
  badge: 'Top Rated' | 'Highly Rated' | 'Verified' | null;
}

export function calculateRecognitionBadge(avgRating: number | null, count: number): 'Top Rated' | 'Highly Rated' | 'Verified' | null {
  if (count === 0 || avgRating === null) return null;
  if (avgRating >= 4.8) return 'Top Rated';
  if (avgRating >= 4.5) return 'Highly Rated';
  return 'Verified';
}

export const reviewService = {
  /**
   * Get overall rating summary for a single SLP calculated from slp_reviews table
   */
  async getSLPRatingSummary(slpId: string): Promise<SLPRatingSummary> {
    if (!slpId) {
      return { slpId, averageRating: null, reviewCount: 0, badge: null };
    }

    try {
      const { data, error } = await (supabase.from('slp_reviews') as any)
        .select('rating')
        .eq('slp_id', slpId);

      if (error) {
        console.error('Error fetching SLP rating summary:', error);
        return { slpId, averageRating: null, reviewCount: 0, badge: null };
      }

      if (!data || data.length === 0) {
        return { slpId, averageRating: null, reviewCount: 0, badge: null };
      }

      const total = data.reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0);
      const count = data.length;
      const rawAvg = total / count;
      const roundedAvg = Math.round(rawAvg * 10) / 10;
      const badge = calculateRecognitionBadge(roundedAvg, count);

      return {
        slpId,
        averageRating: roundedAvg,
        reviewCount: count,
        badge,
      };
    } catch (err) {
      console.error('getSLPRatingSummary exception:', err);
      return { slpId, averageRating: null, reviewCount: 0, badge: null };
    }
  },

  /**
   * Get rating summaries for a list of SLP IDs in batch
   */
  async getMultipleSLPRatings(slpIds: string[]): Promise<Record<string, SLPRatingSummary>> {
    const result: Record<string, SLPRatingSummary> = {};
    if (!slpIds || slpIds.length === 0) return result;

    try {
      const { data, error } = await (supabase.from('slp_reviews') as any)
        .select('slp_id, rating')
        .in('slp_id', slpIds);

      if (error) {
        console.error('Error fetching multiple SLP ratings:', error);
        return result;
      }

      const grouped: Record<string, number[]> = {};
      (data || []).forEach((row: any) => {
        if (!grouped[row.slp_id]) grouped[row.slp_id] = [];
        grouped[row.slp_id].push(Number(row.rating) || 0);
      });

      slpIds.forEach((id) => {
        const ratings = grouped[id] || [];
        if (ratings.length === 0) {
          result[id] = { slpId: id, averageRating: null, reviewCount: 0, badge: null };
        } else {
          const total = ratings.reduce((a, b) => a + b, 0);
          const count = ratings.length;
          const avg = Math.round((total / count) * 10) / 10;
          result[id] = {
            slpId: id,
            averageRating: avg,
            reviewCount: count,
            badge: calculateRecognitionBadge(avg, count),
          };
        }
      });

      return result;
    } catch (err) {
      console.error('getMultipleSLPRatings exception:', err);
      return result;
    }
  },

  /**
   * Fetch all patient reviews for an SLP
   */
  async getSLPReviews(slpId: string): Promise<SLPReview[]> {
    if (!slpId) return [];
    try {
      const { data, error } = await (supabase.from('slp_reviews') as any)
        .select(`
          *,
          patient:patient_id (
            id,
            full_name,
            avatar_url
          )
        `)
        .eq('slp_id', slpId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching SLP reviews:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('getSLPReviews exception:', err);
      return [];
    }
  },

  /**
   * Check if a specific session has already been reviewed
   */
  async getReviewForSession(sessionId: string): Promise<SLPReview | null> {
    if (!sessionId) return null;
    try {
      const { data, error } = await (supabase.from('slp_reviews') as any)
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle();

      if (error) {
        console.error('Error checking session review:', error);
        return null;
      }

      return data || null;
    } catch (err) {
      console.error('getReviewForSession exception:', err);
      return null;
    }
  },

  /**
   * Submit a new review for a completed session
   */
  async submitReview({
    slpId,
    patientId,
    sessionId,
    rating,
    review,
  }: {
    slpId: string;
    patientId: string;
    sessionId: string;
    rating: number;
    review?: string;
  }): Promise<{ success: boolean; error?: string; data?: SLPReview }> {
    if (!rating || rating < 1 || rating > 5) {
      return { success: false, error: 'Rating must be between 1 and 5 stars.' };
    }
    if (!slpId || !patientId || !sessionId) {
      return { success: false, error: 'Missing required session parameters.' };
    }

    try {
      // Check if already reviewed
      const existing = await this.getReviewForSession(sessionId);
      if (existing) {
        return { success: false, error: 'You have already submitted a review for this session.' };
      }

      const { data, error } = await (supabase.from('slp_reviews') as any)
        .insert({
          slp_id: slpId,
          patient_id: patientId,
          session_id: sessionId,
          rating,
          review: review?.trim() || null,
        })
        .select('*')
        .single();

      if (error) {
        if (error.code === '23505') {
          return { success: false, error: 'A review has already been submitted for this session.' };
        }
        return { success: false, error: error.message || 'Failed to save review.' };
      }

      return { success: true, data };
    } catch (err: any) {
      console.error('submitReview exception:', err);
      return { success: false, error: err.message || 'An unexpected error occurred.' };
    }
  },
};
