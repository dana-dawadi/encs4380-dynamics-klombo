// Linear analysis of the closed loop used by the Control modules (P2 onward).
// It builds the characteristic polynomial of the same loop that sim.js integrates
// and checks stability with the Routh–Hurwitz test. No limit on u is assumed here:
// with a limit the loop is nonlinear and only the simulation can tell.
import { checkPlant, filterTime } from './sim.js';

// Polynomials are arrays of coefficients, lowest power first: [a0, a1, a2] = a0 + a1·s + a2·s².
export const polyMul = (a, b) => {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; }));
  return out;
};
export const polyAdd = (a, b) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] || 0) + (b[i] || 0));

// Each block as numerator / denominator.
export function blocks({ plant, Kp = 0, Ki = 0, Kd = 0, sensorTau = 0, Tf }) {
  checkPlant(plant);
  Tf ??= filterTime(plant, Kd);
  // PID with the same filtered derivative as sim.js: Kp + Ki/s + Kd·s/(Tf·s + 1).
  let C;
  if (Kd > 0 && Ki > 0) C = { num: [Ki, Kp + Ki * Tf, Kp * Tf + Kd], den: [0, 1, Tf] };
  else if (Kd > 0) C = { num: [Kp, Kp * Tf + Kd], den: [1, Tf] };
  else if (Ki > 0) C = { num: [Ki, Kp], den: [0, 1] };
  else C = { num: [Kp], den: [1] };
  const G = plant.type === 'first'
    ? { num: [plant.K], den: [1, plant.tau] }
    : { num: [plant.K * plant.wn ** 2], den: [plant.wn ** 2, 2 * plant.zeta * plant.wn, 1] };
  // The sensor is Module 1's first-order model with gain 1: 1/(τs·s + 1).
  const H = sensorTau > 0 ? { num: [1], den: [1, sensorTau] } : { num: [1], den: [1] };
  return { C, G, H, Tf };
}

// 1 + C·G·H = 0  →  denC·denG·denH + numC·numG·numH = 0
export function characteristic(opts) {
  const { C, G, H } = blocks(opts);
  const p = polyAdd(polyMul(polyMul(C.den, G.den), H.den), polyMul(polyMul(C.num, G.num), H.num));
  while (p.length > 1 && p[p.length - 1] === 0) p.pop();
  return p;
}

// Routh–Hurwitz: every root in the left half-plane if and only if the first column of the array
// has no sign change. A zero in the first column means a root on or to the right of the jω axis.
export function routh(poly) {
  const c = [...poly].reverse();               // highest power first
  if (c[0] < 0) c.forEach((v, i) => { c[i] = -v; });
  const n = c.length - 1;
  const rows = [c.filter((_, i) => i % 2 === 0), c.filter((_, i) => i % 2 === 1)];
  const width = rows[0].length;
  while (rows[1].length < width) rows[1].push(0);
  const scale = Math.max(...c.map(Math.abs));
  for (let k = 2; k <= n; k++) {
    const a = rows[k - 2], b = rows[k - 1], next = [];
    for (let j = 0; j < width - 1; j++) next.push(b[0] === 0 ? NaN : (b[0] * a[j + 1] - a[0] * b[j + 1]) / b[0]);
    next.push(0);
    rows.push(next);
  }
  const first = rows.slice(0, n + 1).map(r => r[0]);
  const stable = c.every(v => v > 0) && first.every(v => Number.isFinite(v) && v > 1e-12 * scale);
  return { stable, first, rows: rows.slice(0, n + 1) };
}
export const isStable = opts => routh(characteristic(opts)).stable;

// Values of one parameter (sensorTau, Kp, …) in [lo, hi] where the linear loop is unstable,
// found on a logarithmic grid and refined by bisection. Returns [[from, to], …].
export function unstableIntervals(opts, key, lo, hi, points = 240) {
  const at = v => isStable({ ...opts, [key]: v });
  const grid = Array.from({ length: points + 1 }, (_, i) => lo * (hi / lo) ** (i / points));
  const refine = (a, b) => {          // a and b differ in stability; return the boundary
    const sa = at(a);
    for (let i = 0; i < 60 && b / a > 1 + 1e-10; i++) { const m = Math.sqrt(a * b); if (at(m) === sa) a = m; else b = m; }
    return Math.sqrt(a * b);
  };
  const out = [];
  let start = at(grid[0]) ? null : lo;
  for (let i = 1; i <= points; i++) {
    const was = at(grid[i - 1]), now = at(grid[i]);
    if (was && !now) start = refine(grid[i - 1], grid[i]);
    if (!was && now) { out.push([start, refine(grid[i - 1], grid[i])]); start = null; }
  }
  if (start !== null) out.push([start, hi]);
  return out;
}

// Smallest sensor time constant that makes the linear loop unstable, or null if none up to `hi`.
export function criticalSensorTau(opts, hi = 10, lo = 1e-4) {
  const first = unstableIntervals({ ...opts, sensorTau: 0 }, 'sensorTau', lo, hi)[0];
  return first ? first[0] : null;
}

// Roots of a polynomial (Durand–Kerner), as { re, im }. Used for the oscillation frequency.
export function roots(poly) {
  const c = [...poly];
  while (c.length > 1 && c[c.length - 1] === 0) c.pop();
  const n = c.length - 1;
  if (n < 1) return [];
  const a = c.map(v => v / c[n]);                       // monic
  const R = 1 + Math.max(...a.slice(0, n).map(Math.abs));
  let z = Array.from({ length: n }, (_, k) => ({ re: R * 0.9 * Math.cos(2 * Math.PI * k / n + 0.4), im: R * 0.9 * Math.sin(2 * Math.PI * k / n + 0.4) }));
  const mul = (p, q) => ({ re: p.re * q.re - p.im * q.im, im: p.re * q.im + p.im * q.re });
  const div = (p, q) => { const d = q.re ** 2 + q.im ** 2 || 1e-300; return { re: (p.re * q.re + p.im * q.im) / d, im: (p.im * q.re - p.re * q.im) / d }; };
  const evalAt = x => { let v = { re: 1, im: 0 }; for (let k = n - 1; k >= 0; k--) v = { re: mul(v, x).re + a[k], im: mul(v, x).im }; return v; };
  for (let iter = 0; iter < 2000; iter++) {
    let moved = 0;
    z = z.map((zi, i) => {
      let den = { re: 1, im: 0 };
      z.forEach((zj, j) => { if (j !== i) den = mul(den, { re: zi.re - zj.re, im: zi.im - zj.im }); });
      const step = div(evalAt(zi), den);
      moved = Math.max(moved, Math.hypot(step.re, step.im) / Math.max(1, Math.hypot(zi.re, zi.im)));
      return { re: zi.re - step.re, im: zi.im - step.im };
    });
    if (moved < 1e-14) break;
  }
  return z.map(r => ({ re: r.re, im: Math.abs(r.im) < 1e-9 * Math.max(1, Math.abs(r.re)) ? 0 : r.im }));
}

// Closed-loop poles and the slowest-decaying (dominant) one.
export function poles(opts) {
  const list = roots(characteristic(opts));
  const dominant = list.reduce((best, p) => (best === null || p.re > best.re ? p : best), null);
  return { list, dominant };
}

// Closed-form results from the lecture for a first-order plant K/(τs + 1) and the sensor 1/(τs·s + 1).
// P only:  ττs·s² + (τ + τs)·s + (1 + KKp) = 0, and ym/r is exactly Module 3's second-order system.
// PI:      ττs·s³ + (τ + τs)·s² + (1 + KKp)·s + KKi = 0; Routh: stable while ττs·KKi < (τ + τs)(1 + KKp).
export function sensorTheory({ K, tau }, Kp, Ki, sensorTau) {
  const a = 1 + K * Kp;
  if (Ki > 0) {
    const excess = tau * K * Ki - a;
    const critical = excess > 0 ? tau * a / excess : null;
    return { kind: 'PI', critical, omegaAtCritical: critical ? Math.sqrt(a / (tau * critical)) : null, stable: tau * sensorTau * K * Ki < (tau + sensorTau) * a };
  }
  if (!(sensorTau > 0)) return { kind: 'P', wn: null, zeta: null, critical: null, final: K * Kp / a };
  const wn = Math.sqrt(a / (tau * sensorTau));
  return { kind: 'P', wn, zeta: (tau + sensorTau) / (2 * Math.sqrt(tau * sensorTau * a)), critical: null, final: K * Kp / a };
}
