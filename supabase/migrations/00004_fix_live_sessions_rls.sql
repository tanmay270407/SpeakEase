-- Migration 00004: Fix live_sessions and notifications RLS policies for patient session requests

-- Fix live_sessions INSERT policy
DROP POLICY IF EXISTS live_sessions_insert_policy ON live_sessions;

CREATE POLICY live_sessions_insert_policy ON live_sessions
FOR INSERT
TO public
WITH CHECK (
  -- Patient requesting session for themselves with their active connected SLP
  (
    (patient_id = auth.uid())
    AND (requested_by = 'patient')
    AND (status = 'pending')
    AND EXISTS (
      SELECT 1 FROM patient_assignments
      WHERE patient_assignments.patient_id = auth.uid()
        AND patient_assignments.slp_id = live_sessions.slp_id
        AND patient_assignments.status = 'ACTIVE'::assignment_status
    )
  )
  OR
  -- SLP scheduling session for an active connected patient
  (
    (slp_id IN (SELECT id FROM slps WHERE user_id = auth.uid()))
    AND EXISTS (
      SELECT 1 FROM patient_assignments
      WHERE patient_assignments.patient_id = live_sessions.patient_id
        AND patient_assignments.slp_id = live_sessions.slp_id
        AND patient_assignments.status = 'ACTIVE'::assignment_status
    )
  )
  OR
  (auth.role() = 'service_role'::text)
);

-- Fix notifications INSERT policy
DROP POLICY IF EXISTS "SLPs can insert notifications for assigned patients" ON notifications;
DROP POLICY IF EXISTS notifications_insert_policy ON notifications;

CREATE POLICY notifications_insert_policy ON notifications
FOR INSERT
TO public
WITH CHECK (
  -- Own notification
  (user_id = auth.uid())
  OR
  -- SLP inserting for assigned patient
  EXISTS (
    SELECT 1 FROM patient_assignments pa
    JOIN slps s ON pa.slp_id = s.id
    WHERE pa.patient_id = notifications.user_id
      AND s.user_id = auth.uid()
  )
  OR
  -- Patient inserting for assigned SLP
  EXISTS (
    SELECT 1 FROM patient_assignments pa
    JOIN slps s ON pa.slp_id = s.id
    WHERE pa.patient_id = auth.uid()
      AND s.user_id = notifications.user_id
  )
  OR
  (auth.role() = 'service_role'::text)
);
