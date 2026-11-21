// P4: challenge content and grading. The actual closed-loop physics is shared with P1.
import { run } from '../control/sim.js';

// Each problem has an independently checked feasible tuning solution. The plant's
// numbers are deliberately not shown to the player (as in HW1 Module 4).
export const CHALLENGES = [
  { plant: { type: 'first', K: 1, tau: 1 }, target: { overshoot: 10, settling: 3, sse: 0.5 }, solution: { Kp: 2, Ki: 2, Kd: 0 } },
  { plant: { type: 'first', K: 0.8, tau: 1.4 }, target: { overshoot: 10, settling: 6, sse: 0.5 }, solution: { Kp: 3, Ki: 1.5, Kd: 0 } },
  { plant: { type: 'first', K: 1.2, tau: 0.7 }, target: { overshoot: 10, settling: 3.5, sse: 0.5 }, solution: { Kp: 2, Ki: 2, Kd: 0 } },
  { plant: { type: 'second', K: 1, zeta: 0.5, wn: 2 }, target: { overshoot: 10, settling: 3.5, sse: 0.5 }, solution: { Kp: 3, Ki: 2, Kd: 1 } },
  { plant: { type: 'second', K: 0.8, zeta: 0.65, wn: 3 }, target: { overshoot: 10, settling: 2.5, sse: 0.5 }, solution: { Kp: 3, Ki: 3, Kd: 1 } },
  { plant: { type: 'second', K: 1.1, zeta: 0.4, wn: 2.5 }, target: { overshoot: 10, settling: 3, sse: 0.5 }, solution: { Kp: 3, Ki: 2, Kd: 1.5 } },
];
export const CONTROL_LIMITS = { uMin: -10, uMax: 10, r: 1 };

export function newChallenge(rng = Math.random, previous = -1) {
  if (typeof rng !== 'function') throw new TypeError('A random generator is required');
  const count = CHALLENGES.length;
  const exclude = previous >= 0 && previous < count;
  let idx = Math.min((exclude ? count - 1 : count) - 1, Math.max(0, Math.floor(rng() * (exclude ? count - 1 : count))));
  if (exclude && idx >= previous) idx += 1;
  return { ...CHALLENGES[idx], index: idx };
}

export function calculateResponse(challenge, gains) {
  for (const key of ['Kp', 'Ki', 'Kd']) {
    if (!Number.isFinite(gains[key]) || gains[key] < 0) throw new RangeError(`Invalid ${key}`);
  }
  return run({ plant: challenge.plant, ...gains, ...CONTROL_LIMITS });
}

// Always calculate settling against the *setpoint*, not an incorrect P-only final
// value. A response that settles below r must not earn settling-time credit.
export function evaluate(challenge, sim, m) {
  const { r, y, t } = sim;
  const usable = m.settled && !sim.unstable;
  let peak = -Infinity;
  for (const v of y) peak = Math.max(peak, v);
  const overshoot = Math.max(0, (peak - r) / Math.abs(r) * 100);
  const error = usable ? Math.abs((r - y[y.length - 1]) / r) * 100 : null;
  let lastOutside = -1;
  for (let i = 0; i < y.length; i++) if (Math.abs(y[i] - r) > 0.02 * Math.abs(r)) lastOutside = i;
  const settling = usable && lastOutside < y.length - 1 ? (lastOutside < 0 ? 0 : t[lastOutside + 1]) : null;
  const checks = [
    { key: 'overshoot', label: 'Overshoot', value: overshoot, limit: challenge.target.overshoot, unit: '%', pass: usable && overshoot <= challenge.target.overshoot + 1e-8 },
    { key: 'settling', label: '2% settling time', value: settling, limit: challenge.target.settling, unit: ' s', pass: usable && settling !== null && settling <= challenge.target.settling + 1e-8 },
    { key: 'sse', label: 'Steady-state error', value: error, limit: challenge.target.sse, unit: '%', pass: usable && error !== null && error <= challenge.target.sse + 1e-8 },
  ];
  return { status: m.status, checks, score: checks.reduce((n, c, i) => n + (c.pass ? (i === 2 ? 34 : 33) : 0), 0), success: checks.every(c => c.pass), settling, overshoot, sse: error };
}
