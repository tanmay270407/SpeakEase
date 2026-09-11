CREATE TABLE IF NOT EXISTS session_audio (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE UNIQUE,
  audio_data BYTEA NOT NULL,
  content_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE session_audio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own audio" ON session_audio FOR SELECT USING (
  EXISTS (SELECT 1 FROM sessions WHERE sessions.id = session_audio.session_id AND sessions.user_id = auth.uid())
);
CREATE POLICY "Users can insert their own audio" ON session_audio FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sessions WHERE sessions.id = session_audio.session_id AND sessions.user_id = auth.uid())
);
CREATE POLICY "SLPs can view audio of assigned patients" ON session_audio FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM sessions 
    JOIN patient_assignments pa ON sessions.user_id = pa.patient_id
    JOIN slps s ON pa.slp_id = s.id
    WHERE sessions.id = session_audio.session_id AND s.user_id = auth.uid()
  )
);
