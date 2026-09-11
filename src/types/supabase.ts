export type UserRole = 'USER' | 'SLP' | 'ADMIN';
export type ReviewStatus = 'NOT_REVIEWED' | 'READY_FOR_REVIEW' | 'REVIEWED';
export type AssignmentStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface SLP {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  professional_title: string | null;
  specialization: string | null;
  organization: string | null;
  availability_status: string | null;
  profile_image: string | null;
  phone: string | null;
  license_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientAssignment {
  id: string;
  patient_id: string;
  slp_id: string;
  assigned_at: string;
  status: AssignmentStatus;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  exercise_id: string | null;
  duration: number;
  review_status: ReviewStatus;
  created_at: string;
}

export interface SpeechMetric {
  id: string;
  session_id: string;
  repetitions: number;
  pauses: number;
  prolongations: number;
  speech_rate: number | null;
  created_at: string;
}

export interface AIObservation {
  id: string;
  session_id: string;
  observation: string;
  created_at: string;
}

export interface Exercise {
  id: string;
  name: string;
  description: string | null;
  duration: number | null;
  approval_status: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicianNote {
  id: string;
  session_id: string;
  clinician_id: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface Consent {
  id: string;
  user_id: string;
  session_id: string | null;
  consent_type: string;
  consent_timestamp: string;
}

export interface AuditLog {
  id: string;
  event_type: string;
  user_id: string | null;
  description: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;
      };
      slps: {
        Row: SLP;
        Insert: Omit<SLP, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<SLP, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
      };
      patient_assignments: {
        Row: PatientAssignment;
        Insert: Omit<PatientAssignment, 'id' | 'assigned_at' | 'created_at'>;
        Update: Partial<Omit<PatientAssignment, 'id' | 'assigned_at' | 'created_at'>>;
      };
      sessions: {
        Row: Session;
        Insert: Omit<Session, 'id' | 'created_at'>;
        Update: Partial<Omit<Session, 'id' | 'created_at'>>;
      };
      speech_metrics: {
        Row: SpeechMetric;
        Insert: Omit<SpeechMetric, 'id' | 'created_at'>;
        Update: Partial<Omit<SpeechMetric, 'id' | 'created_at'>>;
      };
      ai_observations: {
        Row: AIObservation;
        Insert: Omit<AIObservation, 'id' | 'created_at'>;
        Update: Partial<Omit<AIObservation, 'id' | 'created_at'>>;
      };
      exercises: {
        Row: Exercise;
        Insert: Omit<Exercise, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Exercise, 'id' | 'created_at' | 'updated_at'>>;
      };
      clinician_notes: {
        Row: ClinicianNote;
        Insert: Omit<ClinicianNote, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ClinicianNote, 'id' | 'created_at' | 'updated_at'>>;
      };
      consents: {
        Row: Consent;
        Insert: Omit<Consent, 'id' | 'consent_timestamp'>;
        Update: Partial<Omit<Consent, 'id' | 'consent_timestamp'>>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Omit<AuditLog, 'id' | 'created_at'>;
        Update: Partial<Omit<AuditLog, 'id' | 'created_at'>>;
      };
    };
  };
}
