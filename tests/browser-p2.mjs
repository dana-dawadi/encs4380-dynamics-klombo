import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
  const c = n => page.locator(`.control-p2 [data-control="${n}"]`), v = n => page.locator(`.control-p2 [data-view="${n}"]`);
  const set = async (n, value) => { await c(n).evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, value); await page.waitForTimeout(150); };
  const setTau = s => set('sensorTau', Math.log10(s));
  const text = async n => (await v(n).textContent()).replace(/\s+/g, ' ');
  const sweepReady = () => page.waitForFunction(() => { const n = document.querySelector('.control-p2 [data-view="sweep-note"]'); return n && n.textContent && !/Updating/.test(n.textContent); });
  const check = async (name, f) => { await f(); passed.push(name); console.log(`PASS ${name}`); };

  await page.goto(base);
  await check('P2 is linked from the Control section of the landing page', async () => {
    await page.waitForSelector('.module-one');
    await page.locator('[data-route="p2"]').click();
    await page.waitForSelector('.control-p2 [data-view="y-chart"] svg');
    assert.equal(await page.locator('[data-route="p2"]').getAttribute('aria-current'), 'page');
    assert.match(await page.title(), /Slow sensor in the loop/);
  });
  await check('All seven P2 checks pass on the page', async () => {
    assert.equal((await text('validation')).match(/PASS/g).length, 7);
    assert.doesNotMatch(await text('validation'), /FAIL/);
  });
  await check('Default loop (P1’s PI, τs = 100 ms): true y overshoots more than the reading', async () => {
    const m = await text('metrics');
    assert.match(m, /True overshoot\s*41\.3%/); assert.match(m, /Sensor-reading overshoot\s*28\.2%/); assert.match(m, /Critical τs\s*1 s/);
    assert.match(await text('seen'), /true output reaches r = 1, but the sensor still reads 0\.45/);
    assert.match(await text('theory'), /Critical τs = .* = 1 s/);
    assert.match(await text('diagram'), /Sensor H\(s\)/); assert.match(await text('diagram'), /1 \/ \(0\.1s \+ 1\)/);
    assert.match(await text('status'), /Settled at the setpoint/);
    assert.equal(await page.locator('.control-p2 [data-view="y-chart"] path.ct-meas').count(), 1);
    assert.equal(await page.locator('.control-p2 [data-view="y-chart"] path.ct-out').count(), 1);
  });
  await check('The τs sweep shows growth and shades the unstable range from 1 s', async () => {
    await sweepReady();
    assert.match(await text('sweep'), /τs,crit = 1 s/);
    assert.equal(await page.locator('.control-p2 [data-view="sweep"] rect.sw-unstable').count(), 1);
    assert.match(await text('sweep-note'), /overshoot grows, until at τs = 1 s the loop starts to oscillate/);
  });
  await check('Ideal sensor: y and ym coincide, slider disabled', async () => {
    await c('ideal').check(); await page.waitForTimeout(200);
    const m = await text('metrics');
    const [a, b] = [...m.matchAll(/overshoot\s*([\d.]+)%/g)].map(x => x[1]);
    assert.equal(a, b);
    assert.ok(await c('sensorTau').isDisabled());
    assert.match(await text('seen'), /Ideal sensor/);
    await c('ideal').uncheck(); await page.waitForTimeout(200);
  });
  await page.screenshot({ path: resolve(root, 'docs/screenshots/p2-desktop.png'), fullPage: true });
  await check('Past the critical τs the loop is unstable; with a u limit it is a limit cycle', async () => {
    await setTau(1.5);
    assert.match(await text('status'), /Unstable: each swing is bigger than the last\. τs = 1\.5\d* s is past the critical τs = 1 s/);
    assert.match(await text('metrics'), /True overshoot\s*—/);
    await c('limit').check(); await page.waitForTimeout(300);
    assert.match(await text('status'), /limit cycle/);
    await c('limit').uncheck(); await page.waitForTimeout(200);
  });
  await page.screenshot({ path: resolve(root, 'docs/screenshots/p2-oscillation.png'), fullPage: true });
  const submit = () => page.locator('.control-p2 [data-form="prediction"] button').click();
  await check('Experiment 1: a slower sensor raises the overshoot', async () => {
    await page.locator('.control-p2 [data-question="grow"]').click(); await page.waitForTimeout(150);
    await submit(); assert.match(await text('feedback'), /Choose your prediction/);
    await c('guess').selectOption('grows'); await submit(); await page.waitForTimeout(300);
    assert.match(await text('feedback'), /Correct\. The true overshoot went from 41\.3% to 18\d%/);
    assert.equal(await page.locator('.control-p2 [data-output="sensorTau"]').textContent(), '500 ms');
  });
  await check('Experiment 2: the true output overshoots more than the reading', async () => {
    await page.locator('.control-p2 [data-question="truth"]').click(); await page.waitForTimeout(150);
    await c('guess').selectOption('sensor'); await submit(); await page.waitForTimeout(300);
    assert.match(await text('feedback'), /Not quite\. The true output overshoots by 124%, but the sensor reading only by 58\.\d%/);
  });
  await check('Experiment 3: a faster sensor fixes the oscillation with the same gains', async () => {
    await page.locator('.control-p2 [data-question="fix"]').click(); await page.waitForTimeout(300);
    assert.match(await text('status'), /Unstable/);
    await c('guess').selectOption('calm'); await submit(); await page.waitForTimeout(300);
    assert.match(await text('feedback'), /Correct\. With τs = 1\.5 s the loop was unstable; with τs = 0\.1 s it settles, with 41\.3% overshoot\. .*critical τs is 1 s.*below 16\.7/);
    assert.match(await text('status'), /Settled/);
  });
  await check('Micromouse preset: encoder sensor, PWM units, critical τs 3.45 s', async () => {
    await page.locator('.control-p2 [data-preset="motor"]').click(); await page.waitForTimeout(300);
    assert.match(await text('units'), /encoder counts/);
    assert.match(await text('metrics'), /Critical τs\s*3\.45 s/);
    assert.match(await text('seen'), /% PWM/);
    assert.match(await text('sat'), /At the limit 0%/);
    assert.match(await text('diagram'), /0\.65 \/ \(0\.06s \+ 1\)/);
    await sweepReady();
    assert.match(await text('sweep-note'), /limit cycle/);
  });
  await check('Second-order preset: an unstable band, stable again for a very slow sensor', async () => {
    await page.locator('.control-p2 [data-preset="second"]').click(); await page.waitForTimeout(300);
    assert.equal(await c('plantType').inputValue(), 'second');
    assert.match(await text('metrics'), /Critical τs\s*134 ms/);
    await sweepReady();
    assert.match(await text('sweep-note'), /Above 1\.87 s the loop is stable again/);
    assert.match(await text('theory'), /Routh–Hurwitz/);
  });
  await check('Reset returns to P1’s loop with τs = 100 ms', async () => {
    await page.locator('.control-p2 [data-action="reset"]').click(); await page.waitForTimeout(200);
    for (const [n, x] of Object.entries({ K: '1', tau: '1', Kp: '9', Ki: '20', Kd: '0', r: '1' })) assert.equal(await c(n).inputValue(), x);
    assert.equal(+(10 ** +(await c('sensorTau').inputValue())).toFixed(4), 0.1);
  });
  await check('Extreme slider values give finite paths', async () => {
    for (const [pt, Kp, Ki, Kd, tau] of [['first', 20, 100, 2, 10], ['second', 20, 100, 2, 1e-4], ['first', 0, 0, 0, 1], ['second', 0.1, 0, 2, 3]]) {
      await c('plantType').selectOption(pt); await set('Kp', Kp); await set('Ki', Ki); await set('Kd', Kd); await setTau(tau);
      await sweepReady();
      const d = await page.locator('.control-p2 svg path').evaluateAll(es => es.map(e => e.getAttribute('d')).join(' '));
      assert.doesNotMatch(d, /NaN|Infinity/);
    }
  });
  await check('Leaving P2 and coming back mounts one clean copy; P1 still works', async () => {
    await page.evaluate(() => { location.hash = 'p1'; }); await page.waitForSelector('.control-p1 svg');
    assert.equal(await page.locator('.control-p2').count(), 0);
    assert.equal((await page.locator('.control-p1 [data-view="validation"]').textContent()).match(/PASS/g).length, 6);
    await page.evaluate(() => { location.hash = 'p2'; }); await page.waitForSelector('.control-p2 svg');
    assert.equal(await page.locator('.control-p2').count(), 1);
  });
  await check('Mobile layout fits 390px and 320px widths', async () => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(250);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
      assert.ok(await c('sensorTau').isVisible());
    }
  });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(root, 'docs/screenshots/p2-mobile.png'), fullPage: true });
  await check('No runtime or failed-resource errors', () => assert.deepEqual(errors, []));
  console.log(`\n${passed.length} P2 browser checks passed. Browser: ${await browser.version()}`);
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
