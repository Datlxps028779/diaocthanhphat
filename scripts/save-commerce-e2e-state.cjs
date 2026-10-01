const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');

const baseUrl = process.env.COMMERCE_E2E_BASE_URL || 'http://localhost:3001';
const output = process.env.COMMERCE_E2E_OUTPUT || path.join(os.homedir(), 'commerce-owner-storage.json');
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const allowProductionAuth = process.env.COMMERCE_E2E_ALLOW_PRODUCTION_AUTH === 'true';

function classifyEnvironment() {
  for (const file of ['.env.local', '.env']) {
    if (!fs.existsSync(file)) continue;
    const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find(value => value.startsWith('NEXT_PUBLIC_SUPABASE_URL='));
    if (!line) continue;
    const raw = line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
    try {
      const host = new URL(raw).hostname;
      return host.includes('itgxladqskdcbwsbmuyi') ? 'known-production' : 'other';
    } catch {
      return 'invalid';
    }
  }
  return 'unknown';
}

const environment = classifyEnvironment();
if (environment === 'known-production' && !allowProductionAuth) {
  console.error('[commerce-e2e] BLOCKED: local env trỏ project production. Nếu chỉ cho phép read-only auth, chạy lại với COMMERCE_E2E_ALLOW_PRODUCTION_AUTH=true. Không bật checkout write.');
  process.exit(2);
}
if (!fs.existsSync(chromePath)) {
  console.error(`[commerce-e2e] Không tìm thấy Chrome tại ${chromePath}`);
  process.exit(2);
}

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/tai-khoan?tab=commerce`, { waitUntil: 'domcontentloaded' });
  console.log('[commerce-e2e] Đăng nhập thủ công trong Chrome đang mở. Không bấm thanh toán.');
  await page.waitForFunction(
    () => {
      const body = document.body?.innerText ?? '';
      const hasAuthStorage = Object.keys(localStorage).some(key => key.includes('auth-token') && Boolean(localStorage.getItem(key)));
      const hasAuthenticatedHeader = body.includes('Tài khoản của tôi') && !body.includes('Đăng nhập');
      return hasAuthStorage || hasAuthenticatedHeader;
    },
    undefined,
    { timeout: 300_000 },
  );
  await context.storageState({ path: output });
  console.log(`[commerce-e2e] Đã lưu storage state ngoài repository: ${output}`);
  await browser.close();
})().catch(error => {
  console.error(`[commerce-e2e] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
