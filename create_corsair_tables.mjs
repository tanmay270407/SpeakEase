import pg from 'pg';
const DATABASE_URL = 'postgresql://postgres.dbpcjfhrswhphitltpgb:SpeakEase%401234@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';

const sql = `
CREATE TABLE IF NOT EXISTS corsair_integrations (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  dek TEXT NULL
);
CREATE TABLE IF NOT EXISTS corsair_accounts (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  tenant_id TEXT NOT NULL,
  integration_id TEXT NOT NULL,
  config JSONB NOT NULL,
  dek TEXT NULL
);
CREATE TABLE IF NOT EXISTS corsair_entities (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  account_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  version TEXT NOT NULL,
  data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS corsair_events (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  account_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT
);
CREATE TABLE IF NOT EXISTS corsair_permissions (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  tenant_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  plugin TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  args JSONB,
  reason TEXT,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS corsair_events_account_type_created_idx
  ON corsair_events (account_id, event_type, created_at);
`;

const pool = new pg.Pool({ connectionString: DATABASE_URL });
pool.query(sql).then(() => {
  console.log('SUCCESS');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
