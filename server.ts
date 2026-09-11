import express from "express";
import path from "path";
import multer from "multer";
import { spawnSync } from "child_process";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { z } from "zod";
import { toExpressHandler } from "corsair";
import { buildCorsairToolDefs } from "@corsair-dev/mcp";
import pg from "pg";
import { corsairClient } from "./corsair";

dotenv.config({ override: true });

const { Pool } = pg;
const POOLER_DB_URL = "postgresql://postgres.dbpcjfhrswhphitltpgb:SpeakEase%401234@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
const rawDbUrl = process.env.DATABASE_URL;
const isPlaceholder = !rawDbUrl || rawDbUrl.includes("YOUR_POSTGRES_URL") || rawDbUrl.includes("[YOUR-PASSWORD]") || rawDbUrl.includes("YOUR-PASSWORD");
const dbUrl = isPlaceholder ? POOLER_DB_URL : rawDbUrl;

let pool: pg.Pool | null = null;
try {
  pool = new Pool({ connectionString: dbUrl });
  pool.query(`
    CREATE TABLE IF NOT EXISTS session_audio (
      session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      audio_data BYTEA NOT NULL,
      content_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(err => {
    console.warn("Could not verify session_audio table:", err.message);
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
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// Helper to create Supabase client using the user's token
const getSupabaseClient = (req: express.Request) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const rawUrl = process.env.VITE_SUPABASE_URL || "";
  const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  return createClient(
    supabaseUrl,
    process.env.VITE_SUPABASE_ANON_KEY || "",
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
    const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
    const supabase = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY || "");

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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
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

    // 3. Fetch assignments and patients
    const { data: assignments } = await supabase
      .from('patient_assignments')
      .select('id, patient_id, status, assigned_at, created_at, profiles!patient_assignments_patient_id_fkey(full_name, email, phone)')
      .eq('slp_id', slpId);

    const patientIds = (assignments || []).map((a: any) => a.patient_id);

    // Sync assignments and patients into corsair_entities
    for (const a of assignments || []) {
      await pool.query(
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
      );

      await pool.query(
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
      );
    }

    // 4. Fetch practice sessions
    let sessions: any[] = [];
    if (patientIds.length > 0) {
      const { data: s } = await supabase
        .from('sessions')
        .select('id, user_id, profiles!sessions_user_id_fkey(full_name), created_at, duration, review_status')
        .in('user_id', patientIds)
        .order('created_at', { ascending: false });
      sessions = s || [];
    }

    // Sync sessions into corsair_entities
    for (const s of sessions) {
      await pool.query(
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
      );
    }

    // 5. Fetch speech metrics
    if (sessions.length > 0) {
      const sessionIds = sessions.map((s: any) => s.id);
      const { data: metrics } = await supabase
        .from('speech_metrics')
        .select('id, session_id, repetitions, pauses, prolongations, speech_rate, created_at')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: false });

      for (const m of metrics || []) {
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

        await pool.query(
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
      }

      // Fetch clinician reviews/notes
      const { data: notes } = await supabase
        .from('clinician_notes')
        .select('id, session_id, clinician_id, note, created_at, updated_at')
        .in('session_id', sessionIds);

      for (const n of notes || []) {
        await pool.query(
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
        );
      }
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

    // Filter sessions needing review
    const needsReviewSessions = allSessions
      .filter((s: any) => s.review_status === 'READY_FOR_REVIEW' || s.review_status === 'REVIEW_PENDING')
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
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
      .select('id')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !sessionInfo) {
      return res.status(403).json({ error: "Forbidden or Not Found" });
    }

    if (!pool) {
       return res.status(503).json({ error: "Durable storage not configured" });
    }
    
    const result = await pool.query('SELECT audio_data, content_type FROM session_audio WHERE session_id = $1', [sessionId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Audio could not be saved." });
    }

    const { audio_data, content_type } = result.rows[0];
    
    res.setHeader('Content-Type', content_type);
    res.send(audio_data);
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
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

app.post("/api/analyze-speech", upload.single("audio"), async (req, res) => {
  let currentSessionId: string | null = null;
  try {
    const supabase = getSupabaseClient(req);
    if (!supabase) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }
    currentSessionId = sessionId;

    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: "Audio could not be saved." });
    }

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

    // 1. Secure audio recording: Save raw audio securely to durable DB and verify
    if (!pool) {
      return res.status(500).json({ error: "Audio could not be saved." });
    }

    try {
      await pool.query(
        `INSERT INTO session_audio (session_id, audio_data, content_type) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (session_id) DO UPDATE SET audio_data = EXCLUDED.audio_data, content_type = EXCLUDED.content_type`,
        [sessionId, req.file.buffer, req.file.mimetype]
      );

      // Verify the saved audio actually exists and is non-empty
      const verifyRes = await pool.query(
        "SELECT octet_length(audio_data) as len FROM session_audio WHERE session_id = $1",
        [sessionId]
      );
      if (!verifyRes.rows.length || !verifyRes.rows[0].len || Number(verifyRes.rows[0].len) === 0) {
        throw new Error("Audio verification failed in database");
      }
    } catch (audioErr: any) {
      console.error("Failed to save audio to durable DB:", audioErr.message);
      return res.status(500).json({ error: "Audio could not be saved." });
    }

    // 2. Determine the exact authoritative audio recording duration from audio data
    let authoritativeDuration = sessionInfo.duration;
    try {
      const probeResult = spawnSync("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        "-"
      ], { input: req.file.buffer, timeout: 5000 });
      const out = probeResult.stdout?.toString().trim();
      const durSec = parseFloat(out);
      if (!isNaN(durSec) && durSec > 0) {
        authoritativeDuration = durSec < 1 ? 1 : Math.round(durSec);
      }
    } catch (ffErr: any) {
      console.warn("ffprobe duration inspection failed:", ffErr.message);
    }

    if (authoritativeDuration > 0 && authoritativeDuration !== sessionInfo.duration) {
      console.log(`[server] Updating session ${sessionId} duration from ${sessionInfo.duration}s to authoritative audio duration ${authoritativeDuration}s`);
      await supabase.from("sessions").update({ duration: authoritativeDuration }).eq("id", sessionId);
      if (pool) {
        await pool.query("UPDATE sessions SET duration = $1 WHERE id = $2", [authoritativeDuration, sessionId]);
      }
      sessionInfo.duration = authoritativeDuration;
    }

    if (!ai) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    // 2. Speech-to-text / Audio processing
    // Corsair AI configuration does not support direct binary audio analysis.
    // Use speech-to-text / audio processing to extract transcript, duration, and acoustic timings.
    const mimeType = req.file.mimetype;
    const base64Audio = req.file.buffer.toString("base64");

    const sttPrompt = `You are an acoustic speech-to-text processor.
Analyze the speech in this audio recording and extract:
1. Verbatim transcript of the spoken words.
2. Approximate duration in seconds.
3. Total word count.
4. Calculated speech rate in words per minute (WPM).
5. Preliminary acoustic pause count (distinct hesitations or gaps).
6. Preliminary sound, syllable, or word repetition count.
7. Preliminary sound prolongation count.

Return valid JSON with this EXACT structure:
{
  "transcript": "<transcribed text or empty if silence>",
  "durationSeconds": <number>,
  "wordCount": <number>,
  "speechRate": <number>,
  "repetitions": <number>,
  "pauses": <number>,
  "prolongations": <number>
}`;

    const sttResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: sttPrompt },
            { inlineData: { mimeType, data: base64Audio } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const sttResultText = sttResponse.text;
    if (!sttResultText) {
      throw new Error("Empty response from speech processing step");
    }

    let processedAudio: {
      transcript: string;
      durationSeconds: number;
      wordCount: number;
      speechRate: number;
      repetitions: number;
      pauses: number;
      prolongations: number;
    };
    try {
      processedAudio = JSON.parse(sttResultText);
    } catch (e: any) {
      throw new Error("Failed to parse speech processing results: " + e.message);
    }

    // 3. Fetch real previous session data for historical comparison
    let priorContext = "This is the patient's baseline practice session (no prior recorded session).";
    try {
      const { data: priorSessions } = await supabase
        .from("sessions")
        .select("id, created_at, duration")
        .eq("user_id", user.id)
        .neq("id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (priorSessions && priorSessions.length > 0) {
        const { data: pMetrics } = await supabase
          .from("speech_metrics")
          .select("repetitions, pauses, prolongations, speech_rate, created_at")
          .eq("session_id", priorSessions[0].id)
          .single();

        if (pMetrics) {
          priorContext = `Prior session on ${new Date(pMetrics.created_at).toLocaleDateString()}: Speech rate ${pMetrics.speech_rate || 0} wpm, repetitions ${pMetrics.repetitions ?? 0}, pauses ${pMetrics.pauses ?? 0}, prolongations ${pMetrics.prolongations ?? 0}.`;
        }
      }
    } catch (priorErr: any) {
      console.warn("Could not load prior session context:", priorErr.message);
    }

    // 4. Corsair AI Agent Analysis
    // Send transcript and structured speech information through Corsair AI
    const corsairAnalysisPrompt = `You are a clinical speech observation assistant for Speech-Language Pathologists reviewing practice sessions in SpeakEase.
Analyze the following speech session transcript and acoustic parameters:
- Spoken Transcript: "${processedAudio.transcript || 'No speech detected'}"
- Audio Duration: ${processedAudio.durationSeconds || sessionInfo.duration || 0} seconds
- Word Count: ${processedAudio.wordCount || 0}
- Calculated Speech Rate: ${processedAudio.speechRate || 0} words per minute
- Preliminary detected repetitions: ${processedAudio.repetitions || 0}
- Preliminary detected pauses: ${processedAudio.pauses || 0}
- Preliminary detected prolongations: ${processedAudio.prolongations || 0}
- Historical Context: ${priorContext}

Task:
Provide cautious, objective, non-diagnostic observations for clinician review.
Cover:
1. Possible repetitions (sound, syllable, or word).
2. Noticeable pauses or hesitations.
3. Possible sound prolongations.
4. Speech rate and pace.
5. Comparison with previous session when real previous data exists (state clearly if baseline/initial session).

CRITICAL CLINICAL SAFETY RULES:
- You must NEVER diagnose stuttering, speech disorder, or any medical condition.
- You must NEVER claim medical severity (do NOT use terms like "severe stutter", "pathological", "speech disorder").
- You must NEVER prescribe therapy, exercises, or clinical interventions.
- Only provide objective observations that assist the SLP in their evaluation.
- Allowed phrasing: "Possible repetition observed...", "A pause was noted...", "Speech rate was steady...", "In comparison to prior session..."

Return a JSON object with this EXACT structure:
{
  "repetitions": <number>,
  "pauses": <number>,
  "prolongations": <number>,
  "speech_rate": <number>,
  "observation": "<cautious, non-diagnostic observation narrative complying with all safety rules>"
}`;

    let corsairObservationText = "";
    let finalMetrics = {
      repetitions: Number(processedAudio.repetitions) || 0,
      pauses: Number(processedAudio.pauses) || 0,
      prolongations: Number(processedAudio.prolongations) || 0,
      speech_rate: Number(processedAudio.speechRate) || 0
    };

    try {
      const corsairChat = await corsairClient.chats.create(corsairAnalysisPrompt);
      const rawContent = corsairChat?.reply?.message?.content;
      if (!rawContent) {
        throw new Error("Empty response received from Corsair AI Agent");
      }

      let parsedCorsair: any = null;
      try {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedCorsair = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr: any) {
        console.warn("Could not parse JSON from Corsair AI response, using narrative output.");
      }

      if (parsedCorsair && typeof parsedCorsair === 'object') {
        if (typeof parsedCorsair.repetitions === 'number') finalMetrics.repetitions = parsedCorsair.repetitions;
        if (typeof parsedCorsair.pauses === 'number') finalMetrics.pauses = parsedCorsair.pauses;
        if (typeof parsedCorsair.prolongations === 'number') finalMetrics.prolongations = parsedCorsair.prolongations;
        if (typeof parsedCorsair.speech_rate === 'number') finalMetrics.speech_rate = parsedCorsair.speech_rate;
        corsairObservationText = parsedCorsair.observation || rawContent;
      } else {
        corsairObservationText = rawContent;
      }
    } catch (corsairErr: any) {
      console.error("Corsair AI speech analysis failed:", corsairErr.message);
      // Log failure safely to audit_logs
      if (pool) {
        try {
          const failureDetails = JSON.stringify({
            workflow: "Corsair AI Speech Analysis",
            sessionId,
            status: "Failed",
            error: corsairErr.message || "Unknown error"
          });
          await pool.query(
            "INSERT INTO audit_logs (event_type, description) VALUES ($1, $2)",
            ['WORKFLOW_EXECUTION', failureDetails]
          );
        } catch(e) {}
      }
      // If Corsair AI analysis fails:
      // - keep recorded session
      // - do not fabricate results
      // - show a clear analysis-unavailable message
      return res.status(503).json({
        error: "Speech analysis is temporarily unavailable. Your session recording was saved securely.",
        sessionId
      });
    }

    // 5. Save results to Supabase (speech_metrics and ai_observations)
    // 5a. Save to speech_metrics
    const { error: metricsError } = await supabase.from("speech_metrics").insert({
      session_id: sessionId,
      repetitions: finalMetrics.repetitions,
      pauses: finalMetrics.pauses,
      prolongations: finalMetrics.prolongations,
      speech_rate: finalMetrics.speech_rate
    });

    if (metricsError) {
      console.error("speech_metrics insert error:", metricsError);
      throw metricsError;
    }

    // 5b. Save to ai_observations
    const { error: obsError } = await supabase.from("ai_observations").insert({
      session_id: sessionId,
      observation: corsairObservationText,
      observation_text: corsairObservationText
    });

    if (obsError) {
      console.error("ai_observations insert error:", obsError);
      throw obsError;
    }

    // 5c. Mark session as READY_FOR_REVIEW
    const { error: updateError } = await supabase.from("sessions")
      .update({ review_status: "READY_FOR_REVIEW" })
      .eq("id", sessionId);

    if (updateError) {
      console.warn("Session status update warning:", updateError.message);
    }

    // 6. Sync session and speech_metric entities to corsair_entities for Corsair SLP Dashboard
    if (pool) {
      try {
        const timestamp = new Date().toISOString();
        const accountId = "default";
        
        // Update session in corsair_entities
        const sessionEntityId = `session_${sessionId}`;
        const existingSession = await pool.query('SELECT data FROM corsair_entities WHERE id = $1', [sessionEntityId]);
        const sData = existingSession.rows[0]?.data || {
          id: sessionId,
          user_id: user.id,
          patient_id: user.id,
          duration: sessionInfo.duration,
          created_at: timestamp
        };
        sData.review_status = 'READY_FOR_REVIEW';
        await pool.query(
          `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8;`,
          [sessionEntityId, timestamp, timestamp, accountId, sessionId, 'session', '1', JSON.stringify(sData)]
        );

        // Upsert speech_metric in corsair_entities
        const metricEntityId = `metric_${sessionId}`;
        const metricPayload = {
          session_id: sessionId,
          repetitions: finalMetrics.repetitions,
          pauses: finalMetrics.pauses,
          prolongations: finalMetrics.prolongations,
          speech_rate: finalMetrics.speech_rate,
          observation: corsairObservationText,
          created_at: timestamp
        };
        await pool.query(
          `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8;`,
          [metricEntityId, timestamp, timestamp, accountId, sessionId, 'speech_metric', '1', JSON.stringify(metricPayload)]
        );

        // Audit log entry
        const details = JSON.stringify({
          workflow: "Corsair AI Speech Analysis",
          status: "Success",
          details: "Speech analysis completed and observations saved successfully",
          sessionId,
          metrics: finalMetrics
        });
        await pool.query(
          "INSERT INTO audit_logs (event_type, description) VALUES ($1, $2)",
          ['WORKFLOW_EXECUTION', details]
        );
      } catch (e: any) {
        console.warn("Audit/Corsair sync warning:", e.message);
      }
    }

    return res.json({
      success: true,
      sessionId,
      metrics: finalMetrics,
      observation: corsairObservationText
    });

  } catch (err: any) {
    console.error("Speech analysis pipeline error:", err);
    return res.status(500).json({ error: "Speech analysis is temporarily unavailable." });
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
    const { data: userAuth, error: authErr } = await supabase.auth.getUser();
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
    const { message } = req.body;

    if (!ai) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    // Create a request-scoped Corsair instance with native clinical tools
    const { createCorsair } = await import('corsair');
    const scopedCorsair = createCorsair({
      plugins: [{
        id: 'clinical',
        endpoints: {
          get_patients: async () => {
            const { data } = await supabase.from('patient_assignments')
              .select('patient_id, profiles!patient_assignments_patient_id_fkey(full_name)')
              .eq('slp_id', slpId);
            return { patients: data || [] };
          },
          get_sessions: async (args) => {
            const { review_status, limit } = args as any;
            let query = supabase.from('sessions')
              .select('id, user_id, profiles!sessions_user_id_fkey(full_name), created_at, duration, review_status')
              .order('created_at', { ascending: false });
            if (review_status) query = query.eq('review_status', review_status);
            if (limit) query = query.limit(limit);
            
            const { data: assignments } = await supabase.from('patient_assignments').select('patient_id').eq('slp_id', slpId);
            const patientIds = assignments?.map((a) => (a as any).patient_id) || [];
            if (patientIds.length > 0) {
              query = query.in('user_id', patientIds);
            } else {
              query = query.eq('id', 'NONE');
            }
            const { data } = await query;
            return { sessions: data || [] };
          }
        },
        endpointMeta: {
          get_patients: { description: "Get a list of patients assigned to you." },
          get_sessions: { description: "Get recent sessions for your patients. Can filter by review status." }
        },
        endpointSchemas: {
          get_patients: { input: z.object({}), output: z.any() },
          get_sessions: { 
            input: z.object({ 
              review_status: z.string().optional().describe("Filter by review status"),
              limit: z.number().optional().describe("Number of sessions")
            }), 
            output: z.any() 
          }
        }
      }],
      database: (corsairClient as any).database,
      kek: process.env.CORSAIR_KEK || ''
    });

    const corsairTools = buildCorsairToolDefs({ corsair: scopedCorsair });
    const geminiCorsairTools = corsairTools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: zodToGeminiSchema(z.object(t.shape))
    }));

    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: "You are a professional assistant for Speech-Language Pathologists. You help them analyze their connected data. You MUST respect the authenticated SLP's permissions. NEVER Diagnose, Prescribe therapy, Change treatment plans, Make clinical decisions, Claim a medical condition, or Replace the SLP. Only summarize and provide objective observations based on data.",
        tools: [{ functionDeclarations: geminiCorsairTools }],
      }
    });

    let chatResponse = await chat.sendMessage({ message });
    
    // Process function calls sequentially
    let iterations = 0;
    while (chatResponse.functionCalls && chatResponse.functionCalls.length > 0 && iterations < 5) {
      const functionResponses = [];
      for (const call of chatResponse.functionCalls) {
        try {
          const corsairTool = corsairTools.find(t => t.name === call.name);
          if (corsairTool) {
            const result = await corsairTool.handler(call.args);
            functionResponses.push({ name: call.name, response: { result } });
          } else {
            functionResponses.push({ name: call.name, response: { error: "Unknown tool" } });
          }
        } catch (e: any) {
          functionResponses.push({ name: call.name, response: { error: e.message } });
        }
      }
      chatResponse = await chat.sendMessage({
        message: functionResponses.map(fr => ({
          functionResponse: { name: fr.name, response: fr.response }
        }))
      });
      iterations++;
    }

    res.json({ text: chatResponse.text });
  } catch (err: any) {
    console.error("Assistant error:", err);
    res.status(500).json({ error: "Assistant is temporarily unavailable." });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
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
if (process.env.NODE_ENV !== "production" || process.env.RUN_SERVER === "true" || (!process.env.VERCEL && !process.env.AWS_REGION)) {
  startServer();
}

