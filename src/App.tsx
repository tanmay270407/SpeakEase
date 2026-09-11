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
import { ExerciseDetailPage } from "./pages/user/ExerciseDetailPage";
import { ExerciseRecordingPage } from "./pages/user/ExerciseRecordingPage";
import { ExerciseResultPage } from "./pages/user/ExerciseResultPage";
import { PracticePage } from "./pages/user/PracticePage";
import { SessionResultPage } from "./pages/user/SessionResultPage";
import { UserProgress } from "./pages/user/UserProgress";
import { UserSessions } from "./pages/user/UserSessions";
import { MySLPPage } from "./pages/user/MySLPPage";
import { FindSLPsPage } from "./pages/user/FindSLPsPage";
import { UserConnectionRequestsPage } from "./pages/user/UserConnectionRequestsPage";
import { PatientProfilePage } from "./pages/user/PatientProfilePage";
import { ViewSLPProfilePage } from "./pages/user/ViewSLPProfilePage";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { SLPDashboard } from "./pages/slp/SLPDashboard";
import { SLPPatients } from "./pages/slp/SLPPatients";
import { FindPatientsPage } from "./pages/slp/FindPatientsPage";
import { SLPConnectionRequestsPage } from "./pages/slp/SLPConnectionRequestsPage";
import { SLPPatientProfile } from "./pages/slp/SLPPatientProfile";
import { SLPSessions } from "./pages/slp/SLPSessions";
import { SLPExercises } from "./pages/slp/SLPExercises";
import { SLPProfilePage } from "./pages/slp/SLPProfilePage";
import { SLPAssistant } from "./pages/slp/SLPAssistant";
import { SLPWorkflows } from "./pages/slp/SLPWorkflows";
import { DemoRoleSelectPage } from "./pages/DemoRoleSelectPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
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
            <Route path="/my-slp" element={<MySLPPage />} />
            <Route path="/find-slps" element={<FindSLPsPage />} />
            <Route path="/connection-requests" element={<UserConnectionRequestsPage />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/practice/:sessionId" element={<SessionResultPage />} />
            <Route path="/session/:sessionId" element={<SessionResultPage />} />
            <Route path="/progress" element={<UserProgress />} />
            <Route path="/sessions" element={<UserSessions />} />
            <Route path="/exercises" element={<UserExercises />} />
            <Route path="/exercises/:exerciseId" element={<ExerciseDetailPage />} />
            <Route path="/exercises/:exerciseId/record" element={<ExerciseRecordingPage />} />
            <Route path="/exercises/:exerciseId/results/:sessionId" element={<ExerciseResultPage />} />
            <Route path="/profile" element={<PatientProfilePage />} />
            <Route path="/slp-profile/:slpId" element={<ViewSLPProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
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
            <Route path="find-patients" element={<FindPatientsPage />} />
            <Route path="requests" element={<SLPConnectionRequestsPage />} />
            <Route path="patients/:id" element={<SLPPatientProfile />} />
            <Route path="profile" element={<SLPProfilePage />} />
            <Route path="sessions" element={<SLPSessions />} />
            <Route path="exercises" element={<SLPExercises />} />
            <Route path="assistant" element={<SLPAssistant />} />
            <Route path="workflows" element={<SLPWorkflows />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Admin User Management Routes */}
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminUsersPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/users" 
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminUsersPage />
              </ProtectedRoute>
            } 
          />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
