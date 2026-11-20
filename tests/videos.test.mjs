import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { VIDEO_CDN_SRC, parseVideoManifest, retainedVideos, itemHref, videoLinksByFeedId, VIDEO_MANIFEST_MAX_BYTES } from '../src/lib/videos.mjs';

const raw = readFileSync(new URL('../public/videos.json', import.meta.url), 'utf8');
const manifest = JSON.parse(raw);

test('Video News manifest is valid and small', () => {
  assert.ok(raw.length < VIDEO_MANIFEST_MAX_BYTES);
  const videos = parseVideoManifest(manifest, '/personal-dashboard/');
  assert.equal(videos.length, manifest.videos.length);
  const feed = JSON.parse(readFileSync(new URL('../public/feed.json', import.meta.url), 'utf8'));
  const ids = new Set(feed.items.map(i => i.id));
  for (const v of videos) assert.ok(ids.has(v.feedId) && v.url, `${v.id}: needs a feedId in feed.json and an article url`);
  for (const v of videos) assert.ok(/^\/personal-dashboard\/media\/videos\/[a-z0-9-]+\.mp4$/.test(v.src) || VIDEO_CDN_SRC.test(v.src), `${v.id}: bad src ${v.src}`);
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
  const ok = { id: 'video:a', feedId: 'hn:1', title: 'A', src: 'media/videos/a.mp4' };
  assert.equal(parseVideoManifest({ version: 1, videos: [ok] }, '/')[0].src, '/media/videos/a.mp4');
  const cdn = 'https://cdn.jsdelivr.net/gh/ar4ft/dashboard-videos@' + 'a'.repeat(40) + '/hn-1.mp4';
  assert.equal(parseVideoManifest({ version: 1, videos: [{ ...ok, src: cdn }] }, '/')[0].src, cdn);
  for (const src of ['javascript:alert(1).mp4', '../secret.mp4', 'http://x.com/a.mp4', 'media/videos/a.html',
    'https://evil.example/a.mp4', 'https://cdn.jsdelivr.net/gh/someone/else@' + 'a'.repeat(40) + '/a.mp4',
    'https://cdn.jsdelivr.net/gh/ar4ft/dashboard-videos@main/a.mp4'])
    assert.throws(() => parseVideoManifest({ version: 1, videos: [{ ...ok, src }] }));
  assert.equal(parseVideoManifest({ version: 1, videos: [{ ...ok, url: 'javascript:alert(1)' }] })[0].url, '');
  assert.throws(() => parseVideoManifest({ version: 1, videos: [ok, ok] }));
  assert.throws(() => parseVideoManifest({ version: 2, videos: [] }));
});

test('Retention keeps 60 days, and pinned videos forever', () => {
  const now = Date.parse('2026-12-31T00:00:00Z');
  const vids = [
    { id: 'video:new', createdAt: '2026-12-01T00:00:00Z' },
    { id: 'video:old', createdAt: '2026-10-01T00:00:00Z' },
    { id: 'video:old-pinned', createdAt: '2026-01-01T00:00:00Z', pinned: true },
  ];
  assert.deepEqual(retainedVideos(vids, 60, now).map(v => v.id), ['video:new', 'video:old-pinned']);
  assert.equal(parseVideoManifest({ version: 1, videos: [{ id: 'video:a', feedId: 'hn:1', title: 'A', src: 'media/videos/a.mp4', pinned: true }] })[0].pinned, true);
  assert.equal(parseVideoManifest({ version: 1, videos: [{ id: 'video:a', feedId: 'hn:1', title: 'A', src: 'media/videos/a.mp4', pinned: 'yes' }] })[0].pinned, false);
  assert.throws(() => parseVideoManifest({ version: 1, videos: [{ id: 'video:a', title: 'A', src: 'media/videos/a.mp4' }] }));
});

test('Videos link to their dashboard item and back', () => {
  assert.equal(itemHref('hn:50572503', '/personal-dashboard/'), '/personal-dashboard/news/?item=hn%3A50572503');
  assert.equal(itemHref('ideas:x', '/'), '/ideas/?item=ideas%3Ax');
  const links = videoLinksByFeedId([{ id: 'video:hn-1', feedId: 'hn:1' }], '/personal-dashboard/');
  assert.equal(links.get('hn:1'), '/personal-dashboard/videos/#video%3Ahn-1');
});
