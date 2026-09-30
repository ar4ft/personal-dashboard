import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  emptyState,
  seedItems,
  materialize,
  validateFeed,
  validateBackup,
  mergeFeed,
  moveItem,
  filterItems,
  sortItems,
  safeUrl,
  safeImageUrl,
} from "../src/lib/workspace.mjs";
const seed = seedItems(
  JSON.parse(
    readFileSync(new URL("../src/data/dashboard.json", import.meta.url)),
  ),
);
const feed = (changes = {}) => ({
  version: 1,
  items: [
    {
      id: "hn:100",
      section: "news",
      title: "Incoming story",
      topics: ["Technology", "Tools"],
      content: "A full article body",
      createdAt: "2026-09-30T09:00:00Z",
      ...changes,
    },
  ],
});
test("Stable IDs distinguish tasks and events and seed every section", () => {
  assert.equal(new Set(seed.map((i) => i.id)).size, seed.length);
  for (const section of ["news", "ideas", "planning"])
    assert.ok(seed.some((i) => i.section === section));
});
test("Repeated feed updates preserve favorites, personal notes, and board position while updating source fields", () => {
  const state = emptyState();
  mergeFeed(state, validateFeed(feed()));
  state.favorites.push("hn:100");
  state.edits["hn:100"] = { status: "following", content: "My notes" };
  mergeFeed(
    state,
    validateFeed(
      feed({ title: "Updated story", description: "Fresh summary" }),
    ),
  );
  const item = materialize(seed, state).find((i) => i.id === "hn:100");
  assert.equal(item.title, "Updated story");
  assert.equal(item.description, "Fresh summary");
  assert.equal(item.content, "My notes");
  assert.equal(item.status, "following");
  assert.equal(item.favorite, true);
  assert.equal(state.cachedItems.length, 1);
});
test("An empty or partial incoming batch retains tracked older stories", () => {
  const state = emptyState();
  mergeFeed(state, validateFeed(feed()));
  mergeFeed(state, []);
  assert.ok(materialize([], state).some((i) => i.id === "hn:100"));
});
test("Card movement changes columns and preserves order including filtered cards", () => {
  const state = emptyState();
  const news = seed.filter((i) => i.section === "news");
  state.order.news = news.map((i) => i.id);
  moveItem(state, news[2], "following", news[0].id);
  assert.equal(
    materialize(seed, state).find((i) => i.id === news[2].id).status,
    "following",
  );
  assert.equal(state.order.news[0], news[2].id);
  assert.equal(state.order.news.length, news.length);
  assert.throws(() => moveItem(state, news[0], "missing"), /Unknown/);
});
test("Task completion follows the Done lane and can be reversed", () => {
  const state = emptyState(),
    task = seed.find((i) => i.type === "task");
  moveItem(state, task, "done");
  assert.equal(
    materialize(seed, state).find((i) => i.id === task.id).done,
    true,
  );
  moveItem(state, task, "doing");
  assert.equal(
    materialize(seed, state).find((i) => i.id === task.id).done,
    false,
  );
});
test("Search includes full article content and topics; favorites and source filters combine", () => {
  const state = emptyState();
  mergeFeed(state, validateFeed(feed({ source: "Hacker News" })));
  state.favorites.push("hn:100");
  const items = materialize(seed, state);
  assert.equal(
    filterItems(
      items,
      {
        section: "news",
        query: "ARTICLE BODY",
        topic: "Tools",
        favorites: true,
        subsection: "Hacker News",
      },
      state,
    ).length,
    1,
  );
  assert.equal(
    filterItems(items, { section: "news", query: "unknown" }, state).length,
    0,
  );
});
test("Timeline uses scheduled date while feed uses publication date", () => {
  const state = emptyState();
  const items = validateFeed({
    version: 1,
    items: [
      {
        id: "a",
        section: "planning",
        title: "Earlier event",
        type: "event",
        date: "2026-10-01",
        createdAt: "2026-09-30T00:00:00Z",
      },
      {
        id: "b",
        section: "planning",
        title: "Later event",
        type: "event",
        date: "2026-10-10",
        createdAt: "2026-09-29T00:00:00Z",
      },
    ],
  });
  assert.equal(sortItems(items, state, "planning", "timeline")[0].id, "b");
  assert.equal(sortItems(items, state, "planning", "newest")[0].id, "a");
});
test("Malformed feeds and unsafe URLs are rejected before mutation", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.throws(
    () => validateFeed(feed({ url: "data:text/html,bad" })),
    /http/,
  );
  assert.throws(() => validateFeed(feed({ date: "2026-02-30" })), /valid/);
  assert.throws(() => validateFeed(feed({ topics: [42] })), /Topics/);
  assert.throws(() => validateFeed(feed({ id: "__proto__" })), /ID/);
  assert.throws(
    () =>
      validateFeed({ version: 1, items: [...feed().items, ...feed().items] }),
    /unique/,
  );
  assert.throws(
    () => validateFeed(feed({ createdAt: "not a date" })),
    /timestamp/,
  );
});
test("Backup round trip retains boards, edits, favorites, hidden IDs, custom items, and feed cache", () => {
  const state = emptyState();
  mergeFeed(state, validateFeed(feed()));
  state.columns.news.push({ id: "custom-column", title: "Deep dive" });
  state.favorites = ["hn:100"];
  state.edits["hn:100"] = { status: "custom-column", content: "A note" };
  state.hidden = [seed[0].id];
  state.custom = validateFeed(feed({ id: "local:1" }));
  state.order.news = ["hn:100"];
  state.views.news = "board";
  state.feedUrl = "https://example.com/feed.json";
  assert.deepEqual(
    validateBackup(
      JSON.parse(
        JSON.stringify({
          kind: "personal-dashboard-backup",
          version: 1,
          state,
        }),
      ),
    ),
    state,
  );
});
test("Invalid backup columns and executable edit URLs are rejected", () => {
  const state = emptyState();
  state.columns.news = [];
  assert.throws(
    () =>
      validateBackup({ kind: "personal-dashboard-backup", version: 1, state }),
    /columns/,
  );
  const other = emptyState();
  other.edits.bad = { url: "javascript:alert(1)" };
  assert.throws(
    () =>
      validateBackup({
        kind: "personal-dashboard-backup",
        version: 1,
        state: other,
      }),
    /URL/,
  );
});

test("Renaming a column preserves its existing subsection route", () => {
  const state = emptyState();
  state.columns.ideas.find((c) => c.id === "explore").title = "Research";
  assert.equal(
    filterItems(
      materialize(seed, state),
      { section: "ideas", subsection: "Explore" },
      state,
    ).length,
    1,
  );
});

test("Social media fields survive feed ingestion, personal edits and backup restore", () => {
  const state = emptyState();
  mergeFeed(
    state,
    validateFeed(
      feed({
        author: "@builder",
        image: "media/technology.svg",
        imageAlt: "Illustrated cover",
      }),
    ),
  );
  state.edits["hn:100"] = {
    image: "https://example.com/cover.jpg",
    imageAlt: "My chosen cover",
  };
  const restored = validateBackup({
    kind: "personal-dashboard-backup",
    version: 1,
    state,
  });
  const item = materialize([], restored)[0];
  assert.equal(item.author, "@builder");
  assert.equal(item.image, "https://example.com/cover.jpg");
  assert.equal(item.imageAlt, "My chosen cover");
  assert.equal(
    safeImageUrl("media/technology.svg", "/personal-dashboard-/"),
    "/personal-dashboard-/media/technology.svg",
  );
  for (const image of [
    "javascript:alert(1)",
    "data:image/svg+xml,bad",
    "http://example.com/pic.jpg",
    "//example.com/pic.jpg",
    "media/../private.svg",
  ])
    assert.equal(safeImageUrl(image), "");
  assert.throws(
    () => validateFeed(feed({ image: "javascript:alert(1)" })),
    /Images/,
  );
});
