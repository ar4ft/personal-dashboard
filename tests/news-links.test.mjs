import test from "node:test";
import assert from "node:assert/strict";
import {
  newsSourceKey,
  duplicateNewsSource,
  assertUniqueNewsSources,
  validateFeed,
  validateBackup,
  emptyState,
  mergeFeed,
  materialize,
} from "../src/lib/workspace.mjs";
const news = (id, url, extra = {}) =>
  validateFeed({
    version: 1,
    items: [{ id, section: "news", title: id, url, ...extra }],
  })[0];
test("News link comparison removes trackers/fragments/slashes and normalizes query order without changing the source", () => {
  const a =
    "https://EXAMPLE.com:443/story/?b=2&utm_source=rss&a=1&fbclid=tracking#comments";
  assert.equal(
    newsSourceKey(a),
    newsSourceKey("https://example.com/story?a=1&b=2"),
  );
  assert.equal(news("first", a).url, new URL(a).href);
  assert.notEqual(
    newsSourceKey("https://news.ycombinator.com/item?id=1"),
    newsSourceKey("https://news.ycombinator.com/item?id=2"),
  );
  assert.notEqual(
    newsSourceKey("https://example.com/Story"),
    newsSourceKey("https://example.com/story"),
  );
  assert.equal(newsSourceKey(""), "");
});
test("Duplicate checks span news sources and columns but allow self-editing, other sections and linkless notes", () => {
  const existing = news("hn:1", "https://example.com/story", {
    source: "Hacker News",
    status: "archived",
  });
  const duplicate = news(
    "reading:1",
    "https://example.com/story/?utm_medium=reading",
    { source: "Reading" },
  );
  assert.equal(duplicateNewsSource(duplicate, [existing])?.id, existing.id);
  assert.equal(duplicateNewsSource(existing, [existing]), undefined);
  assert.equal(
    duplicateNewsSource({ ...duplicate, section: "ideas" }, [existing]),
    undefined,
  );
  assert.doesNotThrow(() =>
    assertUniqueNewsSources([news("note:1", ""), news("note:2", "")]),
  );
});
test("Feed validation rejects repeated news links atomically while allowing distinct articles and cross-section references", () => {
  const a = news("a", "https://example.com/story");
  const b = news("b", "https://example.com/story/#discussion");
  assert.throws(
    () => validateFeed({ version: 1, items: [a, b] }),
    /Duplicate news source URL/,
  );
  assert.doesNotThrow(() =>
    validateFeed({
      version: 1,
      items: [a, { ...b, section: "ideas", type: "idea" }],
    }),
  );
  assert.doesNotThrow(() =>
    validateFeed({
      version: 1,
      items: [
        news("a", "https://example.com/?id=1"),
        news("b", "https://example.com/?id=2"),
      ],
    }),
  );
});
test("Ingestion keeps an existing tracked story across changing feed IDs and still accepts same-ID updates", () => {
  const state = emptyState();
  const original = news("a", "https://example.com/story");
  mergeFeed(state, [original]);
  state.favorites.push("a");
  state.edits.a = { content: "My notes", status: "following" };
  mergeFeed(state, [
    news("other-source", "https://example.com/story/?utm_source=x"),
    news("new", "https://example.com/new"),
  ]);
  assert.deepEqual(
    state.cachedItems.map((i) => i.id),
    ["a", "new"],
  );
  mergeFeed(state, [
    news("a", "https://example.com/story#discussion", {
      title: "Updated title",
    }),
  ]);
  const kept = materialize([], state).find((i) => i.id === "a");
  assert.equal(kept.title, "Updated title");
  assert.equal(kept.content, "My notes");
  assert.equal(kept.status, "following");
  assert.equal(kept.favorite, true);
});
test("Ingestion checks starter/custom URLs, personal URL edits, deleted items, and conflicting update URLs", () => {
  const state = emptyState();
  const seed = [news("seed", "https://example.com/seed")];
  state.custom.push(news("local", "https://example.com/local"));
  state.edits.local = { url: "https://example.com/edited" };
  state.cachedItems.push(news("deleted", "https://example.com/deleted"));
  state.hidden.push("deleted");
  mergeFeed(
    state,
    [
      news("duplicate-seed", seed[0].url),
      news("duplicate-edit", "https://example.com/edited"),
      news("duplicate-deleted", "https://example.com/deleted"),
    ],
    seed,
  );
  assert.deepEqual(
    state.cachedItems.map((i) => i.id),
    ["deleted"],
  );
  mergeFeed(state, [news("new", "https://example.com/new")], seed);
  mergeFeed(state, [news("new", seed[0].url)], seed);
  assert.equal(
    state.cachedItems.find((i) => i.id === "new").url,
    "https://example.com/new",
  );
  // A personal URL edit must also prevent an incoming update from introducing a collision.
  state.edits.new = { url: "https://example.com/edited" };
  mergeFeed(
    state,
    [
      news("new", "https://example.com/another", {
        title: "Conflicting update",
      }),
    ],
    seed,
  );
  assert.equal(state.cachedItems.find((i) => i.id === "new").title, "new");
});
test("Older backups containing duplicate URLs stay readable and retain both sets of personal notes", () => {
  const state = emptyState();
  state.custom.push(
    news("a", "https://example.com/story"),
    news("b", "https://example.com/story#comments"),
  );
  state.edits.a = { content: "First notes" };
  state.edits.b = { content: "Second notes" };
  const restored = validateBackup({
    kind: "personal-dashboard-backup",
    version: 1,
    state,
  });
  assert.equal(restored.custom.length, 2);
  assert.equal(restored.edits.a.content, "First notes");
  assert.equal(restored.edits.b.content, "Second notes");
});
