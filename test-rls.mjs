import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const DATABASE_URL = process.env.DATABASE_URL ? decodeURIComponent(process.env.DATABASE_URL) : '';
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    const tableRes = await pool.query(`
      SELECT relname as table_name, relrowsecurity as rls_enabled
      FROM pg_class 
      WHERE relnamespace = 'public'::regnamespace 
        AND relkind = 'r';
    `);
    
    const policyRes = await pool.query(`
      SELECT tablename, policyname, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE schemaname = 'public';
    `);

    console.log("TABLES:");
    console.table(tableRes.rows);
    console.log("POLICIES:");
    console.table(policyRes.rows);
  } catch (e) {
    console.error('DB Error:', e.message);
  } finally {
    await pool.end();
  }
}
run();
