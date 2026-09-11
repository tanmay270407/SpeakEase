import dotenv from "dotenv";
dotenv.config({ override: true });

import { createCorsair } from 'corsair';
import { Pool } from 'pg';

const POOLER_DB_URL = "postgresql://postgres.dbpcjfhrswhphitltpgb:SpeakEase%401234@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
const rawDbUrl = process.env.DATABASE_URL;
const isPlaceholder = !rawDbUrl || rawDbUrl.includes("YOUR_POSTGRES_URL") || rawDbUrl.includes("[YOUR-PASSWORD]") || rawDbUrl.includes("YOUR-PASSWORD");
const dbUrl = isPlaceholder ? POOLER_DB_URL : rawDbUrl;

// Initialize Postgres connection
const pool = new Pool({ 
  connectionString: dbUrl 
});

export const corsairClient = createCorsair({
  plugins: [],
  database: pool,
  kek: process.env.CORSAIR_KEK!,
  hub: {
    projectApiKey: process.env.CORSAIR_API_KEY!,
    signingSecret: process.env.CORSAIR_SIGNING_SECRET!,
    allowWorkflowExecution: true,
  },
});

export const corsair = corsairClient;
export default corsairClient;
