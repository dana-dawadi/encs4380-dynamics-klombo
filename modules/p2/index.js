import { run, filterTime, horizon } from '../control/sim.js';
import { sensorTheory, poles } from '../control/analysis.js';
import { lineChart, fmt, fmtTime } from '../control/plot.js';
import { responseMetrics } from '../module3/calculations.js';
import { TAU_RANGE, plantOf, runLoop, sensorMetrics, stabilityMap, sweep, controllerView, validate } from './model.js';

// P1's lecture loop (after its experiment 1), our Micromouse motor read through the encoder, and Module 3's plant.
const PRESETS = {
  lecture: { plantType: 'first', K: 1, tau: 1, Kp: 9, Ki: 20, Kd: 0, r: 1, sensorTau: 0.1, ideal: false, limit: false, uMin: -10, uMax: 10, motor: false },
  motor: { plantType: 'first', K: 0.65, tau: 0.06, Kp: 2, Ki: 60, Kd: 0, r: 30, sensorTau: 0.01, ideal: false, limit: true, uMin: 0, uMax: 100, motor: true },
  second: { plantType: 'second', K: 1, zeta: 0.5, wn: 2, Kp: 5, Ki: 0, Kd: 0, r: 1, sensorTau: 0.05, ideal: false, limit: false, uMin: -10, uMax: 10, motor: false },
};
const DEFAULTS = { plantType: 'first', K: 1, tau: 1, zeta: 0.5, wn: 2, ...PRESETS.lecture };
const SLIDERS = {
  K: ['Plant gain K', 0.05, 5, 0.05], tau: ['Time constant τ', 0.01, 5, 0.01, 's'], zeta: ['Damping ratio ζ', 0.05, 2, 0.05], wn: ['Natural frequency ωn', 0.5, 20, 0.5, 'rad/s'],
  Kp: ['Proportional gain Kp', 0, 20, 0.1], Ki: ['Integral gain Ki', 0, 100, 0.1], Kd: ['Derivative gain Kd', 0, 2, 0.01], r: ['Setpoint step r', 0.1, 50, 0.1],
};
// Three guided experiments on the lecture loop: slow the sensor, compare the two curves, fix the oscillation.
const QUESTIONS = {
  grow: { setup: { ...PRESETS.lecture, sensorTau: 0.1 }, apply: { sensorTau: 0.5 }, title: 'Slow the sensor down',
    text: 'P1\'s loop (K = 1, τ = 1 s, Kp = 9, Ki = 20) now reads y through a sensor with τs = 0.1 s. The gains stay the same. What happens to the overshoot of the true output if the sensor slows to τs = 0.5 s?',
    options: [['grows', 'The overshoot grows'], ['shrinks', 'The overshoot shrinks: a slow sensor smooths the signal, so the loop calms down'], ['same', 'No change: the gains decide the overshoot, not the sensor']], correct: 'grows' },
  truth: { setup: { ...PRESETS.lecture, sensorTau: 0.3 }, apply: {}, title: 'Sensor or truth?',
    text: 'Same loop with τs = 0.3 s. The controller only sees the sensor reading ym. Which curve overshoots the setpoint more: the true output y or the sensor reading ym?',
    options: [['true', 'The true output y'], ['sensor', 'The sensor reading ym'], ['equal', 'Both overshoot by the same amount; they end at the same value']], correct: 'true' },
  fix: { setup: { ...PRESETS.lecture, sensorTau: 1.5 }, apply: { sensorTau: 0.1 }, title: 'Fix the oscillation',
    text: 'With τs = 1.5 s the loop oscillates and the swing grows. You keep Kp = 9 and Ki = 20 and fit a sensor 15 times faster, τs = 0.1 s. What happens?',
    options: [['calm', 'The loop is stable again'], ['still', 'It still oscillates: the gains are too high, so only lowering them can help'], ['worse', 'It gets worse: a fast sensor makes the controller react harder']], correct: 'calm' },
};
const DECADES = [[1e-4, '0.1 ms'], [1e-3, '1 ms'], [1e-2, '10 ms'], [0.1, '0.1 s'], [1, '1 s'], [10, '10 s']];
let instance = 0;
// The critical τs comes from bisection, so 0.99999999995 s is shown as 1 s.
const fmtTs = v => fmtTime(Number(v.toPrecision(6)));

// Same interface as the other modules: mount(root) returns a cleanup function.
export function mount(root) {
  const prefix = `p2-${++instance}`;
  const id = name => `${prefix}-${name}`;
  const state = { ...DEFAULTS };
  let question = 'grow', applied = false, frame = 0, sweepTimer = 0, sweepKey = '', sweepData = null;
  root.classList.add('control-p2');
  root.innerHTML = `
    <header class="p2-heading"><p class="p2-eyebrow">CONTROL · P2 / A SLOW SENSOR IN THE LOOP</p><h1>The controller only controls what the sensor says.</h1>
      <p>Put Module 1's first-order sensor into P1's feedback path. The controller now sees the sensor reading y<sub>m</sub>, a delayed and smoothed copy of the true output y. Make the sensor slower and watch the true output overshoot more, until the loop oscillates.</p>
      <div class="p2-equation"><span class="p2-eq-main">e = r − y<sub>m</sub></span><span>τs·dy<sub>m</sub>/dt + y<sub>m</sub> = y</span></div></header>
    <div class="p2-workspace">
      <section class="p2-controls" aria-labelledby="${id('controls')}"><h2 id="${id('controls')}">Set up the loop</h2>
        <p class="p2-label">Presets</p>
        <div class="p2-presets">
          <button type="button" class="p2-secondary" data-preset="lecture">P1's loop: K = 1, τ = 1 s, Kp = 9, Ki = 20</button>
          <button type="button" class="p2-secondary" data-preset="motor">Our Micromouse motor, read by the encoder</button>
          <button type="button" class="p2-secondary" data-preset="second">Second order (Module 3), P only</button>
        </div>
        <h3>Sensor in the feedback path</h3>
        <div class="p2-slider p2-sensor"><label for="${id('sensorTau')}">Sensor time constant τs</label><output for="${id('sensorTau')}" data-output="sensorTau"></output><input id="${id('sensorTau')}" data-control="sensorTau" type="range" min="${Math.log10(TAU_RANGE[0])}" max="${Math.log10(TAU_RANGE[1])}" step="0.01"><span>0.1 ms</span><span>10 s</span></div>
        <label class="p2-check"><input type="checkbox" data-control="ideal"> Ideal sensor (τs = 0)</label>
        <p class="p2-note">H(s) = 1/(τs·s + 1): Module 1's sensor with gain 1. The slider is logarithmic, like Module 2's τ slider.</p>
        <h3>Controller</h3>${slider('Kp')}${slider('Ki')}${slider('Kd')}
        <h3>Plant</h3>
        <label for="${id('plantType')}">Plant</label>
        <select id="${id('plantType')}" data-control="plantType"><option value="first">First order: K / (τs + 1)</option><option value="second">Second order: Kωn² / (s² + 2ζωn s + ωn²)</option></select>
        <div class="p2-group" data-group="first">${slider('K')}${slider('tau')}</div>
        <div class="p2-group" data-group="second" hidden>${slider('K', 'K2')}${slider('zeta')}${slider('wn')}</div>
        <h3>Setpoint and limit</h3>${slider('r')}
        <label class="p2-check"><input type="checkbox" data-control="limit"> Limit the control signal u</label>
        <div class="p2-limits"><div><label for="${id('uMin')}">u min</label><input id="${id('uMin')}" type="number" step="any" data-control="uMin" inputmode="decimal"></div><div><label for="${id('uMax')}">u max</label><input id="${id('uMax')}" type="number" step="any" data-control="uMax" inputmode="decimal"></div></div>
        <p class="p2-warning" data-view="limit-error" role="status"></p>
        <button type="button" data-action="reset" class="p2-secondary">Reset</button>
        <p class="p2-note" data-view="units"></p>
      </section>
      <div class="p2-results">
        <section class="p2-card" aria-labelledby="${id('diagram')}"><div class="p2-chart-heading"><h2 id="${id('diagram')}">Block diagram</h2><span>The sensor sits in the feedback path</span></div><div data-view="diagram"></div></section>
        <section class="p2-card" aria-labelledby="${id('response')}"><div class="p2-chart-heading"><h2 id="${id('response')}">True output and sensor reading</h2><span data-view="window"></span></div>
          <div data-view="y-chart"></div><div class="p2-legend"><span class="p2-l-set">Setpoint r</span><span class="p2-l-out">True output y</span><span class="p2-l-meas">Sensor reading y<sub>m</sub></span><span class="p2-l-ghost" data-view="ghost-legend">y with an ideal sensor</span><span class="p2-l-cross">y first reaches r</span></div>
          <div class="p2-status" data-view="status" role="status"></div>
          <div class="p2-metrics" data-view="metrics"></div>
          <p class="p2-seen" data-view="seen"></p>
          <p class="p2-formula" data-view="theory"></p></section>
        <section class="p2-card" aria-labelledby="${id('sweep')}"><div class="p2-chart-heading"><h2 id="${id('sweep')}">Overshoot against sensor τs</h2><span>Same gains, logarithmic τs axis</span></div>
          <div data-view="sweep"></div><div class="p2-legend"><span class="p2-l-out">True output y</span><span class="p2-l-meas">Sensor reading y<sub>m</sub></span><span class="p2-l-unstable">Unstable (Routh–Hurwitz)</span><span class="p2-l-now">Current τs</span></div>
          <p class="p2-note" data-view="sweep-note"></p></section>
        <section class="p2-card" aria-labelledby="${id('control')}"><div class="p2-chart-heading"><h2 id="${id('control')}">Control signal u(t)</h2><span data-view="sat"></span></div>
          <div data-view="u-chart"></div><div class="p2-legend"><span class="p2-l-u">Control signal u</span><span class="p2-l-limit">Limit</span></div>
          <p class="p2-note" data-view="u-note"></p></section>
      </div>
    </div>
    <section class="p2-predict" aria-labelledby="${id('predict')}"><div><p class="p2-eyebrow">PREDICT, THEN CHECK</p><h2 id="${id('predict')}">What does sensor lag do to the loop?</h2>
      <div class="p2-tabs" role="group" aria-label="Experiment">${Object.entries(QUESTIONS).map(([k, q], i) => `<button type="button" class="p2-tab" data-question="${k}">${i + 1}. ${q.title}</button>`).join('')}</div>
      <p data-view="q-text"></p><p class="p2-note">Choosing an experiment loads its starting loop into the plots.</p></div>
      <form data-form="prediction"><label for="${id('guess')}">Your prediction</label><select id="${id('guess')}" data-control="guess"></select><button type="submit">Apply and check</button><p data-view="feedback" role="status"></p></form></section>
    <section class="p2-card p2-why" aria-labelledby="${id('why')}"><p class="p2-eyebrow">WHY IT HAPPENS</p><h2 id="${id('why')}">A slow sensor reports the past</h2>
      <ol>
        <li><strong>The controller acts on e = r − y<sub>m</sub>.</strong> It never sees y itself. In steady state a gain-1 sensor reads y exactly, so the final value does not change; only the transient does.</li>
        <li><strong>The reading lags.</strong> A first-order sensor follows a rising signal about τs behind it (Module 1: the ramp lag equals τ). So when y reaches r, y<sub>m</sub> is still below r.</li>
        <li><strong>The controller keeps pushing.</strong> It still sees a positive error, so u stays high and y carries on past r. That push is the extra overshoot.</li>
        <li><strong>The correction comes late.</strong> By the time the reading shows the overshoot, y is already on its way back, and the controller pulls too long the other way. More lag means bigger swings. Above the critical τs each swing is bigger than the last: the loop oscillates.</li>
      </ol>
      <p>In Laplace terms the sensor adds a pole, 1/(τs·s + 1), to the loop. With P only on a first-order plant the closed loop becomes second order, and y<sub>m</sub>/r is exactly Module 3's step response. With PI it becomes third order, and the Routh–Hurwitz test gives the τs at which a pair of poles reaches the jω axis.</p>
      <p data-view="rule" class="p2-formula"></p></section>
    <section class="p2-card" aria-labelledby="${id('validation')}"><p class="p2-eyebrow">CHECK THE MODEL</p><h2 id="${id('validation')}">P2 checks against the theory</h2>
      <p>The Homework 2 plant K/(τs + 1), K = 1, τ = 1 s, no limit on u. The sensor-reading overshoot uses Module 3's formula; the critical τs and frequency come from the Routh–Hurwitz test; every "RK4" value is measured from the same simulation that draws the plots.</p>
      <div class="p2-table-wrap"><table><caption>Sensor-in-the-loop checks</caption><thead><tr><th scope="col">Check</th><th scope="col">Expected</th><th scope="col">Calculated</th><th scope="col">Result</th></tr></thead><tbody data-view="validation"></tbody></table></div></section>`;

  function slider(name, key = name) {
    const [label, min, max, step] = SLIDERS[name];
    return `<div class="p2-slider"><label for="${id(key)}">${label}</label><output for="${id(key)}" data-output="${key}"></output><input id="${id(key)}" data-control="${key}" type="range" min="${min}" max="${max}" step="${step}"><span>${min}</span><span>${max}</span></div>`;
  }
  const control = name => root.querySelector(`[data-control="${name}"]`);
  const view = name => root.querySelector(`[data-view="${name}"]`);
  const yUnit = () => state.motor ? 'rad/s' : 'units';
  const uUnit = () => state.motor ? '% PWM' : 'units';
  const ts = () => state.ideal ? 0 : state.sensorTau;
  const loopOpts = () => {
    const useLimit = state.limit && state.uMax > state.uMin;
    return { plant: plantOf(state), Kp: state.Kp, Ki: state.Ki, Kd: state.Kd, r: state.r, uMin: useLimit ? state.uMin : -Infinity, uMax: useLimit ? state.uMax : Infinity };
  };

  function sync() {
    for (const k of ['K', 'tau', 'zeta', 'wn', 'Kp', 'Ki', 'Kd', 'r']) control(k).value = state[k];
    control('K2').value = state.K;
    control('sensorTau').value = Math.log10(state.sensorTau);
    control('ideal').checked = state.ideal;
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
    const tsText = state.ideal ? '0 (ideal)' : fmtTime(state.sensorTau);
    root.querySelector('[data-output="sensorTau"]').textContent = tsText;
    control('sensorTau').setAttribute('aria-valuetext', tsText);
    control('sensorTau').disabled = state.ideal;
    control('uMin').disabled = control('uMax').disabled = !state.limit;
    const limitOk = !state.limit || state.uMax > state.uMin;
    view('limit-error').textContent = limitOk ? '' : 'u max must be greater than u min. The limit is ignored until it is.';
    view('units').textContent = state.motor
      ? 'Motor preset: y is wheel speed in rad/s and u is the PWM duty in %, with the same K = 0.65 (rad/s)/% and τ = 0.06 s as P1 (K from the datasheet, τ an estimate). The sensor is the speed computed from encoder counts and smoothed in software; τs = 10 ms is an assumed filter setting, not a measurement.'
      : 'Zero initial conditions. y, ym and u are in the plant\'s own units.';

    const opts = loopOpts(), plant = opts.plant, useLimit = Number.isFinite(opts.uMax);
    const { sim, m: simM } = runLoop({ ...opts, sensorTau: ts() });
    // Without a limit the loop is linear, so Routh–Hurwitz decides: a swing that grows too slowly
    // for the simulated window to show it is still unstable.
    const m = !useLimit && simM.status === 'oscillating' && !stabilityMap(opts).stableAt(ts()) ? { ...simM, status: 'unstable', unstable: true, settled: false } : simM;
    const mm = sensorMetrics(sim);
    const ideal = ts() > 0 ? run({ ...opts, sensorTau: 0 }) : null;
    const map = stabilityMap(opts);
    const { t, y, ym, u } = sim, n = y.length, last = t[n - 1];

    // Time window: the settled response, or a few swings of an oscillation.
    let end;
    if (m.settled) end = Math.max(1.4 * m.settlingTime, 4 * (m.tau63 || 0), ideal?.m.settlingTime || 0, 1e-3);
    else end = Math.min(last, horizon(plant, state.Kp, state.Ki, ts()));
    end = Math.min(end, last) || last;
    // A growing swing: show about three swings, or until the envelope has grown about six times,
    // using the dominant closed-loop pole p = σ ± jω of the linear loop.
    if (m.status === 'unstable') {
      const { dominant } = poles({ ...opts, sensorTau: ts() }), w = Math.abs(dominant.im);
      const want = Math.min(w > 0 ? 3 * 2 * Math.PI / w : Infinity, dominant.re > 0 ? Math.log(6) / dominant.re + (w > 0 ? Math.PI / w : 0) : Infinity);
      if (Number.isFinite(want)) end = Math.min(last, want);
    }
    const scale = end < 1 ? 1000 : 1, tUnit = end < 1 ? 'ms' : 's';
    view('window').textContent = `0–${fmt(end * scale)} ${tUnit}`;
    const width = el => Math.min(860, Math.max(280, view(el).clientWidth));
    const seen = m.status === 'unstable' ? null : controllerView(sim);

    let lo = 0, hi = state.r;
    const grow = (tt, arr) => { for (let i = 0; i < arr.length && tt[i] <= end; i++) { lo = Math.min(lo, arr[i]); hi = Math.max(hi, arr[i]); } };
    grow(t, y); grow(t, ym); if (ideal) grow(ideal.sim.t, ideal.sim.y);
    const cap = (m.status === 'unstable' ? 100 : 5) * Math.abs(state.r);
    lo = Math.max(lo, -cap); hi = Math.min(hi, cap);
    const pad = (hi - lo) * 0.08 || 0.1;
    view('ghost-legend').hidden = !ideal;
    view('y-chart').innerHTML = lineChart({
      width: width('y-chart'), xmax: end, ymin: lo - pad, ymax: hi + pad, xscale: scale, xlabel: `Time (${tUnit})`, ylabel: `Output (${yUnit()})`, prefix: `${prefix}-y`,
      title: `True output and sensor reading for τs ${tsText}, Kp ${state.Kp}, Ki ${state.Ki}, Kd ${state.Kd}`,
      hlines: [{ y: state.r, cls: 'ct-set', label: `r = ${fmt(state.r)}` }],
      vlines: seen && seen.t <= end ? [{ x: seen.t, cls: 'ct-cross' }] : [],
      series: [...(ideal ? [{ x: ideal.sim.t, y: ideal.sim.y, cls: 'ct-ghost' }] : []), { x: t, y: ym, cls: 'ct-meas' }, { x: t, y, cls: 'ct-out' }],
      dots: seen && seen.t <= end ? [{ x: seen.t, y: seen.y, cls: 'ct-dot-out' }, { x: seen.t, y: seen.ym, cls: 'ct-dot-meas' }] : [],
    });

    // Control signal and its limit.
    let ulo = useLimit ? opts.uMin : 0, uhi = useLimit ? opts.uMax : 0, satCount = 0, count = 0;
    for (let i = 0; i < n && t[i] <= end; i++) {
      if (!useLimit) { ulo = Math.min(ulo, u[i]); uhi = Math.max(uhi, u[i]); }
      if (useLimit && i > 0 && (u[i] >= opts.uMax - 1e-9 || u[i] <= opts.uMin + 1e-9)) satCount++;
      count++;
    }
    if (!useLimit) { const c = Math.max(Math.abs(ulo), Math.abs(uhi), 1) * 1.1; ulo = Math.max(ulo, -c, -1e4); uhi = Math.min(uhi, c, 1e4); }
    const upad = (uhi - ulo) * 0.08 || 0.1;
    view('u-chart').innerHTML = lineChart({
      width: width('u-chart'), height: 220, xmax: end, ymin: ulo - upad, ymax: uhi + upad, xscale: scale, xlabel: `Time (${tUnit})`, ylabel: `u (${uUnit()})`, prefix: `${prefix}-u`,
      title: 'Control signal with its limits',
      hlines: useLimit ? [{ y: opts.uMax, cls: 'ct-limit', label: `u max = ${fmt(opts.uMax)}` }, { y: opts.uMin, cls: 'ct-limit', label: `u min = ${fmt(opts.uMin)}` }] : [],
      series: [{ x: t, y: u, cls: 'ct-u' }],
    });
    const satPct = count ? satCount / count * 100 : 0;
    view('sat').textContent = useLimit ? `At the limit ${fmt(satPct, 2)}% of the time` : 'No limit';
    view('u-note').textContent = (state.Kd > 0 ? `The derivative is filtered, Kd·s/(Tf·s + 1) with Tf = ${fmtTime(filterTime(plant, state.Kd))}, and acts on the sensor reading too. ` : '')
      + (useLimit && satPct > 0 ? 'While u sits on its limit the loop is open: the actuator gives all it can and the integral keeps growing. With a slow sensor this makes the overshoot even larger.' : useLimit ? 'u never reaches its limit, so the loop behaves linearly.' : 'No limit: u can take any value. A real actuator cannot, so a linearly unstable loop would end up in a limit cycle instead (tick the limit to see it).');

    // Status, metrics and the critical τs.
    const linearStable = map.stableAt(ts());
    const offTarget = m.settled && Math.abs(m.sse) >= 0.05;
    const critText = map.critical === null ? 'none up to 10 s' : fmtTs(map.critical);
    const msg = {
      settled: offTarget ? `Settled, but not at the setpoint: y stays at ${fmt(m.final, 4)}, ${fmt(Math.abs(m.sse))}% ${m.sse > 0 ? 'below' : 'above'} r.` + (state.Ki === 0 ? ' P only leaves this error with or without the sensor.' : '') : 'Settled at the setpoint (within ±2%).',
      slow: `Still settling at the end of the run: τs = ${tsText} is close to the critical value, so the swings die out very slowly.`,
      oscillating: !linearStable && useLimit ? `Oscillating: the linear loop is unstable at τs = ${tsText}, and the u limit holds the swing at a fixed size (a limit cycle). Untick the limit to see it grow.` : linearStable ? `Still oscillating at the end of the run: τs = ${tsText} is close to the critical τs = ${critText}, so the swings die out very slowly.` : `Oscillating: τs = ${tsText} is at the edge of stability (critical τs = ${critText}).`,
      unstable: `Unstable: each swing is bigger than the last. τs = ${tsText} is past the critical τs = ${critText}. Look at the sensor before blaming the gains.`,
    }[m.status];
    view('status').className = `p2-status p2-${m.status === 'settled' ? (offTarget ? 'warn' : 'ok') : m.status === 'unstable' ? 'bad' : 'warn'}`;
    view('status').textContent = msg;
    const unstable = m.status === 'unstable', band = map.intervals.find(([a, b]) => ts() >= a && ts() <= b);
    view('metrics').innerHTML = [
      ['True overshoot', unstable ? '—' : `${fmt(m.overshoot, 3)}%`, unstable ? 'The swing grows without bound' : m.peakTime ? `y peaks at ${fmtTime(m.peakTime)}` : 'No peak above the final value'],
      ['Sensor-reading overshoot', unstable ? '—' : `${fmt(mm.overshoot, 3)}%`, 'What the controller sees'],
      ['Settling time of y (2%)', fmtTime(m.settlingTime), m.final === null ? 'Not settled' : `Final y = ${fmt(m.final, 4)}`],
      ['Critical τs', critText, map.critical === null ? 'Sensor lag alone cannot make this loop unstable' : band ? 'Exceeded: the linear loop is unstable' : ts() < map.critical ? `Now at ${fmt(ts() / map.critical * 100, 2)}% of it` : `Unstable band ${fmtTs(map.intervals[0][0])}–${fmtTs(map.intervals[0][1])}`],
    ].map(([a, b, c]) => `<div><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('');

    // What the controller sees at the moment y first reaches r.
    view('seen').innerHTML = !seen ? (unstable ? 'The loop is unstable, so there is no steady picture of what the controller sees.' : 'The true output never reaches the setpoint here, so the sensor has nothing to hide: with P only the loop settles short of r.')
      : ts() === 0 ? `<strong>Ideal sensor:</strong> y<sub>m</sub> = y, so the controller sees the true error at every moment. Move the τs slider to add lag.`
      : `<strong>The controller only sees y<sub>m</sub>.</strong> At t = ${fmtTime(seen.t)} the true output reaches r = ${fmt(state.r)}, but the sensor still reads ${fmt(seen.ym, 3)} (${fmt(Math.abs(seen.e) / Math.abs(state.r) * 100, 2)}% short). The controller sees an error of ${fmt(seen.e, 3)} and keeps pushing (u = ${fmt(seen.u, 3)} ${uUnit()}), so y carries on past r.`;

    // Theory next to the simulation for the cases the lecture solves by hand.
    if (first && state.Kd === 0 && !(useLimit && satPct > 0)) {
      const th = sensorTheory(plant, state.Kp, state.Ki, ts());
      if (th.kind === 'P' && ts() > 0) {
        const m3 = th.zeta < 1 ? responseMetrics(th.zeta, th.wn).overshoot : 0;
        view('theory').textContent = `Theory (P only): ττs·s² + (τ + τs)·s + (1 + KKp) = 0, so ωn = ${fmt(th.wn)} rad/s and ζ = ${fmt(th.zeta)}. ym/r is Module 3's second-order step scaled by KKp/(1 + KKp): overshoot ${fmt(m3)}% from Module 3's formula, ${fmt(mm.overshoot)}% from the simulation.`;
      } else if (th.kind === 'P') {
        view('theory').textContent = 'Theory (P only, ideal sensor): the loop is first order, τcl = τ/(1 + KKp). Add sensor lag to make it second order.';
      } else {
        view('theory').textContent = `Theory (PI): ττs·s³ + (τ + τs)·s² + (1 + KKp)·s + KKi = 0. Routh–Hurwitz: stable while ττs·KKi < (τ + τs)(1 + KKp). ` + (th.critical
          ? `Critical τs = τ(1 + KKp)/(τKKi − (1 + KKp)) = ${fmtTs(th.critical)}, where the loop oscillates at ω = √((1 + KKp)/(ττs)) = ${fmt(th.omegaAtCritical)} rad/s. Now: ${th.stable ? 'stable' : 'unstable'}.`
          : `Here τKKi ≤ 1 + KKp, so no amount of sensor lag makes this loop unstable; it only slows it down.`);
      }
    } else {
      view('theory').textContent = !first ? 'Second-order plant: with the sensor the closed loop has three or more poles, so the critical τs comes from the Routh–Hurwitz test on the characteristic polynomial and the curves from the RK4 simulation.'
        : state.Kd > 0 ? 'With Kd the loop has extra poles (the derivative filter), so the critical τs comes from the Routh–Hurwitz test on the full characteristic polynomial and the curves from the RK4 simulation.'
        : 'u reaches its limit, so the loop is nonlinear: the curves come from the RK4 simulation, and the critical τs shown is for the linear loop.';
    }
    const cl = ideal?.m.tau63 ?? m.tau63;
    view('rule').textContent = ts() > 0 && cl
      ? `Compare the sensor with the closed loop, not with the plant: with an ideal sensor this loop reaches 63.2% in ${fmtTime(cl)}, and τs = ${tsText} is ${fmt(ts() / cl, 2)} times that. ${state.plantType === 'first' ? `The plant alone has τ = ${fmtTime(state.tau)}; feedback made the loop ${fmt(state.tau / cl, 2)} times faster, so the sensor has to be fast compared with the faster loop.` : ''}`
      : 'Compare the sensor with the closed loop, not with the plant: feedback makes the loop faster than the plant, so the sensor must keep up with the faster loop.';

    view('diagram').innerHTML = diagram(width('diagram'), first, useLimit);
    drawSweep();
    queueSweep();
  }

  // The sweep only depends on the plant, gains, setpoint and limit, so it is recomputed after they stop changing.
  function queueSweep() {
    const opts = loopOpts(), key = JSON.stringify(opts, (k, v) => v === Infinity ? 'inf' : v === -Infinity ? '-inf' : v);
    if (key === sweepKey) return;
    sweepKey = key;
    clearTimeout(sweepTimer);
    view('sweep-note').textContent = 'Updating…';
    sweepTimer = setTimeout(() => { sweepData = sweep(opts); drawSweep(); }, sweepData ? 150 : 0);
  }

  function drawSweep() {
    const box = view('sweep');
    if (!sweepData) return;
    const { lo, hi, rows, intervals, critical } = sweepData;
    const W = Math.min(860, Math.max(280, box.clientWidth)), H = 260, L = W < 500 ? 46 : 60, R = 16, T = 22, B = 46, w = W - L - R, h = H - T - B;
    const vals = rows.flatMap(r => [r.y, r.ym]).filter(v => v !== null);
    const ymax = Math.min(300, Math.max(20, ...vals.map(v => v * 1.1)));
    const x = v => L + (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * w, yv = v => T + (ymax - Math.min(v, ymax * 1.05)) / ymax * h;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Overshoot of y and ym against sensor time constant"><title>Overshoot against τs. ${critical === null ? 'No critical τs up to 10 s.' : `The loop becomes unstable at τs = ${fmtTs(critical)}.`}</title><defs><clipPath id="${prefix}-sw"><rect x="${L}" y="${T}" width="${w}" height="${h}"/></clipPath></defs>`;
    for (const [a, b] of intervals) svg += `<rect class="sw-unstable" x="${x(Math.max(a, lo))}" y="${T}" width="${Math.max(0, x(Math.min(b, hi)) - x(Math.max(a, lo)))}" height="${h}"/>`;
    for (const [v, label] of DECADES) if (v >= lo * 0.999) svg += `<line class="ct-grid" x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${T + h}"/><text x="${x(v)}" y="${T + h + 20}" text-anchor="middle">${label}</text>`;
    const step = ymax > 150 ? 100 : ymax > 60 ? 20 : 10;
    for (let v = 0; v <= ymax; v += step) svg += `<line class="ct-grid" x1="${L}" x2="${L + w}" y1="${yv(v)}" y2="${yv(v)}"/><text x="${L - 8}" y="${yv(v) + 4}" text-anchor="end">${v}%</text>`;
    svg += `<text x="${L}" y="14">Overshoot</text><text x="${L + w / 2}" y="${H - 6}" text-anchor="middle">Sensor time constant τs</text><g clip-path="url(#${prefix}-sw)">`;
    const line = key => { let d = '', pen = false; for (const r of rows) { if (r[key] === null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${x(r.ts).toFixed(1)},${yv(r[key]).toFixed(1)}`; pen = true; } return d; };
    svg += `<path class="ct-line ct-meas" d="${line('ym')}"/><path class="ct-line ct-out" d="${line('y')}"/>`;
    const now = Math.max(ts(), lo);
    svg += `<line class="sw-now" x1="${x(now)}" x2="${x(now)}" y1="${T}" y2="${T + h}"/>`;
    if (critical !== null) svg += `<line class="sw-crit" x1="${x(critical)}" x2="${x(critical)}" y1="${T}" y2="${T + h}"/>`;
    svg += '</g>';
    if (critical !== null && critical <= hi) svg += `<text class="sw-label" x="${Math.min(x(critical) + 6, L + w - 4)}" y="${T + 16}" text-anchor="${x(critical) > L + w - 120 ? 'end' : 'start'}">τs,crit = ${fmtTs(critical)}</text>`;
    box.innerHTML = svg + '</svg>';
    const tail = intervals.length && intervals[0][1] < hi * 0.999 ? ` Above ${fmtTs(intervals[0][1])} the loop is stable again: the sensor is then so slow that it, not the plant, sets the pace of the whole loop.` : '';
    view('sweep-note').textContent = (critical === null
      ? 'No τs up to 10 s makes the linear loop unstable. The overshoot still grows as the sensor slows.'
      : `As τs grows the overshoot grows, until at τs = ${fmtTs(critical)} the loop starts to oscillate (shaded). ${state.ideal ? '' : `The vertical line is the current τs = ${fmtTime(state.sensorTau)}.`}`) + tail
      + (Number.isFinite(loopOpts().uMax) ? ' The shading is for the linear loop; the curves include the u limit, which turns the growing swing into a limit cycle.' : ' Inside the shading the swing grows without bound, so there is no overshoot to plot.');
  }

  function diagram(width, first, limited) {
    const g = `Kp ${fmt(state.Kp)} · Ki ${fmt(state.Ki)} · Kd ${fmt(state.Kd)}`;
    const p = first ? `${fmt(state.K)} / (${state.tau === 1 ? '' : fmt(state.tau)}s + 1)` : `K = ${fmt(state.K)}, ζ = ${fmt(state.zeta)}, ωn = ${fmt(state.wn)}`;
    const lim = limited ? `[${fmt(state.uMin)}, ${fmt(state.uMax)}]` : 'none';
    const sens = ts() > 0 ? `1 / (${fmt(ts())}s + 1)` : '1 (ideal)';
    const box = (x, y, w, h, title, sub, cls = '') => `<rect class="bd-box ${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/><text class="bd-title" x="${x + w / 2}" y="${y + h / 2 - 4}" text-anchor="middle">${title}</text><text class="bd-sub" x="${x + w / 2}" y="${y + h / 2 + 14}" text-anchor="middle">${sub}</text>`;
    const arrow = (d, label, lx, ly, anchor = 'middle') => `<path class="bd-wire" d="${d}" marker-end="url(#${prefix}-arrow)"/>${label ? `<text class="bd-signal" x="${lx}" y="${ly}" text-anchor="${anchor}">${label}</text>` : ''}`;
    const defs = `<defs><marker id="${prefix}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="bd-head"/></marker></defs>`;
    const title = `<title>Block diagram: setpoint r, summing junction, PID controller, actuator limit ${lim}, plant, true output y, sensor ${sens} in the feedback path, measured ym fed back</title>`;
    if (width >= 620) {
      return `<svg viewBox="0 0 860 210" role="img" aria-label="Closed-loop block diagram with a sensor in the feedback path">${title}${defs}
        <text class="bd-signal" x="18" y="62">r</text>${arrow('M30,58 H86', '', 0, 0)}
        <circle class="bd-sum" cx="104" cy="58" r="17"/><text class="bd-sign" x="72" y="50" text-anchor="middle">+</text><text class="bd-sign" x="118" y="96" text-anchor="middle">−</text>
        ${arrow('M121,58 H180', 'e', 150, 48)}${box(182, 26, 188, 64, 'PID', g)}
        ${arrow('M370,58 H420', 'u', 395, 48)}${box(422, 26, 140, 64, 'Limit', lim, 'bd-lim')}
        ${arrow('M562,58 H612', '', 0, 0)}${box(614, 26, 182, 64, first ? 'Plant G(s)' : 'Plant (2nd order)', p)}
        ${arrow('M796,58 H850', 'y (true)', 826, 46)}
        <path class="bd-wire" d="M824,58 V164 H612" marker-end="url(#${prefix}-arrow)"/>
        ${box(430, 134, 180, 60, 'Sensor H(s)', sens, 'bd-sensor')}
        <path class="bd-wire bd-meas" d="M430,164 H104 V77" marker-end="url(#${prefix}-arrow)"/><text class="bd-signal bd-meas-text" x="268" y="156" text-anchor="middle">ym (measured)</text></svg>`;
    }
    return `<svg viewBox="0 0 360 380" role="img" aria-label="Closed-loop block diagram with a sensor in the feedback path">${title}${defs}
      <text class="bd-signal" x="14" y="48">r</text>${arrow('M24,44 H62', '', 0, 0)}
      <circle class="bd-sum" cx="80" cy="44" r="16"/><text class="bd-sign" x="50" y="36" text-anchor="middle">+</text><text class="bd-sign" x="94" y="80" text-anchor="middle">−</text>
      ${arrow('M96,44 H130', 'e', 113, 34)}${box(132, 12, 214, 64, 'PID', g)}
      ${arrow('M240,76 V114', 'u', 252, 99, 'start')}${box(132, 116, 214, 56, 'Limit', lim, 'bd-lim')}
      ${arrow('M240,172 V200', '', 0, 0)}${box(132, 202, 214, 64, first ? 'Plant G(s)' : 'Plant (2nd order)', p)}
      ${arrow('M240,266 V298', 'y (true)', 252, 288, 'start')}${box(132, 300, 214, 60, 'Sensor H(s)', sens, 'bd-sensor')}
      <path class="bd-wire bd-meas" d="M132,330 H80 V62" marker-end="url(#${prefix}-arrow)"/><text class="bd-signal bd-meas-text" x="70" y="200" text-anchor="end">ym</text></svg>`;
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
    else if (key === 'ideal') state.ideal = el.checked;
    else if (key === 'sensorTau') state.sensorTau = 10 ** +el.value;
    else if (key === 'K2') { state.K = +el.value; control('K').value = state.K; }
    else if (key === 'uMin' || key === 'uMax') { if (el.value.trim() === '' || !Number.isFinite(+el.value)) return; state[key] = +el.value; }
    else { state[key] = +el.value; if (key === 'K') control('K2').value = state.K; }
    changed(); schedule();
  }
  function onSubmit(event) {
    event.preventDefault();
    const q = QUESTIONS[question], guess = control('guess').value;
    if (!guess) { view('feedback').textContent = 'Choose your prediction before checking.'; control('guess').focus(); return; }
    const base = { plant: plantOf({ ...DEFAULTS, ...q.setup }), Kp: q.setup.Kp, Ki: q.setup.Ki, Kd: q.setup.Kd, r: q.setup.r };
    const before = runLoop({ ...base, sensorTau: q.setup.sensorTau });
    const after = runLoop({ ...base, sensorTau: q.apply.sensorTau ?? q.setup.sensorTau });
    setState({ ...DEFAULTS, ...q.setup, ...q.apply }); applied = true;
    const ok = guess === q.correct ? 'Correct.' : 'Not quite.';
    const crit = sensorTheory(base.plant, base.Kp, base.Ki, 0).critical;
    if (question === 'grow') {
      view('feedback').textContent = `${ok} The true overshoot went from ${fmt(before.m.overshoot)}% to ${fmt(after.m.overshoot)}%, and settling from ${fmtTime(before.m.settlingTime)} to ${fmtTime(after.m.settlingTime)}. The gains did not change: a slower sensor reports y later, so the controller keeps pushing for longer after y has reached r. Smoothing the reading does not smooth the plant.`;
    } else if (question === 'truth') {
      const mm = sensorMetrics(before.sim);
      view('feedback').textContent = `${ok} The true output overshoots by ${fmt(before.m.overshoot)}%, but the sensor reading only by ${fmt(mm.overshoot)}%. The sensor smooths the peak away, so the controller is told the overshoot is smaller than it really is. Both end at r, because a gain-1 sensor reads y exactly once nothing moves. On a real robot, the reading is all you would see.`;
    } else {
      view('feedback').textContent = `${ok} With τs = 1.5 s the loop was ${before.m.status}; with τs = 0.1 s it ${after.m.status === 'settled' ? `settles, with ${fmt(after.m.overshoot)}% overshoot` : `is ${after.m.status}`}. For Kp = 9 and Ki = 20 the critical τs is ${fmtTime(crit)}: the gains were fine, the sensor was too slow. Lowering Ki below ${fmt((1 + base.plant.K * base.Kp) * (base.plant.tau + 1.5) / (base.plant.tau * 1.5 * base.plant.K))} would also stop the oscillation, but it gives up speed the plant can deliver. Look at τs before blaming the gains.`;
    }
    control('guess').value = '';
  }
  function onClick(event) {
    const preset = event.target.closest('[data-preset]')?.dataset.preset;
    if (preset) { changed(); view('feedback').textContent = ''; setState({ ...DEFAULTS, ...PRESETS[preset] }); return; }
    const q = event.target.closest('[data-question]')?.dataset.question;
    if (q) { loadQuestion(q); return; }
    if (event.target.closest('[data-action="reset"]')) { applied = false; loadQuestion('grow'); view('feedback').textContent = 'Reset to P1\'s loop with τs = 0.1 s.'; }
  }

  view('validation').innerHTML = validate().map(r => {
    const show = (v, extra = 0) => typeof v === 'string' ? v : Math.abs(v) < 1e-9 ? '0' : v.toFixed(r.digits + extra) + r.unit;
    return `<tr><th scope="row">${r.label}</th><td>${show(r.expected)}</td><td>${show(r.actual, 2)}</td><td class="p2-pass">${r.pass ? 'PASS' : 'FAIL'}</td></tr>`;
  }).join('');
  root.addEventListener('input', onInput); root.addEventListener('submit', onSubmit); root.addEventListener('click', onClick);
  loadQuestion('grow'); render();
  let lastWidth = root.clientWidth;
  const resizeObserver = new ResizeObserver(() => { if (root.clientWidth !== lastWidth) { lastWidth = root.clientWidth; schedule(); } });
  resizeObserver.observe(root);
  return () => { cancelAnimationFrame(frame); clearTimeout(sweepTimer); resizeObserver.disconnect(); root.removeEventListener('input', onInput); root.removeEventListener('submit', onSubmit); root.removeEventListener('click', onClick); root.replaceChildren(); root.classList.remove('control-p2'); };
}
