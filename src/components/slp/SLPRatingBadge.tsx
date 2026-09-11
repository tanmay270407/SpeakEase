import React from 'react';
import { Star, Trophy, Award, CheckCircle } from 'lucide-react';

interface SLPRatingBadgeProps {
  averageRating: number | null;
  reviewCount: number;
  badge?: 'Top Rated' | 'Highly Rated' | 'Verified' | null;
  size?: 'sm' | 'md' | 'lg';
  showDetails?: boolean;
  className?: string;
}

export function SLPRatingBadge({
  averageRating,
  reviewCount,
  badge,
  size = 'md',
  showDetails = true,
  className = '',
}: SLPRatingBadgeProps) {
  if (!reviewCount || averageRating === null) {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs text-slate-500 font-medium ${className}`}>
        <Star className="w-3.5 h-3.5 text-slate-300 stroke-[1.5]" />
        <span>No ratings yet</span>
      </div>
    );
  }

  const formattedRating = averageRating.toFixed(1);

  const getBadgeIcon = (b: string) => {
    switch (b) {
      case 'Top Rated':
        return <Trophy className="w-3 h-3 text-amber-600 shrink-0" />;
      case 'Highly Rated':
        return <Award className="w-3 h-3 text-indigo-600 shrink-0" />;
      case 'Verified':
      default:
        return <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />;
    }
  };

  const getBadgeClass = (b: string) => {
    switch (b) {
      case 'Top Rated':
        return 'bg-amber-50 text-amber-900 border-amber-200/80';
      case 'Highly Rated':
        return 'bg-indigo-50 text-indigo-900 border-indigo-200/80';
      case 'Verified':
      default:
        return 'bg-slate-50 text-slate-800 border-slate-200';
    }
  };

  if (size === 'sm') {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
        <div className="flex items-center gap-1 font-bold text-slate-900">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
          <span>{formattedRating}</span>
        </div>
        <span className="text-slate-400">({reviewCount})</span>
        {badge && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getBadgeClass(badge)}`}>
            {getBadgeIcon(badge)}
            {badge}
          </span>
        )}
      </div>
    );
  }

  if (size === 'lg') {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-2xl font-black tracking-tight text-slate-900">
            <Star className="w-6 h-6 fill-amber-400 text-amber-400 shrink-0" />
            <span>{formattedRating}</span>
          </div>
          {badge && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-xs ${getBadgeClass(badge)}`}>
              {getBadgeIcon(badge)}
              {badge}
            </span>
          )}
        </div>
        {showDetails && (
          <p className="text-xs text-slate-500 font-medium">
            {reviewCount} {reviewCount === 1 ? 'Patient Review' : 'Patient Reviews'}
          </p>
        )}
      </div>
    );
  }

  // Medium (default)
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <div className="flex items-center gap-1 font-bold text-slate-900 text-sm">
        <Star className="w-4 h-4 fill-amber-400 text-amber-400 shrink-0" />
        <span>{formattedRating}</span>
      </div>
      {showDetails && (
        <span className="text-xs text-slate-500 font-medium">
          · {reviewCount} {reviewCount === 1 ? 'Review' : 'Reviews'}
        </span>
      )}
      {badge && (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${getBadgeClass(badge)}`}>
          {getBadgeIcon(badge)}
          {badge}
        </span>
      )}
    </div>
  );
}
