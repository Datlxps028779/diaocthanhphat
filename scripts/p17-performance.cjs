const { chromium } = require('playwright-core');

const base = (process.env.BASE || 'http://localhost:3023').replace(/\/$/, '');
const hostname = new URL(base).hostname;
const productionHost = /(^|\.)chonhaviet\.com$/.test(hostname);
if (productionHost && process.env.ALLOW_PRODUCTION !== '1') {
  throw new Error('Refusing production performance measurement without ALLOW_PRODUCTION=1');
}

const routes = ['/', '/mua-ban', '/tin-tuc'];
if (process.env.PROPERTY_PATH) routes.push(process.env.PROPERTY_PATH);
const executablePath = process.env.PW_CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function ignoredConsoleError(text, location) {
  if (location.includes('/_vercel/insights/') || location.includes('/_vercel/speed-insights/')) return true;
  if (location.includes('tile.openstreetmap.org/')) return true;
  if (text.includes('tile.openstreetmap.org/')) return true;
  return text.includes('Failed to fetch RSC payload') && text.includes('Falling back to browser navigation');
}

async function measureRoute(browser, viewport, path) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!ignoredConsoleError(text, message.location().url)) consoleErrors.push(text);
  });
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.addInitScript(() => {
    window.__p17 = { lcp: null, cls: 0, inp: null };
    try {
      new PerformanceObserver(list => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) window.__p17.lcp = last.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      let sessionValue = 0;
      let sessionStart = 0;
      let lastShift = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          if (!sessionStart || entry.startTime - lastShift > 1000 || entry.startTime - sessionStart > 5000) {
            sessionStart = entry.startTime;
            sessionValue = entry.value;
          } else {
            sessionValue += entry.value;
          }
          lastShift = entry.startTime;
          window.__p17.cls = Math.max(window.__p17.cls, sessionValue);
        }
      }).observe({ type: 'layout-shift', buffered: true });

      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.__p17.inp = Math.max(window.__p17.inp || 0, entry.duration || 0);
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    } catch {}
  });

  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(2000);
  const metrics = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource');
    const js = resources.filter(r => r.name.includes('/_next/') && r.name.endsWith('.js'));
    const images = resources.filter(r => r.initiatorType === 'img');
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      jsRequests: js.length,
      jsTransferBytes: js.reduce((sum, r) => sum + (r.transferSize || 0), 0),
      imageRequests: images.length,
      totalTransferBytes: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
      ttfbMs: nav?.responseStart ?? null,
      domContentLoadedMs: nav?.domContentLoadedEventEnd ?? null,
      lcpMs: window.__p17?.lcp ?? null,
      cls: window.__p17?.cls ?? null,
      inpMs: window.__p17?.inp ?? null,
    };
  });
  const result = { viewport: viewport.name, path, ...metrics, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length };
  await page.close();
  if (consoleErrors.length || pageErrors.length) {
    throw new Error(`Runtime errors on ${viewport.name} ${path}: ${JSON.stringify({ consoleErrors, pageErrors })}`);
  }
  return result;
}

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const results = [];
  try {
    for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
      for (const path of routes) results.push(await measureRoute(browser, viewport, path));
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify({ base, propertyPath: process.env.PROPERTY_PATH || null, results }, null, 2));
})().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
