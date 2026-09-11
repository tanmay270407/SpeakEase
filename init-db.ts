import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const POOLER_DB_URL = "postgresql://postgres.dbpcjfhrswhphitltpgb:SpeakEase%401234@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
const rawDbUrl = process.env.DATABASE_URL;
const isPlaceholder = !rawDbUrl || rawDbUrl.includes("YOUR_POSTGRES_URL") || rawDbUrl.includes("[YOUR-PASSWORD]") || rawDbUrl.includes("YOUR-PASSWORD");
const dbUrl = isPlaceholder ? POOLER_DB_URL : rawDbUrl;

const pool = new Pool({ connectionString: dbUrl });
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
