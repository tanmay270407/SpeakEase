import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name LIKE 'corsair_%';
  `);
  console.log(res.rows.map(r => r.table_name));
  process.exit(0);
}
check();
