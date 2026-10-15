-- Migration 00003: Realtime Security Policies for Private WebRTC Signaling Channels
-- Enforces Row-Level Security on realtime.messages for room:<live_session_id> channels

-- 1. SELECT Policy: Permit receiving broadcast messages only for authorized patient or assigned SLP
DROP POLICY IF EXISTS "Allow patient or slp to receive live session messages" ON realtime.messages;

CREATE POLICY "Allow patient or slp to receive live session messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND EXISTS (
    SELECT 1 
    FROM public.live_sessions ls
    JOIN public.slps s ON s.id = ls.slp_id
    JOIN public.patient_assignments pa 
      ON pa.patient_id = ls.patient_id 
     AND pa.slp_id = ls.slp_id
    WHERE realtime.topic() = ('room:' || ls.id::text)
      AND ls.status = 'confirmed'
      AND pa.status = 'ACTIVE'
      AND (
        ls.patient_id = auth.uid()
        OR s.user_id = auth.uid()
      )
  )
);

-- 2. INSERT Policy: Permit sending broadcast messages only for authorized patient or assigned SLP
DROP POLICY IF EXISTS "Allow patient or slp to send live session messages" ON realtime.messages;

CREATE POLICY "Allow patient or slp to send live session messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.messages.extension = 'broadcast'
  AND EXISTS (
    SELECT 1 
    FROM public.live_sessions ls
    JOIN public.slps s ON s.id = ls.slp_id
    JOIN public.patient_assignments pa 
      ON pa.patient_id = ls.patient_id 
     AND pa.slp_id = ls.slp_id
    WHERE realtime.topic() = ('room:' || ls.id::text)
      AND ls.status = 'confirmed'
      AND pa.status = 'ACTIVE'
      AND (
        ls.patient_id = auth.uid()
        OR s.user_id = auth.uid()
      )
  )
);
