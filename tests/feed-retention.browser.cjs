const { showView } = require('./browser-views.cjs');
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.DASHBOARD_BROWSER_EXECUTABLE,
    args: ['--no-sandbox'],
    ...(process.env.DASHBOARD_TEST_PROXY ? { proxy: { server: process.env.DASHBOARD_TEST_PROXY, bypass: 'localhost,127.0.0.1' } } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const root = process.env.DASHBOARD_TEST_URL || 'http://localhost:4322/personal-dashboard/';
  const feed = { version: 1, items: Array.from({ length: 701 }, (_, index) => ({
    id: `retention:${index}`, section: 'news', title: `Retained story number ${index}`,
    source: 'Hacker News', topics: ['Retention'],
    createdAt: new Date(Date.UTC(2024, 0, 1) + index * 86400000).toISOString(),
  })) };
  await context.route(root + 'feed.json', route => route.fulfill({ json: feed }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(root + 'news/');
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem('personal-dashboard:workspace:v1'));
    return state?.cachedItems.length === 701;
  });
  await showView(page, 'feed');
  // The oldest story is outside a newest-600 window but remains searchable and editable.
  await page.locator('#workspace-search').fill('Retained story number 0');
  const oldest = page.locator('.item-card[data-id="retention:0"]');
  await oldest.locator('.favorite-button').click();
  await oldest.locator('select').selectOption('following');
  await oldest.locator('.item-title').click();
  assert.equal(await page.locator('#detail-title').innerText(), 'Retained story number 0');
  await page.locator('[data-close="detail-dialog"]').click();
  feed.items.push({ id: 'retention:new', section: 'news', title: 'New batch story', topics: ['Retention'] });
  await page.reload();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('personal-dashboard:workspace:v1'))?.cachedItems.length === 702);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-dashboard:workspace:v1')));
  assert.equal(state.cachedItems.length, 702);
  assert.ok(state.cachedItems.some(item => item.id === 'retention:0'));
  assert.ok(state.cachedItems.some(item => item.id === 'retention:700'));
  assert.ok(state.cachedItems.some(item => item.id === 'retention:new'));
  assert.ok(state.favorites.includes('retention:0'));
  assert.equal(state.edits['retention:0'].status, 'following');
  assert.deepEqual(errors, []);
  await context.close();
  await browser.close();
  console.log('Retention browser checks passed: 701-story feed, oldest-story search/details, a new batch, reload and persisted tracking without trimming.');
})().catch(error => { console.error(error); process.exit(1); });
