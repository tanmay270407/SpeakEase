import pg from 'pg';
const DATABASE_URL = 'postgresql://postgres.dbpcjfhrswhphitltpgb:SpeakEase%401234@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
const pool = new pg.Pool({ connectionString: DATABASE_URL });
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
