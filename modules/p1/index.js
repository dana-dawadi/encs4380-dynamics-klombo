import { run, validate, theory, filterTime } from '../control/sim.js';
import { lineChart, fmt, fmtTime } from '../control/plot.js';

// Lecture validation plant, our Micromouse drive motor, and Module 3's second-order example.
const PRESETS = {
  lecture: { plantType: 'first', K: 1, tau: 1, Kp: 9, Ki: 0, Kd: 0, r: 1, limit: true, uMin: -10, uMax: 10, motor: false },
  motor: { plantType: 'first', K: 0.65, tau: 0.06, Kp: 2, Ki: 60, Kd: 0, r: 30, limit: true, uMin: 0, uMax: 100, motor: true },
  second: { plantType: 'second', K: 1, zeta: 0.5, wn: 2, Kp: 5, Ki: 0, Kd: 0, r: 1, limit: true, uMin: -10, uMax: 10, motor: false },
};
const DEFAULTS = { plantType: 'first', K: 1, tau: 1, zeta: 0.5, wn: 2, Kp: 9, Ki: 0, Kd: 0, r: 1, limit: true, uMin: -10, uMax: 10, motor: false };
const SLIDERS = {
  K: ['Plant gain K', 0.05, 5, 0.05], tau: ['Time constant τ', 0.01, 5, 0.01, 's'], zeta: ['Damping ratio ζ', 0.05, 2, 0.05], wn: ['Natural frequency ωn', 0.5, 20, 0.5, 'rad/s'],
  Kp: ['Proportional gain Kp', 0, 20, 0.1], Ki: ['Integral gain Ki', 0, 100, 0.1], Kd: ['Derivative gain Kd', 0, 2, 0.01], r: ['Setpoint step r', 0.1, 50, 0.1],
};
// Two guided experiments: P → PI on the lecture plant, then PI → PID on the second-order plant.
const QUESTIONS = {
  i: { setup: { ...PRESETS.lecture }, apply: { Ki: 20 }, title: 'Add an integral term', text: 'The lecture plant (K = 1, τ = 1 s) with P only, Kp = 9, settles 10% short. What happens to that error if you add Ki = 20?',
    options: [['zero', 'The error goes to zero'], ['half', 'The error halves to about 5%'], ['same', 'The error stays at 10%; only the speed changes']], correct: 'zero' },
  d: { setup: { ...PRESETS.second, Kp: 5, Ki: 5 }, apply: { Kd: 1 }, title: 'Add a derivative term', text: 'The second-order plant (ζ = 0.5, ωn = 2 rad/s) with Kp = 5 and Ki = 5 overshoots a lot. What happens to the overshoot if you add Kd = 1?',
    options: [['down', 'The overshoot falls'], ['up', 'The overshoot grows'], ['same', 'The overshoot stays the same; only the error changes']], correct: 'down' },
};
let instance = 0;

// Same interface as the HW1 modules: mount(root) returns a cleanup function.
export function mount(root) {
  const prefix = `p1-${++instance}`;
  const id = name => `${prefix}-${name}`;
  const state = { ...DEFAULTS };
  let question = 'i', applied = false, frame = 0;
  root.classList.add('control-p1');
  root.innerHTML = `
    <header class="p1-heading"><p class="p1-eyebrow">CONTROL · P1 / PID PLAYGROUND</p><h1>Feedback makes a slow plant fast and accurate.</h1>
      <p>Close the loop around a plant from Module 1 or Module 3. Change Kp, Ki and Kd and watch the output follow the setpoint, the control signal hit its limit, and the four performance numbers move.</p>
      <div class="p1-equation">u(t) = Kp·e + Ki∫e dt + Kd·de/dt <span>e = r − y</span></div></header>
    <div class="p1-workspace">
      <section class="p1-controls" aria-labelledby="${id('controls')}"><h2 id="${id('controls')}">Set up the loop</h2>
        <p class="p1-label">Presets</p>
        <div class="p1-presets">
          <button type="button" class="p1-secondary" data-preset="lecture">Lecture: K = 1, τ = 1 s, Kp = 9</button>
          <button type="button" class="p1-secondary" data-preset="motor">Our Micromouse motor</button>
          <button type="button" class="p1-secondary" data-preset="second">Second order (Module 3)</button>
        </div>
        <label for="${id('plantType')}">Plant</label>
        <select id="${id('plantType')}" data-control="plantType"><option value="first">First order: K / (τs + 1)</option><option value="second">Second order: Kωn² / (s² + 2ζωn s + ωn²)</option></select>
        <div class="p1-group" data-group="first">${slider('K')}${slider('tau')}</div>
        <div class="p1-group" data-group="second" hidden>${slider('K', 'K2')}${slider('zeta')}${slider('wn')}</div>
        <h3>Controller</h3>${slider('Kp')}${slider('Ki')}${slider('Kd')}
        <h3>Setpoint and limit</h3>${slider('r')}
        <label class="p1-check"><input type="checkbox" data-control="limit"> Limit the control signal u</label>
        <div class="p1-limits"><div><label for="${id('uMin')}">u min</label><input id="${id('uMin')}" type="number" step="any" data-control="uMin" inputmode="decimal"></div><div><label for="${id('uMax')}">u max</label><input id="${id('uMax')}" type="number" step="any" data-control="uMax" inputmode="decimal"></div></div>
        <p class="p1-warning" data-view="limit-error" role="status"></p>
        <button type="button" data-action="reset" class="p1-secondary">Reset</button>
        <p class="p1-note" data-view="units"></p>
      </section>
      <div class="p1-results">
        <section class="p1-card" aria-labelledby="${id('diagram')}"><div class="p1-chart-heading"><h2 id="${id('diagram')}">Block diagram</h2><span>Unity feedback</span></div><div data-view="diagram"></div></section>
        <section class="p1-card" aria-labelledby="${id('response')}"><div class="p1-chart-heading"><h2 id="${id('response')}">Output against setpoint</h2><span data-view="window"></span></div>
          <div data-view="y-chart"></div><div class="p1-legend"><span class="p1-l-set">Setpoint r</span><span class="p1-l-out">Output y(t)</span><span class="p1-l-band">±2% band</span><span class="p1-l-settle">Settling time</span></div>
          <div class="p1-status" data-view="status"></div>
          <div class="p1-metrics" data-view="metrics"></div>
          <p class="p1-formula" data-view="theory"></p></section>
        <section class="p1-card" aria-labelledby="${id('control')}"><div class="p1-chart-heading"><h2 id="${id('control')}">Control signal u(t)</h2><span data-view="sat"></span></div>
          <div data-view="u-chart"></div><div class="p1-legend"><span class="p1-l-u">Control signal u</span><span class="p1-l-limit">Limit</span></div>
          <p class="p1-note" data-view="u-note"></p></section>
      </div>
    </div>
    <section class="p1-predict" aria-labelledby="${id('predict')}"><div><p class="p1-eyebrow">PREDICT, THEN CHECK</p><h2 id="${id('predict')}">What does each term do?</h2>
      <div class="p1-tabs" role="group" aria-label="Experiment">${Object.entries(QUESTIONS).map(([k, q], i) => `<button type="button" class="p1-tab" data-question="${k}">${i + 1}. ${q.title}</button>`).join('')}</div>
      <p data-view="q-text"></p><p class="p1-note">Choosing an experiment loads its starting loop into the plots.</p></div>
      <form data-form="prediction"><label for="${id('guess')}">Your prediction</label><select id="${id('guess')}" data-control="guess"></select><button type="submit">Apply and check</button><p data-view="feedback" role="status"></p></form></section>
    <section class="p1-card p1-effects" aria-labelledby="${id('effects')}"><p class="p1-eyebrow">WHAT THE LECTURE SAYS</p><h2 id="${id('effects')}">Effect of increasing each gain</h2>
      <div class="p1-table-wrap"><table><caption>Typical effect of raising one gain, the others fixed</caption><thead><tr><th scope="col">Gain</th><th scope="col">Rise time</th><th scope="col">Overshoot</th><th scope="col">Settling time</th><th scope="col">Steady-state error</th></tr></thead>
      <tbody><tr><th scope="row">Kp</th><td>Decreases</td><td>Increases</td><td>Small change</td><td>Decreases, never zero</td></tr><tr><th scope="row">Ki</th><td>Decreases</td><td>Increases</td><td>Increases</td><td>Eliminated, if the loop is stable and u is not stuck at its limit</td></tr><tr><th scope="row">Kd</th><td>Small change</td><td>Decreases</td><td>Decreases</td><td>No effect</td></tr></tbody></table></div>
      <p class="p1-note">These are tendencies, not laws. Try Kd on the first-order plant: it mostly slows the loop a little. Its damping shows clearly on the second-order plant, which can oscillate on its own.</p></section>
    <section class="p1-card" aria-labelledby="${id('validation')}"><p class="p1-eyebrow">CHECK THE MODEL</p><h2 id="${id('validation')}">Homework 2 validation</h2>
      <p>Plant K/(τs + 1) with K = 1 and τ = 1 s, no limit on u. Every row except the two PI formulas is measured from the RK4 simulation that draws the plots. Check 3 holds for a stable loop whose actuator is not stuck at a limit: a PI loop on this plant is stable for any positive gains.</p>
      <div class="p1-table-wrap"><table><caption>Validation checks 1–3</caption><thead><tr><th scope="col">Check</th><th scope="col">Expected</th><th scope="col">Calculated</th><th scope="col">Result</th></tr></thead><tbody data-view="validation"></tbody></table></div></section>`;

  function slider(name, key = name) {
    const [label, min, max, step] = SLIDERS[name];
    return `<div class="p1-slider"><label for="${id(key)}">${label}</label><output for="${id(key)}" data-output="${key}"></output><input id="${id(key)}" data-control="${key}" type="range" min="${min}" max="${max}" step="${step}"><span>${min}</span><span>${max}</span></div>`;
  }
  const control = name => root.querySelector(`[data-control="${name}"]`);
  const view = name => root.querySelector(`[data-view="${name}"]`);
  const yUnit = () => state.motor ? 'rad/s' : 'units';
  const uUnit = () => state.motor ? '% PWM' : 'units';

  function sync() {
    for (const k of ['K', 'tau', 'zeta', 'wn', 'Kp', 'Ki', 'Kd', 'r']) control(k).value = state[k];
    control('K2').value = state.K;
    control('plantType').value = state.plantType;
    control('limit').checked = state.limit;
    control('uMin').value = state.uMin; control('uMax').value = state.uMax;
  }

  function render() {
    frame = 0;
    const first = state.plantType === 'first';
    root.querySelector('[data-group="first"]').hidden = !first;
    root.querySelector('[data-group="second"]').hidden = first;
    for (const k of ['K', 'K2', 'tau', 'zeta', 'wn', 'Kp', 'Ki', 'Kd', 'r']) {
      const name = k === 'K2' ? 'K' : k, unit = name === 'r' ? yUnit() : SLIDERS[name][4] || '';
      const text = `${fmt(state[name])}${unit ? ' ' + unit : ''}`;
      root.querySelector(`[data-output="${k}"]`).textContent = text;
      control(k).setAttribute('aria-valuetext', text);
    }
    control('uMin').disabled = control('uMax').disabled = !state.limit;
    const limitOk = !state.limit || state.uMax > state.uMin;
    view('limit-error').textContent = limitOk ? '' : 'u max must be greater than u min. The limit is ignored until it is.';
    view('units').textContent = state.motor
      ? 'Motor preset: y is wheel speed in rad/s and u is the PWM duty in %. K = 0.65 (rad/s)/% is calculated from the datasheet no-load speed (500 RPM at 6 V), scaled linearly to the 7.4 V battery, so it is a no-load value. τ = 0.06 s is an approximate estimate, not a datasheet value. The limit 0–100% is the PWM range.'
      : 'Zero initial conditions. y and u are in the plant\'s own units; for K = 1 they share one unit.';

    const plant = first ? { type: 'first', K: state.K, tau: state.tau } : { type: 'second', K: state.K, zeta: state.zeta, wn: state.wn };
    const useLimit = state.limit && limitOk;
    const { sim, m } = run({ plant, Kp: state.Kp, Ki: state.Ki, Kd: state.Kd, r: state.r, uMin: useLimit ? state.uMin : -Infinity, uMax: useLimit ? state.uMax : Infinity });
    const { t, y, u } = sim, n = y.length;
    const last = t[n - 1];
    const span = m.settled ? Math.max(1.6 * m.settlingTime, 4 * (m.tau63 || 0), 0.03 * sim.T, 1e-3) : last;
    const end = Math.min(last, span) || last;
    const scale = end < 1 ? 1000 : 1, tUnit = end < 1 ? 'ms' : 's';
    view('window').textContent = `0–${fmt(end * scale)} ${tUnit}`;
    const width = el => Math.min(860, Math.max(280, view(el).clientWidth));

    // Output plot: range covers the setpoint and the visible part of y.
    let lo = 0, hi = state.r;
    for (let i = 0; i < n && t[i] <= end; i++) { lo = Math.min(lo, y[i]); hi = Math.max(hi, y[i]); }
    const cap = 4 * Math.abs(state.r);
    lo = Math.max(lo, -cap); hi = Math.min(hi, cap);
    const pad = (hi - lo) * 0.1 || 0.1;
    view('y-chart').innerHTML = lineChart({
      width: width('y-chart'), xmax: end, ymin: lo - pad, ymax: hi + pad, xscale: scale, xlabel: `Time (${tUnit})`, ylabel: `Output (${yUnit()})`, prefix: `${prefix}-y`,
      title: `Closed-loop output for Kp ${state.Kp}, Ki ${state.Ki}, Kd ${state.Kd}`,
      band: m.settled ? [m.final * 0.98, m.final * 1.02] : null,
      hlines: [{ y: state.r, cls: 'ct-set', label: `r = ${fmt(state.r)}` }],
      vlines: m.settlingTime ? [{ x: m.settlingTime, cls: 'ct-settle' }] : [],
      series: [{ x: t, y, cls: 'ct-out' }],
      dots: m.peakTime ? [{ x: m.peakTime, y: m.final * (1 + m.overshoot / 100), cls: 'ct-peak' }] : [],
    });

    // Control-signal plot with its limit lines.
    let ulo = useLimit ? state.uMin : 0, uhi = useLimit ? state.uMax : 0, satCount = 0, count = 0;
    for (let i = 0; i < n && t[i] <= end; i++) {
      if (!useLimit) { ulo = Math.min(ulo, u[i]); uhi = Math.max(uhi, u[i]); }
      if (useLimit && i > 0 && (u[i] >= state.uMax - 1e-9 || u[i] <= state.uMin + 1e-9)) satCount++;
      count++;
    }
    if (!useLimit) { const c = Math.max(Math.abs(ulo), Math.abs(uhi), 1) * 1.1; ulo = Math.max(ulo, -c); uhi = Math.min(uhi, c); }
    const upad = (uhi - ulo) * 0.08 || 0.1;
    view('u-chart').innerHTML = lineChart({
      width: width('u-chart'), height: 240, xmax: end, ymin: ulo - upad, ymax: uhi + upad, xscale: scale, xlabel: `Time (${tUnit})`, ylabel: `u (${uUnit()})`, prefix: `${prefix}-u`,
      title: 'Control signal with its limits',
      hlines: useLimit ? [{ y: state.uMax, cls: 'ct-limit', label: `u max = ${fmt(state.uMax)}` }, { y: state.uMin, cls: 'ct-limit', label: `u min = ${fmt(state.uMin)}` }] : [],
      series: [{ x: t, y: u, cls: 'ct-u' }],
    });
    const satPct = count ? satCount / count * 100 : 0;
    view('sat').textContent = useLimit ? `At the limit ${fmt(satPct, 2)}% of the time` : 'No limit';
    view('u-note').textContent = (state.Kd > 0 ? `The derivative is filtered, Kd·s/(Tf·s + 1) with Tf = ${fmtTime(filterTime(plant, state.Kd))}, so the step in r gives a short spike in u (derivative kick) instead of an infinite one. ` : '')
      + (useLimit && satPct > 0 ? 'While u sits on its limit the loop is open: the plant gets the most the actuator can give, and the integral keeps growing (windup, handled in P3).' : useLimit ? 'u never reaches its limit, so the loop behaves linearly.' : 'Without a limit, u can take any value: a real actuator cannot.');

    // Live metrics, read from the simulated curve.
    const st = { settled: ['ok', 'Settled'], slow: ['warn', 'Still settling at the end of the run: a very slow mode (try a larger Ki)'], oscillating: ['warn', 'Not settled: still oscillating at the end of the run'], unstable: ['bad', 'Unstable: the output grows without bound'] }[m.status];
    // Settled means settled around the final value; reaching the setpoint is a separate question.
    const offTarget = m.settled && Math.abs(m.sse) >= 0.05;
    const stuck = offTarget && useLimit && (u[n - 1] >= state.uMax - 1e-9 || u[n - 1] <= state.uMin + 1e-9);
    view('status').className = `p1-status p1-${offTarget ? 'warn' : st[0]}`;
    view('status').textContent = m.settled
      ? (offTarget
        ? `Settled, but not at the setpoint: y stays at ${fmt(m.final, 4)}, ${fmt(Math.abs(m.sse))}% ${m.sse > 0 ? 'below' : 'above'} r. ` + (stuck
          ? `u is stuck at its limit (${fmt(u[n - 1])} ${uUnit()}), so the actuator cannot push y any further. Even an integral term cannot remove this error: the setpoint is out of reach.`
          : 'Settling time is measured around this final value, not the setpoint.')
        : 'Settled at the setpoint (within ±2%).')
      : st[1] + (m.status === 'oscillating' && satPct > 0 ? '. u keeps hitting its limit, which stops the swing from growing: a limit cycle. Turn the limit off to see whether the linear loop is unstable.' : '');
    const unstable = m.status === 'unstable';
    view('metrics').innerHTML = [
      ['Rise time (10–90%)', unstable ? '—' : fmtTime(m.riseTime), 'Of the final value'],
      ['Overshoot', unstable ? '—' : `${fmt(m.overshoot, 3)}%`, m.peakTime ? `Peak at ${fmtTime(m.peakTime)}` : 'No peak above the final value'],
      ['Settling time (2%)', fmtTime(m.settlingTime), 'Within ±2% of the final value'],
      ['Steady-state error', m.sse === null ? '—' : `${fmt(Math.abs(m.sse) < 5e-3 ? 0 : m.sse, 3)}%`, m.final === null ? 'No final value' : `Final y = ${fmt(m.final, 4)}`],
    ].map(([a, b, c]) => `<div><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('');

    // Theory next to the simulation for the cases the lecture solves by hand.
    if (first && state.Kd === 0 && !(useLimit && satPct > 0)) {
      const th = theory(plant, state.Kp, state.Ki);
      view('theory').textContent = th.kind === 'P'
        ? `Theory (P only): τcl = τ/(1 + KKp) = ${fmtTime(th.tau)}, ess = 1/(1 + KKp) = ${fmt(th.sse)}%.  Simulation: 63.2% time = ${fmtTime(m.tau63)}, ess = ${m.sse === null ? '—' : fmt(m.sse) + '%'}.`
        : `Theory (PI): τs² + (1 + KKp)s + KKi = 0, so ωn = ${fmt(th.wn)} rad/s and ζ = ${fmt(th.zeta)} (${th.zeta < 0.999 ? 'underdamped' : th.zeta > 1.001 ? 'overdamped' : 'critically damped'}); ess = 0. The PI zero at s = −Ki/Kp also shapes the step.`;
    } else {
      view('theory').textContent = !first ? 'Second-order plant: the closed loop is third order with PI or PID, so the curve comes from the RK4 simulation.'
        : state.Kd > 0 ? 'With Kd the hand formulas no longer apply directly; the curve comes from the RK4 simulation.'
        : 'u reaches its limit, so the loop is nonlinear and the linear formulas no longer hold; the curve comes from the RK4 simulation.';
    }
    view('diagram').innerHTML = diagram(width('diagram'), first, useLimit);
  }

  function diagram(width, first, limited) {
    const g = `Kp ${fmt(state.Kp)} · Ki ${fmt(state.Ki)} · Kd ${fmt(state.Kd)}`;
    const p = first ? `${fmt(state.K)} / (${state.tau === 1 ? '' : fmt(state.tau)}s + 1)` : `K = ${fmt(state.K)}, ζ = ${fmt(state.zeta)}, ωn = ${fmt(state.wn)}`;
    const lim = limited ? `[${fmt(state.uMin)}, ${fmt(state.uMax)}]` : 'none';
    const box = (x, y, w, h, title, sub, cls = '') => `<rect class="bd-box ${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/><text class="bd-title" x="${x + w / 2}" y="${y + h / 2 - 4}" text-anchor="middle">${title}</text><text class="bd-sub" x="${x + w / 2}" y="${y + h / 2 + 14}" text-anchor="middle">${sub}</text>`;
    const arrow = (d, label, lx, ly) => `<path class="bd-wire" d="${d}" marker-end="url(#${prefix}-arrow)"/>${label ? `<text class="bd-signal" x="${lx}" y="${ly}" text-anchor="middle">${label}</text>` : ''}`;
    const defs = `<defs><marker id="${prefix}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="bd-head"/></marker></defs>`;
    const title = `<title>Block diagram: setpoint r, summing junction, PID controller, actuator limit ${lim}, plant, output y fed back</title>`;
    if (width >= 620) {
      return `<svg viewBox="0 0 860 170" role="img" aria-label="Closed-loop block diagram">${title}${defs}
        <text class="bd-signal" x="18" y="62">r</text>${arrow('M30,58 H86', '', 0, 0)}
        <circle class="bd-sum" cx="104" cy="58" r="17"/><text class="bd-sign" x="72" y="50" text-anchor="middle">+</text><text class="bd-sign" x="116" y="96" text-anchor="middle">−</text>
        ${arrow('M121,58 H180', 'e', 150, 48)}${box(182, 26, 188, 64, 'PID', g)}
        ${arrow('M370,58 H420', 'u', 395, 48)}${box(422, 26, 140, 64, 'Limit', lim, 'bd-lim')}
        ${arrow('M562,58 H612', '', 0, 0)}${box(614, 26, 182, 64, first ? 'Plant G(s)' : 'Plant (2nd order)', p)}
        ${arrow('M796,58 H850', 'y', 822, 48)}
        <path class="bd-wire" d="M824,58 V138 H104 V77" marker-end="url(#${prefix}-arrow)"/><text class="bd-signal" x="460" y="156" text-anchor="middle">feedback: y</text></svg>`;
    }
    return `<svg viewBox="0 0 360 300" role="img" aria-label="Closed-loop block diagram">${title}${defs}
      <text class="bd-signal" x="14" y="48">r</text>${arrow('M24,44 H62', '', 0, 0)}
      <circle class="bd-sum" cx="80" cy="44" r="16"/><text class="bd-sign" x="50" y="36" text-anchor="middle">+</text><text class="bd-sign" x="92" y="80" text-anchor="middle">−</text>
      ${arrow('M96,44 H130', 'e', 113, 34)}${box(132, 12, 214, 64, 'PID', g)}
      ${arrow('M240,76 V114', 'u', 252, 99)}${box(132, 116, 214, 56, 'Limit', lim, 'bd-lim')}
      ${arrow('M240,172 V200', '', 0, 0)}${box(132, 202, 214, 64, first ? 'Plant G(s)' : 'Plant (2nd order)', p)}
      <path class="bd-wire" d="M132,234 H80 V62" marker-end="url(#${prefix}-arrow)"/><text class="bd-signal" x="70" y="160" text-anchor="end">y</text></svg>`;
  }

  function schedule() { if (!frame) frame = requestAnimationFrame(render); }
  function changed() { if (applied) view('feedback').textContent = 'Loop changed. Pick an experiment to try again.'; applied = false; }
  function setState(next) { Object.assign(state, next); sync(); schedule(); }

  function loadQuestion(key) {
    question = key; applied = false;
    const q = QUESTIONS[key];
    root.querySelectorAll('[data-question]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.question === key)));
    view('q-text').textContent = q.text;
    control('guess').innerHTML = `<option value="">Choose an answer…</option>` + q.options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    view('feedback').textContent = '';
    setState({ ...DEFAULTS, ...q.setup });
  }

  function onInput(event) {
    const el = event.target;
    if (!el.matches('[data-control]') || el === control('guess')) return;
    const key = el.dataset.control;
    // Changing the plant itself means it is no longer our motor, so drop the motor units.
    if (['plantType', 'K', 'K2', 'tau'].includes(key)) state.motor = false;
    if (key === 'plantType') state.plantType = el.value;
    else if (key === 'limit') state.limit = el.checked;
    else if (key === 'K2') { state.K = +el.value; control('K').value = state.K; }
    else if (key === 'uMin' || key === 'uMax') { if (el.value.trim() === '' || !Number.isFinite(+el.value)) return; state[key] = +el.value; }
    else { state[key] = +el.value; if (key === 'K') control('K2').value = state.K; }
    changed(); schedule();
  }
  function onSubmit(event) {
    event.preventDefault();
    const q = QUESTIONS[question], guess = control('guess').value;
    if (!guess) { view('feedback').textContent = 'Choose your prediction before checking.'; control('guess').focus(); return; }
    Object.assign(state, q.setup);
    const plant = q.setup.plantType === 'first' ? { type: 'first', K: q.setup.K, tau: q.setup.tau } : { type: 'second', K: q.setup.K, zeta: q.setup.zeta, wn: q.setup.wn };
    const opts = { plant, Kp: q.setup.Kp, Ki: q.setup.Ki, Kd: q.setup.Kd, r: q.setup.r, uMin: q.setup.uMin, uMax: q.setup.uMax };
    const before = run(opts).m, after = run({ ...opts, ...q.apply }).m;
    setState(q.apply); applied = true;
    const ok = guess === q.correct ? 'Correct.' : 'Not quite.';
    view('feedback').textContent = question === 'i'
      ? `${ok} The steady-state error went from ${fmt(before.sse)}% to ${fmt(Math.abs(after.sse) < 5e-3 ? 0 : after.sse)}%. The integral keeps growing while any error remains, so the loop can only rest at e = 0. The price: overshoot went from ${fmt(before.overshoot)}% to ${fmt(after.overshoot)}%. Try experiment 2 to calm it.`
      : `${ok} The overshoot fell from ${fmt(before.overshoot)}% to ${fmt(after.overshoot)}%, and settling went from ${fmtTime(before.settlingTime)} to ${fmtTime(after.settlingTime)}. D reacts to how fast the error is shrinking and brakes before the output overshoots. The steady-state error stays at 0: D cannot change it, because de/dt = 0 at rest.`;
    control('guess').value = '';
  }
  function onClick(event) {
    const preset = event.target.closest('[data-preset]')?.dataset.preset;
    if (preset) { changed(); view('feedback').textContent = ''; setState({ ...DEFAULTS, ...PRESETS[preset] }); return; }
    const q = event.target.closest('[data-question]')?.dataset.question;
    if (q) { loadQuestion(q); return; }
    if (event.target.closest('[data-action="reset"]')) { applied = false; loadQuestion('i'); view('feedback').textContent = 'Reset to the lecture plant with P only, Kp = 9.'; }
  }

  view('validation').innerHTML = validate().map(r => `<tr><th scope="row">${r.label}</th><td>${r.expected.toFixed(r.digits)}${r.unit}</td><td>${r.actual.toFixed(r.digits + 2)}${r.unit}</td><td class="p1-pass">${r.pass ? 'PASS' : 'FAIL'}</td></tr>`).join('');
  root.addEventListener('input', onInput); root.addEventListener('submit', onSubmit); root.addEventListener('click', onClick);
  loadQuestion('i'); render();
  let lastWidth = root.clientWidth;
  const resizeObserver = new ResizeObserver(() => { if (root.clientWidth !== lastWidth) { lastWidth = root.clientWidth; schedule(); } });
  resizeObserver.observe(root);
  return () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); root.removeEventListener('input', onInput); root.removeEventListener('submit', onSubmit); root.removeEventListener('click', onClick); root.replaceChildren(); root.classList.remove('control-p1'); };
}
