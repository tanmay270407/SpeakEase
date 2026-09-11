import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const target = `    if (pool) {
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
      });`;

const replacement = `    // Fetch basic speech metrics
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
      const accountId = \`slp_account_\${slpId}\`;

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

      // sync metrics
      for (const m of speechMetrics) {
        const entityId = \`metric_\${m.id}\`;
        await pool.query(
          \`INSERT INTO corsair_entities (id, created_at, updated_at, account_id, entity_id, entity_type, version, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET updated_at = $3, data = $8\`,
          [entityId, timestamp, timestamp, accountId, m.id, 'speech_metric', '1', JSON.stringify(m)]
        );
      }

      // READ FROM CORSAIR DB
      const pRes = await pool.query(\`SELECT data FROM corsair_entities WHERE account_id = $1 AND entity_type = 'patient'\`, [accountId]);
      const allPatients = pRes.rows.map(r => r.data);
      const patientCount = allPatients.length;

      const sRes = await pool.query(
        \`SELECT data FROM corsair_entities 
         WHERE account_id = $1 AND entity_type = 'session'
         ORDER BY (data->>'created_at') DESC\`, [accountId]
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
        \`SELECT data FROM corsair_entities 
         WHERE account_id = $1 AND entity_type = 'speech_metric'
         ORDER BY (data->>'created_at') DESC
         LIMIT 10\`, [accountId]
      );
      const metricsData = mRes.rows.map(r => r.data);

      return res.json({
        patientCount,
        sessionCount,
        needsReviewSessions,
        recentSessions,
        inactivePatients,
        speechMetrics: metricsData
      });`;

content = content.replace(target, replacement);
fs.writeFileSync('server.ts', content);
console.log('Fixed route in server.ts');
