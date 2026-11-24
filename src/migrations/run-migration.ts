import 'dotenv/config';
// @ts-ignore
import pg from 'pg';

export async function runMigration() {
  const rawUrl = process.env.DATABASE_URL || '';
  const connectionString = rawUrl.includes('?')
    ? rawUrl.replace(/[?&]sslmode=[^&]+/, '')
    : rawUrl;
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log('Running migration: creating daily_message_logs and payment_entries tables...');
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

    CREATE TABLE IF NOT EXISTS public.payment_entries (
      pid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cid uuid NOT NULL REFERENCES public.customers(cid) ON DELETE CASCADE,
      did uuid NOT NULL REFERENCES public.distributors(did) ON DELETE CASCADE,
      uid uuid NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
      year integer NOT NULL,
      month integer NOT NULL,
      bill_amount numeric(12, 2) NOT NULL DEFAULT 0.00,
      received_amount numeric(12, 2) NOT NULL DEFAULT 0.00,
      note text,
      received_date date NOT NULL DEFAULT CURRENT_DATE,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_payment_entries_customer_year_month UNIQUE (cid, year, month)
    );

    CREATE INDEX IF NOT EXISTS idx_payment_entries_dist_year_month ON public.payment_entries (did, year, month);
    CREATE INDEX IF NOT EXISTS idx_payment_entries_cust_year_month ON public.payment_entries (cid, year, month);

    ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
    ALTER TABLE public.distributors ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

    -- Ensure milk_entries cascades on customer delete
    ALTER TABLE public.milk_entries DROP CONSTRAINT IF EXISTS milk_entries_cid_foreign;
    ALTER TABLE public.milk_entries ADD CONSTRAINT milk_entries_cid_foreign FOREIGN KEY (cid) REFERENCES public.customers(cid) ON DELETE CASCADE;

    -- Ensure user expiry columns use timestamptz
    ALTER TABLE public.users ALTER COLUMN reset_expires_at TYPE TIMESTAMPTZ USING reset_expires_at::timestamptz;
    ALTER TABLE public.users ALTER COLUMN verification_expires_at TYPE TIMESTAMPTZ USING verification_expires_at::timestamptz;

    -- Ensure authorized platform owners have ADMIN role
    UPDATE public.users 
    SET role = 'admin' 
    WHERE LOWER(email) IN ('hareshsambad426@gmail.com', 'yashpatoliya14@gmail.com');
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
