const { showView } = require("./browser-views.cjs");
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.DASHBOARD_BROWSER_EXECUTABLE,
    args: ["--no-sandbox"],
    ...(process.env.DASHBOARD_TEST_PROXY
      ? {
          proxy: {
            server: process.env.DASHBOARD_TEST_PROXY,
            bypass: "localhost,127.0.0.1",
          },
        }
      : {}),
  });
  const root =
    process.env.DASHBOARD_TEST_URL ||
    "http://localhost:4322/personal-dashboard/";
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(root + "news/");
  await showView(page, "feed");
  const first = page.locator(".item-card").first();
  await first.locator(".favorite-button").focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.classList.contains("favorite-button"),
    ),
    true,
  );
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-pressed"),
    ),
    "true",
  );
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-pressed"),
    ),
    "false",
  );
  await first.locator("select").focus();
  await first.locator("select").selectOption({ index: 1 });
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.focusKey),
    "column",
  );
  await first.locator(".item-title").click();
  await page.locator("#detail-body .favorite-button").focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.classList.contains("favorite-button"),
    ),
    true,
  );
  await page.getByRole("button", { name: "Close details" }).click();
  await page.locator("#workspace-search").fill("no match for this search");
  assert.ok(
    (await page.locator(".empty-workspace").innerText()).includes(
      "no match for this search",
    ),
  );
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "workspace-search",
  );
  assert.ok(await page.locator(".item-card").count());
  // Representative secondary text must meet WCAG AA against its opaque background.
  const contrast = await page.evaluate(() => {
    const rgb = (value) =>
      value
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
    const luminance = (color) =>
      rgb(color)
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    return [
      ".intro",
      "#save-status",
      ".item-summary",
      ".post-byline > span",
      ".post-source",
      ".topic-chip",
    ].map((selector) => {
      const node = document.querySelector(selector);
      let current = node,
        background = "rgb(255, 255, 255)";
      while (current) {
        const value = getComputedStyle(current).backgroundColor;
        if (value !== "rgba(0, 0, 0, 0)" && value !== "transparent") {
          background = value;
          break;
        }
        current = current.parentElement;
      }
      const a = luminance(getComputedStyle(node).color),
        b = luminance(background);
      return {
        selector,
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
  });
  for (const { selector, ratio } of contrast)
    assert.ok(ratio >= 4.5, `${selector} contrast ${ratio}`);
  assert.equal(
    requests.some((url) => /fonts\.(googleapis|gstatic)\.com/.test(url)),
    false,
  );
  await page
    .getByRole("button", { name: "Sideways cards", exact: true })
    .click();
  await page.evaluate(() => {
    const original = HTMLElement.prototype.scrollBy;
    window.__scrollBehaviors = [];
    HTMLElement.prototype.scrollBy = function (options) {
      window.__scrollBehaviors.push(options.behavior);
      return original.call(this, options);
    };
  });
  await page.getByRole("button", { name: "Next →", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.__scrollBehaviors), [
    "instant",
  ]);
  assert.equal(
    await page
      .locator(".swipe-feed")
      .evaluate((node) => getComputedStyle(node).scrollBehavior),
    "auto",
  );
  await showView(page, "swipe");
  const readerTargets = await page
    .locator(
      "#news-swipe-dialog button:visible, .news-reel:not([inert]) a, .news-reel:not([inert]) select",
    )
    .evaluateAll((nodes) =>
      nodes
        .map((node) => ({
          label: node.getAttribute("aria-label") || node.textContent,
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        }))
        .filter((node) => node.width < 43.5 || node.height < 43.5),
    );
  assert.deepEqual(readerTargets, []);
  await showView(page, "feed");
  // An imported feed exercises the existing batching and keyboard continuation.
  const feed = {
    version: 1,
    items: Array.from({ length: 65 }, (_, i) => ({
      id: `accessibility:${i}`,
      section: "news",
      type: "news",
      title: `Accessible story ${i}`,
      description: "A useful description.",
      content: "Article text.",
      topics: ["Testing"],
      source: "Testing",
      status: "inbox",
      createdAt: "2026-10-04T00:00:00Z",
      updatedAt: "2026-10-04T00:00:00Z",
    })),
  };
  await page
    .getByRole("button", { name: "Sideways cards", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Feeds & backup", exact: true })
    .click();
  await page.locator("#feed-import").setInputFiles({
    name: "feed.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(feed)),
  });
  await page.getByRole("button", { name: "Close feeds and backup" }).click();
  await page.locator("#workspace-search").fill("Accessible story");
  assert.equal(await page.locator(".item-card").count(), 30);
  await page.locator(".load-more").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(".item-card").count(), 60);
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.classList.contains("item-title"),
    ),
    true,
  );
  await page.locator("#workspace-search").fill("Accessible story 64");
  assert.equal(await page.locator(".item-card").count(), 1);
  await context.close();
  const phone = await browser.newContext({
    viewport: { width: 320, height: 720 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const mobile = await phone.newPage();
  for (const route of ["news/", "planning/calendar/", ""]) {
    await mobile.goto(root + route);
    if (route === "news/") {
      await showView(mobile, "feed");
      const touch = await mobile
        .locator("button:visible, .tabs a")
        .evaluateAll((nodes) =>
          nodes
            .map((n) => ({
              name: n.getAttribute("aria-label") || n.textContent,
              width: n.getBoundingClientRect().width,
              height: n.getBoundingClientRect().height,
            }))
            .filter((n) => n.width < 43.5 || n.height < 43.5),
        );
      assert.deepEqual(touch, []);
    }
    await mobile.evaluate(
      () => (document.documentElement.style.fontSize = "32px"),
    );
    assert.ok(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Text resizing causes overflow on ${route}`,
    );
    if (route === "news/") {
      assert.equal(
        await mobile
          .locator(".item-summary")
          .first()
          .evaluate((n) => getComputedStyle(n).fontSize),
        "32px",
      );
      await mobile
        .getByRole("button", { name: "Filters", exact: true })
        .click();
      assert.ok(await mobile.locator("#topic-filter").isVisible());
    }
    if (route === "planning/calendar/") {
      const targets = await mobile
        .locator(".calendar-grid button")
        .evaluateAll((nodes) =>
          nodes.every(
            (n) =>
              n.getBoundingClientRect().width >= 43.5 &&
              n.getBoundingClientRect().height >= 43.5,
          ),
        );
      assert.equal(targets, true);
    }
  }
  assert.deepEqual(errors, []);
  await phone.close();
  await browser.close();
  console.log(
    "Accessibility checks passed: contrast, touch targets, large text, focus continuity, reduced motion, batching/search and offline fonts.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
