-- ============================================================================
-- Migration 00002: match_clinical_embeddings RPC function for Secure RAG (Ambiguity Fixed)
-- Embedding Model: gemini-embedding-2 (Dimension: 768)
-- ============================================================================

CREATE OR REPLACE FUNCTION match_clinical_embeddings(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5,
  p_patient_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  slp_id uuid,
  patient_id uuid,
  source_type text,
  source_id uuid,
  content text,
  metadata jsonb,
  similarity float,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vector
AS $$
DECLARE
  v_slp_id uuid;
BEGIN
  -- 1. Identify the authenticated SLP from auth.uid() using fully qualified table columns
  SELECT slps.id INTO v_slp_id
  FROM slps
  WHERE slps.user_id = auth.uid();

  IF v_slp_id IS NULL THEN
    RETURN; -- Unauthorized or not an SLP
  END IF;

  -- 2. Return authorized embeddings with fully qualified table columns and parameter qualification
  RETURN QUERY
  SELECT
    ce.id,
    ce.slp_id,
    ce.patient_id,
    ce.source_type,
    ce.source_id,
    ce.content,
    ce.metadata,
    1 - (ce.embedding <=> match_clinical_embeddings.query_embedding) AS similarity,
    ce.created_at
  FROM clinical_embeddings ce
  WHERE ce.slp_id = v_slp_id
    AND (match_clinical_embeddings.p_patient_id IS NULL OR ce.patient_id = match_clinical_embeddings.p_patient_id)
    AND (
      ce.patient_id IS NULL
      OR
      EXISTS (
        SELECT 1 FROM patient_assignments pa
        WHERE pa.slp_id = v_slp_id
          AND pa.patient_id = ce.patient_id
          AND pa.status = 'ACTIVE'
      )
    )
    AND 1 - (ce.embedding <=> match_clinical_embeddings.query_embedding) >= match_clinical_embeddings.match_threshold
  ORDER BY ce.embedding <=> match_clinical_embeddings.query_embedding ASC
  LIMIT match_clinical_embeddings.match_count;
END;
$$;
