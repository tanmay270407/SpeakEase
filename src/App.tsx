/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PublicLayout } from "./layouts/PublicLayout";
import { UserLayout } from "./layouts/UserLayout";
import { SLPLayout } from "./layouts/SLPLayout";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignupPage } from "./pages/auth/SignupPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { UserDashboard } from "./pages/user/UserDashboard";
import { UserExercises } from "./pages/user/UserExercises";
import { PracticePage } from "./pages/user/PracticePage";
import { SessionResultPage } from "./pages/user/SessionResultPage";
import { UserProgress } from "./pages/user/UserProgress";
import { UserSessions } from "./pages/user/UserSessions";
import { SLPDashboard } from "./pages/slp/SLPDashboard";
import { SLPPatients } from "./pages/slp/SLPPatients";
import { SLPPatientProfile } from "./pages/slp/SLPPatientProfile";
import { SLPAssistant } from "./pages/slp/SLPAssistant";
import { SLPWorkflows } from "./pages/slp/SLPWorkflows";
import { DemoRoleSelectPage } from "./pages/DemoRoleSelectPage";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Demo Role Selection (Demo Presentation Account Only) */}
          <Route 
            path="/demo-role" 
            element={
              <ProtectedRoute demoOnly>
                <DemoRoleSelectPage />
              </ProtectedRoute>
            } 
          />

          {/* Public Routes */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Route>

          {/* User Routes */}
          <Route 
            element={
              <ProtectedRoute allowedRoles={['USER']}>
                <UserLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<UserDashboard />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/practice/:sessionId" element={<SessionResultPage />} />
            <Route path="/progress" element={<UserProgress />} />
            <Route path="/sessions" element={<UserSessions />} />
            <Route path="/exercises" element={<UserExercises />} />
            <Route path="/settings" element={<div className="p-4">Settings Page placeholder</div>} />
          </Route>

          {/* SLP Routes */}
          <Route 
            path="/slp" 
            element={
              <ProtectedRoute allowedRoles={['SLP']}>
                <SLPLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<SLPDashboard />} />
            <Route path="patients" element={<SLPPatients />} />
            <Route path="patients/:id" element={<SLPPatientProfile />} />
            <Route path="sessions" element={<div className="p-4">Sessions Page placeholder</div>} />
            <Route path="exercises" element={<div className="p-4">Exercises Page placeholder</div>} />
            <Route path="assistant" element={<SLPAssistant />} />
            <Route path="workflows" element={<SLPWorkflows />} />
            <Route path="settings" element={<div className="p-4">Settings Page placeholder</div>} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
