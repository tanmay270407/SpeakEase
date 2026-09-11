import express from "express";
import path from "path";
import multer from "multer";
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
      return res.status(404).json({ error: "Audio not found" });
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

app.get("/api/corsair/slp/:slpId/dashboard", async (req, res) => {
  try {
    const { slpId } = req.params;
    
    const supabase = getSupabaseClient(req);
    if (!supabase) return res.status(401).json({ error: "Missing authorization" });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: "Invalid token" });

    // Verify SLP owns this data
    const { data: slpRec } = await supabase.from('slps').select('id, user_id').eq('id', slpId).single();
    if (!slpRec || slpRec.user_id !== user.id) {
      return res.status(403).json({ error: "Unauthorized access to SLP data" });
    }

    const { data: assignments } = await supabase.from('patient_assignments')
      .select('patient_id, profiles!patient_assignments_patient_id_fkey(full_name)')
      .eq('slp_id', slpId);
    
    const patientIds = assignments?.map((a) => (a as any).patient_id) || [];
    
    let sessions = [];
    if (patientIds.length > 0) {
      const { data: s } = await supabase.from('sessions')
        .select('id, user_id, profiles!sessions_user_id_fkey(full_name), created_at, duration, review_status')
        .in('user_id', patientIds);
      sessions = s || [];
    }

    // Fetch basic speech metrics
    let speechMetrics = [];
    if (sessions.length > 0) {
      const sessionIds = sessions.map((s: any) => s.id);
      const { data: m } = await supabase.from('speech_metrics')
        .select('id, session_id, fluency_score, articulation_score, created_at')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: false })
        .limit(20);
      speechMetrics = m || [];
    }

    if (pool) {
      const timestamp = new Date().toISOString();
      const accountId = `slp_account_${slpId}`;

      // sync patients
      for (const a of assignments || []) {
        const entityId = `patient_${a.patient_id}`;
        await pool.query(
          `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8`,
          [entityId, timestamp, timestamp, accountId, a.patient_id, 'patient', '1', JSON.stringify(a)]
        );
      }

      // sync sessions
      for (const s of sessions) {
        const entityId = `session_${s.id}`;
        await pool.query(
          `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8`,
          [entityId, timestamp, timestamp, accountId, s.id, 'session', '1', JSON.stringify(s)]
        );
      }

      // sync metrics
      for (const m of speechMetrics) {
        const entityId = `metric_${m.id}`;
        await pool.query(
          `INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8`,
          [entityId, timestamp, timestamp, accountId, m.id, 'speech_metric', '1', JSON.stringify(m)]
        );
      }

      // READ FROM CORSAIR DB
      const pRes = await pool.query(`SELECT data FROM corsair_entities WHERE account_id = $1 AND entity_type = 'patient'`, [accountId]);
      const allPatients = pRes.rows.map(r => r.data);
      const patientCount = allPatients.length;

      const sRes = await pool.query(
        `SELECT data FROM corsair_entities 
         WHERE account_id = $1 AND entity_type = 'session'
         ORDER BY (data->>'created_at') DESC`, [accountId]
      );
      const allSessions = sRes.rows.map(r => r.data);
      const sessionCount = allSessions.length;

      // needs review
      const needsReviewSessions = allSessions
        .filter((s: any) => s.review_status === 'READY_FOR_REVIEW' || s.review_status === 'REVIEW_PENDING')
        .slice(0, 10);

      // recent sessions
      const recentSessions = allSessions.slice(0, 10);

      // inactive patients (no session in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const inactivePatients = allPatients.filter((p: any) => {
        const pSessions = allSessions.filter((s: any) => s.user_id === p.patient_id);
        if (pSessions.length === 0) return true;
        const lastSessionDate = new Date(pSessions[0].created_at);
        return lastSessionDate < sevenDaysAgo;
      });

      // speech metrics
      const mRes = await pool.query(
        `SELECT data FROM corsair_entities 
         WHERE account_id = $1 AND entity_type = 'speech_metric'
         ORDER BY (data->>'created_at') DESC
         LIMIT 10`, [accountId]
      );
      const metricsData = mRes.rows.map(r => r.data);

      return res.json({
        patientCount,
        sessionCount,
        needsReviewSessions,
        recentSessions,
        inactivePatients,
        speechMetrics: metricsData
      });
    } else {
      return res.status(500).json({ error: "Corsair DB not connected" });
    }
  } catch (err: any) {
    console.error("Dashboard error:", err);
    return res.status(500).json({ error: "Failed to load dashboard from Corsair" });
  }
});

app.post("/api/analyze-speech", upload.single("audio"), async (req, res) => {
  try {
    const supabase = getSupabaseClient(req);
    if (!supabase) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Missing audio file" });
    }

    if (!ai) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const mimeType = req.file.mimetype;
    const base64Audio = req.file.buffer.toString("base64");

    // Call Gemini 2.5 Flash for speech analysis
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are an AI assistant analyzing speech for clinical observation. 
Your task is to estimate possible repetitions, pauses, prolongations, and estimate speech rate (words per minute).

STRICT SAFETY RULES:
- You must ONLY provide objective observations based on the audio provided.
- NEVER diagnose a condition (e.g., do not say "You have severe stuttering", "Your condition is worse", "You have a speech disorder").
- NEVER prescribe treatment or assert the user needs therapy.
- Allowed phrasing examples: "Possible repetition detected.", "Speech rate was steady.", "This session may be useful for clinician review."
- If the audio is completely silent or lacks speech, set the metrics to 0 and provide a relevant observation like "No clear speech detected."

Return a JSON object with this EXACT structure (all values must be present):
{
  "repetitions": <number>,
  "pauses": <number>,
  "prolongations": <number>,
  "speechRate": <number>,
  "observation": "<string, strictly following the safety rules above>"
}`
            },
            {
              inlineData: { mimeType, data: base64Audio }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const aiResultText = response.text;
    if (!aiResultText) {
      throw new Error("Empty response from AI");
    }

    const parsedData = JSON.parse(aiResultText);
    const { repetitions, pauses, prolongations, speechRate, observation } = parsedData;

    // Save to database
    // 1. Save to speech_metrics
    const { error: metricsError } = await supabase.from("speech_metrics").insert({
      session_id: sessionId,
      metrics: {
        repetitions: Number(repetitions) || 0,
        pauses: Number(pauses) || 0,
        prolongations: Number(prolongations) || 0,
        speech_rate: Number(speechRate) || 0
      }
    });

    if (metricsError) throw metricsError;

    // 2. Save to ai_observations
    const { error: obsError } = await supabase.from("ai_observations").insert({
      session_id: sessionId,
      observation_text: observation || "No observation recorded."
    });

    if (obsError) throw obsError;

    // 3. Mark session as REVIEW_PENDING locally (as fallback)
    const { error: updateError } = await supabase.from("sessions")
      .update({ review_status: "REVIEW_PENDING" })
      .eq("id", sessionId);

    if (updateError) throw updateError;

    // Save audio durably via Postgres pool if available
    if (pool) {
      try {
        await pool.query(
          'INSERT INTO session_audio (session_id, audio_data, content_type) VALUES ($1, $2, $3) ON CONFLICT (session_id) DO UPDATE SET audio_data = EXCLUDED.audio_data, content_type = EXCLUDED.content_type',
          [sessionId, req.file.buffer, req.file.mimetype]
        );
      } catch (audioErr: any) {
        console.error("Failed to save audio to durable DB:", audioErr.message);
      }
    }


    // 4. Trigger Corsair Workflow for Session Review
    // "Practice completed -> Session saved -> Corsair workflow triggered -> Session marked 'Ready for Review'"
    try {
      await corsairClient.workflows.run('wf_session_review', {
        payload: { sessionId, metrics: parsedData }
      });
      // If it miraculously succeeds, log success
      
      // Log to audit_logs durably if possible
      if (pool) {
        try {
          const details = JSON.stringify({ workflow: "Session Review", status: "Success", details: "Workflow completed successfully" });
          await pool.query(
            "INSERT INTO audit_logs (event_type, description) VALUES ($1, $2)",
            ['WORKFLOW_EXECUTION', details]
          );
        } catch(e) { console.error("Audit log error:", e); }
      }

    } catch (err: any) {
      console.error("Corsair workflow execution failed:", err);
      if (pool) {
        try {
          const details = JSON.stringify({ workflow: "Session Review", status: "Failed", details: err.message || "Unknown error" });
          await pool.query(
            "INSERT INTO audit_logs (event_type, description) VALUES ($1, $2)",
            ['WORKFLOW_EXECUTION', details]
          );
        } catch(e) { console.error("Audit log error:", e); }
      }
      return res.status(500).json({ error: "Failed to queue session for review." });
    }

    res.json({ success: true, metrics: parsedData });
  } catch (err: any) {
    console.error("Speech analysis error:", err);
    res.status(500).json({ error: "Speech analysis is temporarily unavailable." });
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

