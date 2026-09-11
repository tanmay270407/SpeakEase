import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types/supabase';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  demoOnly?: boolean;
}

export function ProtectedRoute({ children, allowedRoles, demoOnly }: ProtectedRouteProps) {
  const { session, profile, isDemoAccount, demoRole, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
          <p className="text-sm text-slate-500 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 1. If route is demoOnly, only the demo account is allowed
  if (demoOnly) {
    if (!isDemoAccount) {
      if (profile.role === 'SLP') {
        return <Navigate to="/slp" replace />;
      }
      return <Navigate to="/dashboard" replace />;
    }
    return <>{children}</>;
  }

  // 2. Demo Account Role Resolution
  // The verified demo presenter account can dynamically access both Patient and SLP experiences
  if (isDemoAccount) {
    if (allowedRoles && !allowedRoles.includes(demoRole)) {
      if (demoRole === 'SLP') {
        return <Navigate to="/slp" replace />;
      }
      return <Navigate to="/dashboard" replace />;
    }
    return <>{children}</>;
  }

  // 3. Strict Security for Normal Accounts
  // Normal USER and SLP accounts can NEVER switch roles or access unauthorized areas
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    if (profile.role === 'SLP') {
      return <Navigate to="/slp" replace />;
    } else if (profile.role === 'USER') {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
