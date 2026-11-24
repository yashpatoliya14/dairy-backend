const pg = require('pg');
const bcrypt = require('bcrypt');

async function seedAdmin() {
  const connectionString = 'postgresql://postgres.hahlroumvgbybqzhxyhp:Mirzapur%4059@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const email = 'admin@dairydesk.in';
  const rawPassword = 'DairyAdmin@2026!';
  const passwordHash = await bcrypt.hash(rawPassword, 12);

  console.log(`Hashing password for ${email}...`);

  const existing = await client.query('SELECT uid, email, role FROM users WHERE email = $1', [email]);

  if (existing.rows.length > 0) {
    console.log(`User ${email} already exists. Updating password and role...`);
    await client.query(
      `UPDATE users 
       SET password_hash = $1, role = 'admin', is_active = true, email_verified = true
       WHERE email = $2`,
      [passwordHash, email]
    );
    console.log(`Updated ${email} successfully.`);
  } else {
    console.log(`Creating new dedicated admin account: ${email}...`);
    await client.query(
      `INSERT INTO users (
        uid, email, password_hash, role, email_verified, is_active, first_name, last_name, name
      ) VALUES (
        gen_random_uuid(), $1, $2, 'admin', true, true, 'Platform', 'Admin', 'Platform Admin'
      )`,
      [email, passwordHash]
    );
    console.log(`Created ${email} successfully.`);
  }

  const verify = await client.query('SELECT uid, email, role, is_active FROM users WHERE email = $1', [email]);
  console.log('Verification record:', verify.rows[0]);

  await client.end();
}

seedAdmin().catch(console.error);
