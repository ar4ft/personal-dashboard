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
    "http://localhost:4322/personal-dashboard-/";
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(root + "news/");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.getByRole("button", { name: "App", exact: true }).click();
  await page.locator("[data-theme-mode=light]").click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.locator("#app-close").click();
  await page.goto(root + "ideas/");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.getByRole("button", { name: "App", exact: true }).click();
  await page.locator("[data-theme-mode=auto]").click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.locator("#app-close").click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  // Administrative controls remain available through the phone disclosure.
  await page.locator(".toolbar-manage summary").click();
  await page.locator("#manage-board").click();
  assert.equal(
    await page.locator("#columns-dialog").evaluate((n) => n.open),
    true,
  );
  await page.getByRole("button", { name: "Close columns editor" }).click();
  await page.locator(".toolbar-manage summary").click();
  await page.locator("#data-settings").click();
  assert.equal(
    await page.locator("#settings-dialog").evaluate((n) => n.open),
    true,
  );
  await page.getByRole("button", { name: "Close feeds and backup" }).click();
  await page.goto(root + "planning/calendar/");
  assert.equal(
    await page.locator(".tabs .active").evaluate((n) => {
      const r = n.getBoundingClientRect(),
        parent = n.parentElement.getBoundingClientRect();
      return r.left >= parent.left - 1 && r.right <= parent.right + 1;
    }),
    true,
  );
  await page.goto(root + "news/");
  await page.locator("#news-swipe-launch").click();
  await page.locator(".news-reel").first().locator(".reel-track").click();
  assert.match(
    await page.locator(".bookmark-feedback").innerText(),
    /Clipped to/,
  );
  assert.equal(
    await page.locator(".bookmark-feedback").evaluate((note) => {
      const r = note.getBoundingClientRect();
      return (
        r.left >= 16 &&
        r.right <= innerWidth - 16 &&
        [
          ...document.querySelectorAll(
            ".news-reel:not([inert]) .reel-read, .news-reel:not([inert]) .reel-source, .news-reel:not([inert]) .reel-column",
          ),
        ].every((n) => {
          const b = n.getBoundingClientRect();
          return (
            r.right <= b.left ||
            r.left >= b.right ||
            r.bottom <= b.top ||
            r.top >= b.bottom
          );
        })
      );
    }),
    true,
  );
  assert.equal(
    await page
      .locator(".bookmark-feedback")
      .evaluate((n) => getComputedStyle(n).animationName),
    "none",
  );
  assert.deepEqual(errors, []);
  await context.close();
  await browser.close();
  console.log(
    "Appearance checks passed: system/manual themes, persistence, phone management, selected tabs and unobstructed reduced-motion clipping feedback.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
