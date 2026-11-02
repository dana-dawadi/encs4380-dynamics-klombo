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
const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
    const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
    const path = resolve(root, relative);
    if (!path.startsWith(resolve(root) + '/') && !path.startsWith(resolve(root) + '\\')) throw Error('Invalid path');
    const content = await readFile(path);
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(path)] || 'application/octet-stream');
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
let browser;
const passed=[];
try {
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE}: {})});
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  const c=n=>page.locator(`[data-control="${n}"]`), v=n=>page.locator(`[data-view="${n}"]`);
  const set=async(n,value)=>{await c(n).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);};
  const check=async(name,f)=>{await f();passed.push(name);console.log(`PASS ${name}`);};
  await page.waitForSelector('[data-view="response-chart"] svg');
  await check('Repository-prefixed URL loads all relative assets',()=>assert.deepEqual(errors,[]));
  await check('Step shows two landmarks and both lecture checks pass',async()=>{
    assert.equal(await v('response-chart').locator('circle').count(),2);
    assert.match(await v('response-chart').textContent(),/63.2%/);
    assert.match(await v('response-chart').textContent(),/95.0%/);
    assert.equal((await v('validation').textContent()).match(/PASS/g).length,2);
    assert.match(await v('validation').textContent(),/0.632121/);
    assert.match(await v('validation').textContent(),/0.950213/);
  });
  await check('Step markers agree with independent expected SVG coordinates',async()=>{
    const dots=await v('response-chart').locator('circle').evaluateAll(es=>es.map(e=>[+e.getAttribute('cx'),+e.getAttribute('cy')]));
    assert.ok(Math.abs(dots[0][0]-188)<.01);
    assert.ok(Math.abs(dots[0][1]-(32+(1.16-0.6321205588285577)/1.16*246))<.01);
  });
  await check('Gain and amplitude update outputs immediately',async()=>{
    await set('K',2);await set('size',3);
    assert.match(await v('metrics').textContent(),/6 units/);
    assert.match(await v('metrics').textContent(),/3.793 units/);
  });
  await check('Tau changes physical time labels and natural slope',async()=>{
    await set('tau',4);assert.match(await v('window').textContent(),/24/);
    assert.match(await v('slope').textContent(),/−1\/τ = -0.25/);
  });
  await check('Log10 mode uses the correct converted slope',async()=>{
    await c('base').selectOption('10');assert.match(await v('slope').textContent(),/-0.109/);
    assert.match(await v('log-chart').textContent(),/log₁₀/);
  });
  await check('Ramp displays scaled error, lag and raw-input distinction',async()=>{
    await c('mode').selectOption('ramp');
    assert.equal(await v('response-chart').locator('circle').count(),0);
    assert.equal(await v('response-chart').locator('.m1-lag').count(),1);
    assert.match(await v('metrics').textContent(),/24 units/);
    assert.match(await v('metrics').textContent(),/4 s/);
    assert.match(await v('explanation').textContent(),/not constant when K ≠ 1/);
  });
  const submit=()=>page.locator('[data-form="prediction"] button').click();
  await check('Prediction requires a guess before changing tau',async()=>{
    await submit();assert.equal(await c('tau').inputValue(),'4');assert.match(await v('feedback').textContent(),/Choose your prediction/);
  });
  await check('Ramp prediction applies doubling and explains the result',async()=>{
    await c('guess').selectOption('slower');await submit();assert.equal(await c('tau').inputValue(),'8');
    assert.match(await v('feedback').textContent(),/Correct/);assert.match(await v('metrics').textContent(),/48 units/);
  });
  await check('Prediction prevents out-of-range doubling',async()=>{
    await c('guess').selectOption('slower');await submit();assert.equal(await c('tau').inputValue(),'8');assert.match(await v('feedback').textContent(),/5 s or less/);
  });
  await check('Reset restores defaults, modes and validation',async()=>{
    await page.locator('[data-action="reset"]').click();
    for(const [n,x] of Object.entries({K:'1',tau:'2',size:'1',mode:'step',base:'e'}))assert.equal(await c(n).inputValue(),x);
  });
  await check('Incorrect step prediction gives quantitative feedback',async()=>{
    await c('guess').selectOption('higher');await submit();
    assert.match(await v('feedback').textContent(),/Check the relationship/);assert.match(await v('feedback').textContent(),/final output KA stays the same/);
  });
  await check('Keyboard adjusts range control and redraws',async()=>{
    await c('tau').focus();await page.keyboard.press('ArrowRight');assert.equal(await c('tau').inputValue(),'4.1');assert.match(await v('window').textContent(),/24.6/);
  });
  await check('All extrema render finite paths with passing validation',async()=>{
    for(const mode of ['step','ramp']) for(const value of [.1,5]) {
      await c('mode').selectOption(mode);await set('K',value);await set('size',value);await set('tau',value===5?10:.1);
      const d=await page.locator('svg path').evaluateAll(es=>es.map(e=>e.getAttribute('d')).join(' '));
      assert.doesNotMatch(d,/NaN|Infinity/);assert.equal((await v('validation').textContent()).match(/PASS/g).length,2);
    }
  });
  await page.locator('[data-action="reset"]').click();
  await mkdir(resolve(root,'docs/screenshots'),{recursive:true});
  await page.screenshot({path:resolve(root,'docs/screenshots/module1-desktop.png'),fullPage:true});
  await c('mode').selectOption('ramp');await set('K',2);
  await page.screenshot({path:resolve(root,'docs/screenshots/module1-ramp.png'),fullPage:true});
  await check('Mobile layout fits 390px and 320px widths',async()=>{
    for(const width of [390,320]) {
      await page.setViewportSize({width,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}px`);
      assert.ok(await c('tau').isVisible());
      await c('mode').selectOption('step');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Step overflow at ${width}px`);
      await c('mode').selectOption('ramp');
    }
  });
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:resolve(root,'docs/screenshots/module1-mobile.png'),fullPage:true});
  await check('Multiple module instances have unique IDs and clean unmounts',async()=>{
    const result=await page.evaluate(async()=>{
      const {mount}=await import('./modules/module1/index.js');
      const a=document.createElement('div'),b=document.createElement('div');
      document.body.append(a,b);
      const cleanA=mount(a),cleanB=mount(b);
      const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
      const unique=new Set(ids).size===ids.length;
      a.querySelector('[data-control="K"]').value='3';
      a.querySelector('[data-control="K"]').dispatchEvent(new Event('input',{bubbles:true}));
      const isolated=b.querySelector('[data-control="K"]').value==='1';
      cleanA();cleanB();
      const empty=!a.children.length&&!b.children.length;
      a.remove();b.remove();return {unique,isolated,empty};
    });
    assert.deepEqual(result,{unique:true,isolated:true,empty:true});
  });
  await check('No runtime or failed-resource errors through all interactions',()=>assert.deepEqual(errors,[]));
  console.log(`\n${passed.length} browser checks passed. Browser: ${await browser.version()}`);
} finally {await browser?.close();await new Promise(r=>server.close(r));}
