export type UserRole = 'USER' | 'SLP' | 'ADMIN';
export type ReviewStatus = 'NOT_REVIEWED' | 'READY_FOR_REVIEW' | 'REVIEWED';
export type AssignmentStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE';
export type ConnectionRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';
export type ConnectionUserType = 'PATIENT' | 'SLP';

export interface ConnectionRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  sender_type: ConnectionUserType;
  receiver_type: ConnectionUserType;
  status: ConnectionRequestStatus;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id?: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  practice_goal?: string | null;
  notification_preferences?: {
    email_alerts?: boolean;
    session_reminders?: boolean;
    clinical_updates?: boolean;
  } | null;
  privacy_settings?: {
    share_metrics_with_slp?: boolean;
    allow_audio_analytics?: boolean;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
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
  avatar_url?: string | null;
  bio?: string | null;
  qualification?: string | null;
  years_of_experience?: string | null;
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
  instructions?: string | null;
  category?: string | null;
  status?: string | null;
  duration?: number | null;
  approval_status?: string | null;
  approved_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type PatientExerciseStatus = 'enabled' | 'disabled';

export interface PatientExercise {
  id: string;
  patient_id: string;
  exercise_id: string;
  assigned_by: string | null;
  status: PatientExerciseStatus;
  assigned_at: string;
  updated_at: string;
  exercises?: Exercise;
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

export interface Notification {
  id: string;
  user_id: string;
  session_id: string | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface SLPAvailability {
  id: string;
  slp_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  slot_duration?: number;
  created_at?: string;
  updated_at?: string;
}

export type LiveSessionStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'completed';

export interface LiveSession {
  id: string;
  patient_id: string;
  slp_id: string;
  scheduled_start: string;
  scheduled_end: string;
  duration: number;
  status: LiveSessionStatus;
  requested_by: 'slp' | 'patient';
  purpose?: string | null;
  meeting_id?: string | null;
  actual_started_at?: string | null;
  actual_ended_at?: string | null;
  actual_duration?: number | null;
  created_at?: string;
  updated_at?: string;
  patient?: Profile;
  slp?: SLP;
}

export interface SLPReview {
  id: string;
  slp_id: string;
  patient_id: string;
  session_id: string;
  rating: number;
  review?: string | null;
  created_at: string;
  updated_at: string;
  patient?: Profile;
  slp?: SLP;
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
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, 'id' | 'created_at'>;
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>;
      };
      connection_requests: {
        Row: ConnectionRequest;
        Insert: Omit<ConnectionRequest, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ConnectionRequest, 'id' | 'created_at' | 'updated_at'>>;
      };
      slp_availability: {
        Row: SLPAvailability;
        Insert: Omit<SLPAvailability, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<SLPAvailability, 'id' | 'created_at' | 'updated_at'>>;
      };
      live_sessions: {
        Row: LiveSession;
        Insert: Omit<LiveSession, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<LiveSession, 'id' | 'created_at' | 'updated_at'>>;
      };
      slp_reviews: {
        Row: SLPReview;
        Insert: Omit<SLPReview, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<SLPReview, 'id' | 'created_at' | 'updated_at'>>;
      };
    };
  };
}
