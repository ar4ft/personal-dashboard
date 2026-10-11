const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.DASHBOARD_BROWSER_EXECUTABLE,
    args: ['--no-sandbox'],
    ...(process.env.DASHBOARD_TEST_PROXY ? { proxy: { server: process.env.DASHBOARD_TEST_PROXY, bypass: 'localhost,127.0.0.1' } } : {}),
  });
  const root = process.env.DASHBOARD_TEST_URL || 'http://localhost:4322/personal-dashboard/';
  const errors = [];
  const cases = [
    { name: 'iPhone', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', expected: /Safari.*Share → Add to Home Screen.*Open as Web App/ },
    { name: 'iPad desktop mode', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', ipad: true, expected: /Safari.*Share → Add to Home Screen/ },
    { name: 'Android', ua: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/135.0.0.0 Mobile Safari/537.36', expected: /Chrome.*⋮.*Install app/ },
    { name: 'Installed iOS', standalone: true },
    { name: 'Standalone display mode', displayMode: true },
  ];
  for (const test of cases) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', ...(test.ua ? { userAgent: test.ua } : {}) });
    await context.addInitScript(({ ipad, standalone, displayMode }) => {
      if (ipad) { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); }
      if (standalone) Object.defineProperty(navigator, 'standalone', { get: () => true });
      if (displayMode) {
        const original = window.matchMedia.bind(window);
        window.matchMedia = query => { const result = original(query); if (query === '(display-mode: standalone)') Object.defineProperty(result, 'matches', { value: true }); return result; };
      }
    }, test);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(root);
    await page.getByRole('button', { name: 'App', exact: true }).click();
    if (test.expected) {
      assert.match(await page.locator('#app-help').innerText(), test.expected, test.name);
      assert.equal(await page.locator('#app-install').isVisible(), false);
    } else {
      assert.equal(await page.locator('#app-help').isVisible(), false);
      assert.equal(await page.locator('#app-title').innerText(), 'Your dashboard app');
      // Even a stray event must not offer installation inside an installed app.
      await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })));
      assert.equal(await page.locator('#app-install').isVisible(), false);
    }
    if (test.name === 'Android') {
      // Exercise the browser-event lifecycle without claiming to install an OS app.
      for (const outcome of ['dismissed', 'accepted', 'error']) {
        const prevented = await page.evaluate(outcome => {
          const event = new Event('beforeinstallprompt', { cancelable: true });
          Object.assign(event, { prompt: async () => { if (outcome === 'error') throw new Error('Unavailable prompt'); }, userChoice: Promise.resolve({ outcome }) });
          window.dispatchEvent(event);
          return event.defaultPrevented;
        }, outcome);
        assert.equal(prevented, true);
        await page.getByRole('button', { name: 'Install app', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('#app-install').disabled);
        assert.equal(await page.locator('#app-install').isVisible(), false);
        assert.match(await page.locator('#app-install-status').innerText(), outcome === 'dismissed' ? /dismissed/ : outcome === 'accepted' ? /confirmation/ : /could not open/);
      }
      await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
      assert.equal(await page.locator('#app-title').innerText(), 'Dashboard is installed');
      assert.match(await page.locator('#app-help').innerText(), /Dashboard icon/);
      await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })));
      assert.equal(await page.locator('#app-install').isVisible(), false);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await context.close();
  }
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('Installation UI passed: iPhone, iPad desktop mode, Android prompt acceptance/dismissal/error, standalone modes and installed state.');
})().catch(error => { console.error(error); process.exit(1); });
