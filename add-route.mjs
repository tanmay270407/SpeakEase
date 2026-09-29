import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const target = `app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});`;

const replacement = `app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/corsair/slp/:slpId/dashboard", async (req, res) => {
  try {
    const { slpId } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Missing authorization" });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
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

    if (pool) {
      const timestamp = new Date().toISOString();
      const accountId = \`slp_account_\${slpId}\`; // tenant/account mapping in corsair

      // sync patients
      for (const a of assignments || []) {
        const entityId = \`patient_\${a.patient_id}\`;
        await pool.query(
          \`INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8\`,
          [entityId, timestamp, timestamp, accountId, a.patient_id, 'patient', '1', JSON.stringify(a)]
        );
      }

      // sync sessions
      for (const s of sessions) {
        const entityId = \`session_\${s.id}\`;
        await pool.query(
          \`INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8\`,
          [entityId, timestamp, timestamp, accountId, s.id, 'session', '1', JSON.stringify(s)]
        );
      }

      // Read synced data from Corsair DB
      const pRes = await pool.query(\`SELECT count(*) FROM corsair_entities WHERE account_id = $1 AND entity_type = 'patient'\`, [accountId]);
      const patientCount = parseInt(pRes.rows[0].count);

      const sRes = await pool.query(\`SELECT count(*) FROM corsair_entities WHERE account_id = $1 AND entity_type = 'session'\`, [accountId]);
      const sessionCount = parseInt(sRes.rows[0].count);

      const rRes = await pool.query(
        \`SELECT data FROM corsair_entities 
         WHERE account_id = $1 AND entity_type = 'session' 
         AND (data->>'review_status' = 'READY_FOR_REVIEW' OR data->>'review_status' = 'REVIEW_PENDING')
         ORDER BY (data->>'created_at') DESC
         LIMIT 10\`, [accountId]
      );
      const needsReviewSessions = rRes.rows.map(r => r.data);

      return res.json({
        patientCount,
        sessionCount,
        needsReviewSessions
      });
    } else {
      return res.status(500).json({ error: "Corsair DB not connected" });
    }
  } catch (err: any) {
    console.error("Dashboard error:", err);
    return res.status(500).json({ error: "Failed to load dashboard from Corsair" });
  }
});`;

content = content.replace(target, replacement);
fs.writeFileSync('server.ts', content);
console.log('Added route to server.ts');
