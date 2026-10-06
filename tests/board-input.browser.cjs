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
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(root + "news/");
  await page.waitForFunction(() =>
    document.querySelector("#feed-status").textContent.includes("refreshed"),
  );
  await page.locator("[data-view=timeline]").click();
  await page.locator(".timeline-list img").first().scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => document.querySelector(".timeline-list img")?.naturalWidth > 0,
  );
  assert.ok(await page.locator(".post-identity").count());
  assert.ok(await page.locator(".post-source").count());
  for (const path of [
    "technology",
    "people",
    "web",
    "opensource",
    "ideas",
    "planning",
  ])
    assert.equal(
      await page.evaluate(
        async (src) => {
          const image = new Image();
          image.src = src;
          try {
            await image.decode();
            return image.naturalWidth > 0;
          } catch {
            return false;
          }
        },
        root + "media/" + path + ".svg",
      ),
      true,
      `Cover decodes: ${path}`,
    );
  fs.mkdirSync("test-output", { recursive: true });
  await page.screenshot({
    path: "test-output/social-timeline.png",
    fullPage: true,
  });
  await page.locator("[data-view=board]").click();
  const item = page.locator('[data-id="news:news:hn"]'),
    title = item.locator(".item-title");
  await title.click();
  assert.equal(
    await page.locator("#detail-dialog").evaluate((n) => n.open),
    true,
    "A normal title click still opens details",
  );
  await page.locator("[data-close=detail-dialog]").click();
  await title.scrollIntoViewIfNeeded();
  const start = await title.boundingBox(),
    end = await page.locator("[data-column=following]").boundingBox();
  await page.mouse.move(start.x + 30, start.y + 10);
  await page.mouse.down();
  await page.mouse.move(end.x + 75, start.y + 15, { steps: 25 });
  await page.mouse.up();
  assert.equal(
    await page
      .locator('[data-column=following] [data-id="news:news:hn"]')
      .count(),
    1,
    "Mouse drag from the title moves the card",
  );
  assert.equal(
    await page.locator("#detail-dialog").evaluate((n) => n.open),
    false,
    "Dragging must not open the detail dialog",
  );
  await page.reload();
  await page
    .locator('[data-column=following] [data-id="news:news:hn"]')
    .waitFor();
  const handle = page.locator('[data-id="news:news:hn"] .drag-handle');
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.locator('[data-column=read] [data-id="news:news:hn"]').count(),
    1,
    "Keyboard handle moves to adjacent column",
  );
  const cancelTitle = page.locator('[data-id="news:news:hn"] .item-title');
  const cancel = await cancelTitle.boundingBox();
  await page.mouse.move(cancel.x + 15, cancel.y + 10);
  await page.mouse.down();
  await page.mouse.move(cancel.x + 55, cancel.y + 55, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(
    await page.locator('[data-column=read] [data-id="news:news:hn"]').count(),
    1,
    "Escape cancels a drag",
  );
  assert.equal(
    await page.locator("#detail-dialog").evaluate((n) => n.open),
    false,
    "Cancelling a drag must not open details",
  );
  // Real Chromium touch input, not synthetic HTML drag events.
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const touch = await mobile.newPage();
  touch.on("pageerror", (e) => errors.push(e.message));
  await touch.goto(root + "news/");
  await touch.waitForFunction(() =>
    document.querySelector("#feed-status").textContent.includes("refreshed"),
  );
  await touch.locator("[data-view=board]").click();
  await touch.locator(".kanban-board").scrollIntoViewIfNeeded();
  await touch
    .locator('[data-id="news:news:astro"] .drag-handle')
    .scrollIntoViewIfNeeded();
  const touchHandle = await touch
    .locator('[data-id="news:news:astro"] .drag-handle')
    .boundingBox();
  const client = await mobile.newCDPSession(touch);
  const x = touchHandle.x + touchHandle.width / 2,
    y = touchHandle.y + touchHandle.height / 2;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + 15, y: y + 15, id: 1 }],
  });
  // Hold at the right edge so the board scrolls to the next lane.
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 365, y: y + 25, id: 1 }],
  });
  await touch.waitForTimeout(700);
  const lane = await touch.locator("[data-column=following]").boundingBox();
  const dropX = Math.min(350, Math.max(40, lane.x + 80)),
    dropY = Math.max(40, Math.min(760, lane.y + 90));
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: dropX, y: dropY, id: 1 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.equal(
    await touch
      .locator('[data-column=following] [data-id="news:news:astro"]')
      .count(),
    1,
    "Touch handle drags across columns with edge scrolling",
  );
  await touch.reload();
  await touch
    .locator('[data-column=following] [data-id="news:news:astro"]')
    .waitFor();
  await touch.locator("[data-view=timeline]").click();
  await touch.locator(".timeline-list img").first().scrollIntoViewIfNeeded();
  await touch.waitForFunction(
    () => document.querySelector(".timeline-list img")?.naturalWidth > 0,
  );
  await touch.screenshot({
    path: "test-output/social-timeline-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await touch.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "Regression checks passed: title click, title drag, persistence, keyboard movement, cancellation, real touch drag and edge scrolling, social images/source links, mobile layout.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
