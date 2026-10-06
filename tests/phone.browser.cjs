const { showView } = require("./browser-views.cjs");
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.DASHBOARD_BROWSER_EXECUTABLE,
    headless: true,
    args: ["--no-sandbox"],
    ...(process.env.DASHBOARD_TEST_PROXY
      ? { proxy: { server: process.env.DASHBOARD_TEST_PROXY } }
      : {}),
  });
  const root =
    process.env.DASHBOARD_TEST_URL ||
    "http://localhost:4322/personal-dashboard/";
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
  });
  await context.route(root + "feed.json", (route) =>
    route.fulfill({ json: { version: 1, items: [] } }),
  );
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "share", {
      value: async (data) => {
        window.__sharedStory = data;
      },
      configurable: true,
    }),
  );
  await page.goto(root + "news/");
  await page.waitForFunction(() =>
    document.querySelector("#feed-status").textContent.includes("refreshed"),
  );
  assert.equal(await page.locator(".sidebar").isVisible(), false);
  assert.equal(await page.locator(".mobile-bottom-nav").isVisible(), true);
  assert.equal(
    await page.locator(".mobile-bottom-nav [aria-current=page]").textContent(),
    "News",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator("#news-swipe-dialog").waitFor();
  const dialog = page.locator("#news-swipe-dialog");
  assert.equal(await dialog.isVisible(), true);
  const rect = await dialog.boundingBox();
  assert.ok(
    rect.height >= 740 && rect.width >= 380,
    "Phone swipe reader uses the viewport above section navigation",
  );
  assert.equal(
    await page.locator("#news-swipe-position").textContent(),
    "1 / 4",
  );
  await page.locator(".news-reel").first().locator(".reel-favorite").click();
  assert.equal(
    await page
      .locator(".news-reel")
      .first()
      .locator(".reel-favorite")
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.locator(".news-reel").first().locator(".reel-track").click();
  assert.equal(
    await page
      .locator(".news-reel")
      .first()
      .locator(".reel-column")
      .inputValue(),
    "following",
  );
  await page.locator(".news-reel").first().locator(".reel-share").click();
  const shared = await page.evaluate(() => window.__sharedStory);
  assert.ok(
    shared.url.includes("news/?item="),
    "Share links point to the news detail view",
  );
  fs.mkdirSync("test-output", { recursive: true });
  await page.screenshot({ path: "test-output/phone-news-swipe.png" });
  // Dispatch actual touch input to exercise native scrolling and snapping.
  const client = await context.newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 200, y: 650, id: 1 }],
  });
  for (let i = 1; i <= 10; i++)
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 200, y: 650 - i * 50, id: 1 }],
    });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#news-swipe-position").textContent !== "1 / 4",
  );
  await page.waitForTimeout(500);
  const position = await page.locator("#news-swipe-position").textContent();
  assert.ok(["2 / 4", "3 / 4", "4 / 4"].includes(position), position);
  // Keyboard and explicit buttons remain alternatives to touch gestures.
  await page.locator("#news-swipe-scroller").focus();
  await page.keyboard.press("Home");
  await page.waitForFunction(
    () =>
      document.querySelector("#news-swipe-position").textContent === "1 / 4",
  );
  await page.locator("#news-swipe-next").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#news-swipe-position").textContent === "2 / 4",
  );
  await page.locator(".news-reel").nth(1).locator(".reel-read").click();
  await page.locator("#detail-title").waitFor();
  assert.equal(
    await page.locator("#detail-dialog").evaluate((n) => n.open),
    true,
  );
  assert.equal(await dialog.isVisible(), true);
  await page.locator("[data-close=detail-dialog]").click();
  assert.equal(
    await page.locator("#news-swipe-position").textContent(),
    "2 / 4",
    "Reading and returning keeps the current swipe story",
  );
  await showView(page, "board");
  assert.ok(
    (await page.locator("[data-column=following] .item-card").count()) > 0,
    "Swipe tracking appears in Kanban",
  );
  await page.reload();
  assert.equal(await page.locator("#news-swipe-dialog").isVisible(), true);
  await showView(page, "board");
  await page.locator("[data-column=following] .item-card").waitFor();
  await page
    .locator(".mobile-bottom-nav a")
    .filter({ hasText: "Ideas" })
    .click();
  await page.locator("#interactive-workspace").waitFor();
  assert.equal(
    await page.locator(".mobile-bottom-nav [aria-current=page]").textContent(),
    "Ideas",
  );
  await page
    .locator(".mobile-bottom-nav a")
    .filter({ hasText: "Plan" })
    .click();
  await page.locator("#interactive-workspace").waitFor();
  await page.locator("[data-view=calendar]").click();
  assert.equal(await page.locator(".workspace-calendar").isVisible(), true);
  // Narrow phones must retain all navigation and readable forms without overflow.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(root + "news/");
  await page.locator("#news-swipe-dialog").waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  const narrow = await dialog.boundingBox();
  assert.ok(narrow.width <= 321);
  const readBox = await page
    .locator(".news-reel")
    .first()
    .locator(".reel-read")
    .boundingBox();
  assert.ok(
    readBox.y >= 70 && readBox.y + readBox.height <= 568,
    "Read button stays inside a small phone viewport",
  );
  await page.screenshot({ path: "test-output/phone-news-swipe-small.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(200);
  const landscape = await dialog.boundingBox();
  assert.ok(landscape.height <= 391);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await showView(page, "feed");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".social-post").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-output/phone-social-feed.png" });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "Phone checks passed: bottom navigation, portrait/narrow/landscape layouts, real vertical touch swipe, keyboard/buttons, favorites and board tracking persistence, read-and-return, calendar, no overflow or JavaScript errors.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
