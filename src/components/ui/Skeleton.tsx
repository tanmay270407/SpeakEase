import React from "react";
import { cn } from "../../lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-200/80", className)}
      {...props}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4 animate-pulse">
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-slate-200/80 bg-white shadow-xs space-y-2 animate-pulse">
          <div className="space-y-2 flex-1 pr-4">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function TableRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 flex items-center justify-between animate-pulse gap-4">
          <div className="flex items-center gap-3 flex-1">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/5" />
            </div>
          </div>
          <Skeleton className="h-6 w-20 rounded-full shrink-0" />
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
        </div>
      ))}
    </div>
  );
}
