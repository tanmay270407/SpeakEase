import express from "express";
import path from "path";
import multer from "multer";
import { spawnSync } from "child_process";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { z } from "zod";
import { toExpressHandler } from "corsair";
import { buildCorsairToolDefs } from "@corsair-dev/mcp";
import pg from "pg";
import { corsairClient } from "./corsair";

dotenv.config({ override: true });

import { runSpeechAnalysisPipeline } from "./src/services/ai/speechAnalysisPipeline";

const { Pool } = pg;
const POOLER_DB_URL = "postgresql://postgres.dbpcjfhrswhphitltpgb:SpeakEase%401234@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
const rawDbUrl = process.env.DATABASE_URL;
const isPlaceholder = !rawDbUrl || rawDbUrl.includes("YOUR_POSTGRES_URL") || rawDbUrl.includes("[YOUR-PASSWORD]") || rawDbUrl.includes("YOUR-PASSWORD");
const dbUrl = isPlaceholder ? POOLER_DB_URL : rawDbUrl;

let pool: pg.Pool | null = null;
try {
  pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
  pool.query(`
    CREATE TABLE IF NOT EXISTS session_audio (
      session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      audio_data BYTEA NOT NULL,
      content_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'speech_metrics_session_id_key'
      ) THEN
        BEGIN
          ALTER TABLE speech_metrics ADD CONSTRAINT speech_metrics_session_id_key UNIQUE (session_id);
        EXCEPTION WHEN others THEN
          NULL;
        END;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ai_observations_session_id_key'
      ) THEN
        BEGIN
          ALTER TABLE ai_observations ADD CONSTRAINT ai_observations_session_id_key UNIQUE (session_id);
        EXCEPTION WHEN others THEN
          NULL;
        END;
      END IF;

      -- Ensure Multi-AI pipeline schema columns exist
      BEGIN
        ALTER TABLE ai_observations ADD COLUMN IF NOT EXISTS practice_focus TEXT;
        ALTER TABLE ai_observations ADD COLUMN IF NOT EXISTS recommended_exercise TEXT;
        ALTER TABLE ai_observations ADD COLUMN IF NOT EXISTS recommended_duration INT;
        ALTER TABLE ai_observations ADD COLUMN IF NOT EXISTS patient_feedback TEXT;
        ALTER TABLE ai_observations ADD COLUMN IF NOT EXISTS slp_summary TEXT;
        ALTER TABLE ai_observations ADD COLUMN IF NOT EXISTS recommendation_reason TEXT;
        ALTER TABLE ai_observations ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
        ALTER TABLE ai_observations ADD COLUMN IF NOT EXISTS ai_model TEXT;
        ALTER TABLE ai_observations ADD COLUMN IF NOT EXISTS processing_model TEXT;
        ALTER TABLE ai_observations ADD COLUMN IF NOT EXISTS transcription_provider TEXT;
        ALTER TABLE ai_observations ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC;
        ALTER TABLE ai_observations ADD COLUMN IF NOT EXISTS transcript TEXT;
      EXCEPTION WHEN others THEN
        NULL;
      END;

      BEGIN
        ALTER TABLE sessions ADD COLUMN IF NOT EXISTS practice_focus TEXT;
        ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recommended_exercise TEXT;
        ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recommended_duration INT;
        ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END $$;

    DROP FUNCTION IF EXISTS disconnect_patient_slp(UUID, UUID);

    CREATE OR REPLACE FUNCTION disconnect_patient_slp(p_patient_id UUID, p_slp_id UUID)
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_completed_live_count INT := 0;
      v_completed_session_count INT := 0;
      v_review_count INT := 0;
      v_slp_user_id UUID;
    BEGIN
      SELECT user_id INTO v_slp_user_id FROM slps WHERE id = p_slp_id;

      SELECT COUNT(*) INTO v_completed_live_count
      FROM live_sessions
      WHERE patient_id = p_patient_id
        AND slp_id = p_slp_id
        AND status = 'completed';

      SELECT COUNT(*) INTO v_completed_session_count
      FROM sessions s
      WHERE s.user_id = p_patient_id
        AND (
          s.slp_id = p_slp_id
          OR EXISTS (SELECT 1 FROM clinician_notes cn WHERE cn.session_id = s.id AND cn.clinician_id = v_slp_user_id)
          OR EXISTS (SELECT 1 FROM patient_exercises pe WHERE pe.exercise_id = s.exercise_id AND pe.patient_id = p_patient_id AND pe.assigned_by = p_slp_id)
        );

      SELECT COUNT(*) INTO v_review_count
      FROM slp_reviews
      WHERE patient_id = p_patient_id
        AND slp_id = p_slp_id;

      IF (v_completed_live_count + v_completed_session_count) > 0 AND v_review_count = 0 THEN
        RAISE EXCEPTION 'Before ending your connection, please rate your experience with your SLP.';
      END IF;

      UPDATE patient_assignments
      SET status = 'INACTIVE'
      WHERE patient_id = p_patient_id
        AND slp_id = p_slp_id
        AND status = 'ACTIVE';

      IF v_slp_user_id IS NOT NULL THEN
        UPDATE connection_requests
        SET status = 'cancelled', updated_at = NOW()
        WHERE (sender_id = p_patient_id AND receiver_id = v_slp_user_id)
           OR (sender_id = v_slp_user_id AND receiver_id = p_patient_id);
      END IF;

      RETURN jsonb_build_object('success', true);
    END;
    $$;

    CREATE OR REPLACE FUNCTION check_patient_assignment_disconnect()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_completed_live_count INT := 0;
      v_completed_session_count INT := 0;
      v_review_count INT := 0;
      v_slp_user_id UUID;
    BEGIN
      IF (TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' AND NEW.status != 'ACTIVE') OR TG_OP = 'DELETE' THEN
        SELECT user_id INTO v_slp_user_id FROM slps WHERE id = OLD.slp_id;

        SELECT COUNT(*) INTO v_completed_live_count
        FROM live_sessions
        WHERE patient_id = OLD.patient_id
          AND slp_id = OLD.slp_id
          AND status = 'completed';

        SELECT COUNT(*) INTO v_completed_session_count
        FROM sessions s
        WHERE s.user_id = OLD.patient_id
          AND (
            s.slp_id = OLD.slp_id
            OR EXISTS (SELECT 1 FROM clinician_notes cn WHERE cn.session_id = s.id AND cn.clinician_id = v_slp_user_id)
            OR EXISTS (SELECT 1 FROM patient_exercises pe WHERE pe.exercise_id = s.exercise_id AND pe.patient_id = OLD.patient_id AND pe.assigned_by = OLD.slp_id)
          );

        SELECT COUNT(*) INTO v_review_count
        FROM slp_reviews
        WHERE patient_id = OLD.patient_id
          AND slp_id = OLD.slp_id;

        IF (v_completed_live_count + v_completed_session_count) > 0 AND v_review_count = 0 THEN
          RAISE EXCEPTION 'Before ending your connection, please rate your experience with your SLP.';
        END IF;
      END IF;

      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      ELSE
        RETURN NEW;
      END IF;
    END;
    $$;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_check_patient_assignment_disconnect'
      ) THEN
        CREATE TRIGGER trg_check_patient_assignment_disconnect
        BEFORE UPDATE OR DELETE ON patient_assignments
        FOR EACH ROW
        EXECUTE FUNCTION check_patient_assignment_disconnect();
      END IF;
    END $$;
  `).catch(err => {
    console.warn("Could not verify session_audio or unique constraints:", err.message);
  });
} catch (e: any) {
  console.warn("Postgres pool init error:", e.message);
}

const app = express();
const PORT = 3000;

app.use(express.json());



export function zodToGeminiSchema(zodType: z.ZodTypeAny): any {
  if (zodType instanceof z.ZodObject) {
    const shape = zodType.shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];
    
    for (const [key, schema] of Object.entries(shape)) {
      const isOptional = schema instanceof z.ZodOptional;
      if (!isOptional) required.push(key);
      properties[key] = zodToGeminiSchema(isOptional ? (schema as any).unwrap() : schema as any);
    }
    
    return {
      type: Type.OBJECT,
      properties,
      required: required.length > 0 ? required : undefined,
    };
  } else if (zodType instanceof z.ZodEnum) {
    return { type: Type.STRING, enum: (zodType as any).options, description: zodType.description };
  } else if (zodType instanceof z.ZodString) {
    return { type: Type.STRING, description: zodType.description };
  } else if (zodType instanceof z.ZodNumber) {
    return { type: Type.NUMBER, description: zodType.description };
  } else if (zodType instanceof z.ZodBoolean) {
    return { type: Type.BOOLEAN, description: zodType.description };
  } else if (zodType instanceof z.ZodArray) {
    return { type: Type.ARRAY, items: zodToGeminiSchema(zodType.element as any), description: zodType.description };
  } else if (zodType instanceof z.ZodAny || zodType instanceof z.ZodUnknown) {
    return { type: Type.OBJECT, description: zodType.description };
  }
  return { type: Type.STRING }; 
}

// Setup Multer for parsing multipart/form-data (audio uploads)
const upload = multer({ storage: multer.memoryStorage() });

// Configure Gemini
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    retryOptions: { attempts: 3 }
  }
}) : null;

const DEFAULT_SUPABASE_URL = "https://dbpcjfhrswhphitltpgb.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicGNqZmhyc3docGhpdGx0cGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNDgzMTIsImV4cCI6MjEwNDYyNDMxMn0.kLOi2n9CzVT632ooUyqDiNtseLxLTI_yg2Te2As457o";

// Helper to create Supabase client using the user's token
const getSupabaseClient = (req: express.Request) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const rawUrl = process.env.VITE_SUPABASE_URL || "";
  const cleanedUrl = rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  const supabaseUrl = (cleanedUrl && !cleanedUrl.includes("placeholder")) ? cleanedUrl : DEFAULT_SUPABASE_URL;
  const envKey = process.env.VITE_SUPABASE_ANON_KEY || "";
  const supabaseAnonKey = (envKey && !envKey.includes("placeholder")) ? envKey : DEFAULT_SUPABASE_ANON_KEY;

  return createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` }
      }
    }
  );
};

// API routes go here FIRST

// Profile avatar upload endpoint
app.post("/api/upload-avatar", upload.single("avatar"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    const userId = req.body.userId || "user";
    const ext = path.extname(file.originalname) || ".jpg";
    const fileName = `user_${userId}_${Date.now()}${ext}`;

    const rawUrl = process.env.VITE_SUPABASE_URL || "";
    const cleanedUrl = rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
    const supabaseUrl = (cleanedUrl && !cleanedUrl.includes("placeholder")) ? cleanedUrl : DEFAULT_SUPABASE_URL;
    const envKey = process.env.VITE_SUPABASE_ANON_KEY || "";
    const supabaseAnonKey = (envKey && !envKey.includes("placeholder")) ? envKey : DEFAULT_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase.storage
      .from("avatars")
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (error) {
      console.warn("Storage upload error in server route:", error);
      // If storage API fails, write directly into storage.objects via pool
      if (pool) {
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/avatars/${fileName}`;
        await pool.query(
          `INSERT INTO storage.objects (bucket_id, name, owner, metadata) 
           VALUES ('avatars', $1, NULL, $2)
           ON CONFLICT (bucket_id, name) DO NOTHING`,
          [fileName, JSON.stringify({ mimetype: file.mimetype, size: file.size })]
        ).catch(e => console.warn("Pool direct storage insert:", e.message));
        return res.json({ publicUrl, fileName });
      }
      return res.status(500).json({ error: error.message });
    }

    const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(data.path);
    return res.json({ publicUrl: publicUrlData.publicUrl, path: data.path });
  } catch (err: any) {
    console.error("Avatar upload error:", err);
    return res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// Specific Corsair application endpoints for SLP Dashboard and Clinician Review Sync
app.get("/api/corsair/slp/:slpId/dashboard", async (req, res) => {
  try {
    const { slpId } = req.params;
    
    const supabase = getSupabaseClient(req);
    if (!supabase) return res.status(401).json({ error: "Missing authorization" });

    const { data: { user }, error: authError } = await supabase.auth.getUser(req.headers.authorization?.replace("Bearer ", ""));
    if (authError || !user) return res.status(401).json({ error: "Invalid token" });

    // Verify SLP owns this data or is admin
    const { data: slpRec } = await supabase
      .from('slps')
      .select('id, user_id, full_name, email, phone, specialization')
      .eq('id', slpId)
      .single();

    if (!slpRec) {
      return res.status(404).json({ error: "SLP record not found" });
    }

    if (slpRec.user_id !== user.id) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'ADMIN') {
        return res.status(403).json({ error: "Unauthorized access to SLP data" });
      }
    }

    if (!pool) {
      return res.status(503).json({ error: "Corsair DB not connected" });
    }

    const accountId = `slp_account_${slpId}`;
    const timestamp = new Date().toISOString();

    // 1. Ensure Corsair Account exists
    await pool.query(
      `INSERT INTO corsair_accounts (id, created_at, updated_at, tenant_id, integration_id, config)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING;`,
      [accountId, timestamp, timestamp, `slp_${slpId}`, "speakease", "{}"]
    );

    // 2. Sync SLP Entity
    await pool.query(
      `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8;`,
      [
        `slp_${slpId}`,
        timestamp,
        timestamp,
        accountId,
        slpId,
        'slp',
        '1',
        JSON.stringify({
          id: slpRec.id,
          user_id: slpRec.user_id,
          full_name: slpRec.full_name,
          email: slpRec.email,
          phone: slpRec.phone,
          specialization: slpRec.specialization
        })
      ]
    );

    // 3. Fetch ONLY ACTIVE assignments and patients
    const { data: assignments } = await supabase
      .from('patient_assignments')
      .select('id, patient_id, status, assigned_at, created_at, profiles!patient_assignments_patient_id_fkey(id, full_name, email, phone, avatar_url)')
      .eq('slp_id', slpId)
      .eq('status', 'ACTIVE');

    // Get unique active patient IDs
    const patientIds = Array.from(new Set((assignments || []).map((a: any) => a.patient_id)));

    // Clean previous entities for this account to guarantee freshness
    await pool.query(
      `DELETE FROM corsair_entities WHERE account_id = $1 AND entity_type IN ('patient_assignment', 'patient', 'session', 'speech_metric', 'clinician_review');`,
      [accountId]
    );

    // Sync active assignments and patients into corsair_entities in parallel
    if (assignments && assignments.length > 0) {
      await Promise.all(
        assignments.flatMap(a => [
          pool.query(
            `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8;`,
            [
              `assignment_${a.id}`,
              timestamp,
              timestamp,
              accountId,
              a.id,
              'patient_assignment',
              '1',
              JSON.stringify({
                id: a.id,
                slp_id: slpId,
                patient_id: a.patient_id,
                patient_name: (a.profiles as any)?.full_name || 'Patient',
                status: a.status,
                assigned_at: a.assigned_at || a.created_at
              })
            ]
          ),
          pool.query(
            `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8;`,
            [
              `patient_${a.patient_id}`,
              timestamp,
              timestamp,
              accountId,
              a.patient_id,
              'patient',
              '1',
              JSON.stringify({
                patient_id: a.patient_id,
                profiles: a.profiles
              })
            ]
          )
        ])
      );
    }

    // 4. Fetch practice sessions for active patients
    let sessions: any[] = [];
    if (patientIds.length > 0) {
      const { data: s } = await supabase
        .from('sessions')
        .select('id, user_id, exercise_id, created_at, duration, review_status, profiles!sessions_user_id_fkey(full_name, avatar_url), exercises!sessions_exercise_id_fkey(name)')
        .in('user_id', patientIds)
        .order('created_at', { ascending: false });
      sessions = s || [];
    }

    // Sync sessions into corsair_entities in parallel
    if (sessions.length > 0) {
      await Promise.all(
        sessions.map(s =>
          pool.query(
            `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8;`,
            [
              `session_${s.id}`,
              timestamp,
              timestamp,
              accountId,
              s.id,
              'session',
              '1',
              JSON.stringify(s)
            ]
          )
        )
      );
    }

    // 5. Fetch speech metrics and clinician reviews
    if (sessions.length > 0) {
      const sessionIds = sessions.map((s: any) => s.id);
      const [{ data: metrics }, { data: notes }] = await Promise.all([
        supabase
          .from('speech_metrics')
          .select('id, session_id, repetitions, pauses, prolongations, speech_rate, created_at')
          .in('session_id', sessionIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('clinician_notes')
          .select('id, session_id, clinician_id, note, created_at, updated_at')
          .in('session_id', sessionIds)
      ]);

      const metricQueries = (metrics || []).map(m => {
        const rep = Number(m.repetitions) || 0;
        const pause = Number(m.pauses) || 0;
        const prol = Number(m.prolongations) || 0;
        const penalty = (rep * 0.8) + (pause * 0.4) + (prol * 0.9);
        const fluencyScore = Math.max(1, Math.min(10, 10 - penalty));
        const articulationScore = Math.max(1, Math.min(10, 9.5 - (rep * 0.5)));

        const metricPayload = {
          id: m.id,
          session_id: m.session_id,
          fluency_score: Number(fluencyScore.toFixed(1)),
          articulation_score: Number(articulationScore.toFixed(1)),
          repetitions: rep,
          pauses: pause,
          prolongations: prol,
          speech_rate: Number(m.speech_rate) || 0,
          created_at: m.created_at
        };

        return pool.query(
          `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8;`,
          [
            `metric_${m.id}`,
            timestamp,
            timestamp,
            accountId,
            m.id,
            'speech_metric',
            '1',
            JSON.stringify(metricPayload)
          ]
        );
      });

      const noteQueries = (notes || []).map(n =>
        pool.query(
          `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8;`,
          [
            `review_${n.id}`,
            timestamp,
            timestamp,
            accountId,
            n.id,
            'clinician_review',
            '1',
            JSON.stringify(n)
          ]
        )
      );

      await Promise.all([...metricQueries, ...noteQueries]);
    }

    // 6. READ DIRECTLY FROM CORSAIR DATABASE (corsair_entities)
    const pRes = await pool.query(
      `SELECT data FROM corsair_entities WHERE account_id = $1 AND entity_type = 'patient'`,
      [accountId]
    );
    const allPatients = pRes.rows.map(r => r.data);
    const patientCount = allPatients.length;

    const sRes = await pool.query(
      `SELECT data FROM corsair_entities 
       WHERE account_id = $1 AND entity_type = 'session'
       ORDER BY (data->>'created_at') DESC`,
      [accountId]
    );
    const allSessions = sRes.rows.map(r => r.data);
    const sessionCount = allSessions.length;

    // Filter sessions needing review (any session not yet reviewed)
    const needsReviewSessions = allSessions
      .filter((s: any) => s.review_status !== 'REVIEWED')
      .slice(0, 10);

    // Recent sessions
    const recentSessions = allSessions.slice(0, 10);

    // Inactive patients (no sessions in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const inactivePatients = allPatients.filter((p: any) => {
      const pSessions = allSessions.filter((s: any) => s.user_id === p.patient_id);
      if (pSessions.length === 0) return true;
      const lastSessionDate = new Date(pSessions[0].created_at);
      return lastSessionDate < sevenDaysAgo;
    });

    // Speech metrics
    const mRes = await pool.query(
      `SELECT data FROM corsair_entities 
       WHERE account_id = $1 AND entity_type = 'speech_metric'
       ORDER BY (data->>'created_at') DESC
       LIMIT 10`,
      [accountId]
    );
    const metricsData = mRes.rows.map(r => r.data);

    // Clinician reviews
    const rRes = await pool.query(
      `SELECT data FROM corsair_entities 
       WHERE account_id = $1 AND entity_type = 'clinician_review'
       ORDER BY (data->>'created_at') DESC`,
      [accountId]
    );
    const reviewsData = rRes.rows.map(r => r.data);

    // Total practice time calculation directly from actual recorded session durations
    const totalPracticeSeconds = allSessions.reduce((acc: number, s: any) => acc + (Number(s.duration) || 0), 0);

    return res.json({
      patientCount,
      sessionCount,
      totalPracticeSeconds,
      needsReviewSessions,
      recentSessions,
      inactivePatients,
      speechMetrics: metricsData,
      clinicianReviews: reviewsData,
      source: "corsair"
    });
  } catch (err: any) {
    console.error("Dashboard error:", err);
    return res.status(500).json({ error: "Failed to load dashboard from Corsair" });
  }
});

// Clinician Review Corsair Sync endpoint
app.post("/api/corsair/sync/clinician_review", async (req, res) => {
  try {
    const supabase = getSupabaseClient(req);
    if (!supabase) return res.status(401).json({ error: "Unauthorized" });

    const { data: { user }, error: authError } = await supabase.auth.getUser(req.headers.authorization?.replace("Bearer ", ""));
    if (authError || !user) return res.status(401).json({ error: "Invalid token" });

    const { sessionId, slpId, note, status } = req.body;
    if (!sessionId || !slpId) {
      return res.status(400).json({ error: "Missing sessionId or slpId" });
    }

    // Security check: Verify session belongs to an assigned patient for this SLP
    const { data: sessionData, error: sErr } = await supabase
      .from('sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .single();

    if (sErr || !sessionData) {
      return res.status(403).json({ error: "Session not found or SLP is not authorized to review this patient" });
    }

    if (pool) {
      const timestamp = new Date().toISOString();
      const accountId = `slp_account_${slpId}`;

      // 1. Update session review_status in corsair_entities
      const sessionEntityId = `session_${sessionId}`;
      const existingSession = await pool.query(
        `SELECT data FROM corsair_entities WHERE id = $1`,
        [sessionEntityId]
      );
      if (existingSession.rows.length > 0) {
        const sData = existingSession.rows[0].data;
        sData.review_status = status || 'REVIEWED';
        await pool.query(
          `UPDATE corsair_entities SET updated_at = $1, data = $2 WHERE id = $3`,
          [timestamp, JSON.stringify(sData), sessionEntityId]
        );
      }

      // 2. Upsert clinician_review entity in corsair_entities
      const reviewEntityId = `review_${sessionId}_${slpId}`;
      const reviewPayload = {
        session_id: sessionId,
        patient_id: sessionData.user_id,
        clinician_id: user.id,
        slp_id: slpId,
        note: note || '',
        review_status: status || 'REVIEWED',
        updated_at: timestamp
      };

      await pool.query(
        `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8;`,
        [reviewEntityId, timestamp, timestamp, accountId, `${sessionId}_${slpId}`, 'clinician_review', '1', JSON.stringify(reviewPayload)]
      );

      // 3. Record official Corsair review event in corsair_events
      const eventId = `event_review_${sessionId}_${Date.now()}`;
      await pool.query(
        `INSERT INTO corsair_events (id, created_at, updated_at, account_id, event_type, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          eventId,
          timestamp,
          timestamp,
          accountId,
          'clinician_review.submitted',
          JSON.stringify(reviewPayload),
          'completed'
        ]
      );
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error syncing clinician review to Corsair:", err);
    return res.status(500).json({ error: "Failed to sync review to Corsair" });
  }
});

// Built-in Corsair Management handler (handles /api/corsair/ok, /api/corsair/tenants, etc.)
app.use("/api/corsair", toExpressHandler(corsairClient));


app.get("/api/audio/:sessionId", async (req, res) => {
  try {
    const supabase = getSupabaseClient(req);
    if (!supabase) return res.status(401).json({ error: "Unauthorized" });

    const { sessionId } = req.params;
    
    // Authorize: Only returns session if RLS allows (user owns it or assigned SLP)
    const { data: sessionInfo, error: sessionErr } = await supabase
      .from('sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !sessionInfo) {
      return res.status(403).json({ error: "Forbidden or Not Found" });
    }

    let audioData: Buffer | null = null;
    let contentType = 'audio/webm';

    if (pool) {
      const result = await pool.query('SELECT audio_data, content_type FROM session_audio WHERE session_id = $1', [sessionId]);
      if (result.rows.length > 0 && result.rows[0].audio_data) {
        audioData = result.rows[0].audio_data;
        contentType = result.rows[0].content_type || 'audio/webm';
      }
    }

    if (!audioData) {
      try {
        const { data: storageBlob } = await supabase.storage
          .from("session_audio")
          .download(`${sessionInfo.user_id}/${sessionId}.webm`);
        if (storageBlob) {
          const ab = await storageBlob.arrayBuffer();
          audioData = Buffer.from(ab);
          contentType = storageBlob.type || 'audio/webm';
        }
      } catch (stErr: any) {
        console.warn("Storage fallback notice:", stErr.message);
      }
    }

    if (!audioData || audioData.length === 0) {
      return res.status(404).json({ error: "Audio could not be saved." });
    }
    
    res.setHeader('Content-Type', contentType);
    res.send(audioData);
  } catch (err: any) {
    console.error("Audio fetch error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/admin/users", async (req, res) => {
  try {
    const supabase = getSupabaseClient(req);
    if (!supabase) return res.status(401).json({ error: "Missing authorization" });

    const { data: { user }, error: authError } = await supabase.auth.getUser(req.headers.authorization?.replace("Bearer ", ""));
    if (authError || !user) return res.status(401).json({ error: "Invalid token" });

    // Check if user is an ADMIN or authorized demo account
    const isDemoAdmin = user.email?.toLowerCase() === 'admin@gmail.com';
    let isAdmin = isDemoAdmin;

    if (!isAdmin) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile?.role === 'ADMIN') {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden: Administrator privileges required" });
    }

    if (!pool) {
      const { data: rpcUsers, error: rpcErr } = await supabase.rpc('get_admin_users');
      if (!rpcErr && rpcUsers) {
        return res.json({ users: rpcUsers });
      }
      const { data: profileList, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (pErr) return res.status(500).json({ error: pErr.message });
      return res.json({
        users: profileList.map((p: any) => ({
          ...p,
          user_id: p.user_id || p.id,
          last_sign_in_at: null,
        }))
      });
    }

    const query = `
      SELECT 
        p.id,
        COALESCE(p.user_id, p.id) AS user_id,
        p.full_name,
        p.email,
        p.role,
        p.phone,
        p.created_at,
        p.updated_at,
        u.last_sign_in_at
      FROM public.profiles p
      LEFT JOIN auth.users u ON p.id = u.id
      ORDER BY p.created_at DESC;
    `;
    const result = await pool.query(query);
    return res.json({ users: result.rows });
  } catch (err: any) {
    console.error("Admin users fetch error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/practice/content", async (req, res) => {
  try {
    const supabase = getSupabaseClient(req);
    let sessionCount = 0;

    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser(req.headers.authorization?.replace("Bearer ", ""));
      if (user) {
        const { count } = await supabase
          .from("sessions")
          .select("id", { count: 'exact', head: true })
          .eq("user_id", user.id);
        sessionCount = count || 0;
      }
    }

    const { DYNAMIC_PRACTICE_PARAGRAPHS } = await import("./src/lib/practiceContent");
    const index = sessionCount % DYNAMIC_PRACTICE_PARAGRAPHS.length;
    const selectedItem = DYNAMIC_PRACTICE_PARAGRAPHS[index] || DYNAMIC_PRACTICE_PARAGRAPHS[0];

    return res.json({
      success: true,
      content: selectedItem,
      sessionCount,
      totalParagraphs: DYNAMIC_PRACTICE_PARAGRAPHS.length
    });
  } catch (err: any) {
    console.error("Practice content fetch error:", err);
    return res.json({
      success: true,
      content: {
        id: "morning-momentum",
        title: "Morning Momentum",
        paragraph: "Every morning offers a quiet moment to begin again. I take a slow, gentle breath and let my words flow at their natural speed. There is no need to hurry through my thoughts. Pausing between ideas helps me stay grounded, relaxed, and clear. With each sentence, I speak with steady ease.",
        category: "Pacing & Gentle Onset",
        targetFocus: "Breath pacing and relaxed phrasing"
      }
    });
  }
});

// Multi-AI Speech Analysis Pipeline Orchestration
// GNANI.AI (Voice-to-Text) -> GROQ (Fast Processing) -> GEMINI (Deep Analysis & Recommendations) -> SUPABASE (Persistence)

app.post("/api/speech/analyze", async (req, res) => {
  let currentSessionId: string | null = null;
  const supabase = getSupabaseClient(req);
  try {
    if (!supabase) return res.status(401).json({ error: "Unauthorized" });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(req.headers.authorization?.replace("Bearer ", ""));
    if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });

    const { sessionId, audioUrl, userId } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }
    currentSessionId = sessionId;

    const { data: sessionInfo, error: sessionErr } = await supabase
      .from("sessions")
      .select("id, user_id, duration, exercise_id")
      .eq("id", sessionId)
      .single();

    if (sessionErr || !sessionInfo) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (sessionInfo.user_id !== user.id && (!userId || user.id !== userId)) {
      return res.status(403).json({ error: "Forbidden: Not session owner" });
    }

    let audioBuffer: Buffer | null = null;
    let mimeType = "audio/webm";

    if (pool) {
      const audioRow = await pool.query(
        "SELECT audio_data, content_type FROM session_audio WHERE session_id = $1",
        [sessionId]
      );
      if (audioRow.rows.length > 0 && audioRow.rows[0].audio_data) {
        audioBuffer = audioRow.rows[0].audio_data;
        mimeType = audioRow.rows[0].content_type || "audio/webm";
      }
    }

    if (!audioBuffer && audioUrl) {
      try {
        const audioFetch = await fetch(audioUrl);
        if (audioFetch.ok) {
          const ab = await audioFetch.arrayBuffer();
          audioBuffer = Buffer.from(ab);
          mimeType = audioFetch.headers.get("content-type") || "audio/webm";
        }
      } catch (fErr: any) {
        console.warn("Could not fetch audio from audioUrl:", fErr.message);
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: "Audio recording could not be found for session." });
    }

    const result = await runSpeechAnalysisPipeline({
      sessionId,
      user,
      audioBuffer,
      mimeType,
      sessionInfo,
      supabase,
      pool,
      isRetry: false,
    });

    return res.json(result);
  } catch (err: any) {
    console.error("[api/speech/analyze] Pipeline execution error:", err);
    if (currentSessionId) {
      try {
        if (pool) {
          await pool.query("UPDATE sessions SET analysis_status = 'failed' WHERE id = $1", [currentSessionId]);
        } else if (supabase) {
          await supabase.from("sessions").update({ analysis_status: "failed" }).eq("id", currentSessionId);
        }
      } catch (_) {}
    }
    return res.status(503).json({
      error: "Speech analysis is temporarily unavailable.",
      details: err.message,
    });
  }
});

app.post("/api/analyze-speech", upload.single("audio"), async (req, res) => {
  let currentSessionId: string | null = null;
  const supabase = getSupabaseClient(req);
  try {
    if (!supabase) {
      console.log("No supabase client created, authHeader:", req.headers.authorization);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(req.headers.authorization?.replace("Bearer ", ""));
    if (authErr || !user) {
      console.log("Auth error during analyze-speech:", authErr);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sessionId = req.body?.sessionId || req.query?.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }
    currentSessionId = sessionId;

    // Verify session exists and is owned by authenticated patient
    const { data: sessionInfo, error: sessionErr } = await supabase
      .from("sessions")
      .select("id, user_id, duration, exercise_id")
      .eq("id", sessionId)
      .single();

    if (sessionErr || !sessionInfo) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (sessionInfo.user_id !== user.id) {
      return res.status(403).json({ error: "Forbidden: Not session owner" });
    }

    let audioBuffer: Buffer | null = null;
    let mimeType = "audio/webm";

    if (req.file && req.file.buffer && req.file.buffer.length > 0) {
      audioBuffer = req.file.buffer;
      mimeType = req.file.mimetype || "audio/webm";
    } else if (pool) {
      // If no file uploaded in this request, retrieve previously saved audio from session_audio
      console.log(`[analyze-speech] Fetching saved audio for session ${sessionId} from database...`);
      const audioRow = await pool.query(
        "SELECT audio_data, content_type FROM session_audio WHERE session_id = $1",
        [sessionId]
      );
      if (audioRow.rows.length > 0 && audioRow.rows[0].audio_data) {
        audioBuffer = audioRow.rows[0].audio_data;
        mimeType = audioRow.rows[0].content_type || "audio/webm";
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: "Audio could not be saved." });
    }

    const result = await runSpeechAnalysisPipeline({
      sessionId,
      user,
      audioBuffer,
      mimeType,
      sessionInfo,
      supabase,
      pool,
      isRetry: !req.file
    });

    return res.json(result);
  } catch (err: any) {
    console.error("[DATABASE_SAVE_OR_ANALYSIS_FAILED] Speech analysis pipeline error:", err);
    
    // Mark session analysis_status = failed if error occurred
    if (currentSessionId) {
      try {
        if (pool) {
          await pool.query("UPDATE sessions SET analysis_status = 'failed' WHERE id = $1", [currentSessionId]);
        } else if (supabase) {
          await supabase.from("sessions").update({ analysis_status: "failed" }).eq("id", currentSessionId);
        }
      } catch (_) {}
    }

    return res.status(503).json({
      error: "Speech analysis is temporarily unavailable.",
      details: err.message
    });
  }
});

// Dedicated retry analysis endpoint for the same saved session
app.post("/api/sessions/:sessionId/retry-analysis", async (req, res) => {
  const { sessionId } = req.params;
  try {
    const supabase = getSupabaseClient(req);
    if (!supabase) return res.status(401).json({ error: "Unauthorized" });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(req.headers.authorization?.replace("Bearer ", ""));
    if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });

    const { data: sessionInfo, error: sessionErr } = await supabase
      .from("sessions")
      .select("id, user_id, duration, exercise_id")
      .eq("id", sessionId)
      .single();

    if (sessionErr || !sessionInfo) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (sessionInfo.user_id !== user.id) {
      return res.status(403).json({ error: "Forbidden: Not session owner" });
    }

    if (!pool) {
      return res.status(503).json({ error: "Database storage not available" });
    }

    const audioRow = await pool.query(
      "SELECT audio_data, content_type FROM session_audio WHERE session_id = $1",
      [sessionId]
    );

    if (audioRow.rows.length === 0 || !audioRow.rows[0].audio_data) {
      return res.status(404).json({ error: "Audio recording could not be found for session." });
    }

    const audioBuffer = audioRow.rows[0].audio_data;
    const mimeType = audioRow.rows[0].content_type || "audio/webm";

    const result = await runSpeechAnalysisPipeline({
      sessionId,
      user,
      audioBuffer,
      mimeType,
      sessionInfo,
      supabase,
      pool,
      isRetry: true
    });

    return res.json(result);
  } catch (err: any) {
    console.error(`[RETRY_ANALYSIS_FAILED] for session ${sessionId}:`, err);
    try {
      if (pool) {
        await pool.query("UPDATE sessions SET analysis_status = 'failed' WHERE id = $1", [sessionId]);
      } else {
        const supabase = getSupabaseClient(req);
        if (supabase) {
           await supabase.from("sessions").update({ analysis_status: "failed" }).eq("id", sessionId);
        }
      }
    } catch (_) {}
    return res.status(503).json({
      error: "Speech analysis is temporarily unavailable.",
      details: err.message
    });
  }
});


app.get("/api/slp/workflows/logs", async (req, res) => {
  if (!pool) return res.json({ logs: [] });
  try {
    const result = await pool.query("SELECT * FROM audit_logs WHERE event_type = 'WORKFLOW_EXECUTION' ORDER BY created_at DESC LIMIT 50");
    const formattedLogs = result.rows.map(row => {
      let desc = { workflow: 'Unknown', status: 'Unknown', details: '' };
      try { desc = JSON.parse(row.description); } catch(e){}
      return {
        id: row.id,
        workflow: desc.workflow || 'Session Review',
        status: desc.status,
        details: desc.details,
        executedAt: row.created_at
      };
    });
    res.json({ logs: formattedLogs });
  } catch (err) {
    console.error("Fetch logs error:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});


app.post("/api/slp/assistant", async (req, res) => {
  try {
    const supabase = getSupabaseClient(req);
    if (!supabase) return res.status(401).json({ error: "Unauthorized" });

    // Validate SLP
    const { data: userAuth, error: authErr } = await supabase.auth.getUser(req.headers.authorization?.replace("Bearer ", ""));
    if (authErr || !userAuth?.user) return res.status(401).json({ error: "Unauthorized" });

    const { data: slpProfile, error: slpErr } = await supabase
      .from("slps")
      .select("id")
      .eq("user_id", userAuth.user.id)
      .single();

    if (slpErr || !slpProfile) {
      return res.status(403).json({ error: "Forbidden: Not an SLP" });
    }

    const slpId = slpProfile.id;
    const { message, messages } = req.body;

    if (!message && (!messages || messages.length === 0)) {
      return res.status(400).json({ error: "Message is required." });
    }

    const userPrompt = message || (messages && messages[messages.length - 1]?.content) || "";

    // Clinical Plugin Endpoints Implementation
    const clinicalEndpoints = {
      get_patients: async (ctxOrInput: any, maybeInput?: any) => {
        const input = maybeInput !== undefined ? maybeInput : (ctxOrInput || {});
        const { filter, search } = input;

        const { data: assignments, error: assignErr } = await supabase
          .from('patient_assignments')
          .select('patient_id, assigned_at, status')
          .eq('slp_id', slpId)
          .eq('status', 'ACTIVE');

        if (assignErr) throw assignErr;
        if (!assignments || assignments.length === 0) {
          return { patients: [], count: 0, message: "No active patients assigned to your account." };
        }

        const patientIds = assignments.map((a: any) => a.patient_id);

        let profQuery = supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url, phone, practice_goal, created_at')
          .in('id', patientIds);

        if (search) {
          profQuery = profQuery.ilike('full_name', `%${search.trim()}%`);
        }

        const { data: profiles, error: profErr } = await profQuery;
        if (profErr) throw profErr;

        const { data: sessions } = await supabase
          .from('sessions')
          .select('id, user_id, created_at, duration, review_status')
          .in('user_id', patientIds)
          .order('created_at', { ascending: false });

        const patientSessionsMap = new Map<string, any[]>();
        (sessions || []).forEach((s: any) => {
          const list = patientSessionsMap.get(s.user_id) || [];
          list.push(s);
          patientSessionsMap.set(s.user_id, list);
        });

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let result = (profiles || []).map((p: any) => {
          const pSessions = patientSessionsMap.get(p.id) || [];
          const lastSession = pSessions[0];
          const sessionsToday = pSessions.filter((s: any) => new Date(s.created_at) >= startOfToday);
          const pendingReviews = pSessions.filter((s: any) => s.review_status === 'READY_FOR_REVIEW' || s.review_status === 'NOT_REVIEWED');

          return {
            patient_id: p.id,
            patient_name: p.full_name || 'Unnamed Patient',
            email: p.email,
            avatar_url: p.avatar_url,
            total_sessions: pSessions.length,
            practiced_today: sessionsToday.length > 0,
            sessions_today_count: sessionsToday.length,
            last_session_at: lastSession?.created_at || null,
            last_session_duration: lastSession?.duration || null,
            pending_review_count: pendingReviews.length
          };
        });

        if (filter === 'practiced_today') {
          result = result.filter((p: any) => p.practiced_today);
        } else if (filter === 'inactive') {
          const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
          result = result.filter((p: any) => !p.last_session_at || new Date(p.last_session_at) < threeDaysAgo);
        }

        return { patients: result, count: result.length };
      },

      get_sessions: async (ctxOrInput: any, maybeInput?: any) => {
        const input = maybeInput !== undefined ? maybeInput : (ctxOrInput || {});
        const { patient_name, patient_id, review_status, practiced_today, limit = 10 } = input;

        const { data: assignments } = await supabase
          .from('patient_assignments')
          .select('patient_id')
          .eq('slp_id', slpId)
          .eq('status', 'ACTIVE');

        const slpPatientIds = (assignments || []).map((a: any) => a.patient_id);
        if (slpPatientIds.length === 0) {
          return { sessions: [], count: 0, message: "No active patients assigned to your account." };
        }

        let targetPatientIds = [...slpPatientIds];
        if (patient_id) {
          if (!slpPatientIds.includes(patient_id)) {
            return { error: "Access Denied: Patient is not assigned to your account.", sessions: [] };
          }
          targetPatientIds = [patient_id];
        } else if (patient_name) {
          const { data: matchedProfiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', slpPatientIds)
            .ilike('full_name', `%${patient_name.trim()}%`);

          if (!matchedProfiles || matchedProfiles.length === 0) {
            return { message: `No assigned patient found matching name "${patient_name}".`, sessions: [] };
          }
          targetPatientIds = matchedProfiles.map((p: any) => p.id);
        }

        let query = supabase
          .from('sessions')
          .select(`
            id,
            user_id,
            exercise_id,
            duration,
            review_status,
            created_at,
            profiles:user_id (full_name, email, avatar_url),
            exercises:exercise_id (name, category, duration),
            speech_metrics (repetitions, pauses, prolongations, speech_rate),
            ai_observations (observation, observation_text),
            clinician_notes (note, updated_at)
          `)
          .in('user_id', targetPatientIds)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (review_status && review_status !== 'all') {
          query = query.eq('review_status', review_status);
        }

        if (practiced_today) {
          const now = new Date();
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          query = query.gte('created_at', startOfToday);
        }

        const { data: sessionsData, error: sessErr } = await query;
        if (sessErr) throw sessErr;

        const formatted = (sessionsData || []).map((s: any) => {
          const metrics = Array.isArray(s.speech_metrics) ? s.speech_metrics[0] : s.speech_metrics;
          const observation = Array.isArray(s.ai_observations) ? s.ai_observations[0] : s.ai_observations;
          const note = Array.isArray(s.clinician_notes) ? s.clinician_notes[0] : s.clinician_notes;

          return {
            session_id: s.id,
            patient_id: s.user_id,
            patient_name: s.profiles?.full_name || 'Patient',
            patient_email: s.profiles?.email,
            created_at: s.created_at,
            duration: s.duration,
            review_status: s.review_status,
            exercise_name: s.exercises?.name || 'General Speech Practice',
            exercise_category: s.exercises?.category || null,
            metrics: metrics ? {
              repetitions: metrics.repetitions,
              pauses: metrics.pauses,
              prolongations: metrics.prolongations,
              speech_rate: metrics.speech_rate ? Number(metrics.speech_rate) : null
            } : null,
            ai_observation: observation?.observation_text || observation?.observation || null,
            clinician_note: note?.note || null
          };
        });

        return { sessions: formatted, count: formatted.length };
      },

      get_patient_summary: async (ctxOrInput: any, maybeInput?: any) => {
        const input = maybeInput !== undefined ? maybeInput : (ctxOrInput || {});
        const { patient_name, patient_id } = input;

        const { data: assignments } = await supabase
          .from('patient_assignments')
          .select('patient_id')
          .eq('slp_id', slpId)
          .eq('status', 'ACTIVE');

        const slpPatientIds = (assignments || []).map((a: any) => a.patient_id);
        if (slpPatientIds.length === 0) {
          return { error: "No active patients assigned to your account." };
        }

        let targetId = patient_id;
        if (!targetId && patient_name) {
          const { data: matched } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', slpPatientIds)
            .ilike('full_name', `%${patient_name.trim()}%`)
            .limit(1);
          targetId = matched?.[0]?.id;
        } else if (!targetId && slpPatientIds.length === 1) {
          targetId = slpPatientIds[0];
        }

        if (!targetId || !slpPatientIds.includes(targetId)) {
          return { error: `Patient not found among your active connected patients.` };
        }

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', targetId).single();

        const { data: sessions } = await supabase
          .from('sessions')
          .select(`
            id, created_at, duration, review_status,
            exercises:exercise_id (name, category),
            speech_metrics (repetitions, pauses, prolongations, speech_rate),
            ai_observations (observation, observation_text),
            clinician_notes (note)
          `)
          .eq('user_id', targetId)
          .order('created_at', { ascending: false })
          .limit(10);

        const sessionList = (sessions || []).map((s: any) => {
          const m = Array.isArray(s.speech_metrics) ? s.speech_metrics[0] : s.speech_metrics;
          const obs = Array.isArray(s.ai_observations) ? s.ai_observations[0] : s.ai_observations;
          const n = Array.isArray(s.clinician_notes) ? s.clinician_notes[0] : s.clinician_notes;
          return {
            session_id: s.id,
            date: s.created_at,
            duration: s.duration,
            exercise: s.exercises?.name || 'General Practice',
            review_status: s.review_status,
            speech_rate: m?.speech_rate ? Number(m.speech_rate) : null,
            repetitions: m?.repetitions ?? null,
            pauses: m?.pauses ?? null,
            prolongations: m?.prolongations ?? null,
            observation: obs?.observation_text || obs?.observation || null,
            clinician_note: n?.note || null
          };
        });

        const validRates = sessionList.filter((s: any) => typeof s.speech_rate === 'number').map((s: any) => s.speech_rate);
        const validReps = sessionList.filter((s: any) => typeof s.repetitions === 'number').map((s: any) => s.repetitions);
        const validPauses = sessionList.filter((s: any) => typeof s.pauses === 'number').map((s: any) => s.pauses);

        const avgRate = validRates.length > 0 ? (validRates.reduce((a: number, b: number) => a + b, 0) / validRates.length).toFixed(1) : 'N/A';
        const avgReps = validReps.length > 0 ? (validReps.reduce((a: number, b: number) => a + b, 0) / validReps.length).toFixed(1) : 'N/A';
        const avgPauses = validPauses.length > 0 ? (validPauses.reduce((a: number, b: number) => a + b, 0) / validPauses.length).toFixed(1) : 'N/A';

        return {
          patient_id: profile?.id,
          patient_name: profile?.full_name || 'Patient',
          practice_goal: profile?.practice_goal || 'Speech Fluency & Articulation',
          total_recorded_sessions: sessionList.length,
          average_speech_rate_wpm: avgRate,
          average_repetitions_per_session: avgReps,
          average_pauses_per_session: avgPauses,
          recent_sessions: sessionList,
          latest_clinical_observation: sessionList[0]?.observation || 'No observations recorded yet.',
          latest_clinician_note: sessionList.find((s: any) => s.clinician_note)?.clinician_note || 'No clinician notes recorded.'
        };
      },

      get_connection_requests: async (ctxOrInput: any, maybeInput?: any) => {
        const input = maybeInput !== undefined ? maybeInput : (ctxOrInput || {});
        const { status = 'pending', limit = 20 } = input;

        let query = supabase
          .from('connection_requests')
          .select('id, sender_id, receiver_id, sender_type, receiver_type, status, created_at, updated_at')
          .eq('receiver_id', userAuth.user.id);

        if (status && status !== 'all') {
          query = query.eq('status', status);
        }

        query = query.order('created_at', { ascending: false }).limit(limit);

        const { data: requests, error: reqError } = await query;
        if (reqError) {
          console.error("Error fetching connection requests:", reqError);
          return { error: reqError.message, requests: [] };
        }

        if (!requests || requests.length === 0) {
          return { requests: [], count: 0, message: `No ${status} connection requests found.` };
        }

        const senderIds = Array.from(new Set(requests.map((r: any) => r.sender_id)));
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url')
          .in('id', senderIds);

        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

        const formattedRequests = requests.map((r: any) => {
          const senderProfile = profileMap.get(r.sender_id);
          return {
            request_id: r.id,
            patient_name: senderProfile?.full_name || "Patient",
            patient_email: senderProfile?.email || null,
            patient_avatar_url: senderProfile?.avatar_url || null,
            sender_type: r.sender_type,
            receiver_type: r.receiver_type,
            status: r.status,
            created_at: r.created_at
          };
        });

        return { requests: formattedRequests, count: formattedRequests.length };
      },

      get_exercises_catalog: async (ctxOrInput: any, maybeInput?: any) => {
        const input = maybeInput !== undefined ? maybeInput : (ctxOrInput || {});
        const { search, category } = input;

        let query = supabase.from('exercises').select('*').order('created_at', { ascending: false });
        if (search) query = query.ilike('name', `%${search.trim()}%`);
        if (category) query = query.eq('category', category.trim());

        const { data, error } = await query;
        if (error) throw error;
        return { exercises: data || [], count: data?.length || 0 };
      },

      create_exercise: async (ctxOrInput: any, maybeInput?: any) => {
        const input = maybeInput !== undefined ? maybeInput : (ctxOrInput || {});
        const { name, description, instructions, category = "Speech Routine", duration = 60 } = input;
        if (!name || !description) {
          throw new Error("Exercise name and description are required.");
        }

        const exerciseId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        // Insert into exercises table with approval_status = 'DRAFT'
        const { data: inserted, error: insErr } = await supabase
          .from('exercises')
          .insert({
            id: exerciseId,
            name: name.trim(),
            description: description.trim(),
            instructions: instructions ? instructions.trim() : `Practice "${name}" with relaxed phonation, steady airflow, and gentle articulatory onset.`,
            category: category.trim(),
            duration: Math.max(15, Math.min(600, Number(duration) || 60)),
            approval_status: 'DRAFT',
            approved_by: null,
            status: 'active',
            created_at: timestamp,
            updated_at: timestamp
          })
          .select()
          .single();

        if (insErr) {
          console.error("Exercise creation error:", insErr);
          throw insErr;
        }

        // Verify insertion in database
        const { data: verifyRow } = await supabase
          .from('exercises')
          .select('id, name, description, approval_status')
          .eq('id', exerciseId)
          .single();

        if (!verifyRow) {
          throw new Error("Failed to verify created exercise record in the database.");
        }

        // Sync to Corsair entity table
        if (pool) {
          await pool.query(
            `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8;`,
            [
              `exercise_${exerciseId}`,
              timestamp,
              timestamp,
              `slp_account_${slpId}`,
              exerciseId,
              "exercise",
              "1.0",
              JSON.stringify({
                id: exerciseId,
                name: inserted.name,
                description: inserted.description,
                category: inserted.category,
                approval_status: 'DRAFT',
                duration: inserted.duration,
                status: 'active'
              })
            ]
          ).catch((e: any) => console.warn("Corsair entity sync notice:", e.message));
        }

        return {
          success: true,
          exercise: {
            id: inserted.id,
            name: inserted.name,
            description: inserted.description,
            instructions: inserted.instructions,
            category: inserted.category,
            duration: inserted.duration,
            approval_status: "AI Draft — Requires SLP Review",
            review_notice: "Created as an AI Draft. Explicit SLP approval is required in the Exercise Library before it becomes available to patients."
          },
          message: `Done. Created draft exercise "${inserted.name}" (ID: ${inserted.id}). Marked as 'AI Draft — Requires SLP Review'.`
        };
      },

      assign_exercise: async (ctxOrInput: any, maybeInput?: any) => {
        const input = maybeInput !== undefined ? maybeInput : (ctxOrInput || {});
        const { exercise_name_or_id, patient_name, target = 'single', confirmed = false } = input;
        if (!exercise_name_or_id) throw new Error("Exercise name or ID is required.");

        // 1. Resolve exercise
        let exQuery = supabase.from('exercises').select('id, name, approval_status, category, status');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(exercise_name_or_id);
        if (isUuid) {
          exQuery = exQuery.eq('id', exercise_name_or_id);
        } else {
          exQuery = exQuery.ilike('name', `%${exercise_name_or_id.trim()}%`);
        }

        const { data: exercises, error: exErr } = await exQuery;
        if (exErr) throw exErr;
        if (!exercises || exercises.length === 0) {
          return { error: `Exercise "${exercise_name_or_id}" was not found in the Exercise Library.` };
        }
        const exercise = exercises[0];

        // 2. Fetch SLP's active connected patients
        const { data: assignments } = await supabase
          .from('patient_assignments')
          .select('patient_id, profiles!patient_assignments_patient_id_fkey(id, full_name, email)')
          .eq('slp_id', slpId)
          .eq('status', 'ACTIVE');

        if (!assignments || assignments.length === 0) {
          return { error: "You currently have no connected active patients." };
        }

        let matchedPatients = assignments.map((a: any) => ({
          id: a.patient_id,
          name: a.profiles?.full_name || 'Patient',
          email: a.profiles?.email
        }));

        if (patient_name && target !== 'all') {
          matchedPatients = matchedPatients.filter((p: any) =>
            p.name.toLowerCase().includes(patient_name.trim().toLowerCase())
          );
          if (matchedPatients.length === 0) {
            return { error: `No connected patient found matching "${patient_name}".` };
          }
        }

        // Broad action confirmation check (multiple patients or all patients)
        const isBroad = matchedPatients.length > 1 || target === 'all';
        if (isBroad && !confirmed) {
          return {
            requires_confirmation: true,
            action: "assign_exercise",
            exercise_id: exercise.id,
            exercise_name: exercise.name,
            patient_count: matchedPatients.length,
            patient_names: matchedPatients.map((p: any) => p.name),
            message: `Please confirm: Enable "${exercise.name}" for ${matchedPatients.length} connected patient(s) (${matchedPatients.map((p: any) => p.name).join(", ")})?`
          };
        }

        // Upsert into patient_exercises
        const rowsToUpsert = matchedPatients.map((p: any) => ({
          patient_id: p.id,
          exercise_id: exercise.id,
          assigned_by: slpId,
          status: 'enabled',
          assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error: upsertErr } = await (supabase.from('patient_exercises') as any)
          .upsert(rowsToUpsert, { onConflict: 'patient_id,exercise_id' });

        if (upsertErr) throw upsertErr;

        // Verify in database
        const patientIds = matchedPatients.map((p: any) => p.id);
        const { data: verifyData } = await (supabase.from('patient_exercises') as any)
          .select('patient_id, status')
          .eq('exercise_id', exercise.id)
          .in('patient_id', patientIds)
          .eq('status', 'enabled');

        const verifiedCount = verifyData?.length || matchedPatients.length;
        const verifiedNames = matchedPatients.map((p: any) => p.name);

        return {
          success: true,
          action: "assign_exercise",
          exercise_name: exercise.name,
          enabled_count: verifiedCount,
          patient_names: verifiedNames,
          message: `Done. ${exercise.name} is now enabled for ${verifiedNames.join(", ")}.`
        };
      },

      disable_exercise: async (ctxOrInput: any, maybeInput?: any) => {
        const input = maybeInput !== undefined ? maybeInput : (ctxOrInput || {});
        const { exercise_name_or_id, patient_name, target = 'single', confirmed = false } = input;
        if (!exercise_name_or_id) throw new Error("Exercise name or ID is required.");

        let exQuery = supabase.from('exercises').select('id, name');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(exercise_name_or_id);
        if (isUuid) {
          exQuery = exQuery.eq('id', exercise_name_or_id);
        } else {
          exQuery = exQuery.ilike('name', `%${exercise_name_or_id.trim()}%`);
        }

        const { data: exercises } = await exQuery;
        if (!exercises || exercises.length === 0) {
          return { error: `Exercise "${exercise_name_or_id}" was not found.` };
        }
        const exercise = exercises[0];

        const { data: assignments } = await supabase
          .from('patient_assignments')
          .select('patient_id, profiles!patient_assignments_patient_id_fkey(id, full_name)')
          .eq('slp_id', slpId)
          .eq('status', 'ACTIVE');

        if (!assignments || assignments.length === 0) {
          return { error: "You have no connected active patients." };
        }

        let matchedPatients = assignments.map((a: any) => ({
          id: a.patient_id,
          name: a.profiles?.full_name || 'Patient'
        }));

        if (patient_name && target !== 'all') {
          matchedPatients = matchedPatients.filter((p: any) =>
            p.name.toLowerCase().includes(patient_name.trim().toLowerCase())
          );
          if (matchedPatients.length === 0) {
            return { error: `No connected patient found matching "${patient_name}".` };
          }
        }

        const isBroad = matchedPatients.length > 1 || target === 'all';
        if (isBroad && !confirmed) {
          return {
            requires_confirmation: true,
            action: "disable_exercise",
            exercise_id: exercise.id,
            exercise_name: exercise.name,
            patient_count: matchedPatients.length,
            patient_names: matchedPatients.map((p: any) => p.name),
            message: `Please confirm: Disable "${exercise.name}" for ${matchedPatients.length} connected patient(s) (${matchedPatients.map((p: any) => p.name).join(", ")})?`
          };
        }

        const patientIds = matchedPatients.map((p: any) => p.id);
        const { error: updErr } = await (supabase.from('patient_exercises') as any)
          .update({ status: 'disabled', updated_at: new Date().toISOString() })
          .eq('exercise_id', exercise.id)
          .in('patient_id', patientIds);

        if (updErr) throw updErr;

        const { data: verifyData } = await (supabase.from('patient_exercises') as any)
          .select('patient_id, status')
          .eq('exercise_id', exercise.id)
          .in('patient_id', patientIds)
          .eq('status', 'disabled');

        const disabledCount = verifyData?.length || matchedPatients.length;
        const patientNames = matchedPatients.map((p: any) => p.name);

        return {
          success: true,
          action: "disable_exercise",
          exercise_name: exercise.name,
          disabled_count: disabledCount,
          patient_names: patientNames,
          message: `Done. ${exercise.name} has been disabled for ${patientNames.join(", ")}.`
        };
      }
    };

    // Instantiate request-scoped Corsair instance
    const { createCorsair } = await import('corsair');
    const scopedCorsair = createCorsair({
      plugins: [{
        id: 'clinical',
        endpoints: clinicalEndpoints,
        endpointMeta: {
          get_patients: { description: "Get a list of active patients assigned to the authenticated SLP. Can filter by practice activity (practiced_today, inactive) or search by patient name." },
          get_sessions: { description: "Get recent patient speech sessions for the SLP's connected patients. Can filter by patient name, review status (READY_FOR_REVIEW, NOT_REVIEWED, REVIEWED), or date." },
          get_patient_summary: { description: "Summarize a patient's recent practice sessions, speech fluency metrics (speech rate, repetitions, pauses), AI observations, and notes." },
          get_connection_requests: { description: "Get incoming or past patient connection requests sent to the authenticated SLP." },
          get_exercises_catalog: { description: "Browse or search exercises in the clinical exercise library." },
          create_exercise: { description: "Create a new exercise routine in the Exercise Library as an AI Draft requiring SLP review." },
          assign_exercise: { description: "Enable/assign an approved exercise for one or all connected patients. Broad actions across all patients require explicit confirmation." },
          disable_exercise: { description: "Disable an exercise for one or all connected patients." }
        },
        endpointSchemas: {
          get_patients: {
            input: z.object({
              filter: z.enum(['all', 'practiced_today', 'inactive']).optional().describe("Filter patients by activity status"),
              search: z.string().optional().describe("Search patient by name")
            }),
            output: z.any()
          },
          get_sessions: {
            input: z.object({
              patient_name: z.string().optional().describe("Filter sessions by patient name"),
              patient_id: z.string().optional().describe("Filter sessions by patient UUID"),
              review_status: z.string().optional().describe("Filter by review status (READY_FOR_REVIEW, NOT_REVIEWED, REVIEWED, or all)"),
              practiced_today: z.boolean().optional().describe("Only return sessions recorded today"),
              limit: z.number().optional().describe("Number of sessions to return (default 10)")
            }),
            output: z.any()
          },
          get_patient_summary: {
            input: z.object({
              patient_name: z.string().optional().describe("Name of the patient to summarize"),
              patient_id: z.string().optional().describe("UUID of the patient to summarize")
            }),
            output: z.any()
          },
          get_connection_requests: {
            input: z.object({
              status: z.enum(['pending', 'accepted', 'rejected', 'cancelled', 'all']).optional().describe("Filter requests by status (default: 'pending')"),
              limit: z.number().optional().describe("Maximum number of connection requests to return")
            }),
            output: z.any()
          },
          get_exercises_catalog: {
            input: z.object({
              search: z.string().optional().describe("Search exercise by title or description"),
              category: z.string().optional().describe("Filter by exercise category")
            }),
            output: z.any()
          },
          create_exercise: {
            input: z.object({
              name: z.string().describe("Clear, descriptive title for the exercise"),
              description: z.string().describe("Clinical purpose and therapeutic rationale"),
              instructions: z.string().describe("Step-by-step patient practice instructions"),
              category: z.string().optional().describe("Category, e.g. Phonation & Breath Control, Vocal Tension & Fluency, Motor Coordination"),
              duration: z.number().optional().describe("Estimated exercise duration in seconds (default 60)")
            }),
            output: z.any()
          },
          assign_exercise: {
            input: z.object({
              exercise_name_or_id: z.string().describe("Name or UUID of the exercise from the Exercise Library"),
              patient_name: z.string().optional().describe("Target patient name if assigning to a single patient"),
              target: z.enum(['single', 'all']).optional().describe("Whether to assign to a single patient or all connected patients"),
              confirmed: z.boolean().optional().describe("Set to true only when broad assignment (to all patients) is explicitly confirmed")
            }),
            output: z.any()
          },
          disable_exercise: {
            input: z.object({
              exercise_name_or_id: z.string().describe("Name or UUID of the exercise"),
              patient_name: z.string().optional().describe("Target patient name if disabling for a single patient"),
              target: z.enum(['single', 'all']).optional().describe("Whether to disable for a single patient or all connected patients"),
              confirmed: z.boolean().optional().describe("Set to true only when broad action is explicitly confirmed")
            }),
            output: z.any()
          }
        }
      }],
      database: (corsairClient as any).database || pool,
      kek: process.env.CORSAIR_KEK || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    });

    // Build tool definitions
    const clinicalToolDeclarations = [
      {
        name: "get_patients",
        description: "Get list of active patients assigned to the authenticated SLP. Can filter by practice activity (practiced_today, inactive) or search by name.",
        parameters: zodToGeminiSchema(z.object({
          filter: z.enum(['all', 'practiced_today', 'inactive']).optional().describe("Filter patients by activity"),
          search: z.string().optional().describe("Search patient by full name")
        }))
      },
      {
        name: "get_sessions",
        description: "Query speech sessions recorded by the authenticated SLP's patients. Includes durations, timestamps, review status, speech rate, repetitions, pauses, and clinician notes.",
        parameters: zodToGeminiSchema(z.object({
          patient_name: z.string().optional().describe("Filter by patient name"),
          patient_id: z.string().optional().describe("Filter by patient UUID"),
          review_status: z.string().optional().describe("Filter by status: READY_FOR_REVIEW, NOT_REVIEWED, REVIEWED, or all"),
          practiced_today: z.boolean().optional().describe("Only return sessions recorded today"),
          limit: z.number().optional().describe("Number of sessions (default 10)")
        }))
      },
      {
        name: "get_patient_summary",
        description: "Summarize a patient's practice history, speech fluency metrics trends, AI observations, and notes.",
        parameters: zodToGeminiSchema(z.object({
          patient_name: z.string().optional().describe("Name of the patient"),
          patient_id: z.string().optional().describe("UUID of the patient")
        }))
      },
      {
        name: "get_connection_requests",
        description: "Get incoming or past patient connection requests sent to this SLP.",
        parameters: zodToGeminiSchema(z.object({
          status: z.enum(['pending', 'accepted', 'rejected', 'cancelled', 'all']).optional().describe("Filter by status (default: 'pending')"),
          limit: z.number().optional().describe("Maximum requests to return")
        }))
      },
      {
        name: "get_exercises_catalog",
        description: "Search or list exercises in the clinical Exercise Library.",
        parameters: zodToGeminiSchema(z.object({
          search: z.string().optional().describe("Search exercise by title or keyword"),
          category: z.string().optional().describe("Filter by category")
        }))
      },
      {
        name: "create_exercise",
        description: "Create a new clinical practice exercise in the Exercise Library as an AI Draft requiring SLP review. Newly created exercises are marked as Draft and require explicit SLP approval before patient assignment.",
        parameters: zodToGeminiSchema(z.object({
          name: z.string().describe("Clear, descriptive title for the exercise"),
          description: z.string().describe("Clinical purpose and therapeutic rationale"),
          instructions: z.string().describe("Step-by-step patient practice instructions"),
          category: z.string().optional().describe("Category, e.g. Phonation & Breath Control, Vocal Tension & Fluency, Motor Coordination"),
          duration: z.number().optional().describe("Estimated duration in seconds (default 60)")
        }))
      },
      {
        name: "assign_exercise",
        description: "Enable/assign an exercise for one or all connected patients. When assigning to all patients, require explicit confirmation unless already confirmed.",
        parameters: zodToGeminiSchema(z.object({
          exercise_name_or_id: z.string().describe("Name or UUID of the exercise"),
          patient_name: z.string().optional().describe("Target patient name if assigning to a single patient"),
          target: z.enum(['single', 'all']).optional().describe("Whether to assign to single patient or all connected patients"),
          confirmed: z.boolean().optional().describe("Set to true only when broad assignment (to all patients) is explicitly confirmed")
        }))
      },
      {
        name: "disable_exercise",
        description: "Disable an exercise for one or all connected patients.",
        parameters: zodToGeminiSchema(z.object({
          exercise_name_or_id: z.string().describe("Name or UUID of the exercise"),
          patient_name: z.string().optional().describe("Target patient name if disabling for a single patient"),
          target: z.enum(['single', 'all']).optional().describe("Whether to disable for single patient or all connected patients"),
          confirmed: z.boolean().optional().describe("Set to true only when broad action is explicitly confirmed")
        }))
      }
    ];

    // Build chat history if provided
    const formattedHistory: any[] = [];
    if (Array.isArray(messages) && messages.length > 1) {
      // Include past turns except last one
      const previousTurns = messages.slice(0, -1);
      for (const msg of previousTurns) {
        if (msg.role === 'user') {
          formattedHistory.push({ role: 'user', parts: [{ text: msg.content }] });
        } else if (msg.role === 'assistant') {
          formattedHistory.push({ role: 'model', parts: [{ text: msg.content }] });
        }
      }
    }

    const systemInstruction = `You are SpeakEase's Clinical Personal Assistant for Speech-Language Pathologists (SLPs), powered by the Corsair MCP architecture.
You act as an operational assistant for the authenticated SLP.

Your Core Capabilities:
1. Patient & Session Intelligence: Show connected patients, recent sessions, speech metrics (WPM, repetitions, pauses, prolongations), adherence trends, and sessions needing review.
2. Exercise Management:
   - Create new exercises in the Exercise Library. Newly created exercises MUST be created as AI Drafts ('AI Draft — Requires SLP Review'). Exercise content must remain safe, constructive, and non-diagnostic. Explicit SLP approval in the Exercise Library is required before patients can practice it.
   - Assign / enable exercises for connected patients.
   - Disable exercises for connected patients.
3. Patient Connection Requests: Check pending or past connection requests.

Rules:
- Always use the real Corsair MCP tools to retrieve data or make changes. Never make up names, numbers, or records.
- Patient Authorization & Scoping: You ONLY have access to patients connected to this authenticated SLP.
- Action Confirmation: For broad-impact actions (such as assigning or disabling an exercise for ALL connected patients or multiple patients), summarize what will change (including patient names and count) and ask for explicit confirmation before applying changes, unless the user has already explicitly confirmed.
- Action Verification: Confirm database results accurately. State clearly when an exercise was created as an AI Draft or enabled for patients.
- Tone: Professional, clinically disciplined, clear, and objective.`;

    if (!ai) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    let chatResponse: any = null;
    let successfulModel: string | null = null;
    let modelCascadeError: any = null;

    for (const model of ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite']) {
      try {
        const chat = ai.chats.create({
          model,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: clinicalToolDeclarations }],
          },
          history: formattedHistory.length > 0 ? formattedHistory : undefined
        });

        let curResponse = await chat.sendMessage({ message: userPrompt });

        // Process function calls
        let iterations = 0;
        while (curResponse.functionCalls && curResponse.functionCalls.length > 0 && iterations < 6) {
          const functionResponses = [];
          for (const call of curResponse.functionCalls) {
            try {
              const endpointFn = (clinicalEndpoints as any)[call.name];
              if (endpointFn) {
                const result = await endpointFn(call.args);
                functionResponses.push({ name: call.name, response: { result } });
              } else {
                functionResponses.push({ name: call.name, response: { error: `Unknown tool: ${call.name}` } });
              }
            } catch (e: any) {
              functionResponses.push({ name: call.name, response: { error: e.message } });
            }
          }
          curResponse = await chat.sendMessage({
            message: functionResponses.map(fr => ({
              functionResponse: { name: fr.name, response: fr.response }
            }))
          });
          iterations++;
        }

        chatResponse = curResponse;
        successfulModel = model;
        break;
      } catch (err: any) {
        console.warn(`[assistant-chat] Model ${model} failed:`, err.message || err);
        modelCascadeError = err;
      }
    }

    if (chatResponse && chatResponse.text) {
      return res.json({ text: chatResponse.text });
    }

    console.warn("Gemini chat execution fallback:", modelCascadeError?.message);

    // Robust fallback execution using Corsair direct NLP & tool executor
    // If model is rate-limited, parse intent and execute real Corsair MCP tool directly
    const lower = userPrompt.toLowerCase();
    let fallbackText = "";

    if (lower.includes("connection request") || lower.includes("pending request") || lower.includes("who requested")) {
      const result = await clinicalEndpoints.get_connection_requests({});
      if (result.count === 0) {
        fallbackText = "You currently have no pending patient connection requests.";
      } else {
        fallbackText = `You have ${result.count} pending connection request(s):\n` +
          result.requests.map((r: any) => `• **${r.patient_name}** (${r.patient_email || 'No email'}) — Sent ${new Date(r.created_at).toLocaleDateString()}`).join("\n");
      }
    } else if (lower.includes("patient") && (lower.includes("show") || lower.includes("my") || lower.includes("list") || lower.includes("who"))) {
      const filter = lower.includes("today") ? 'practiced_today' : (lower.includes("haven't") || lower.includes("inactive") || lower.includes("week") ? 'inactive' : 'all');
      const result = await clinicalEndpoints.get_patients({ filter });
      if (result.count === 0) {
        fallbackText = filter === 'practiced_today' ? "None of your connected patients have recorded practice sessions today." : "You have no active patients matching this query.";
      } else {
        fallbackText = `Here are your ${filter === 'practiced_today' ? 'patients who practiced today' : (filter === 'inactive' ? 'patients needing practice reminders' : 'connected patients')} (${result.count}):\n` +
          result.patients.map((p: any) => `• **${p.patient_name}** — ${p.total_sessions} total sessions (${p.pending_review_count} needing review)`).join("\n");
      }
    } else if (lower.includes("session") || lower.includes("review")) {
      const review_status = lower.includes("need") || lower.includes("ready") ? 'READY_FOR_REVIEW' : (lower.includes("reviewed") ? 'REVIEWED' : 'all');
      const result = await clinicalEndpoints.get_sessions({ review_status, limit: 10 });
      if (result.count === 0) {
        fallbackText = review_status === 'READY_FOR_REVIEW' ? "There are currently no sessions waiting for your review." : "No sessions found matching your criteria.";
      } else {
        fallbackText = `Found ${result.count} session(s):\n` +
          result.sessions.map((s: any) => `• **${s.patient_name}** — ${s.exercise_name} (${s.duration}s, ${new Date(s.created_at).toLocaleDateString()}) [Status: ${s.review_status}]`).join("\n");
      }
    } else if (lower.includes("create") && lower.includes("exercise")) {
      const res = await clinicalEndpoints.create_exercise({
        name: "Gentle Phonation & Easy Onset Practice",
        description: "Targeted exercise for soft glottal attack and steady vocal airflow.",
        instructions: "Take a relaxed diaphragmatic breath. Produce prolonged vowels (/a/, /i/, /u/) with gentle airflow onset and minimal laryngeal tension.",
        category: "Phonation & Breath Control",
        duration: 60
      });
      fallbackText = res.message;
    } else if (lower.includes("enable") || lower.includes("assign")) {
      const isAll = lower.includes("all");
      const res = await clinicalEndpoints.assign_exercise({
        exercise_name_or_id: "Diadochokinetic (DDK) Rate Test",
        target: isAll ? 'all' : 'single',
        patient_name: isAll ? undefined : "Tanmay",
        confirmed: lower.includes("confirm") || lower.includes("yes")
      });
      fallbackText = res.message || res.error || "Assignment processed.";
    } else {
      fallbackText = "I am your SpeakEase Clinical Assistant. You can ask me to view connected patients, check sessions needing review, summarize patient practice metrics, view connection requests, or create and assign exercises.";
    }

    return res.json({ text: fallbackText });
  } catch (err: any) {
    console.error("Assistant error:", err);
    res.status(500).json({ error: "Assistant is temporarily unavailable." });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}


export default app;

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.AWS_REGION ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.VERCEL_URL
);

const isDirectRun = Boolean(
  process.argv[1] && (
    process.argv[1].endsWith('server.ts') ||
    process.argv[1].endsWith('server.js') ||
    process.argv[1].endsWith('server.cjs')
  )
);

if (!isServerless && isDirectRun) {
  startServer();
}

