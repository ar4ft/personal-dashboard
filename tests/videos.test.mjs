import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { parseVideoManifest, VIDEO_MANIFEST_MAX_BYTES } from '../src/lib/videos.mjs';

const raw = readFileSync(new URL('../public/videos.json', import.meta.url), 'utf8');
const manifest = JSON.parse(raw);

test('Video News manifest is valid and small', () => {
  assert.ok(raw.length < VIDEO_MANIFEST_MAX_BYTES);
  const videos = parseVideoManifest(manifest, '/personal-dashboard/');
  assert.equal(videos.length, manifest.videos.length);
  for (const v of videos) assert.match(v.src, /^\/personal-dashboard\/media\/videos\/[a-z0-9-]+\.mp4$|^https:\/\//);
});

test('Local video files exist and stay under 6 MB', () => {
  for (const v of manifest.videos) {
    for (const key of ['src', 'poster', 'captions']) {
      if (!v[key] || v[key].startsWith('https://')) continue;
      const file = new URL(`../public/${v[key]}`, import.meta.url);
      assert.ok(existsSync(file), `${v.id}: missing ${v[key]}`);
      if (key === 'src') assert.ok(statSync(file).size < 6_000_000, `${v.id}: MP4 too large`);
    }
  }
});

test('Video manifest rejects unsafe media and links', () => {
  const ok = { id: 'video:a', title: 'A', src: 'media/videos/a.mp4' };
  assert.equal(parseVideoManifest({ version: 1, videos: [ok] }, '/')[0].src, '/media/videos/a.mp4');
  for (const src of ['javascript:alert(1).mp4', '../secret.mp4', 'http://x.com/a.mp4', 'media/videos/a.html'])
    assert.throws(() => parseVideoManifest({ version: 1, videos: [{ ...ok, src }] }));
  assert.equal(parseVideoManifest({ version: 1, videos: [{ ...ok, url: 'javascript:alert(1)' }] })[0].url, '');
  assert.throws(() => parseVideoManifest({ version: 1, videos: [ok, ok] }));
  assert.throws(() => parseVideoManifest({ version: 2, videos: [] }));
});
