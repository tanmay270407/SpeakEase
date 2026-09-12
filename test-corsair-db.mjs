import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const DATABASE_URL = process.env.DATABASE_URL ? decodeURIComponent(process.env.DATABASE_URL) : '';
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function check() {
  const tableRes = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE 'corsair_%';
  `);
  console.log("Corsair tables:");
  console.table(tableRes.rows);
  pool.end();
}
check();
