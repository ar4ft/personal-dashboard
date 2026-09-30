const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
fs.mkdirSync("test-output", { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.DASHBOARD_BROWSER_EXECUTABLE,
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const root =
    process.env.DASHBOARD_TEST_URL ||
    "http://localhost:4322/personal-dashboard-/";
  const card = (id) => page.locator(`.item-card[data-id="${id}"]`);
  const close = (dialog) => page.locator(`[data-close="${dialog}"]`).click();
  await page.goto(root + "news/");
  await page.waitForFunction(() =>
    document.querySelector("#feed-status").textContent.includes("refreshed"),
  );
  assert.equal(await page.locator(".item-card").count(), 4);
  await card("news:news:hn").locator(".item-title").click();
  await page.locator("#detail-title").waitFor();
  assert.match(
    await page.locator("#detail-body").textContent(),
    /no full article text/,
  );
  await close("detail-dialog");
  await card("news:news:hn").locator(".favorite-button").click();
  await page.locator("#favorites-filter").click();
  assert.equal(await page.locator(".item-card").count(), 1);
  await page.locator("#favorites-filter").click();
  await page.locator('[data-view="board"]').click();
  await card("news:news:hn").locator("select").selectOption("following");
  assert.equal(
    await page.locator('[data-column="following"] .item-card').count(),
    1,
  );
  // Pointer drag and drop, including reordering by dropping above another card.
  await card("news:news:x").dragTo(
    page.locator('[data-column="read"] .empty-column'),
  );
  assert.equal(
    await page.locator('[data-column="read"] .item-card').count(),
    1,
  );
  await card("news:news:github").dragTo(card("news:news:astro"), {
    targetPosition: { x: 70, y: 10 },
  });
  assert.equal(
    await page
      .locator('[data-column="inbox"] .item-card')
      .first()
      .getAttribute("data-id"),
    "news:news:github",
  );
  const titleBox = await card("news:news:hn")
    .locator(".item-title")
    .boundingBox();
  const inboxBox = await page
    .locator('[data-column="inbox"] .column-heading')
    .boundingBox();
  await page.mouse.move(titleBox.x + 25, titleBox.y + 12);
  await page.mouse.down();
  await page.mouse.move(inboxBox.x + 70, titleBox.y + 15, { steps: 20 });
  await page.mouse.up();
  assert.equal(
    await card("news:news:hn").locator("select").inputValue(),
    "inbox",
  );
  assert.equal(
    await page.locator("#detail-dialog").evaluate((n) => n.open),
    false,
    "Dragging a title must not open details",
  );
  await card("news:news:hn").locator("select").selectOption("following");
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector("#feed-status").textContent.includes("refreshed"),
  );
  assert.equal(
    await page.locator('[data-column="following"] .item-card').count(),
    1,
  );
  await page.locator("#manage-board").click();
  await page.locator("#column-form input").fill("Deep dives");
  await page.locator("#column-form button").click();
  assert.equal(
    await page.locator("#columns-list input").last().inputValue(),
    "Deep dives",
  );
  await close("columns-dialog");
  await page.locator("#new-item").click();
  await page.locator("#item-form [name=title]").fill("A new research story");
  await page.locator("#item-form [name=topics]").fill("Research, Technology");
  await page
    .locator("#item-form [name=content]")
    .fill("The complete text to search and read.");
  await page.locator("#item-form [name=url]").fill("https://example.com/story");
  await page.locator("#item-form [type=submit]").click();
  await page.locator("#workspace-search").fill("complete text");
  assert.equal(await page.locator(".item-card").count(), 1);
  await page.locator(".item-title").click();
  assert.equal(
    await page.locator(".detail-text").textContent(),
    "The complete text to search and read.",
  );
  await close("detail-dialog");
  await page.locator("#workspace-search").fill("");
  await page.locator("[data-view=feed]").click();
  await page.locator("#topic-filter").selectOption("Research");
  assert.equal(await page.locator(".item-card").count(), 1);
  await page.locator("#topic-filter").selectOption("");
  await page.locator("#group-filter").selectOption("topics");
  assert.ok((await page.locator(".group-heading").count()) > 1);
  await page.locator("#group-filter").selectOption("none");
  await page.locator("[data-view=timeline]").click();
  const cover = page.locator(".timeline-list img").first();
  await cover.waitFor();
  await cover.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const img = document.querySelector(".timeline-list img");
    return img && img.complete && img.naturalWidth > 0;
  });
  assert.ok((await page.locator(".post-identity").count()) > 0);

  assert.ok((await page.locator(".timeline-group").count()) > 0);
  await page.locator("[data-view=feed]").click();
  await page.locator("#swipe-toggle").click();
  await page
    .getByRole("button", { name: "Next →", exact: true })
    .first()
    .click();
  await page.waitForTimeout(400);
  assert.ok(
    (await page.locator(".swipe-feed").evaluate((n) => n.scrollLeft)) > 0,
  );
  // Import automation feeds; updates must not erase tracking or personal notes.
  const feed = {
    version: 1,
    items: [
      {
        id: "auto:hn:101",
        section: "news",
        title: "An automated story",
        description: "First summary",
        content: "Automation article text",
        topics: ["AI"],
        image: "media/technology.svg",
        imageAlt: "An illustrated technology cover",
        author: "@researcher",
        source: "Hacker News",
        createdAt: "2026-09-30T12:00:00Z",
      },
    ],
  };
  const upload = async (obj) =>
    page.locator("#feed-import").setInputFiles({
      name: "feed.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(obj)),
    });
  await page.locator("#data-settings").click();
  await upload(feed);
  await page.waitForFunction(() =>
    document
      .querySelector("#settings-status")
      .textContent.includes("Feed imported"),
  );
  await close("settings-dialog");
  await card("auto:hn:101").locator(".favorite-button").click();
  await card("auto:hn:101").locator("select").selectOption("following");
  await card("auto:hn:101")
    .getByRole("button", { name: "Edit An automated story", exact: true })
    .click();
  await page
    .locator("#item-form [name=content]")
    .fill("Personal research notes");
  await page.locator("#item-form [type=submit]").click();
  feed.items[0].title = "An updated automated story";
  feed.items[0].description = "Second summary";
  await page.locator("#data-settings").click();
  await upload(feed);
  await page.waitForFunction(() =>
    document
      .querySelector("#settings-status")
      .textContent.includes("Feed imported"),
  );
  await close("settings-dialog");
  await card("auto:hn:101").locator(".item-title").click();
  assert.equal(
    await page.locator("#detail-title").textContent(),
    "An updated automated story",
  );
  assert.equal(
    await page.locator(".detail-text").textContent(),
    "Personal research notes",
  );
  assert.match(
    await page.locator("#detail-body").textContent(),
    /Second summary/,
  );
  assert.equal(
    await page
      .locator("#detail-body .favorite-button")
      .getAttribute("aria-pressed"),
    "true",
  );
  await close("detail-dialog");
  await page.locator("#data-settings").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-backup").click();
  const download = await downloadPromise;
  const backup = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  assert.ok(backup.state.favorites.includes("auto:hn:101"));
  await close("settings-dialog");
  // Every other section has independently editable boards, feeds, timelines, and details.
  for (const section of ["ideas", "planning"]) {
    await page.goto(root + section + "/");
    await page.waitForFunction(() =>
      document.querySelector("#feed-status").textContent.includes("refreshed"),
    );
    await page.locator("[data-view=board]").click();
    assert.equal(
      await page.locator(".kanban-column").count(),
      section === "ideas" ? 4 : 3,
    );
    const first = page.locator(".item-card").first();
    await first
      .locator("select")
      .selectOption(section === "ideas" ? "build" : "done");
    assert.ok(
      (await page
        .locator(
          `[data-column="${section === "ideas" ? "build" : "done"}"] .item-card`,
        )
        .count()) > 0,
    );
    await page.locator("[data-view=timeline]").click();
    assert.ok((await page.locator(".timeline-group").count()) > 0);
    await page.locator("[data-view=feed]").click();
  }
  await page.locator("#new-item").click();
  await page.locator("#item-form [name=type]").selectOption("event");
  await page.locator("#item-form [name=title]").fill("My new meeting");
  const meetingDate = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    15,
  );
  await page
    .locator("#item-form [name=date]")
    .fill(
      `${meetingDate.getFullYear()}-${String(meetingDate.getMonth() + 1).padStart(2, "0")}-15`,
    );
  await page.locator("#item-form [name=time]").fill("12:30");
  await page.locator("#item-form [type=submit]").click();
  await page.locator("[data-view=calendar]").click();
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  assert.match(
    await page.locator(".calendar-events-list").textContent(),
    /My new meeting/,
  );
  // Restore an exported backup; newly created calendar item should disappear.
  await page.locator("#data-settings").click();
  page.once("dialog", (d) => d.accept());
  await page.locator("#backup-import").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector("#settings-status")
      .textContent.includes("Workspace restored"),
  );
  await close("settings-dialog");
  assert.equal(
    await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("personal-dashboard:workspace:v1"),
      ).custom.some((i) => i.title === "My new meeting"),
    ),
    false,
  );
  await page.goto(root);
  await page.waitForFunction(() =>
    document
      .querySelector(".news-list")
      .textContent.includes("An updated automated story"),
  );
  assert.match(
    await page.locator(".news-list").textContent(),
    /An updated automated story/,
  );
  await page.locator(".todo-list input").first().check();
  await page.goto(root + "planning/");
  await page.locator("[data-view=board]").click();
  assert.ok((await page.locator("[data-column=done] .item-card").count()) > 0);
  await page.goto(root + "news/?item=auto%3Ahn%3A101");
  await page.locator("#detail-title").waitFor();
  assert.equal(
    await page.locator("#detail-title").textContent(),
    "An updated automated story",
  );
  await close("detail-dialog");
  await page.locator("[data-view=board]").click();
  await page.screenshot({ path: "test-output/kanban.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("[data-view=feed]").click();
  await page.locator("#mobile-filters-toggle").click();
  await page.locator("#swipe-toggle").click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "No mobile document overflow",
  );
  await page.screenshot({
    path: "test-output/feed-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "Browser checks passed: all sections, pointer drag/drop and order, saved boards, custom columns, editing, full-text details, favorites, search/topics, timeline/swipe, feed merge preserving personal edits, backup restore, editable calendar, deep links, mobile overflow, no JS errors.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
