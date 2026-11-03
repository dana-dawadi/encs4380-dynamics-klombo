import { amplitudeRatio, phase, magnitudeDb, dynamicError, timeDelay, tauMax, sineResponse, validate, hzToRad, deg } from './math.js';

const sig = (n, d = 3) => Number(n.toPrecision(d)).toString();
const fmtTime = s => s < 1 ? `${sig(s * 1000)} ms` : `${sig(s)} s`;
const fmtHz = f => `${sig(f)} Hz`;
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const decade = k => (k >= -2 && k <= 3) ? String(10 ** k) : `10${String(k).split('').map(c => SUP[c]).join('')}`;
const DEFAULTS = { tau: 0.2, f: 1, transient: false };
// Slider positions are log10 values so one control spans 0.1 ms–10 s or 0.01–1000 Hz.
const RANGE = { tau: [-4, 1], f: [-2, 3] };
let instance = 0;


export function mount(root) {
  const prefix = `m2-${++instance}`;
  const id = name => `${prefix}-${name}`;
  const state = { ...DEFAULTS };
  let predictionApplied = false;
  root.classList.add('module-two');
  root.innerHTML = `
    <header class="m2-heading"><p class="m2-eyebrow">MODULE 02 / FREQUENCY RESPONSE</p><h1>Fast signals get smaller and fall behind in phase.</h1><p>Drive a first-order sensor with a sine wave. The output is a sine at the same frequency, but with a smaller amplitude and a phase lag. Both depend only on ωτ.</p><div class="m2-equation">M = 1 / √(1 + (ωτ)²) <span>φ = −tan⁻¹(ωτ)</span></div></header>
    <div class="m2-workspace">
      <section class="m2-controls" aria-labelledby="${id('controls')}"><h2 id="${id('controls')}">Set up the test</h2>
        ${slider('tau', 'Time constant τ', 'tau')}
        ${slider('f', 'Input frequency f', 'f')}
        <label class="m2-check"><input type="checkbox" data-control="transient"> Include start-up transient</label>
        <p class="m2-label">Lecture examples</p>
        <div class="m2-presets"><button type="button" class="m2-secondary" data-preset="lecture">τ = 0.2 s, input sin 2t</button><button type="button" class="m2-secondary" data-preset="design">τmax for 100 Hz, 5% error</button></div>
        <button type="button" data-action="reset" class="m2-secondary">Reset sensor</button>
        <p class="m2-note">K = 1 and input amplitude A = 1, so the output amplitude equals M. Sliders use logarithmic steps; the presets set exact values.</p>
      </section>
      <section class="m2-response" aria-labelledby="${id('response')}"><div class="m2-chart-heading"><h2 id="${id('response')}">Input and output sines</h2><span data-view="window"></span></div><div data-view="sine-chart"></div><div class="m2-legend"><span class="m2-input">Input x(t)</span><span class="m2-output">Sensor y(t)</span><span class="m2-reference" data-view="steady-legend" hidden>Steady state</span></div><div class="m2-metrics" data-view="metrics"></div><p data-view="formula" class="m2-formula"></p><p data-view="explanation"></p></section>
    </div>
    <section class="m2-predict" aria-labelledby="${id('predict')}"><div><p class="m2-eyebrow">PREDICT, THEN CHECK</p><h2 id="${id('predict')}">What happens if the input frequency doubles?</h2><p>Choose a prediction before applying the change. τ stays fixed.</p></div><form data-form="prediction"><label for="${id('guess')}">Your prediction</label><select id="${id('guess')}" data-control="guess"><option value="">Choose an answer…</option><option value="both">The output amplitude decreases and the phase lag angle increases</option><option value="lag">The amplitude stays the same; only the phase lag angle increases</option><option value="amp">The amplitude decreases; the phase lag angle stays the same</option></select><button type="submit">Apply 2×f and check</button><p data-view="feedback" role="status"></p></form></section>
    <section class="m2-bode" aria-labelledby="${id('bode')}"><p class="m2-eyebrow">READ THE BANDWIDTH</p><h2 id="${id('bode')}">Bode plot</h2><p>Frequency on a logarithmic axis. Below the cutoff ω = 1/τ the sensor follows the input; above it the amplitude falls by 20 dB per decade and the lag approaches 90°. The dot is the current input frequency.</p><div data-view="bode-mag"></div><div data-view="bode-phase"></div><div class="m2-legend"><span class="m2-output">Exact response</span><span class="m2-reference">Straight-line asymptotes</span><span class="m2-cut">Cutoff ω = 1/τ</span></div><p data-view="cutoff" class="m2-formula"></p></section>
    <section class="m2-calc" aria-labelledby="${id('calc')}"><p class="m2-eyebrow">DESIGN A SENSOR</p><h2 id="${id('calc')}">Dynamic-error calculator</h2><p>The dynamic error is δ = M − 1. To keep |δ| below a limit for every frequency up to f<sub>max</sub>, the sensor needs M ≥ 1 − |δ| at f<sub>max</sub>, which sets the largest allowed τ.</p>
      <form data-form="calc" class="m2-calc-grid">
        <div><label for="${id('err')}">Allowed error |δ| (%)</label><input id="${id('err')}" data-calc="err" type="number" min="0.1" max="50" step="0.1" value="5" inputmode="decimal"></div>
        <div><label for="${id('fmax')}">Highest signal frequency (Hz)</label><input id="${id('fmax')}" data-calc="fmax" type="number" min="0.01" max="100000" step="any" value="100" inputmode="decimal"></div>
        <div><label for="${id('fcheck')}">Also check phase at (Hz)</label><input id="${id('fcheck')}" data-calc="fcheck" type="number" min="0.01" max="100000" step="any" value="50" inputmode="decimal"></div>
      </form>
      <div class="m2-metrics m2-calc-out" data-view="calc-out"></div><p data-view="calc-steps" class="m2-formula"></p>
      <button type="button" data-action="load-calc" class="m2-secondary m2-inline">Load this sensor into the plots</button><p data-view="calc-range" class="m2-warning" role="status"></p>
    </section>
    <section class="m2-validation" aria-labelledby="${id('validation')}"><p class="m2-eyebrow">CHECK THE MODEL</p><h2 id="${id('validation')}">Lecture validation</h2><p>Computed with the same functions that draw the plots, using the lecture's fixed values. Lecture values are rounded, so the tolerance is half of the last shown digit.</p><div class="m2-table-wrap"><table><caption>First-order frequency response validation</caption><thead><tr><th scope="col">Check</th><th scope="col">Expected</th><th scope="col">Calculated</th><th scope="col">Result</th></tr></thead><tbody data-view="validation"></tbody></table></div></section>`;

  function slider(name, label, key) {
    const [min, max] = RANGE[key];
    return `<div class="m2-slider"><label for="${id(name)}">${label}</label><output for="${id(name)}" data-output="${name}"></output><input id="${id(name)}" data-control="${name}" type="range" min="${min}" max="${max}" step="0.01"><span>${name === 'tau' ? '0.1 ms' : '0.01 Hz'}</span><span>${name === 'tau' ? '10 s' : '1000 Hz'}</span></div>`;
  }
  const control = name => root.querySelector(`[data-control="${name}"]`);
  const view = name => root.querySelector(`[data-view="${name}"]`);
  const calc = name => root.querySelector(`[data-calc="${name}"]`);
  const inRange = (key, v) => { const l = Math.log10(v); return l >= RANGE[key][0] - 1e-9 && l <= RANGE[key][1] + 1e-9; };
  const syncSliders = () => { control('tau').value = Math.log10(state.tau); control('f').value = Math.log10(state.f); control('transient').checked = state.transient; };

  function render() {
    const { tau, f } = state, w = hzToRad(f);
    const M = amplitudeRatio(w, tau), p = phase(w, tau), wt = w * tau;
    for (const [name, text] of [['tau', fmtTime(tau)], ['f', `${fmtHz(f)} · ω = ${sig(w)} rad/s`]]) {
      root.querySelector(`[data-output="${name}"]`).textContent = text;
      control(name).setAttribute('aria-valuetext', text);
    }
    const width = el => Math.min(760, Math.max(270, view(el).clientWidth));

    // Three input periods; markers sit on the third input peak and the matching output peak.
    const end = 3 / f, ms = end < 1, scale = ms ? 1000 : 1;
    view('window').textContent = `0–${sig(end * scale)} ${ms ? 'ms' : 's'} · 3 periods`;
    const tIn = (Math.PI / 2 + 4 * Math.PI) / w, tOut = tIn + timeDelay(w, tau);
    const series = [{ f: t => Math.sin(w * t), cls: 'input' }, { f: t => sineResponse(t, w, tau, 1, 1, state.transient), cls: 'output' }];
    if (state.transient) series.splice(1, 0, { f: t => sineResponse(t, w, tau, 1, 1, false), cls: 'reference' });
    view('steady-legend').hidden = !state.transient;
    const fr = frame({ width: width('sine-chart'), xmin: 0, xmax: end, ymin: -1.3, ymax: 1.3, xticks: ticks(0, end, width('sine-chart') < 500 ? 3 : 6), yticks: [-1, -0.5, 0, 0.5, 1], xfmt: t => sig(t * scale), yfmt: v => String(v), xlabel: `Time (${ms ? 'ms' : 's'})`, ylabel: 'Signal (units)', title: `Input and output sines at ${fmtHz(f)} with tau ${fmtTime(tau)}` });
    let svg = fr.open + `<line class="m2-zero" x1="${fr.x(0)}" x2="${fr.x(end)}" y1="${fr.y(0)}" y2="${fr.y(0)}"/>`;
    for (const s of series) svg += `<path class="m2-line m2-${s.cls}" d="${curve(s.f, 0, end, fr)}"/>`;
    svg += `<line class="m2-marker" x1="${fr.x(0)}" x2="${fr.x(end)}" y1="${fr.y(M)}" y2="${fr.y(M)}"/><text class="m2-marker-label" x="${fr.x(0) + 4}" y="${fr.y(1.16) - 9}">M = ${M.toFixed(3)} ┄</text>`;
    svg += `<circle class="m2-dot m2-dot-in" cx="${fr.x(tIn)}" cy="${fr.y(1)}" r="5"/><circle class="m2-dot" cx="${fr.x(tOut)}" cy="${fr.y(M)}" r="5"/>`;
    svg += `<path class="m2-lag" d="M${fr.x(tIn)},${fr.y(1.16)} H${fr.x(tOut)} M${fr.x(tIn)},${fr.y(1.16) - 5} v10 M${fr.x(tOut)},${fr.y(1.16) - 5} v10"/><text class="m2-lag-label" x="${(fr.x(tIn) + fr.x(tOut)) / 2}" y="${fr.y(1.16) - 9}" text-anchor="middle">Δt = ${fmtTime(timeDelay(w, tau))}</text>`;
    view('sine-chart').innerHTML = svg + '</svg>';

    view('metrics').innerHTML = metric('Amplitude ratio M', M.toFixed(3), `${magnitudeDb(w, tau).toFixed(2)} dB · ωτ = ${sig(wt)}`)
      + metric('Phase lag', `${(-deg(p)).toFixed(1)}°`, `Output peaks ${fmtTime(timeDelay(w, tau))} late`)
      + metric('Dynamic error δ', `${(dynamicError(w, tau) * 100).toFixed(2)}%`, 'δ = M − 1')
      + metric('Cutoff ω = 1/τ', `${sig(1 / tau)} rad/s`, `f = ${fmtHz(1 / (2 * Math.PI * tau))}`);
    view('formula').textContent = `x(t) = sin(ωt);  y(t) = M sin(ωt + φ) = ${M.toFixed(3)} sin(${sig(w)}t − ${(-p).toFixed(3)})`;
    view('explanation').textContent = (wt < 0.1 ? 'Far below the cutoff: the sensor follows almost perfectly, with a tiny lag.'
      : wt < 1 ? 'Below the cutoff: the output is slightly smaller and starts to lag noticeably.'
      : wt < 10 ? 'Above the cutoff: the output has lost more than 29% of its amplitude and lags by more than 45°.'
      : 'Far above the cutoff: the sensor barely responds. M ≈ 1/(ωτ) and the lag approaches 90°.')
      + (state.transient ? ' The sensor starts at rest, so the first cycles include a decaying term e^(−t/τ); the markers use the steady-state curve.' : ' Only the steady state is shown; the M line and Δt are read from it.');

    renderBode(w, tau, Math.min(1240, Math.max(270, view('bode-mag').clientWidth)));
    renderCalc();
    view('validation').innerHTML = validate().map(r => `<tr><th scope="row">${r.label}</th><td>${r.expected.toFixed(r.digits)}${r.unit}</td><td>${r.actual.toFixed(r.digits + 2)}${r.unit}</td><td class="m2-pass">${r.pass ? 'PASS' : 'FAIL'}</td></tr>`).join('');
  }

  function renderBode(w, tau, width) {
    const c = Math.log10(1 / tau), lw = Math.log10(w);
    const lo = Math.floor(Math.min(c - 2, lw - 0.5)), hi = Math.ceil(Math.max(c + 2, lw + 0.5));
    const xticks = []; for (let k = lo; k <= hi; k++) xticks.push(k);
    const step = width < 500 && hi - lo > 5 ? 2 : 1;
    const dbMin = Math.floor(Math.min(-20, magnitudeDb(10 ** hi, tau)) / 10) * 10;
    const dbStep = dbMin < -60 ? 20 : 10, yt = []; for (let v = 0; v >= dbMin; v -= dbStep) yt.push(v);
    const common = { width, height: 250, xmin: lo, xmax: hi, xticks: xticks.filter((k, i) => i % step === 0), xfmt: decade, xlabel: 'Frequency ω (rad/s, log scale)' };
    const at = f => lx => f(10 ** lx);

    const m = frame({ ...common, ymin: dbMin, ymax: 5, yticks: yt, yfmt: v => String(v), ylabel: 'Magnitude 20 log₁₀ M (dB)', title: `Bode magnitude with cutoff at ${sig(1 / tau)} rad/s` });
    let svg = m.open + cutLine(m, c, 5, dbMin) + `<path class="m2-asym" d="M${m.x(lo)},${m.y(0)} L${m.x(c)},${m.y(0)} L${m.x(hi)},${m.y(-20 * (hi - c))}"/>`;
    svg += `<path class="m2-line m2-output" d="${curve(at(x => magnitudeDb(x, tau)), lo, hi, m)}"/>`;
    svg += `<circle class="m2-dot m2-dot-cut" cx="${m.x(c)}" cy="${m.y(-10 * Math.log10(2))}" r="4"/><text class="m2-marker-label" x="${m.x(c) - 8}" y="${m.y(-3) + 20}" text-anchor="end">−3 dB</text>`;
    svg += `<circle class="m2-dot" cx="${m.x(lw)}" cy="${m.y(magnitudeDb(w, tau))}" r="5"/>`;
    view('bode-mag').innerHTML = svg + '</svg>';

    const ph = frame({ ...common, ymin: -95, ymax: 5, yticks: [0, -15, -30, -45, -60, -75, -90], yfmt: v => `${v}°`, ylabel: 'Phase φ (degrees)', title: 'Bode phase from 0 to minus 90 degrees' });
    svg = ph.open + cutLine(ph, c, 5, -95) + `<path class="m2-asym" d="M${ph.x(lo)},${ph.y(0)} L${ph.x(c - 1)},${ph.y(0)} L${ph.x(c + 1)},${ph.y(-90)} L${ph.x(hi)},${ph.y(-90)}"/>`;
    svg += `<path class="m2-line m2-output" d="${curve(at(x => deg(phase(x, tau))), lo, hi, ph)}"/>`;
    svg += `<circle class="m2-dot m2-dot-cut" cx="${ph.x(c)}" cy="${ph.y(-45)}" r="4"/><text class="m2-marker-label" x="${ph.x(c) + 8}" y="${ph.y(-45) - 8}">−45°</text>`;
    svg += `<circle class="m2-dot" cx="${ph.x(lw)}" cy="${ph.y(deg(phase(w, tau)))}" r="5"/>`;
    view('bode-phase').innerHTML = svg + '</svg>';
    view('cutoff').textContent = `Cutoff ω = 1/τ = ${sig(1 / tau)} rad/s (${fmtHz(1 / (2 * Math.PI * tau))}): M = 1/√2 = 0.707 (−3 dB) and φ = −45°. Current input: ω/ωc = ${sig(w * tau)}.`;
  }

  function renderCalc() {
    const err = +calc('err').value / 100, fmax = +calc('fmax').value, fcheck = +calc('fcheck').value;
    const ok = err >= 0.001 && err <= 0.5 && fmax > 0 && fcheck > 0 && [err, fmax, fcheck].every(Number.isFinite);
    const load = root.querySelector('[data-action="load-calc"]');
    load.disabled = true; view('calc-range').textContent = '';
    if (!ok) { view('calc-out').innerHTML = ''; view('calc-steps').textContent = 'Enter an error between 0.1% and 50% and positive frequencies.'; return null; }
    const w = hzToRad(fmax), t = tauMax(err, w), lim = Math.sqrt(1 / (1 - err) ** 2 - 1);
    // The result is still shown, but only values the sliders can represent are loaded.
    const fits = inRange('tau', t) && inRange('f', fmax);
    load.disabled = !fits;
    if (!fits) view('calc-range').textContent = `This result is outside the plot controls (τ: 0.1 ms–10 s, f: 0.01–1000 Hz), so it cannot be loaded. The calculation above is still valid.`;
    view('calc-out').innerHTML = metric('Largest time constant τmax', fmtTime(t), `M = ${(1 - err).toFixed(3)} at ${fmtHz(fmax)}`)
      + metric(`Phase lag at ${fmtHz(fmax)}`, `${(-deg(phase(w, t))).toFixed(1)}°`, 'At the edge of the band')
      + metric(`Phase lag at ${fmtHz(fcheck)}`, `${(-deg(phase(hzToRad(fcheck), t))).toFixed(1)}°`, `M = ${amplitudeRatio(hzToRad(fcheck), t).toFixed(4)} there`);
    view('calc-steps').textContent = `M ≥ 1 − ${sig(err)} = ${sig(1 - err)}  ⇒  ωτ ≤ √(1/${sig(1 - err)}² − 1) = ${lim.toFixed(4)}  ⇒  τ ≤ ${lim.toFixed(4)} / (2π × ${sig(fmax)}) = ${fmtTime(t)}`;
    return { t, fmax };
  }

  function metric(label, value, note) { return `<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`; }
  function setState(next) { Object.assign(state, next); syncSliders(); render(); }
  function changed() { if (predictionApplied) view('feedback').textContent = 'Sensor changed. Choose a new prediction to try again.'; predictionApplied = false; }

  function onInput(event) {
    if (event.target.matches('[data-calc]')) { renderCalc(); return; }
    if (!event.target.matches('[data-control]') || event.target === control('guess')) return;
    // Read only the control that moved: re-reading both would snap an exact preset value to the slider step.
    if (event.target === control('tau')) state.tau = 10 ** +control('tau').value;
    if (event.target === control('f')) state.f = 10 ** +control('f').value;
    if (event.target === control('transient')) state.transient = control('transient').checked;
    changed(); render();
  }
  function onSubmit(event) {
    event.preventDefault();
    if (event.target.matches('[data-form="calc"]')) return;
    const guess = control('guess').value, old = state.f, tau = state.tau;
    if (!guess) { view('feedback').textContent = 'Choose your prediction before checking.'; control('guess').focus(); return; }
    if (old > 500) { view('feedback').textContent = 'Set f to 500 Hz or less, then predict again; doubling must stay within the 1000 Hz control range.'; return; }
    const before = { M: amplitudeRatio(hzToRad(old), tau), lag: -deg(phase(hzToRad(old), tau)), dt: timeDelay(hzToRad(old), tau) };
    setState({ f: old * 2 });
    const after = { M: amplitudeRatio(hzToRad(old * 2), tau), lag: -deg(phase(hzToRad(old * 2), tau)), dt: timeDelay(hzToRad(old * 2), tau) };
    predictionApplied = true;
    const small = before.M - after.M < 0.01 ? ' The change is small here because the input is far below the cutoff; try it again near ω = 1/τ.' : '';
    view('feedback').textContent = `${guess === 'both' ? 'Correct.' : 'Check the relationship:'} f changed from ${fmtHz(old)} to ${fmtHz(old * 2)}. M fell from ${before.M.toFixed(3)} to ${after.M.toFixed(3)} and the phase lag angle grew from ${before.lag.toFixed(1)}° to ${after.lag.toFixed(1)}°. Both depend on ωτ, so a higher ω always gives a smaller output with a larger phase angle. The time delay in seconds actually fell, from ${fmtTime(before.dt)} to ${fmtTime(after.dt)}: the angle grows, but each cycle is shorter. At low frequency the delay approaches τ.${small}`;
    control('guess').value = '';
  }
  function onClick(event) {
    const preset = event.target.closest('[data-preset]')?.dataset.preset;
    if (preset === 'lecture') { changed(); setState({ tau: 0.2, f: 2 / (2 * Math.PI) }); view('feedback').textContent = 'Loaded τ = 0.2 s with ω = 2 rad/s. Expect M ≈ 0.93 and a 21.8° lag.'; return; }
    if (preset === 'design') { changed(); setState({ tau: tauMax(0.05, hzToRad(100)), f: 100 }); view('feedback').textContent = 'Loaded τmax ≈ 0.52 ms at 100 Hz. Expect M = 0.95, a dynamic error of −5%.'; return; }
    if (event.target.closest('[data-action="load-calc"]')) { const r = renderCalc(); if (r) { changed(); setState({ tau: r.t, f: r.fmax }); } return; }
    if (event.target.closest('[data-action="reset"]')) {
      control('guess').value = ''; predictionApplied = false;
      for (const [k, v] of Object.entries({ err: 5, fmax: 100, fcheck: 50 })) calc(k).value = v;
      setState({ ...DEFAULTS }); view('feedback').textContent = 'Sensor reset to τ = 0.2 s, f = 1 Hz.';
    }
  }

  root.addEventListener('input', onInput); root.addEventListener('submit', onSubmit); root.addEventListener('click', onClick);
  syncSliders(); render();
  let lastWidth = root.clientWidth;
  const resizeObserver = new ResizeObserver(() => { if (root.clientWidth !== lastWidth) { lastWidth = root.clientWidth; render(); } });
  resizeObserver.observe(root);
  return () => { resizeObserver.disconnect(); root.removeEventListener('input', onInput); root.removeEventListener('submit', onSubmit); root.removeEventListener('click', onClick); root.replaceChildren(); root.classList.remove('module-two'); };
}

function ticks(a, b, n) { return Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n); }
function curve(f, a, b, fr, n = 360) {
  return Array.from({ length: n + 1 }, (_, i) => { const t = a + (b - a) * i / n; return `${i ? 'L' : 'M'}${fr.x(t).toFixed(2)},${fr.y(f(t)).toFixed(2)}`; }).join(' ');
}
function cutLine(fr, c, top, bottom) { return `<line class="m2-cutline" x1="${fr.x(c)}" x2="${fr.x(c)}" y1="${fr.y(top)}" y2="${fr.y(bottom)}"/>`; }
// Axes, grid and labels; returns the coordinate maps so callers can add their own paths.
function frame({ width = 760, height = 300, xmin, xmax, ymin, ymax, xticks, yticks, xfmt, yfmt, xlabel, ylabel, title }) {
  const W = width, H = height, L = width < 500 ? 52 : 70, R = 22, T = 30, B = 50, w = W - L - R, h = H - T - B;
  const x = v => L + (v - xmin) / (xmax - xmin) * w, y = v => T + (ymax - v) / (ymax - ymin) * h;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}"><title>${title}</title>`;
  for (const t of xticks) svg += `<line class="m2-grid" x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H - B}"/><text x="${x(t)}" y="${H - B + 22}" text-anchor="middle">${xfmt(t)}</text>`;
  for (const v of yticks) svg += `<line class="m2-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 9}" y="${y(v) + 4}" text-anchor="end">${yfmt(v)}</text>`;
  svg += `<text x="${L}" y="16">${ylabel}</text><text x="${L + w / 2}" y="${H - 6}" text-anchor="middle">${xlabel}</text>`;
  return { open: svg, x, y };
}
