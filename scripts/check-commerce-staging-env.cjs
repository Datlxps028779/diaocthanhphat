const fs = require('node:fs');
const { URL } = require('node:url');

const file = process.env.COMMERCE_ENV_FILE || '.env.local';
if (!fs.existsSync(file)) {
  console.error(`[commerce-env] Missing ${file}. Copy .env.local.example first.`);
  process.exit(2);
}

const values = Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
  .filter(line => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
  .map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));

const url = values.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = values.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey || url.includes('<') || anonKey.includes('<')) {
  console.error('[commerce-env] NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY phải là giá trị staging thật.');
  process.exit(2);
}

let host;
try {
  host = new URL(url).hostname;
} catch {
  console.error('[commerce-env] NEXT_PUBLIC_SUPABASE_URL không hợp lệ.');
  process.exit(2);
}
if (host.includes('itgxladqskdcbwsbmuyi')) {
  console.error('[commerce-env] BLOCKED: .env.local đang trỏ project production.');
  process.exit(2);
}

console.log(`[commerce-env] PASS: non-production Supabase host ${host}`);
console.log(`[commerce-env] Required keys present: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY`);
