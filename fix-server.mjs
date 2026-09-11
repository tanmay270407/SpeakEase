import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// 1. Fix the error swallowing
content = content.replace(
  `    } catch (err: any) {
      console.warn("Corsair workflow execution failed:", err);
      const isNotConfigured = err.message?.includes("Workflow execution is not enabled") || err.message?.includes("not found") || err.message?.includes("fetch failed");
      const status = isNotConfigured ? "Not configured" : "Failed";
      
      
      if (pool) {
        try {
          const details = JSON.stringify({ workflow: "Session Review", status, details: err.message || "Unknown error" });
          await pool.query(
            "INSERT INTO audit_logs (event_type, description) VALUES ($1, $2)",
            ['WORKFLOW_EXECUTION', details]
          );
        } catch(e) { console.error("Audit log error:", e); }
      }

    }`,
  `    } catch (err: any) {
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
    }`
);

// 2. Fix the MCP tools injection
const targetBlock = `    // Build the Corsair MCP tools
    const corsairTools = buildCorsairToolDefs({ corsair: corsairClient });
    const geminiCorsairTools = corsairTools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: zodToGeminiSchema(z.object(t.shape))
    }));

    // Define native DB tools
    const dbTools = [
      {
        name: "get_patients",
        description: "Get a list of patients assigned to you.",
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: "get_sessions",
        description: "Get recent sessions for your patients. Can filter by review status.",
        parameters: { 
          type: Type.OBJECT, 
          properties: {
            review_status: { type: Type.STRING, description: "Filter by review status (e.g., REVIEW_PENDING, REVIEWED, READY_FOR_REVIEW)" },
            limit: { type: Type.NUMBER, description: "Number of sessions to fetch" }
          }
        }
      }
    ];

    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: "You are a professional assistant for Speech-Language Pathologists. You help them analyze their connected data. You MUST respect the authenticated SLP's permissions. NEVER Diagnose, Prescribe therapy, Change treatment plans, Make clinical decisions, Claim a medical condition, or Replace the SLP. Only summarize and provide objective observations based on data.",
        tools: [{ functionDeclarations: [...geminiCorsairTools, ...dbTools] }],
      }
    });`;

const replacementBlock = `    // Create a request-scoped Corsair instance with native clinical tools
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
    });`;

if (!content.includes("    // Build the Corsair MCP tools")) {
  console.log("Could not find target block for MCP tools!");
}
content = content.replace(targetBlock, replacementBlock);

// 3. Update the inner loop handling functions
content = content.replace(
  `        try {
          if (call.name === "get_patients") {
            const { data } = await supabase.from('patient_assignments')
              .select('patient_id, profiles!patient_assignments_patient_id_fkey(full_name)')
              .eq('slp_id', slpId);
            functionResponses.push({ name: call.name, response: { patients: data || [] } });
          } 
          else if (call.name === "get_sessions") {
            const { review_status, limit } = call.args as any;
            let query = supabase.from('sessions')
              .select('id, user_id, profiles!sessions_user_id_fkey(full_name), created_at, duration, review_status')
              .order('created_at', { ascending: false });
            if (review_status) query = query.eq('review_status', review_status);
            if (limit) query = query.limit(limit);
            
            // Limit to patients of this SLP
            const { data: assignments } = await supabase.from('patient_assignments').select('patient_id').eq('slp_id', slpId);
            const patientIds = assignments?.map((a: any) => a.patient_id) || [];
            if (patientIds.length > 0) {
              query = query.in('user_id', patientIds);
            } else {
              query = query.eq('id', 'NONE'); // Force empty if no patients
            }
            
            const { data } = await query;
            functionResponses.push({ name: call.name, response: { sessions: data || [] } });
          }
          else {
            const corsairTool = corsairTools.find(t => t.name === call.name);
            if (corsairTool) {
              const result = await corsairTool.handler(call.args);
              functionResponses.push({ name: call.name, response: { result } });
            } else {
              functionResponses.push({ name: call.name, response: { error: "Unknown tool" } });
            }
          }
        } catch (e: any) {
          functionResponses.push({ name: call.name, response: { error: e.message } });
        }`,
  `        try {
          const corsairTool = corsairTools.find(t => t.name === call.name);
          if (corsairTool) {
            const result = await corsairTool.handler(call.args);
            functionResponses.push({ name: call.name, response: { result } });
          } else {
            functionResponses.push({ name: call.name, response: { error: "Unknown tool" } });
          }
        } catch (e: any) {
          functionResponses.push({ name: call.name, response: { error: e.message } });
        }`
);

fs.writeFileSync('server.ts', content);
console.log("Updated server.ts");
