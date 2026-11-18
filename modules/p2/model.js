// Control · P2, a slow sensor in the loop: the calculations behind the page, with no DOM.
// The loop is P1's loop with Module 1's first-order sensor 1/(τs·s + 1) in the feedback path,
// so the controller acts on the sensor reading ym, never on the true output y.
import { run, simulate, metrics, horizon, stepSize, fastestRate, filterTime, timeScale } from '../control/sim.js';
import { isStable, unstableIntervals, sensorTheory, poles } from '../control/analysis.js';
import { responseMetrics } from '../module3/calculations.js';

// Sensor time-constant range of the slider: 0.1 ms to 10 s, the same span as Module 2's τ slider.
export const TAU_RANGE = [1e-4, 10];

export const plantOf = s => s.plantType === 'first'
  ? { type: 'first', K: s.K, tau: s.tau }
  : { type: 'second', K: s.K, zeta: s.zeta, wn: s.wn };

// The simulation P1 uses, plus one step for a loop held by the u limit: while the swing is still
// growing towards its limit cycle, look further ahead so it is not reported as unbounded.
export function runLoop(opts) {
  let out = run(opts);
  const limited = Number.isFinite(opts.uMax) || Number.isFinite(opts.uMin);
  for (let i = 0; i < 3 && limited && out.m.status === 'unstable' && !out.sim.unstable; i++) {
    const sim = simulate({ ...opts, T: out.sim.T * 4 });
    if (sim.T < out.sim.T * 3.99) break;
    out = { sim, m: metrics(sim) };
  }
  if (limited && out.m.status === 'unstable' && !out.sim.unstable) out.m = { ...out.m, status: 'oscillating', unstable: false };
  return out;
}

// Metrics of the sensor reading ym, read the same way as those of y.
export const sensorMetrics = sim => metrics({ ...sim, y: sim.ym });

// Linear-loop stability over the slider range. The u limit is ignored: with it the loop is nonlinear.
export function stabilityMap(opts) {
  const linear = { plant: opts.plant, Kp: opts.Kp, Ki: opts.Ki, Kd: opts.Kd };
  const intervals = unstableIntervals({ ...linear, sensorTau: 0 }, 'sensorTau', TAU_RANGE[0], TAU_RANGE[1]);
  return { intervals, critical: intervals.length ? intervals[0][0] : null, stableAt: ts => isStable({ ...linear, sensorTau: ts }) };
}

// Overshoot of y and of ym against τs, for the sweep chart. Each run only needs to reach the first peak,
// so the window is not extended and the step is as coarse as RK4 accuracy allows.
export function sweep(opts, points = 31) {
  const plant = opts.plant, base = timeScale(plant);
  const lo = Math.max(TAU_RANGE[0], base / 1000), hi = TAU_RANGE[1];
  const map = stabilityMap(opts);
  const limited = Number.isFinite(opts.uMax) || Number.isFinite(opts.uMin);
  const rows = [];
  for (let i = 0; i <= points; i++) {
    const ts = lo * (hi / lo) ** (i / points);
    if (!limited && !map.stableAt(ts)) { rows.push({ ts, y: null, ym: null }); continue; }
    const Tf = filterTime(plant, opts.Kd);
    let T = horizon(plant, opts.Kp, opts.Ki, ts);
    const dt = Math.min(Math.max(stepSize(plant, opts.Kp, opts.Kd, Tf, ts), T / 20000), 0.5 / fastestRate(plant, opts.Kp, opts.Kd, Tf, ts));
    T = Math.min(T, 20000 * dt);      // keeps every point cheap; the first peak comes early
    const sim = simulate({ ...opts, sensorTau: ts, T, dt });
    if (sim.unstable) { rows.push({ ts, y: null, ym: null }); continue; }
    rows.push({ ts, y: overshoot(sim.y, sim, opts), ym: overshoot(sim.ym, sim, opts) });
  }
  return { lo, hi, rows, ...map };
}
// Overshoot above the final value: the settled value of the run, or else the linear loop's
// final value, r with an integral term and r·KKp/(1 + KKp) with P (and D) only.
function overshoot(arr, sim, opts) {
  const m = metrics(sim), KKp = opts.plant.K * opts.Kp;
  const final = m.settled ? sim.y[sim.y.length - 1] : opts.Ki > 0 ? sim.r : sim.r * KKp / (1 + KKp);
  let peak = -Infinity;
  for (const v of arr) peak = Math.max(peak, Math.sign(final) * v);
  return final !== 0 ? Math.max(0, (peak - Math.abs(final)) / Math.abs(final) * 100) : 0;
}

// What the controller sees at the moment the true output first reaches the setpoint.
export function controllerView(sim) {
  const { t, y, ym, u, r } = sim;
  for (let i = 1; i < y.length; i++) {
    if ((y[i - 1] - r) * (y[i] - r) <= 0 && y[i] !== y[i - 1]) {
      const f = (r - y[i - 1]) / (y[i] - y[i - 1]), at = a => a[i - 1] + f * (a[i] - a[i - 1]);
      return { t: at(t), y: r, ym: at(ym), e: r - at(ym), u: at(u) };
    }
  }
  return null;
}

// Angular frequency of a sustained oscillation, from the upward mean crossings in the last half of a run.
export function oscillationFrequency(sim) {
  const { t, y } = sim, n = y.length, from = Math.floor(n / 2);
  let mean = 0;
  for (let i = from; i < n; i++) mean += y[i] / (n - from);
  const ups = [];
  for (let i = from + 1; i < n; i++) if (y[i - 1] < mean && y[i] >= mean) ups.push(t[i - 1] + (t[i] - t[i - 1]) * (mean - y[i - 1]) / (y[i] - y[i - 1]));
  return ups.length >= 3 ? 2 * Math.PI * (ups.length - 1) / (ups[ups.length - 1] - ups[0]) : null;
}

// The Homework 2 lecture plant K/(τs + 1), K = 1, τ = 1 s, now with a sensor in the loop.
export function validate() {
  const plant = { type: 'first', K: 1, tau: 1 };
  // 1–2. P only, Kp = 9, τs = 0.1 s: ym/r is exactly Module 3's second-order step.
  const pTheory = sensorTheory(plant, 9, 0, 0.1);
  const pSim = simulate({ plant, Kp: 9, sensorTau: 0.1, T: 6 });
  const pm = sensorMetrics(pSim), py = metrics(pSim);
  const module3 = responseMetrics(pTheory.zeta, pTheory.wn).overshoot;
  // 3–6. PI, Kp = 9, Ki = 20 (P1's experiment): Routh gives the critical τs and the frequency.
  const piTheory = sensorTheory(plant, 9, 20, 0);
  const scan = stabilityMap({ plant, Kp: 9, Ki: 20, Kd: 0 }).critical;
  const below = run({ plant, Kp: 9, Ki: 20, sensorTau: 0.9 * piTheory.critical }).m.status;
  const above = run({ plant, Kp: 9, Ki: 20, sensorTau: 1.1 * piTheory.critical }).m.status;
  const atCrit = simulate({ plant, Kp: 9, Ki: 20, sensorTau: piTheory.critical, T: 60 });
  const w = oscillationFrequency(atCrit);
  const dom = poles({ plant, Kp: 9, Ki: 20, sensorTau: piTheory.critical }).dominant;
  return [
    { label: 'P only, Kp = 9, τs = 0.1 s: sensor-reading overshoot, Module 3 formula e^(−πζ/√(1−ζ²)) with ζ = (τ + τs)/(2√(ττs(1 + KKp)))', expected: module3, actual: pm.overshoot, tolerance: 0.05, unit: '%', digits: 2 },
    { label: 'P only, Kp = 9, τs = 0.1 s: steady-state error is still 1/(1 + KKp); a gain-1 sensor does not move the final value', expected: 10, actual: py.sse, tolerance: 0.05, unit: '%', digits: 2 },
    { label: 'PI, Kp = 9, Ki = 20: critical τs, Routh closed form τ(1 + KKp)/(τKKi − (1 + KKp)) vs numerical Routh scan', expected: piTheory.critical, actual: scan, tolerance: 1e-6, unit: ' s', digits: 3 },
    { label: 'PI, Kp = 9, Ki = 20, τs = 0.9 × critical: RK4 simulation settles', expected: 'settled', actual: below },
    { label: 'PI, Kp = 9, Ki = 20, τs = 1.1 × critical: RK4 oscillation grows', expected: 'unstable', actual: above },
    { label: 'PI at the critical τs: oscillation frequency √((1 + KKp)/(ττs)) vs RK4 simulation', expected: piTheory.omegaAtCritical, actual: w, tolerance: 0.01 * piTheory.omegaAtCritical, unit: ' rad/s', digits: 3 },
    { label: 'PI at the critical τs: closed-loop poles on the jω axis (largest real part)', expected: 0, actual: dom.re, tolerance: 1e-6, unit: '', digits: 3 },
  ].map(row => ({ ...row, pass: typeof row.expected === 'string' ? row.actual === row.expected : Number.isFinite(row.actual) && Math.abs(row.actual - row.expected) <= row.tolerance }));
}
