import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import config from '../astro.config.mjs';

const base = `${config.base.replace(/\/$/, '')}/`;
const manifest = {
  id: base, name: 'Personal Dashboard', short_name: 'Dashboard',
  description: 'Your news, ideas, boards, tasks and calendar.',
  start_url: base, scope: base, display: 'standalone',
  background_color: '#126773', theme_color: '#126773',
  icons: [192, 512].map(size => ({src: `${base}icons/app-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any maskable'})),
  shortcuts: ['news', 'ideas', 'planning'].map((section, i) => ({name: ['News', 'Project ideas', 'Todos & calendar'][i], url: `${base}${section}/`}))
};
await writeFile('dist/manifest.webmanifest', JSON.stringify(manifest, null, 2));
async function files(dir, prefix = '') {
  const entries = await readdir(dir, {withFileTypes:true});
  const result = [];
  for (const entry of entries) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) result.push(...await files(join(dir, entry.name), `${path}/`));
    else result.push(path);
  }
  return result.sort();
}
const paths = (await files('dist')).filter(path => path !== 'sw.js');
const hash = createHash('sha256');
for (const path of paths) { hash.update(path); hash.update(await readFile(`dist/${path}`)); }
const version = hash.digest('hex').slice(0, 16);
const urls = paths.map(path => base + path.replace(/index\.html$/, ''));
const source = `// Generated from the complete static build. No user workspace data is stored here.
const BASE = ${JSON.stringify(base)};
const PREFIX = 'dashboard-' + encodeURIComponent(BASE) + '-';
const CACHE = PREFIX + ${JSON.stringify(version)};
const FEED_CACHE = PREFIX + 'feeds';
const ASSETS = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE && key !== FEED_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (url.pathname === BASE + 'sw.js') return;
  const key = url.origin + url.pathname;
  if (url.pathname === BASE + 'feed.json') {
    event.respondWith((async () => {
      const cache = await caches.open(FEED_CACHE);
      try {
        const response = await fetch(event.request);
        if (response.ok) { await cache.put(key, response.clone()); return response; }
        return (await cache.match(key)) || (await caches.open(CACHE)).match(key) || response;
      } catch {
        return (await cache.match(key)) || (await caches.open(CACHE)).match(key) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') {
      try { const response = await fetch(event.request); if (response.ok) return response; } catch {}
      return (await cache.match(key)) || new Response('This page is unavailable offline. Open a dashboard section.', {status:503, headers:{'Content-Type':'text/plain'}});
    }
    return (await cache.match(key)) || fetch(event.request);
  })());
});
`;
await writeFile('dist/sw.js', source);
console.log(`PWA: ${urls.length} offline assets, build ${version}, scope ${base}`);
