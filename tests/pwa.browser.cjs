const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({executablePath:process.env.DASHBOARD_BROWSER_EXECUTABLE, args:['--no-sandbox'], ...(process.env.DASHBOARD_TEST_PROXY ? {proxy:{server:process.env.DASHBOARD_TEST_PROXY, bypass:'localhost,127.0.0.1'}} : {})});
  const root = process.env.DASHBOARD_TEST_URL || 'http://localhost:4322/personal-dashboard/';
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(root);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  assert.equal(manifest.scope, new URL(root).pathname);
  assert.equal(manifest.start_url, manifest.scope);
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const size = Number(icon.sizes.split('x')[0]);
    const dimensions = await page.evaluate(async src => {const img = new Image();img.src=src;await img.decode();return [img.naturalWidth,img.naturalHeight];}, icon.src);
    assert.deepEqual(dimensions,[size,size]);
  }
  await page.getByRole('button',{name:'App',exact:true}).click();
  await page.waitForFunction(() => document.querySelector('#app-status').textContent.includes('Ready for offline'));
  await page.getByRole('button',{name:'Done',exact:true}).click();
  // Establish persisted workspace data, then navigate into sections never visited online.
  await page.goto(root+'news/');
  const favorite = page.locator('.favorite-button').first();
  await favorite.click();
  const saved = await page.evaluate(() => localStorage.getItem('personal-dashboard:workspace:v1'));
  assert.ok(saved);
  await context.setOffline(true);
  for (const section of ['ideas/','planning/','news/','news/?offline-test=1','']) {
    await page.goto(root+section);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    assert.ok(await page.locator('main').isVisible());
    assert.equal(await page.evaluate(() => localStorage.getItem('personal-dashboard:workspace:v1')),saved);
  }
  await page.goto(root+'news/');
  await page.locator('.favorite-button').first().click();
  const edited = await page.evaluate(() => localStorage.getItem('personal-dashboard:workspace:v1'));
  assert.notEqual(edited,saved);
  await page.reload();
  assert.equal(await page.evaluate(() => localStorage.getItem('personal-dashboard:workspace:v1')),edited);
  const images = page.locator('main img');
  assert.ok(await images.count());
  for (let i=0;i<await images.count();i++) assert.equal(await images.nth(i).evaluate(img=>img.complete && img.naturalWidth>0),true);
  assert.deepEqual(errors,[]);
  await context.close();
  // A controlled server produces a second build to exercise the waiting/update lifecycle.
  let newer = false;
  const base = manifest.scope;
  const server = http.createServer((req,res) => {
    let file = decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(base.length);
    if (!file || file.endsWith('/')) file += 'index.html';
    const target = path.resolve('dist',file);
    if (!target.startsWith(path.resolve('dist')+path.sep)) {res.writeHead(404).end();return;}
    try {
      let body=fs.readFileSync(target);
      if (file==='sw.js' && newer) body=Buffer.from(body.toString().replace(/const CACHE = ([^;]+);/, 'const CACHE = $1 + "-update-test";'));
      const ext=path.extname(file);
      res.setHeader('Content-Type', {'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'}[ext]||'text/plain');
      res.setHeader('Cache-Control','no-cache'); res.end(body);
    } catch {res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const updateRoot=`http://127.0.0.1:${server.address().port}${base}`;
  const updateContext=await browser.newContext();
  const updatePage=await updateContext.newPage();
  await updatePage.goto(updateRoot);
  await updatePage.evaluate(()=>navigator.serviceWorker.ready);
  await updatePage.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await updatePage.evaluate(()=>localStorage.setItem('pwa-test','preserve me'));
  const initial=await updatePage.evaluate(()=>caches.keys());
  newer=true;
  await updatePage.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  await updatePage.locator('#app-update').waitFor({state:'visible'});
  await Promise.all([updatePage.waitForEvent('load'),updatePage.getByRole('button',{name:'Update',exact:true}).click()]);
  await updatePage.waitForFunction(async()=>!(await navigator.serviceWorker.getRegistration()).waiting);
  assert.equal(await updatePage.evaluate(()=>localStorage.getItem('pwa-test')),'preserve me');
  const after=await updatePage.evaluate(()=>caches.keys());
  assert.ok(after.some(key=>key.endsWith('-update-test')));
  assert.ok(initial.filter(key=>!key.endsWith('feeds')).every(key=>!after.includes(key)));
  await updateContext.close();
  await new Promise(resolve=>server.close(resolve));
  await browser.close();
  console.log('PWA manifest/icons, offline sections/media/edits, and update activation passed.');
})().catch(error=>{console.error(error);process.exit(1);});
