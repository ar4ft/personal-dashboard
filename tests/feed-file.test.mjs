import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateFeed,
  seedItems,
  assertUniqueNewsSources,
} from "../src/lib/workspace.mjs";
test("The committed automation feed is valid before it is published", () => {
  const file = readFileSync(new URL("../public/feed.json", import.meta.url));
  assert.ok(file.length <= 10 * 1024 * 1024, "Feed must be at most 10 MB");
  const items = validateFeed(JSON.parse(file));
  const seed = seedItems(
    JSON.parse(
      readFileSync(new URL("../src/data/dashboard.json", import.meta.url)),
    ),
  );
  assertUniqueNewsSources([...seed, ...items]);
  for (const item of items) {
    if (item.image && !item.image.startsWith("https://"))
      assert.ok(
        readFileSync(new URL("../public/" + item.image, import.meta.url))
          .length > 0,
        `Local image exists: ${item.image}`,
      );
  }
});

test("Starter covers exist and agent guides stay synchronized", () => {
  const seed = JSON.parse(
    readFileSync(new URL("../src/data/dashboard.json", import.meta.url)),
  );
  for (const item of [
    ...seed.news,
    ...seed.ideas,
    ...seed.todos,
    ...seed.events,
  ])
    if (item.image && !item.image.startsWith("https://"))
      assert.ok(
        readFileSync(new URL("../public/" + item.image, import.meta.url))
          .length > 0,
      );
  assert.equal(
    readFileSync(new URL("../public/llms.txt", import.meta.url), "utf8"),
    readFileSync(new URL("../public/llm.txt", import.meta.url), "utf8"),
  );
  const policy = JSON.parse(
    readFileSync(new URL("../public/agent-policy.json", import.meta.url)),
  );
  assert.equal(policy.anonymousPublish, false);
  assert.equal(policy.writeEndpoint, null);
});
