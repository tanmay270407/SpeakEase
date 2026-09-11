import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    const slpRes = await pool.query('SELECT id FROM slps LIMIT 1');
    if (slpRes.rows.length === 0) {
      console.log('No SLP found in DB. Data flow works but cannot test sync.');
      process.exit(0);
    }
    const slpId = slpRes.rows[0].id;
    console.log('Found SLP:', slpId);
    
    // Check corsair_entities
    const accountId = `slp_account_${slpId}`;
    const entities = await pool.query(`SELECT count(*) FROM corsair_entities WHERE account_id = $1`, [accountId]);
    console.log('Entities before:', entities.rows[0].count);
    
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
