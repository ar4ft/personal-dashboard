const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  fs.mkdirSync("test-output", { recursive: true });
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
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
  });
  const fixture = [
    "## Background",
    "**Important** and *useful* with ~~old text~~.",
    "[Clickable source](https://example.com/article)",
    "[Jump to background](#background)",
    "- A list item\n- [x] Completed task",
    "> A useful quotation",
    "| Option | Status |\n| --- | --- |\n| Prototype | Ready |",
    '```js\nconsole.log("Hello");\n```',
    "![Test illustration](media/technology.svg)",
    "```mermaid\nflowchart LR\n  Idea --> Build --> Review\n```",
    "```mermaid\nsequenceDiagram\n  Reader->>Dashboard: Open details\n  Dashboard-->>Reader: Markdown\n```",
    "[Play the clip](media/markdown-demo.mp4)",
    "[YouTube demo](https://youtu.be/dQw4w9WgXcQ)",
    "[Vimeo demo](https://vimeo.com/76979871)",
    "```mermaid\nthis is not a diagram\n```",
    '```mermaid\n%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\n  A --> B\n```',
    "<script>window.__markdownXss=true</script>",
    '<img src=x onerror="window.__markdownXss=true">',
    '<iframe src="https://evil.example/frame"></iframe>',
    "[Bad link](javascript:alert(1))",
    "![Bad image](data:image/svg+xml;base64,PHN2Zz4=)",
    "An inline [video link](https://youtu.be/dQw4w9WgXcQ) stays a normal link.",
  ].join("\n\n");
  const item = (section) => ({
    id: `markdown:${section}`,
    section,
    type: section === "news" ? "news" : "idea",
    title: `Markdown ${section}`,
    description: "Rich notes with diagrams and videos.",
    content: fixture,
    topics: ["Testing"],
    status: section === "news" ? "inbox" : "explore",
    createdAt: "2099-01-01T00:00:00Z",
  });
  await context.route(root + "feed.json", (route) =>
    route.fulfill({
      json: { version: 1, items: [item("news"), item("ideas")] },
    }),
  );
  await context.route("https://www.youtube-nocookie.com/embed/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Test YouTube player</p>",
    }),
  );
  await context.route("https://player.vimeo.com/video/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Test Vimeo player</p>",
    }),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (req) => requests.push(req.url()));
  for (const section of ["news", "ideas"]) {
    await page.goto(root + section + "/?item=markdown%3A" + section);
    await page.locator("#detail-dialog[open]").waitFor();
    const body = page.locator(".markdown-content");
    await body
      .locator(".markdown-diagram[data-diagram-state=ready]")
      .nth(1)
      .waitFor();
    assert.equal(await body.locator("h2").first().innerText(), "Background");
    assert.equal(await body.locator("strong").first().innerText(), "Important");
    assert.equal(
      await body.locator("table tbody td").first().innerText(),
      "Prototype",
    );
    assert.equal(await body.locator("input[type=checkbox]").isDisabled(), true);
    assert.equal(
      await body
        .locator("a", { hasText: "Clickable source" })
        .getAttribute("href"),
      "https://example.com/article",
    );
    assert.equal(
      await body
        .locator("a", { hasText: "Clickable source" })
        .getAttribute("rel"),
      "noopener noreferrer",
    );
    await body.getByRole("link", { name: "Jump to background" }).click();
    assert.ok(page.url().includes("?item="));
    const image = body.locator("img");
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((img) => img.decode());
    assert.equal(
      await image.getAttribute("src"),
      new URL(root).pathname + "media/technology.svg",
    );
    await body.locator(".markdown-diagram[data-diagram-state=error]").nth(1).waitFor();
    assert.equal(
      await body.locator(".markdown-diagram[data-diagram-state=error]").count(),
      2,
    );
    assert.equal(
      await body
        .locator(".markdown-diagram[data-diagram-state=error] details[open]")
        .count(),
      2,
    );
    const video = body.locator("video");
    assert.equal(
      await video.getAttribute("src"),
      new URL(root).pathname + "media/markdown-demo.mp4",
    );
    assert.equal(
      await video.evaluate(
        (v) =>
          v.controls && v.playsInline && !v.autoplay && v.preload === "none",
      ),
      true,
    );
    await video.scrollIntoViewIfNeeded();
    await video.evaluate((v) => v.play());
    assert.ok(await video.evaluate((v) => v.readyState >= 2));
    await video.evaluate((v) => { if (v instanceof HTMLVideoElement) v.pause(); });
    assert.equal(
      await body.locator("iframe").count(),
      0,
      "Providers are not fetched before Play",
    );
    await body.getByRole("button", { name: "Play YouTube demo" }).click();
    const frame = body.locator("iframe");
    assert.ok(
      (await frame.getAttribute("src")).startsWith(
        "https://www.youtube-nocookie.com/embed/",
      ),
    );
    assert.equal(
      await frame.getAttribute("sandbox"),
      "allow-scripts allow-same-origin allow-presentation",
    );
    await body.getByRole("button", { name: "Play Vimeo demo" }).click();
    assert.equal(await body.locator("iframe").count(), 2);
    assert.equal(
      await body
        .locator('script,[onerror],a[href^="javascript:"],img[src^="data:"]')
        .count(),
      0,
    );
    assert.equal(await page.evaluate(() => window.__markdownXss), undefined);
    assert.equal(
      requests.some((url) => url.includes("evil.example")),
      false,
    );
    assert.equal(await body.locator("svg foreignObject").count(), 0);
    await page.screenshot({
      path: `test-output/markdown-${section}-phone.png`,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.locator("#detail-body .favorite-button").click();
    await body
      .locator(".markdown-diagram[data-diagram-state=ready]")
      .nth(1)
      .waitFor();
    // Editing stores the original Markdown rather than rendered HTML.
    await page
      .locator("#detail-body button")
      .filter({ hasText: /^Edit$/ })
      .click();
    assert.equal(
      await page.locator("#item-form [name=content]").inputValue(),
      fixture,
    );
    assert.equal(await page.locator("#markdown-help").isVisible(), true);
    await page.locator("#item-form [type=submit]").click();
  }
  assert.deepEqual(errors, []);
  await context.close();
  // A fresh PWA session renders Mermaid for the first time entirely offline.
  const offline = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const app = await offline.newPage();
  app.on("pageerror", (e) => errors.push(e.message));
  await app.goto(root);
  await app.evaluate(() => navigator.serviceWorker.ready);
  await app.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await app.evaluate((content) => {
    const key = "personal-dashboard:workspace:v1";
    const state = JSON.parse(localStorage.getItem(key));
    state.custom.push({
      id: "ideas:local:markdown-offline",
      section: "ideas",
      type: "idea",
      title: "Offline Markdown",
      content,
      description: "",
      topics: ["Testing"],
      status: "explore",
      createdAt: "2099-01-01T00:00:00Z",
      updatedAt: "2099-01-01T00:00:00Z",
      url: "",
      done: false,
    });
    localStorage.setItem(key, JSON.stringify(state));
  }, "## Offline notes\n\n![Offline image](media/technology.svg)\n\n```mermaid\nflowchart LR\n  Read --> Build\n```\n\n[Offline clip](media/markdown-demo.mp4)");
  await offline.setOffline(true);
  await app.goto(root + "ideas/?item=ideas%3Alocal%3Amarkdown-offline");
  await app.locator(".markdown-diagram[data-diagram-state=ready]").waitFor();
  await app.locator(".markdown-content img").evaluate((img) => img.decode());
  const range = await app.evaluate(async (base) => {
    const res = await fetch(base + "media/markdown-demo.mp4", {
      headers: { Range: "bytes=0-31" },
    });
    return {
      status: res.status,
      size: (await res.arrayBuffer()).byteLength,
      range: res.headers.get("Content-Range"),
    };
  }, new URL(root).pathname);
  assert.equal(range.status, 206);
  assert.equal(range.size, 32);
  assert.match(range.range, /^bytes 0-31\//);
  const size = Number(range.range.split("/")[1]);
  for (const [header, expectedStatus, expectedSize] of [
    ["bytes=-16", 206, 16],
    [`bytes=${size - 8}-`, 206, 8],
    [`bytes=${size}-`, 416, 0],
    ["bytes=32-0", 416, 0],
  ]) {
    const result = await app.evaluate(async ({ base, header }) => {
      const response = await fetch(base + "media/markdown-demo.mp4", { headers: { Range: header } });
      return { status: response.status, size: (await response.arrayBuffer()).byteLength };
    }, { base: new URL(root).pathname, header });
    assert.equal(result.status, expectedStatus);
    assert.equal(result.size, expectedSize);
  }
  await app.locator(".markdown-content video").click();
  await app.locator(".markdown-content video").evaluate((v) => v.play());
  assert.ok(
    await app
      .locator(".markdown-content video")
      .evaluate((v) => v.readyState >= 2),
  );
  await app.screenshot({ path: "test-output/markdown-offline-phone.png" });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "Markdown checks passed: News/Ideas text, links, tables, images, two Mermaid types, error fallback, actual video playback, gated provider embeds, XSS guards, editor source preservation and first-use offline diagrams/media/range playback.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
