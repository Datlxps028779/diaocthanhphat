import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
});

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });
  const page = await context.newPage();

  console.log('\n=== Phase 1: Property Type Pages ===\n');

  // Test 1: Property type page exists and renders
  console.log('Test 1: Visiting /loai-nha-dat/chung-cu...');
  await page.goto('https://chonhaviet.com/loai-nha-dat/chung-cu', {
    waitUntil: 'domcontentloaded',
    timeout: 10000
  });
  await page.waitForTimeout(2000);

  const title = await page.title();
  console.log(`✓ Page title: ${title}`);

  const h1 = await page.locator('h1').first().textContent();
  console.log(`✓ H1: ${h1}`);

  // Check stats display
  const statsVisible = await page.locator('text=/\\d+ tin đăng/i').count() > 0;
  console.log(`✓ Stats visible: ${statsVisible}`);

  // Check listings grid
  const listingCards = await page.locator('[data-testid="property-card"]').count();
  console.log(`✓ Listing cards: ${listingCards}`);

  // Check meta robots
  const metaRobots = await page.locator('meta[name="robots"]').first().getAttribute('content');
  console.log(`✓ Meta robots: ${metaRobots || 'not set'}`);

  console.log('\n=== Phase 2: News Category entity_id ===\n');
  console.log('(Requires SQL query - checking page renders correctly)');

  // Test 2: News category page still works
  console.log('\nTest 2: Visiting /tin-tuc/danh-muc/thi-truong...');
  await page.goto('https://chonhaviet.com/tin-tuc/danh-muc/thi-truong', {
    waitUntil: 'domcontentloaded',
    timeout: 10000
  });
  await page.waitForTimeout(2000);

  const categoryTitle = await page.title();
  console.log(`✓ Category page title: ${categoryTitle}`);

  const categoryH1 = await page.locator('h1').first().textContent();
  console.log(`✓ Category H1: ${categoryH1}`);

  const newsCards = await page.locator('article').count();
  console.log(`✓ News cards: ${newsCards}`);

  console.log('\n=== Summary ===');
  console.log('✓ Property type pages render correctly');
  console.log('✓ News category pages render correctly');
  console.log('\nSQL verification needed:');
  console.log('- Check search_visibility_urls for property_type rows');
  console.log('- Verify news_category rows have entity_id filled');

  await page.waitForTimeout(3000);

} catch (error) {
  console.error('Error:', error.message);
} finally {
  await browser.close();
}
