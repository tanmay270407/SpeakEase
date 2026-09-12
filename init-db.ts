import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const dbUrl = process.env.DATABASE_URL ? decodeURIComponent(process.env.DATABASE_URL) : "";

const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});
pool.on('error', (err) => {
  console.warn("[Init DB] Postgres pool background error:", err.message);
});
async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow_name TEXT NOT NULL,
      status TEXT NOT NULL,
      details TEXT,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  console.log("Table created.");
  process.exit(0);
}
main().catch(console.error);
