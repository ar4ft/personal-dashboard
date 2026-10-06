const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { showView } = require("./browser-views.cjs");
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
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const feed = {
    version: 1,
    items: Array.from({ length: 50 }, (_, i) => ({
      id: `swipe-test:${i}`,
      section: "news",
      type: "news",
      title: `Reader story ${i}`,
      description:
        "A useful description with enough room to read it comfortably.",
      content: "Full story text to read in the detail view.",
      source: "Test source",
      author: "Reader author",
      topics: ["Testing"],
      status: "inbox",
      createdAt: "2026-10-06T18:00:00Z",
      updatedAt: "2026-10-06T18:00:00Z",
      ...(i === 1
        ? { image: "media/reader-test.svg", imageAlt: "Test illustration" }
        : i === 2
          ? {
              image: "media/missing-test.svg",
              imageAlt: "Missing illustration",
            }
          : {}),
    })),
  };
  await context.route(root + "feed.json", (route) =>
    route.fulfill({ json: feed }),
  );
  await context.route(root + "media/reader-test.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700"><rect width="500" height="700" fill="#126773"/><circle cx="250" cy="350" r="120" fill="#fbfcf5"/></svg>',
    }),
  );
  await context.route(root + "media/missing-test.svg", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "share", {
      value: async (data) => (window.__sharedStory = data),
      configurable: true,
    }),
  );
  await page.goto(root + "news/");
  await page.waitForFunction(
    () =>
      document.querySelector("#news-swipe-position").textContent === "1 / 54",
  );
  const active = () => page.locator(".news-reel:not([inert])");
  assert.equal(
    await active().locator(".reel-title").innerText(),
    "Reader story 0",
  );
  assert.equal(await active().locator(".reel-media").innerText(), "");
  assert.equal(await page.locator(".media-title, .media-caption").count(), 0);
  assert.equal(await page.locator(".sidebar").isVisible(), true);
  assert.equal(await page.locator(".mobile-bottom-nav").isVisible(), false);
  const pane = await page.locator("#news-swipe-dialog").boundingBox();
  assert.ok(
    pane.x > 244 && pane.width <= 640,
    "Desktop centers the reader beside left navigation",
  );
  assert.ok(
    await active()
      .locator(".reel-source-clipping")
      .evaluate((tag) => tag.getBoundingClientRect().top < 150),
    "Source tag moves up",
  );
  await active().locator(".reel-favorite").focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => document.activeElement.className),
    "reel-favorite",
  );
  assert.equal(
    await active().locator(".reel-favorite").getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#news-swipe-next").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#news-swipe-position").textContent === "2 / 54",
  );
  assert.ok(
    await active()
      .locator("img.reel-cover")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
  );
  await page.locator("#news-swipe-next").click();
  await active().locator(".media-fallback").waitFor();
  assert.equal(
    await active().locator(".reel-media").innerText(),
    "",
    "Failed images also keep a blank gradient",
  );
  await page
    .locator("#news-swipe-scroller")
    .evaluate((n) =>
      n.scrollTo({ top: 19 * n.clientHeight, behavior: "instant" }),
    );
  await page.waitForFunction(
    () =>
      document.querySelector("#news-swipe-position").textContent === "20 / 54",
  );
  assert.equal(
    await page.locator(".news-reel").count(),
    40,
    "Reader appends the next batch near the end",
  );
  await active().locator(".reel-read").click();
  assert.match(
    await page.locator("#detail-body").innerText(),
    /Full story text/,
  );
  await page.getByRole("button", { name: "Close details" }).click();
  assert.equal(
    await page.locator("#news-swipe-position").innerText(),
    "20 / 54",
  );
  await page.locator("#reader-controls-open").click();
  await page.locator("#workspace-search").fill("nothing matches");
  await page.getByRole("button", { name: "Close reader controls" }).click();
  assert.equal(await page.locator(".reels-empty").isVisible(), true);
  assert.equal(await page.locator(".sidebar").isVisible(), true);
  await page.locator("#reader-controls-open").click();
  await page.locator("#workspace-search").fill("");
  await page.locator("#topic-filter").selectOption("Testing");
  await page.getByRole("button", { name: "Close reader controls" }).click();
  assert.equal(
    await page.locator("#news-swipe-position").innerText(),
    "1 / 50",
  );
  await showView(page, "board");
  assert.equal(await page.locator(".item-card").count(), 50);
  await showView(page, "swipe");
  await page.locator(".sidebar a").filter({ hasText: "Project ideas" }).click();
  await page.locator("#news-swipe-dialog").waitFor();
  assert.equal(
    await page.locator("#news-swipe-title").innerText(),
    "Your ideas",
  );
  await active().locator(".reel-track").click();
  assert.equal(await active().locator(".reel-column").inputValue(), "build");
  await active().locator(".reel-share").click();
  assert.ok(
    (await page.evaluate(() => window.__sharedStory.url)).includes(
      "ideas/?item=",
    ),
  );
  await showView(page, "board");
  assert.ok(await page.locator("[data-column=build] .item-card").count());
  await showView(page, "swipe");
  fs.mkdirSync("test-output", { recursive: true });
  await page.screenshot({ path: "test-output/swipe-ideas-desktop.png" });
  for (const size of [
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(100);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "No horizontal overflow",
    );
    if (size.width <= 900) {
      assert.equal(await page.locator(".mobile-bottom-nav").isVisible(), true);
      const nav = await page.locator(".mobile-bottom-nav").boundingBox(),
        reader = await page.locator("#news-swipe-dialog").boundingBox();
      assert.ok(
        reader.y + reader.height <= nav.y,
        "Reader leaves space for section navigation",
      );
      await page.screenshot({
        path: `test-output/swipe-ideas-${size.width}.png`,
      });
    } else assert.equal(await page.locator(".sidebar").isVisible(), true);
  }
  // Live navigation remains clickable without dismissing a modal reader.
  await page
    .locator(".mobile-bottom-nav a")
    .filter({ hasText: "News" })
    .click();
  await page.locator("#news-swipe-title").waitFor();
  assert.equal(
    await page.locator("#news-swipe-title").innerText(),
    "Your news",
  );
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "Embedded reader checks passed: News/Ideas defaults, blank and failed-image covers, images, persistent navigation, stable focus/position, filters, batching, details, boards, sharing and desktop/tablet/phone layouts.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
