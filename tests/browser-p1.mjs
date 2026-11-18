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
  const c = n => page.locator(`.control-p1 [data-control="${n}"]`), v = n => page.locator(`.control-p1 [data-view="${n}"]`);
  const set = async (n, value) => { await c(n).evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, value); await page.waitForTimeout(120); };
  const text = async n => (await v(n).textContent()).replace(/\s+/g, ' ');
  const check = async (name, f) => { await f(); passed.push(name); console.log(`PASS ${name}`); };

  await page.goto(base);
  await check('Control section is linked from the landing page navigation', async () => {
    await page.waitForSelector('.module-one');
    await page.locator('[data-route="p1"]').click();
    await page.waitForSelector('.control-p1 [data-view="y-chart"] svg');
    assert.equal(await page.locator('[data-route="p1"]').getAttribute('aria-current'), 'page');
    assert.match(await page.title(), /PID playground/);
  });
  await check('All six validation rows pass on the page', async () => {
    assert.equal((await text('validation')).match(/PASS/g).length, 6);
    assert.doesNotMatch(await text('validation'), /FAIL/);
  });
  await check('Default loop (Kp = 9) shows 10% error and theory = simulation = 100 ms', async () => {
    const m = await text('metrics');
    assert.match(m, /10%/); assert.match(m, /220 ms/);
    assert.match(await text('theory'), /τcl = τ\/\(1 \+ KKp\) = 100 ms.*63\.2% time = 100 ms/);
    assert.match(await text('diagram'), /PID/); assert.match(await text('diagram'), /Limit/);
    assert.match(await text('status'), /Settled, but not at the setpoint: y stays at 0\.9, 10% below r/);
  });
  await check('Adding Ki removes the error; the PI formula line appears', async () => {
    await set('Ki', 20);
    assert.match(await text('metrics'), /Steady-state error\s*0%/);
    assert.match(await text('theory'), /ωn = 4\.47 rad\/s and ζ = 1\.12/);
  });
  await check('Adding Kd explains the filtered derivative', async () => {
    await set('Kd', 0.5);
    assert.match(await text('u-note'), /derivative is filtered/);
  });
  await check('A tight limit saturates u and the page says so', async () => {
    await c('uMax').fill('3'); await page.waitForTimeout(150);
    assert.match(await text('sat'), /At the limit [1-9]/);
    assert.match(await text('u-note'), /windup/);
    const max = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.control-p1 [data-view="u-chart"] path.ct-u')].flatMap(p => p.getAttribute('d').match(/-?[\d.]+/g).map(Number))));
    assert.ok(Number.isFinite(max));
    await c('uMin').fill('5'); await page.waitForTimeout(150);
    assert.match(await text('limit-error'), /must be greater/);
  });
  await check('Micromouse preset: ζ in 0.6–0.8, PWM in 0–100%, units in rad/s', async () => {
    await page.locator('.control-p1 [data-preset="motor"]').click(); await page.waitForTimeout(150);
    assert.match(await text('theory'), /ζ = 0\.752/);
    assert.match(await text('sat'), /At the limit 0%/);
    assert.match(await text('metrics'), /Steady-state error\s*0%/);
    assert.match(await text('units'), /rad\/s/);
    assert.match(await text('diagram'), /0\.65 \/ \(0\.06s \+ 1\)/);
    assert.match(await text('status'), /Settled at the setpoint/);
    assert.match(await text('units'), /no-load value.*approximate estimate/);
  });
  await page.screenshot({ path: resolve(root, 'docs/screenshots/p1-motor.png'), fullPage: true });
  await check('A PWM cap below the needed 46% leaves an error even with Ki', async () => {
    await c('uMax').fill('40'); await page.waitForTimeout(150);
    assert.match(await text('status'), /u is stuck at its limit.*out of reach/);
    await c('uMax').fill('100'); await page.waitForTimeout(150);
  });
  await check('Changing the plant drops the motor units', async () => {
    await c('plantType').selectOption('second'); await page.waitForTimeout(150);
    assert.doesNotMatch(await text('units'), /rad\/s/);
    await c('plantType').selectOption('first'); await page.waitForTimeout(150);
  });
  await check('Second-order preset switches the plant controls', async () => {
    await page.locator('.control-p1 [data-preset="second"]').click(); await page.waitForTimeout(150);
    assert.equal(await c('plantType').inputValue(), 'second');
    assert.ok(await c('zeta').isVisible()); assert.ok(!(await c('tau').isVisible()));
    assert.match(await text('metrics'), /Steady-state error\s*16\.7%/);
  });
  await check('Too much gain: a limit cycle with the limit, unstable without it', async () => {
    await set('Kp', 20); await set('Ki', 100);
    assert.match(await text('status'), /limit cycle/);
    await c('limit').uncheck(); await page.waitForTimeout(150);
    assert.match(await text('status'), /Unstable/);
  });
  const submit = () => page.locator('.control-p1 [data-form="prediction"] button').click();
  await check('Experiment 1: predict, then adding Ki takes the error to zero', async () => {
    await page.locator('.control-p1 [data-question="i"]').click(); await page.waitForTimeout(120);
    await submit(); assert.match(await text('feedback'), /Choose your prediction/);
    await c('guess').selectOption('zero'); await submit(); await page.waitForTimeout(150);
    assert.match(await text('feedback'), /Correct\. The steady-state error went from 10% to 0%/);
    assert.equal(await c('Ki').inputValue(), '20');
  });
  await check('Experiment 2: Kd cuts the second-order overshoot', async () => {
    await page.locator('.control-p1 [data-question="d"]').click(); await page.waitForTimeout(120);
    await c('guess').selectOption('up'); await submit(); await page.waitForTimeout(150);
    assert.match(await text('feedback'), /Not quite\. The overshoot fell from/);
  });
  await check('Reset returns to the lecture loop', async () => {
    await page.locator('.control-p1 [data-action="reset"]').click(); await page.waitForTimeout(150);
    for (const [n, x] of Object.entries({ K: '1', tau: '1', Kp: '9', Ki: '0', Kd: '0', r: '1' })) assert.equal(await c(n).inputValue(), x);
  });
  await page.screenshot({ path: resolve(root, 'docs/screenshots/p1-desktop.png'), fullPage: true });
  await check('Extreme slider values give finite paths', async () => {
    for (const [pt, Kp, Ki, Kd] of [['first', 20, 100, 2], ['second', 20, 100, 2], ['first', 0, 0, 0]]) {
      await c('plantType').selectOption(pt); await set('Kp', Kp); await set('Ki', Ki); await set('Kd', Kd);
      const d = await page.locator('.control-p1 svg path').evaluateAll(es => es.map(e => e.getAttribute('d')).join(' '));
      assert.doesNotMatch(d, /NaN|Infinity/);
    }
  });
  await check('Leaving P1 and coming back mounts one clean copy', async () => {
    await page.evaluate(() => { location.hash = 'module2'; }); await page.waitForSelector('.module-two');
    assert.equal(await page.locator('.control-p1').count(), 0);
    await page.evaluate(() => { location.hash = 'p1'; }); await page.waitForSelector('.control-p1 svg');
    assert.equal(await page.locator('.control-p1').count(), 1);
  });
  await check('Mobile layout fits 390px and 320px widths', async () => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(200);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
      assert.ok(await c('Kp').isVisible());
    }
  });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(root, 'docs/screenshots/p1-mobile.png'), fullPage: true });
  await check('No runtime or failed-resource errors', () => assert.deepEqual(errors, []));
  console.log(`\n${passed.length} P1 browser checks passed. Browser: ${await browser.version()}`);
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
