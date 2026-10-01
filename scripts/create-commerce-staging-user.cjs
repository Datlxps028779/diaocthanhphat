const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');

const productionRef = 'itgxladqskdcbwsbmuyi';
const envText = fs.readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/)
  .filter(line => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
  .map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const email = process.env.COMMERCE_STAGING_TEST_EMAIL;
const password = process.env.COMMERCE_STAGING_TEST_PASSWORD;
const serviceRoleKey = process.env.COMMERCE_STAGING_SERVICE_ROLE_KEY;

if (!url || url.includes(productionRef)) {
  console.error('[commerce-staging-user] BLOCKED: .env.local is not staging.');
  process.exit(2);
}
if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error('[commerce-staging-user] Invalid test email.');
  process.exit(2);
}
if (!password || password.length < 12) {
  console.error('[commerce-staging-user] Password must contain at least 12 characters.');
  process.exit(2);
}
if (!serviceRoleKey) {
  console.error('[commerce-staging-user] Staging service-role key is required.');
  process.exit(2);
}

(async () => {
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: 'Commerce E2E Staging' },
  });
  if (error || !data.user) {
    console.error(`[commerce-staging-user] ${error?.message ?? 'User creation failed.'}`);
    process.exit(1);
  }
  console.log(`[commerce-staging-user] PASS: confirmed staging user created (${data.user.id}).`);
  console.log('[commerce-staging-user] Credentials were not saved.');
})().catch(error => {
  console.error(`[commerce-staging-user] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
