import 'dotenv/config';
// @ts-ignore
import pg from 'pg';

export async function runMigration() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log('Running migration: creating daily_message_logs table...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.daily_message_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cid uuid NOT NULL REFERENCES public.customers(cid) ON DELETE CASCADE,
      did uuid NOT NULL REFERENCES public.distributors(did) ON DELETE CASCADE,
      uid uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
      entry_date date NOT NULL,
      status varchar(50) NOT NULL DEFAULT 'not_sent',
      message_content text,
      attempt_count integer NOT NULL DEFAULT 0,
      last_attempted_at timestamptz,
      provider_message_id varchar(255),
      error_message text,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_daily_message_distributor_customer_date UNIQUE (did, cid, entry_date)
    );

    CREATE INDEX IF NOT EXISTS idx_daily_message_dist_date ON public.daily_message_logs (did, entry_date);
    CREATE INDEX IF NOT EXISTS idx_daily_message_cust_date ON public.daily_message_logs (cid, entry_date);
  `);

  console.log('Migration completed successfully.');
  await client.end();
}

if (process.argv[1]?.endsWith('run-migration.ts') || process.argv[1]?.endsWith('run-migration.js')) {
  runMigration().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
