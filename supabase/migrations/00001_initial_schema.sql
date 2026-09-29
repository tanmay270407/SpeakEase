-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Define Enums
CREATE TYPE user_role AS ENUM ('USER', 'SLP', 'ADMIN');
CREATE TYPE review_status AS ENUM ('NOT_REVIEWED', 'READY_FOR_REVIEW', 'REVIEWED');
CREATE TYPE assignment_status AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE');

-- 1. Profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'USER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. SLPs
CREATE TABLE slps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  professional_title TEXT,
  specialization TEXT,
  organization TEXT,
  availability_status TEXT,
  profile_image TEXT,
  phone TEXT,
  license_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE slps ENABLE ROW LEVEL SECURITY;

-- 3. Patient Assignments
CREATE TABLE patient_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slp_id UUID NOT NULL REFERENCES slps(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status assignment_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(patient_id, slp_id)
);
ALTER TABLE patient_assignments ENABLE ROW LEVEL SECURITY;

-- 4. Exercises
CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  duration INTEGER, -- in seconds
  approval_status TEXT,
  approved_by UUID REFERENCES slps(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

-- 5. Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  duration INTEGER NOT NULL, -- in seconds
  review_status review_status NOT NULL DEFAULT 'NOT_REVIEWED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- 6. Speech Metrics
CREATE TABLE speech_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  repetitions INTEGER NOT NULL DEFAULT 0,
  pauses INTEGER NOT NULL DEFAULT 0,
  prolongations INTEGER NOT NULL DEFAULT 0,
  speech_rate NUMERIC, -- words per minute
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE speech_metrics ENABLE ROW LEVEL SECURITY;

-- 7. AI Observations
CREATE TABLE ai_observations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  observation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ai_observations ENABLE ROW LEVEL SECURITY;

-- 8. Clinician Notes
CREATE TABLE clinician_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  clinician_id UUID NOT NULL REFERENCES slps(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE clinician_notes ENABLE ROW LEVEL SECURITY;

-- 9. Consents
CREATE TABLE consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

-- 10. Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- --------------------------------------------------------

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "SLPs can view assigned patient profiles" ON profiles FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM patient_assignments pa 
    JOIN slps s ON pa.slp_id = s.id 
    WHERE pa.patient_id = profiles.id AND s.user_id = auth.uid()
  )
);
CREATE POLICY "Allow insert during signup" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- SLPs
CREATE POLICY "SLPs can view and update own SLP profile" ON slps FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view their assigned SLP" ON slps FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM patient_assignments pa WHERE pa.slp_id = slps.id AND pa.patient_id = auth.uid()
  )
);
CREATE POLICY "Allow insert SLP during signup" ON slps FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Patient Assignments
CREATE POLICY "Users can view their own assignments" ON patient_assignments FOR SELECT USING (patient_id = auth.uid());
CREATE POLICY "SLPs can view and manage their patient assignments" ON patient_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM slps WHERE slps.id = patient_assignments.slp_id AND slps.user_id = auth.uid())
);

-- Exercises
CREATE POLICY "Exercises are readable by all authenticated users" ON exercises FOR SELECT TO authenticated USING (true);
CREATE POLICY "SLPs can manage exercises" ON exercises FOR ALL USING (
  EXISTS (SELECT 1 FROM slps WHERE slps.user_id = auth.uid())
);

-- Sessions
CREATE POLICY "Users can view and create their own sessions" ON sessions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "SLPs can view sessions of assigned patients" ON sessions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM patient_assignments pa 
    JOIN slps s ON pa.slp_id = s.id 
    WHERE pa.patient_id = sessions.user_id AND s.user_id = auth.uid()
  )
);

-- Speech Metrics
CREATE POLICY "Users can view their own metrics" ON speech_metrics FOR SELECT USING (
  EXISTS (SELECT 1 FROM sessions WHERE sessions.id = speech_metrics.session_id AND sessions.user_id = auth.uid())
);
CREATE POLICY "Users can insert their own metrics" ON speech_metrics FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sessions WHERE sessions.id = speech_metrics.session_id AND sessions.user_id = auth.uid())
);
CREATE POLICY "SLPs can view metrics of assigned patients" ON speech_metrics FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM sessions 
    JOIN patient_assignments pa ON sessions.user_id = pa.patient_id
    JOIN slps s ON pa.slp_id = s.id
    WHERE sessions.id = speech_metrics.session_id AND s.user_id = auth.uid()
  )
);

-- AI Observations
CREATE POLICY "Users can view own AI observations" ON ai_observations FOR SELECT USING (
  EXISTS (SELECT 1 FROM sessions WHERE sessions.id = ai_observations.session_id AND sessions.user_id = auth.uid())
);
CREATE POLICY "Users can insert own AI observations" ON ai_observations FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sessions WHERE sessions.id = ai_observations.session_id AND sessions.user_id = auth.uid())
);
CREATE POLICY "SLPs can view AI observations of assigned patients" ON ai_observations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM sessions 
    JOIN patient_assignments pa ON sessions.user_id = pa.patient_id
    JOIN slps s ON pa.slp_id = s.id
    WHERE sessions.id = ai_observations.session_id AND s.user_id = auth.uid()
  )
);

-- Clinician Notes
CREATE POLICY "SLPs can view and manage their own notes" ON clinician_notes FOR ALL USING (
  EXISTS (SELECT 1 FROM slps WHERE slps.id = clinician_notes.clinician_id AND slps.user_id = auth.uid())
);

-- Consents
CREATE POLICY "Users manage their own consents" ON consents FOR ALL USING (user_id = auth.uid());
CREATE POLICY "SLPs can view consents of assigned patients" ON consents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM patient_assignments pa 
    JOIN slps s ON pa.slp_id = s.id 
    WHERE pa.patient_id = consents.user_id AND s.user_id = auth.uid()
  )
);

-- Audit Logs
CREATE POLICY "Users can insert audit logs" ON audit_logs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view audit logs" ON audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN')
);
