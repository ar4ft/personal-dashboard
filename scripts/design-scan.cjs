// Run the app-designer DOM/pixel scan against the real PWA rather than a mockup.
// Clone fortvna/app-designer separately; its source is not vendored in this repo.
const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const skill =
    process.env.APP_DESIGNER_ROOT ||
    "/workspace/scratch/app-designer/app-designer";
  let source = fs.readFileSync(path.join(skill, "scripts/shoot.mjs"), "utf8");
  // Modern browser color-mix() resolves to color(srgb …), which the kit's
  // rgb()-only parser cannot read. Normalize those computed colors for the scan.
  source = source.replace(
    "const parse = (c) => {",
    `const parse = (c) => {
    if (c && c.startsWith("color(srgb ")) {
      const values = c.slice(11, -1).split(/[ /]+/).map(Number);
      return { r: values[0] * 255, g: values[1] * 255, b: values[2] * 255, a: values[3] ?? 1 };
    }`,
  );
  const start = source.indexOf("const report = await page.evaluate(() => {");
  const end = source.indexOf("const appSizes =", start);
  // Use the upstream checks with the color parser adaptation above.
  // OS chrome is outside this web app.
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runScan = new AsyncFunction(
    "page",
    source.slice(start, end) + "\nreturn report;",
  );
  const browser = await chromium.launch({
    executablePath:
      process.env.DASHBOARD_BROWSER_EXECUTABLE || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const root =
    process.env.DASHBOARD_TEST_URL ||
    "http://localhost:4322/personal-dashboard/";
  const reports = [];
  for (const width of [402, 375]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 402 ? 874 : 667 },
        colorScheme: theme,
      });
      const page = await context.newPage();
      for (const route of ["", "news/", "ideas/", "planning/calendar/"]) {
        await page.goto(root + route);
        await page.evaluate(() => document.fonts.ready);
        await page.addStyleTag({
          content: ":root { --screen-w:402px } body.screen { height:100vh; }",
        });
        await page.evaluate(
          ({ route, width, theme }) => {
            document.body.classList.add("screen");
            document.body.dataset.name = `${route || "home"}-${width}-${theme}`;
            document.body.dataset.chrome = "none";
            // These are actual scroll surfaces and floating navigation, not clipped content.
            document.querySelector("main")?.setAttribute("data-scrolls", "");
            document.querySelector(".tabs")?.setAttribute("data-scrolls", "");
            document.querySelector(".tabs")?.setAttribute("data-bleed", "");
            document
              .querySelector(".topbar")
              ?.setAttribute("data-float", "");
            document
              .querySelector(".mobile-bottom-nav")
              ?.setAttribute("data-float", "");
          },
          { route, width, theme },
        );
        const result = await runScan(page);
        reports.push(...result.map(({ pxJobs, chrome, ...report }) => report));
      }
      await context.close();
    }
  }
  await browser.close();
  const output = process.env.DESIGN_SCAN_OUT || "design/app-designer/scan.json";
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(reports, null, 2) + "\n");
  for (const report of reports)
    console.log(
      report.name,
      JSON.stringify({ fails: report.fails, warns: report.warns }),
    );
  if (reports.some((report) => report.fails.length)) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
