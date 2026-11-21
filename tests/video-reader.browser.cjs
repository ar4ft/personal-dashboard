const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
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
  const videos = {
    version: 1,
    videos: [
      {
        id: "video:reader-one",
        feedId: "hn:reader-one",
        title: "First reader video",
        source: "Hacker News",
        topics: ["AI"],
        url: "https://example.com/one",
        src: "media/markdown-demo.mp4",
        poster: "media/technology.svg",
        captions: "media/test-captions.vtt",
        createdAt: "2026-11-20T18:00:00Z",
        pinned: false,
      },
      {
        id: "video:reader-two",
        feedId: "hn:reader-two",
        title: "Second reader video",
        source: "Hacker News",
        topics: ["Programming"],
        url: "https://example.com/two",
        src: "media/markdown-demo.mp4",
        poster: "media/web.svg",
        createdAt: "2026-11-20T17:00:00Z",
        pinned: true,
      },
      {
        id: "video:reader-three",
        feedId: "ideas:reader-three",
        title: "Third reader video",
        source: "Reading",
        topics: ["Math"],
        url: "https://example.com/three",
        src: "media/markdown-demo.mp4",
        createdAt: "2026-11-20T16:00:00Z",
      },
    ],
  };
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  await context.route(root + "videos.json", (route) =>
    route.fulfill({ json: videos }),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(root + "videos/");
  await page.locator(".video-card").first().waitFor();
  assert.equal(await page.locator(".video-card").count(), 3);
  assert.equal(await page.locator("#video-news-fullscreen").isVisible(), true);
  assert.equal(await page.locator("#news-swipe-dialog").isHidden(), true);
  assert.ok(
    (await page.locator("#video-news-fullscreen").boundingBox()).height >= 44,
    "Full screen control meets the 44px touch target",
  );

  await page.locator("#video-news-fullscreen").click();
  await page.locator("#news-swipe-dialog").waitFor();
  assert.equal(await page.locator("#news-swipe-dialog").isVisible(), true);
  assert.equal(
    await page.evaluate(() => document.body.classList.contains("news-swipe-open")),
    true,
  );
  assert.equal(
    await page.locator("#news-swipe-position").textContent(),
    "1 / 3",
  );
  const first = page.locator(".news-reel").first();
  assert.match(
    await first.locator(".reel-date").innerText(),
    /1 \/ 3/,
    "The counter sits in the bottom meta, next to the source and date",
  );
  assert.equal(await first.locator("video").count(), 1);
  assert.equal(await first.locator(".video-reel-link").count(), 0);
  assert.equal(await first.locator(".reel-topics").count(), 0);
  assert.equal(await first.locator(".reel-shade").count(), 0);
  assert.equal(await first.locator(".reel-source-clipping").count(), 0);
  assert.equal(
    await first.locator("a.reel-source").first().getAttribute("href"),
    "https://example.com/one",
  );
  assert.equal(
    await first.locator("a.reel-dash").getAttribute("href"),
    "/personal-dashboard/news/?item=hn%3Areader-one",
  );
  assert.ok(await first.locator(".reel-keep").isVisible());
  assert.equal(
    await page.locator("#news-swipe-dialog > .reels-navigation").isVisible(),
    true,
  );
  const titleSize = await first.locator(".reel-title").evaluate((n) =>
    parseFloat(getComputedStyle(n).fontSize),
  );
  assert.ok(titleSize >= 13 && titleSize <= 16, `Title should be ~14–15px, got ${titleSize}`);
  const videoFit = await first.locator("video").evaluate((n) => getComputedStyle(n).objectFit);
  assert.equal(videoFit, "contain");
  const preloads = await page.evaluate(() =>
    [...document.querySelectorAll("#news-swipe-scroller video")].map((v) => v.preload),
  );
  assert.equal(preloads[0] === "metadata" || preloads[0] === "auto", true);
  if (preloads.length > 2) assert.equal(preloads[2], "none");

  // The burned-in kinetic captions already show the narration, so the plain
  // subtitle track stays hidden until the viewer asks for it with the CC
  // button; the button toggles it on and back off.
  await page.waitForFunction(() => {
    const v = document.querySelector("#news-swipe-scroller video");
    return v && v.textTracks[0] && v.textTracks[0].mode === "hidden";
  });
  const ccButton = first.locator("button.reel-cc");
  assert.equal(await ccButton.count(), 1);
  assert.equal(await ccButton.innerText(), "CC");
  assert.equal(await ccButton.getAttribute("aria-pressed"), "false");
  await ccButton.click();
  await page.waitForFunction(() => {
    const v = document.querySelector("#news-swipe-scroller video");
    return v && v.textTracks[0] && v.textTracks[0].mode === "showing";
  });
  assert.equal(await ccButton.getAttribute("aria-pressed"), "true");
  await ccButton.click();
  await page.waitForFunction(() => {
    const v = document.querySelector("#news-swipe-scroller video");
    return v && v.textTracks[0] && v.textTracks[0].mode === "hidden";
  });
  assert.equal(await ccButton.getAttribute("aria-pressed"), "false");

  await page.locator("#news-swipe-scroller").focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(
    () =>
      document.querySelector("#news-swipe-position").textContent === "2 / 3",
  );
  assert.equal(
    await page.locator(".news-reel:not([inert]) .reel-title").innerText(),
    "Second reader video",
  );
  assert.equal(
    await page.locator(".news-reel:not([inert]) .reel-keep").getAttribute("aria-label"),
    "Kept forever: Second reader video",
  );

  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.querySelector("#news-swipe-dialog").hidden,
  );
  assert.equal(
    await page.evaluate(() => document.body.classList.contains("news-swipe-open")),
    false,
  );
  assert.equal(await page.locator("#video-news-feed").isVisible(), true);

  await page.locator(".video-card").nth(2).click();
  await page.locator("#news-swipe-dialog").waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector("#news-swipe-position").textContent === "3 / 3",
  );
  assert.equal(
    await page.locator(".news-reel:not([inert]) .reel-title").innerText(),
    "Third reader video",
  );
  await page.locator("#video-news-close").click();
  await page.waitForFunction(
    () => document.querySelector("#news-swipe-dialog").hidden,
  );

  await page.goto(root + "videos/#video%3Areader-two");
  await page.locator("#news-swipe-dialog").waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector("#news-swipe-position")?.textContent === "2 / 3",
  );

  fs.mkdirSync("test-output", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-output/video-reader-desktop.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "No horizontal overflow on a phone",
  );
  assert.equal(await page.locator(".mobile-bottom-nav").isVisible(), true);
  const nav = await page.locator(".mobile-bottom-nav").boundingBox();
  const reader = await page.locator("#news-swipe-dialog").boundingBox();
  assert.ok(
    reader.y + reader.height <= nav.y + 1,
    "Reader leaves space for section navigation",
  );
  assert.equal(
    await page.locator("#news-swipe-dialog > .reels-navigation").isVisible(),
    false,
    "Prev/next stay hidden on a phone; swipe is enough",
  );
  const action = page.locator(".news-reel:not([inert]) .reel-actions a, .news-reel:not([inert]) .reel-actions button").first();
  const actionBox = await action.boundingBox();
  assert.ok(
    actionBox && actionBox.height <= 42 && actionBox.width <= 42,
    `Action buttons should be ~40px, got ${actionBox && actionBox.width}x${actionBox && actionBox.height}`,
  );
  await page.screenshot({ path: "test-output/video-reader-mobile.png" });

  // News cards and swipe reels offer Watch video and play the clip inline.
  const news = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  await news.route(root + "videos.json", (route) =>
    route.fulfill({ json: videos }),
  );
  await news.route(root + "feed.json", (route) =>
    route.fulfill({
      json: {
        version: 1,
        items: [
          {
            id: "hn:reader-one",
            section: "news",
            type: "news",
            title: "First reader video",
            description: "A story with a matching video.",
            content: "Full story",
            source: "Hacker News",
            topics: ["AI"],
            status: "inbox",
            url: "https://example.com/one",
            createdAt: "2026-11-20T18:00:00Z",
            updatedAt: "2026-11-20T18:00:00Z",
          },
        ],
      },
    }),
  );
  const newsPage = await news.newPage();
  newsPage.setDefaultTimeout(15000);
  newsPage.on("pageerror", (e) => errors.push(e.message));
  await newsPage.goto(root + "news/");
  await newsPage.locator("#news-swipe-dialog").waitFor();
  await newsPage.waitForFunction(
    () => document.querySelector(".news-reel video.reel-inline-video"),
  );
  assert.equal(
    await newsPage.locator(".news-reel .reel-video").getAttribute("href"),
    "/personal-dashboard/videos/#video%3Areader-one",
  );
  await newsPage.waitForFunction(() => {
    const v = document.querySelector(".news-reel video.reel-inline-video");
    return v && v.textTracks[0] && v.textTracks[0].mode === "hidden";
  });
  const newsCc = newsPage.locator(".news-reel button.reel-cc");
  assert.equal(await newsCc.count(), 1);
  await newsCc.click();
  await newsPage.waitForFunction(() => {
    const v = document.querySelector(".news-reel video.reel-inline-video");
    return v && v.textTracks[0] && v.textTracks[0].mode === "showing";
  });
  await newsCc.click();
  await newsPage.waitForFunction(() => {
    const v = document.querySelector(".news-reel video.reel-inline-video");
    return v && v.textTracks[0] && v.textTracks[0].mode === "hidden";
  });
  await news.close();

  assert.deepEqual(errors, []);
  await context.close();
  await browser.close();
  console.log(
    "Video reader checks passed: full-screen button, card and hash entry, swipe keys, Esc, links, keep, lazy preload, phone layout, and inline news videos.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
