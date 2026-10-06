const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const output =
    process.env.DESIGN_REVIEW_OUT || "design/app-designer/shots/r1";
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.DASHBOARD_BROWSER_EXECUTABLE || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const root =
    process.env.DASHBOARD_TEST_URL ||
    "http://localhost:4322/personal-dashboard/";
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 3,
    colorScheme: "light",
  });
  const page = await context.newPage();
  const files = [];
  async function shot(name) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, name + ".png") });
    files.push(name + ".png");
  }
  await page.goto(root);
  await shot("home");
  await page.goto(root + "news/");
  await shot("news");
  await page.locator(".toolbar-manage summary").click();
  await shot("manage");
  await page.locator(".toolbar-manage summary").click();
  await page.locator(".item-title").first().click();
  await shot("detail");
  await page.getByRole("button", { name: "Close details" }).click();
  await page.locator("#news-swipe-launch").click();
  await shot("swipe");
  await page.locator(".news-reel").first().locator(".reel-track").click();
  await shot("clip-feedback");
  await page.getByRole("button", { name: "Close swipe news" }).click();
  await page.goto(root + "ideas/");
  await page.locator("[data-view=board]").click();
  await shot("ideas-board");
  await page.goto(root + "planning/calendar/");
  await page.locator(".calendar-grid").scrollIntoViewIfNeeded();
  await shot("calendar");
  await page.goto(root + "news/");
  await page.locator("#workspace-search").fill("No story with this title");
  await shot("empty");
  await context.close();
  const dark = await browser.newContext({
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 3,
    colorScheme: "dark",
  });
  const dp = await dark.newPage();
  await dp.goto(root + "news/");
  await dp.evaluate(() => document.fonts.ready);
  await dp.screenshot({ path: path.join(output, "news-dark.png") });
  files.push("news-dark.png");
  await dp.getByRole("button", { name: "App", exact: true }).click();
  await dp.screenshot({ path: path.join(output, "appearance.png") });
  files.push("appearance.png");
  await dark.close();
  const desk = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
  });
  const ds = await desk.newPage();
  await ds.goto(root);
  await ds.evaluate(() => document.fonts.ready);
  await ds.screenshot({ path: path.join(output, "desktop.png") });
  files.push("desktop.png");
  await desk.close();
  const small = await browser.newContext({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 3,
  });
  const sm = await small.newPage();
  await sm.goto(root + "news/");
  await sm.evaluate(() => document.fonts.ready);
  await sm.screenshot({ path: path.join(output, "news-small.png") });
  files.push("news-small.png");
  await small.close();
  const sheet = await browser.newPage({
    viewport: { width: 1740, height: 1000 },
  });
  const html =
    "<style>body{margin:0;padding:24px;background:#dbe2df;display:grid;grid-template-columns:repeat(5,320px);gap:20px;font:16px system-ui}figure{margin:0}img{width:320px;display:block}figcaption{padding:8px}</style>" +
    files
      .filter((f) => f !== "desktop.png" && f !== "news-small.png")
      .map(
        (f) =>
          `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(output, f)).toString("base64")}"><figcaption>${f}</figcaption></figure>`,
      )
      .join("");
  await sheet.setContent(html);
  await sheet.screenshot({
    path: path.join(output, "sheet.png"),
    fullPage: true,
  });
  await browser.close();
  console.log(path.resolve(output));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
