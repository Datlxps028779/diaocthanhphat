const { chromium } = require('playwright-core');

const base = (process.env.BASE || 'http://localhost:3023').replace(/\/$/, '');
const productionHost = /(^|\.)chonhaviet\.com$/.test(new URL(base).hostname);
if (productionHost && process.env.ALLOW_PRODUCTION !== '1') {
  throw new Error('Refusing production smoke test without ALLOW_PRODUCTION=1');
}

const executablePath = process.env.PW_CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const routes = [
  { path: '/', heading: 'Tìm kiếm bất động sản' },
  { path: '/mua-ban', heading: 'Nhà đất bán' },
  { path: '/tin-tuc', heading: 'TIN TỨC' },
  { path: '/nguoi-dang-tin/khong-ton-tai', heading: 'Không tìm thấy trang' },
  { path: '/quantrihethong', heading: 'Không tìm thấy trang' },
];

async function assertHeading(page, expected) {
  const heading = page.locator('h1').first();
  await heading.waitFor({ state: 'visible', timeout: 15000 });
  const text = (await heading.textContent())?.trim() || '';
  if (!text.includes(expected)) throw new Error(`Expected h1 to contain "${expected}", got "${text}"`);
}

async function assertNoRuntimeErrors(page, errors) {
  if (errors.console.length || errors.page.length) {
    throw new Error(`Runtime errors: ${JSON.stringify(errors)}`);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const results = [];
  try {
    for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      const errors = { console: [], page: [] };
      page.on('console', message => {
        if (message.type() !== 'error') return;
        const location = message.location().url;
        const text = message.text();
        if (location.includes('/_vercel/insights/') || location.includes('/_vercel/speed-insights/')) return;
        if (text.includes('Refused to execute script') && (text.includes('/_vercel/insights/') || text.includes('/_vercel/speed-insights/'))) return;
        if (text.includes('Failed to fetch RSC payload') && text.includes('Falling back to browser navigation')) return;
        errors.console.push(`${text} (${location})`);
      });
      page.on('pageerror', error => errors.page.push(String(error)));

      for (const route of routes) {
        errors.console.length = 0;
        errors.page.length = 0;
        await page.goto(`${base}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const expectedDocument404 = route.path === '/nguoi-dang-tin/khong-ton-tai' || route.path === '/quantrihethong';
        if (expectedDocument404) {
          errors.console.splice(0, errors.console.length, ...errors.console.filter(error => !error.includes(`${base}${route.path}`)));
        }
        await assertHeading(page, route.heading);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) throw new Error(`Horizontal overflow on ${route.path} at ${viewport.name}`);
        await assertNoRuntimeErrors(page, errors);
        results.push({ viewport: viewport.name, route: route.path, status: 'PASS' });
      }

      await page.goto(`${base}/mua-ban`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const search = page.locator('input[placeholder="Tìm theo tên, địa chỉ, khu vực..."]');
      await search.fill('Dĩ An');
      await search.press('Enter');
      await page.waitForFunction(() => new URL(window.location.href).searchParams.get('q') === 'Dĩ An', null, { timeout: 10000 });
      const searchUrl = page.url();
      if (!searchUrl.includes('q=D%C4%A9+An') && !searchUrl.includes('q=D%C4%A9%20An')) {
        throw new Error(`Search query was not persisted in URL: ${searchUrl}`);
      }
      results.push({ viewport: viewport.name, route: '/mua-ban?q=Dĩ An', status: 'PASS', url: searchUrl });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify({ base, results }, null, 2));
})().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
