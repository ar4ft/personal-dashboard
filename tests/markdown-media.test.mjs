import test from "node:test";
import assert from "node:assert/strict";
import { markdownLink, embeddedVideo } from "../src/lib/markdown-media.mjs";
const base = "/personal-dashboard/";
test("Markdown links keep repository paths and reject executable/traversal URLs", () => {
  assert.equal(markdownLink("media/notes.pdf", base), base + "media/notes.pdf");
  assert.equal(
    markdownLink("https://example.com/article?q=1", base),
    "https://example.com/article?q=1",
  );
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,<script>bad()</script>",
    "../secret.txt",
    "//evil.example/file",
    "file:///etc/passwd",
  ])
    assert.equal(markdownLink(url, base), "");
});
test("Video files use HTTPS or dashboard assets and retain query strings", () => {
  assert.deepEqual(embeddedVideo("media/demo.webm", base), {
    kind: "file",
    src: base + "media/demo.webm",
    href: base + "media/demo.webm",
  });
  assert.equal(
    embeddedVideo("https://example.com/demo.mp4?download=1#t=3", base).src,
    "https://example.com/demo.mp4?download=1#t=3",
  );
  for (const url of [
    "http://example.com/demo.mp4",
    "https://example.com/demo.txt",
    "data:video/mp4;base64,AA",
    "../../demo.mp4",
  ])
    assert.equal(embeddedVideo(url, base), null);
});
test("Provider embeds accept only recognized hosts/IDs and build their own player URL", () => {
  const id = "dQw4w9WgXcQ";
  for (const url of [
    `https://youtu.be/${id}?t=10`,
    `https://www.youtube.com/watch?v=${id}`,
    `https://m.youtube.com/shorts/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ])
    assert.equal(
      embeddedVideo(url, base).src,
      `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
    );
  assert.equal(
    embeddedVideo("https://vimeo.com/76979871", base).src,
    "https://player.vimeo.com/video/76979871?dnt=1",
  );
  for (const url of [
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://vimeo.com.evil.example/123456",
    "https://youtu.be/javascript:alert(1)",
    "https://www.youtube.com/watch?v=invalid",
    "https://example.com/embed/1234",
  ])
    assert.equal(embeddedVideo(url, base), null);
});
