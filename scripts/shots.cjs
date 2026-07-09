const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, headless: true });
  const B = process.env.BASE || 'https://diaocthanhphat.vercel.app';
  const shots = [
    { path: '/', name: 'home-desktop', w: 1440, h: 900 },
    { path: '/', name: 'home-mobile', w: 390, h: 844 },
    { path: '/mua-ban', name: 'listing-desktop', w: 1440, h: 900 },
    { path: '/mua-ban', name: 'listing-mobile', w: 390, h: 844 },
    { path: '/bat-dong-san/97733cf2-da31-447c-844e-756942c945d7', name: 'detail-desktop', w: 1440, h: 900 },
    { path: '/bat-dong-san/97733cf2-da31-447c-844e-756942c945d7', name: 'detail-mobile', w: 390, h: 844 },
  ];
  for (const s of shots) {
    const page = await browser.newContext({ viewport: { width: s.w, height: s.h } }).then(c => c.newPage());
    try {
      await page.goto(B + s.path, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `/tmp/shot-${s.name}.png`, fullPage: false });
      console.log('OK', s.name);
    } catch (e) { console.log('ERR', s.name, e.message.split('\n')[0]); }
    await page.close();
  }
  await browser.close();
})();
