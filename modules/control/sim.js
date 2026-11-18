// Shared closed-loop simulator for the Control section (HW2 P1–P4).
// Loop: r → e = r − y_m → PID → u (clipped to [uMin, uMax]) → plant → y,
// with an optional first-order sensor y_m in the feedback path (τs, used by P2).
// Integrated in time with fixed-step RK4: no closed-form solution is assumed.

export function checkPlant(plant) {
  const ok = v => Number.isFinite(v) && v > 0;
  if (plant?.type === 'first' && ok(plant.K) && ok(plant.tau)) return;
  if (plant?.type === 'second' && ok(plant.K) && ok(plant.wn) && Number.isFinite(plant.zeta) && plant.zeta >= 0) return;
  throw new RangeError('Plant needs type "first" (K, τ > 0) or "second" (K, ωn > 0, ζ ≥ 0).');
}

// Natural time scale of the open-loop plant, used to pick the step and window.
export const timeScale = plant => plant.type === 'first' ? plant.tau : 1 / plant.wn;

// PID with a filtered derivative: C(s) = Kp + Ki/s + Kd·s/(Tf·s + 1).
// A pure derivative of a step error is infinite, so every real PID filters it.
export function simulate({ plant, Kp = 0, Ki = 0, Kd = 0, r = 1, uMin = -Infinity, uMax = Infinity, sensorTau = 0, T, dt, Tf } = {}) {
  checkPlant(plant);
  if (![Kp, Ki, Kd, r].every(Number.isFinite) || Kp < 0 || Ki < 0 || Kd < 0) throw new RangeError('Gains must be finite and nonnegative.');
  if (!(uMax > uMin)) throw new RangeError('uMax must be greater than uMin.');
  const base = timeScale(plant);
  Tf ??= filterTime(plant, Kd);
  T ??= horizon(plant, Kp, Ki, sensorTau);
  dt ??= stepSize(plant, Kp, Kd, Tf, sensorTau);
  // At most 200 000 RK4 steps. A long window may use a coarser step, but never past 1/(fastest rate),
  // well inside RK4's stability limit; if even that is not enough, the window is shortened.
  const MAX = 200000;
  if (T / dt > MAX) { const dtMax = 8 * stepSize(plant, Kp, Kd, Tf, sensorTau); dt = Math.min(T / MAX, dtMax); T = Math.min(T, MAX * dt); }
  const n = Math.ceil(T / dt);
  dt = T / n;

  // State: [y, ẏ (second order only), ∫e dt, derivative filter, sensor y_m]
  const first = plant.type === 'first', hasSensor = sensorTau > 0;
  const clip = u => Math.min(uMax, Math.max(uMin, u));
  function control(s) {
    const ym = hasSensor ? s[4] : s[0];
    const e = r - ym;
    const d = Kd > 0 ? Kd * (e - s[3]) / Tf : 0;
    return { e, ym, raw: Kp * e + Ki * s[2] + d };
  }
  function deriv(s) {
    const { e, raw } = control(s), u = clip(raw);
    const dy = first ? (plant.K * u - s[0]) / plant.tau : s[1];
    const ddy = first ? 0 : plant.wn ** 2 * (plant.K * u - s[0]) - 2 * plant.zeta * plant.wn * s[1];
    return [dy, ddy, e, Kd > 0 ? (e - s[3]) / Tf : 0, hasSensor ? (s[0] - s[4]) / sensorTau : 0];
  }
  const add = (s, k, h) => s.map((v, i) => v + h * k[i]);
  let s = [0, 0, 0, 0, 0];
  const out = { t: new Float64Array(n + 1), y: new Float64Array(n + 1), ym: new Float64Array(n + 1), u: new Float64Array(n + 1), e: new Float64Array(n + 1), dt, T, r, unstable: false };
  const record = (i, s) => {
    const c = control(s);
    out.t[i] = i * dt; out.y[i] = s[0]; out.ym[i] = c.ym; out.u[i] = clip(c.raw); out.e[i] = c.e;
  };
  record(0, s);
  const blowUp = 1e6 * Math.max(1, Math.abs(r));
  for (let i = 1; i <= n; i++) {
    const k1 = deriv(s), k2 = deriv(add(s, k1, dt / 2)), k3 = deriv(add(s, k2, dt / 2)), k4 = deriv(add(s, k3, dt));
    s = s.map((v, j) => v + dt / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    if (!s.every(Number.isFinite) || Math.abs(s[0]) > blowUp) {
      out.unstable = true;
      for (const key of ['t', 'y', 'ym', 'u', 'e']) out[key] = out[key].subarray(0, i);
      break;
    }
    record(i, s);
  }
  return out;
}

// Long enough to see the slowest mode settle: the plant, the integral mode
// whose time constant is about (1 + K·Kp)/(K·Ki) for a first-order plant, or a slow sensor (P2).
export function horizon(plant, Kp, Ki, sensorTau = 0) {
  const base = timeScale(plant);
  let T = plant.type === 'first' ? 12 * base : Math.max(12 * base, 10 / Math.max(plant.zeta * plant.wn, 0.05 * plant.wn));
  if (Ki > 0) T = Math.max(T, 10 * (1 + plant.K * Kp) / (plant.K * Ki));
  if (sensorTau > 0) T = Math.max(T, 12 * sensorTau);
  return Math.min(T, 3000 * Math.max(base, sensorTau));
}

// Derivative filter time: 1% of the plant time scale, made longer when Kd is so large
// that the filtered-derivative pole would be hundreds of times faster than the plant.
export function filterTime(plant, Kd) {
  const base = timeScale(plant);
  return Math.max(base / 100, plant.type === 'first' ? (plant.tau + plant.K * Kd) / 400 : 0);
}

// The fastest loop mode sets the step: the plant sped up by K·Kp, the derivative path, the sensor.
export function fastestRate(plant, Kp, Kd, Tf, sensorTau = 0) {
  const base = timeScale(plant);
  const dRate = Kd > 0 ? 1 / Tf + (plant.type === 'first' ? plant.K * Kd / (Tf * plant.tau) : Math.sqrt(plant.K * Kd / Tf) * plant.wn) : 0;
  return Math.max(1 / base, (1 + plant.K * Kp) / base, dRate, sensorTau > 0 ? 1 / sensorTau : 0);
}
export function stepSize(plant, Kp, Kd, Tf, sensorTau = 0) {
  return Math.min(timeScale(plant) / 400, 1 / (8 * fastestRate(plant, Kp, Kd, Tf, sensorTau)));
}

// Step-response metrics read from the simulated curve.
// Overshoot, rise and settling use the final value; steady-state error uses the setpoint.
export function metrics(sim, band = 0.02) {
  const { t, y, r } = sim, n = y.length;
  if (sim.unstable) return { status: 'unstable', unstable: true, settled: false };
  const tail = y.subarray(Math.floor(n * 0.9));
  const flat = arr => {
    let lo = Infinity, hi = -Infinity;
    for (const v of arr) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    return hi - lo <= 0.002 * Math.max(Math.abs(arr[arr.length - 1]), Math.abs(r) * 0.01, 1e-12);
  };
  // With a sensor in the loop (P2) the measured value must have stopped moving too:
  // a saturated plant can sit still while a slow sensor is still catching up.
  const settled = flat(tail) && (!sim.ym || sim.ym === y || flat(sim.ym.subarray(Math.floor(n * 0.9))));
  // Not settled: a growing swing means unstable, otherwise a sustained oscillation.
  const swing = (a, b) => { let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(y[i] - r)); return m; };
  const growing = !settled && swing(Math.floor(n * 0.9), n) > 1.05 * swing(Math.floor(n * 0.8), Math.floor(n * 0.9));
  // Not settled and not growing: an oscillation crosses its own mean in the last tenth, a slow creep does not.
  let crossings = 0;
  if (!settled && !growing) {
    const mean = tail.reduce((a, v) => a + v, 0) / tail.length;
    for (let i = 1; i < tail.length; i++) if ((tail[i - 1] - mean) * (tail[i] - mean) < 0) crossings++;
  }
  const status = settled ? 'settled' : growing ? 'unstable' : crossings >= 2 ? 'oscillating' : 'slow';
  // Without a settled final value, overshoot and rise time are measured against the setpoint.
  const final = settled ? y[n - 1] : r;
  const cross = level => { for (let i = 1; i < n; i++) if ((y[i - 1] - level) * (y[i] - level) <= 0 && y[i] !== y[i - 1]) return t[i - 1] + (t[i] - t[i - 1]) * (level - y[i - 1]) / (y[i] - y[i - 1]); return null; };
  let peak = 0, peakAt = 0;
  for (let i = 0; i < n; i++) if (Math.sign(final) * y[i] > Math.sign(final) * peak) { peak = y[i]; peakAt = t[i]; }
  const t10 = cross(0.1 * final), t90 = cross(0.9 * final);
  let settling = 0;
  for (let i = n - 1; i >= 0; i--) if (Math.abs(y[i] - final) > band * Math.abs(final)) { settling = t[Math.min(i + 1, n - 1)]; break; }
  const overshoot = final !== 0 ? Math.max(0, (peak - final) / Math.abs(final) * 100) : 0;
  return {
    status, unstable: status === 'unstable', settled, final: settled ? final : null,
    riseTime: t10 !== null && t90 !== null ? t90 - t10 : null,
    overshoot, peakTime: overshoot > 0.05 ? peakAt : null,
    settlingTime: settled ? settling : null,
    sse: settled && r !== 0 ? (r - final) / r * 100 : null,
    tau63: cross(0.632120558828558 * final),
  };
}

// Lecture formulas for a first-order plant, used to compare with the simulation.
export function theory({ K, tau }, Kp, Ki) {
  if (Ki > 0) {
    const wn = Math.sqrt(K * Ki / tau);
    return { kind: 'PI', wn, zeta: (1 + K * Kp) / (2 * Math.sqrt(tau * K * Ki)), sse: 0 };
  }
  return { kind: 'P', tau: tau / (1 + K * Kp), sse: 100 / (1 + K * Kp) };
}

// The three Homework 2 validation checks, all run through the simulator.
export function validate() {
  const plant = { type: 'first', K: 1, tau: 1 };
  const p = metrics(simulate({ plant, Kp: 9, T: 3 }));
  const pi = simulate({ plant, Kp: 1, Ki: 1, T: 12 });
  const th = theory(plant, 1, 1);
  let worst = 0;
  for (let i = 0; i < pi.y.length; i += 10) worst = Math.max(worst, Math.abs(pi.y[i] - (1 - Math.exp(-pi.t[i]))));
  const pis = [[1, 1], [9, 2], [0.5, 5], [3, 0.5], [2, 20]].map(([Kp, Ki]) => Math.abs(metrics(simulate({ plant, Kp, Ki })).sse));
  return [
    { label: 'P only, Kp = 9: closed-loop τ (time to 63.2% of final)', expected: 0.1, actual: p.tau63, tolerance: 0.001, unit: ' s', digits: 3 },
    { label: 'P only, Kp = 9: steady-state error', expected: 10, actual: p.sse, tolerance: 0.05, unit: '%', digits: 2 },
    { label: 'PI, Kp = Ki = 1: ωn = √(KKi/τ)', expected: 1, actual: th.wn, tolerance: 1e-9, unit: ' rad/s', digits: 3 },
    { label: 'PI, Kp = Ki = 1: ζ = (1 + KKp)/(2√(τKKi))', expected: 1, actual: th.zeta, tolerance: 1e-9, unit: '', digits: 3 },
    { label: 'PI, Kp = Ki = 1: simulation vs 1 − e^(−t), largest gap', expected: 0, actual: worst, tolerance: 1e-4, unit: '', digits: 6 },
    { label: 'Any PI, stable and unsaturated (5 gain pairs): largest steady-state error', expected: 0, actual: Math.max(...pis), tolerance: 0.05, unit: '%', digits: 3 },
  ].map(row => ({ ...row, pass: Number.isFinite(row.actual) && Math.abs(row.actual - row.expected) <= row.tolerance }));
}

// Simulate, and if a slowly decaying mode has not settled yet, look further ahead (up to 3000 plant time scales).
export function run(opts) {
  const cap = 3000 * Math.max(timeScale(opts.plant), opts.sensorTau || 0);
  let T = opts.T ?? horizon(opts.plant, opts.Kp ?? 0, opts.Ki ?? 0, opts.sensorTau || 0);
  for (;;) {
    const sim = simulate({ ...opts, T });
    const m = metrics(sim);
    if (m.status === 'settled' || m.status === 'unstable' || sim.T < T * 0.999 || T >= cap) return { sim, m };
    T = Math.min(cap, T * 3);
  }
}
