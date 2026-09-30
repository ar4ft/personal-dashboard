import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateFeed } from "../src/lib/workspace.mjs";
test("The committed automation feed is valid before it is published", () => {
  const file = readFileSync(new URL("../public/feed.json", import.meta.url));
  assert.ok(file.length <= 10 * 1024 * 1024, "Feed must be at most 10 MB");
  validateFeed(JSON.parse(file));
});
