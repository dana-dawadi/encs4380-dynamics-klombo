import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const prefix = '/encs4380-dynamics-klombo/';
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
    const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
    const path = resolve(root, relative);
    if (!path.startsWith(resolve(root) + '/') && !path.startsWith(resolve(root) + '\\')) throw Error('Invalid path');
    const content = await readFile(path);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[extname(path)] || 'application/octet-stream');
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
const passed = [];
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const base = `http://127.0.0.1:${server.address().port}${prefix}`;
  await page.goto(base);
  const c = n => page.locator(`[data-control="${n}"]`), v = n => page.locator(`[data-view="${n}"]`), k = n => page.locator(`[data-calc="${n}"]`);
  const set = async (n, value) => { await c(n).evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, value); };
  const check = async (name, f) => { await f(); passed.push(name); console.log(`PASS ${name}`); };

  await check('Navigation switches from Module 1 to Module 2 and cleans up', async () => {
    await page.waitForSelector('.module-one');
    await page.locator('[data-route="module2"]').click();
    await page.waitForSelector('.module-two [data-view="sine-chart"] svg');
    assert.equal(await page.locator('.module-one').count(), 0);
    assert.equal(await page.locator('[data-route="module2"]').getAttribute('aria-current'), 'page');
    assert.match(await page.title(), /frequency response/);
  });
  await check('Direct #module2 link opens Module 2', async () => {
    await page.goto(`${base}#module2`); await page.waitForSelector('.module-two svg');
  });
  await check('All four lecture checks pass on the page', async () => {
    const text = await v('validation').textContent();
    assert.equal(text.match(/PASS/g).length, 4);
    for (const s of [/0\.9285/, /21\.801°/, /0\.5231 ms/, /9\.333°/]) assert.match(text, s);
  });
  await check('Lecture preset shows M = 0.928 and a 21.8° lag', async () => {
    await page.locator('[data-preset="lecture"]').click();
    const m = await v('metrics').textContent();
    assert.match(m, /0\.928/); assert.match(m, /21\.8°/);
    assert.match(await v('formula').textContent(), /sin\(2t/);
  });
  await check('Design preset gives -5% dynamic error at 100 Hz', async () => {
    await page.locator('[data-preset="design"]').click();
    const m = await v('metrics').textContent();
    assert.match(m, /0\.950/); assert.match(m, /-5\.00%/);
  });
  await check('Sliders redraw immediately and the cutoff follows tau', async () => {
    await set('tau', 0); await set('f', 0);
    assert.match(await v('cutoff').textContent(), /1\/τ = 1 rad\/s/);
    assert.match(await v('metrics').textContent(), /0\.157/);
    await set('tau', -1);
    assert.match(await v('cutoff').textContent(), /= 10 rad\/s/);
  });
  await check('Calculator reproduces the 100 Hz / 5% design and loads it', async () => {
    await page.locator('[data-action="reset"]').click();
    const out = await v('calc-out').textContent();
    assert.match(out, /0\.523 ms/); assert.match(out, /9\.3°/);
    await k('err').fill('1'); assert.match(await v('calc-steps').textContent(), /0\.99/);
    await k('err').fill('0'); assert.ok(await page.locator('[data-action="load-calc"]').isDisabled());
    await k('err').fill('5');
    await page.locator('[data-action="load-calc"]').click();
    assert.match(await v('metrics').textContent(), /0\.950/);
  });
  await check('Calculator refuses to load results outside the slider ranges', async () => {
    await page.locator('[data-action="reset"]').click();
    await k('fmax').fill('1000');
    assert.match(await v('calc-out').textContent(), /0\.0523 ms/);
    assert.ok(await page.locator('[data-action="load-calc"]').isDisabled());
    assert.match(await v('calc-range').textContent(), /outside the plot controls/);
    await k('fmax').fill('100');
    assert.ok(await page.locator('[data-action="load-calc"]').isEnabled());
    assert.equal(await v('calc-range').textContent(), '');
  });
  await check('Calculator accepts the advertised 50% limit', async () => {
    await k('err').fill('50');
    assert.ok(await page.locator('[data-action="load-calc"]').isEnabled());
    await k('err').fill('50.1');
    assert.ok(await page.locator('[data-action="load-calc"]').isDisabled());
    await k('err').fill('5');
  });
  await check('Moving one slider keeps the other exact preset value', async () => {
    await page.locator('[data-preset="lecture"]').click();
    await set('tau', -0.5);
    assert.match(await v('metrics').textContent(), /ωτ = 0\.632/);
    await page.locator('[data-preset="lecture"]').click();
    await set('f', 0);
    assert.match(await v('metrics').textContent(), /5 rad\/s/);
  });
  const submit = () => page.locator('[data-form="prediction"] button').click();
  await check('Prediction requires a guess, then doubles f with quantitative feedback', async () => {
    await page.locator('[data-action="reset"]').click();
    await submit(); assert.match(await v('feedback').textContent(), /Choose your prediction/);
    await c('guess').selectOption('both'); await submit();
    assert.match(await v('feedback').textContent(), /Correct/);
    assert.match(await v('feedback').textContent(), /2 Hz/);
    assert.match(await v('feedback').textContent(), /time delay in seconds actually fell, from 143 ms to 94\.9 ms/);
    await c('guess').selectOption('lag'); await submit();
    assert.match(await v('feedback').textContent(), /Check the relationship/);
  });
  await check('Prediction refuses to double beyond 1000 Hz', async () => {
    await set('f', 2.9); await c('guess').selectOption('both'); await submit();
    assert.match(await v('feedback').textContent(), /500 Hz or less/);
  });
  await check('Transient toggle adds the steady-state reference curve', async () => {
    await page.locator('[data-action="reset"]').click();
    const before = await v('sine-chart').locator('path.m2-line').count();
    await c('transient').check();
    assert.equal(await v('sine-chart').locator('path.m2-line').count(), before + 1);
  });
  await check('Extreme slider values give finite paths', async () => {
    for (const [t, f] of [[-4, -2], [-4, 3], [1, -2], [1, 3]]) {
      await set('tau', t); await set('f', f);
      const d = await page.locator('.module-two svg path').evaluateAll(es => es.map(e => e.getAttribute('d')).join(' '));
      assert.doesNotMatch(d, /NaN|Infinity/);
    }
  });
  await page.locator('[data-action="reset"]').click();
  await mkdir(resolve(root, 'docs/screenshots'), { recursive: true });
  await page.locator('[data-preset="lecture"]').click();
  await page.screenshot({ path: resolve(root, 'docs/screenshots/module2-desktop.png'), fullPage: true });
  await check('Mobile layout fits 390px and 320px widths', async () => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
      assert.ok(await c('f').isVisible());
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(root, 'docs/screenshots/module2-mobile.png'), fullPage: true });
  await check('Skip link keeps Module 2 open', async () => {
    await page.evaluate(() => { location.hash = 'main'; });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.module-two').count(), 1);
  });
  await check('No runtime or failed-resource errors', () => assert.deepEqual(errors, []));
  console.log(`\n${passed.length} Module 2 browser checks passed. Browser: ${await browser.version()}`);
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
