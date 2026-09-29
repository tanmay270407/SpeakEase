import pg from 'pg';

const DATABASE_URL = 'postgresql://postgres.dbpcjfhrswhphitltpgb:SpeakEase%401234@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

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
