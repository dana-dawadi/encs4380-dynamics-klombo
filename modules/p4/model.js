// P4 uses the PID simulator from P1.
import { run } from '../control/sim.js';

// Each challenge has a hidden plant, targets, and a working example solution.
export const CHALLENGES = [
  // First-order challenges.
  { plant: { type: 'first', K: 1, tau: 1 }, target: { overshoot: 5, settling: 3, sse: 0.5 }, solution: { Kp: 2, Ki: 2, Kd: 0 } },
  { plant: { type: 'first', K: 0.8, tau: 1.4 }, target: { overshoot: 8, settling: 6, sse: 1 }, solution: { Kp: 3, Ki: 1.5, Kd: 0 } },
  { plant: { type: 'first', K: 1.2, tau: 0.7 }, target: { overshoot: 3, settling: 3.2, sse: 0.25 }, solution: { Kp: 2, Ki: 2, Kd: 0 } },
  // Second-order challenges.
  { plant: { type: 'second', K: 1, zeta: 0.5, wn: 2 }, target: { overshoot: 5, settling: 3.5, sse: 0.5 }, solution: { Kp: 3, Ki: 2, Kd: 1 } },
  { plant: { type: 'second', K: 0.8, zeta: 0.65, wn: 3 }, target: { overshoot: 2, settling: 2.5, sse: 0.25 }, solution: { Kp: 3, Ki: 3, Kd: 1 } },
  { plant: { type: 'second', K: 1.1, zeta: 0.4, wn: 2.5 }, target: { overshoot: 5, settling: 2.5, sse: 0.75 }, solution: { Kp: 3, Ki: 2, Kd: 1.5 } },
  // Extra challenges with different limits.
  { plant: { type: 'first', K: 0.65, tau: 0.5 }, target: { overshoot: 5, settling: 2.5, sse: 1 }, solution: { Kp: 2.5, Ki: 4, Kd: 0 } },
  { plant: { type: 'first', K: 1.4, tau: 1.8 }, target: { overshoot: 3, settling: 2.5, sse: 0.25 }, solution: { Kp: 3, Ki: 2, Kd: 0 } },
  { plant: { type: 'first', K: 0.9, tau: 0.35 }, target: { overshoot: 1, settling: 3, sse: 0.5 }, solution: { Kp: 3, Ki: 4, Kd: 0 } },
  { plant: { type: 'second', K: 1.3, zeta: 0.35, wn: 2.2 }, target: { overshoot: 15, settling: 5, sse: 1 }, solution: { Kp: 3, Ki: 3, Kd: 2 } },
  { plant: { type: 'second', K: 0.7, zeta: 0.8, wn: 1.8 }, target: { overshoot: 5, settling: 5.5, sse: 0.75 }, solution: { Kp: 4, Ki: 2, Kd: 1 } },
  { plant: { type: 'second', K: 1.2, zeta: 0.55, wn: 4 }, target: { overshoot: 8, settling: 4.5, sse: 0.25 }, solution: { Kp: 3.5, Ki: 3, Kd: 1.5 } },
];
// Use the same target and controller limits for every challenge.
export const CONTROL_LIMITS = { uMin: -10, uMax: 10, r: 1 };

// Pick a random challenge without repeating the previous one.
export function newChallenge(rng = Math.random, previous = -1) {
  if (typeof rng !== 'function') throw new TypeError('A random generator is required');
  const count = CHALLENGES.length;
  const exclude = previous >= 0 && previous < count;
  let idx = Math.min((exclude ? count - 1 : count) - 1, Math.max(0, Math.floor(rng() * (exclude ? count - 1 : count))));
  if (exclude && idx >= previous) idx += 1;
  return { ...CHALLENGES[idx], index: idx };
}

// Check the gains and simulate the PID response using P1.
export function calculateResponse(challenge, gains) {
  for (const key of ['Kp', 'Ki', 'Kd']) {
    if (!Number.isFinite(gains[key]) || gains[key] < 0) throw new RangeError(`Invalid ${key}`);
  }
  return run({ plant: challenge.plant, ...gains, ...CONTROL_LIMITS });
}

// Calculate the performance and compare it with the challenge limits.
export function evaluate(challenge, sim, m) {
  const { r, y, t } = sim;
  // Unstable or unsettled responses cannot pass.
  const usable = m.settled && !sim.unstable;
  // Find the highest output value to calculate overshoot.
  let peak = -Infinity;
  for (const v of y) peak = Math.max(peak, v);
  const overshoot = Math.max(0, (peak - r) / Math.abs(r) * 100);
  const error = usable ? Math.abs((r - y[y.length - 1]) / r) * 100 : null;
  // Settling time is measured relative to the target (within 2%).
  let lastOutside = -1;
  for (let i = 0; i < y.length; i++) if (Math.abs(y[i] - r) > 0.02 * Math.abs(r)) lastOutside = i;
  const settling = usable && lastOutside < y.length - 1 ? (lastOutside < 0 ? 0 : t[lastOutside + 1]) : null;
  // Check overshoot, settling time, and steady-state error.
  const checks = [
    { key: 'overshoot', label: 'Overshoot', value: overshoot, limit: challenge.target.overshoot, unit: '%', pass: usable && overshoot <= challenge.target.overshoot + 1e-8 },
    { key: 'settling', label: '2% settling time', value: settling, limit: challenge.target.settling, unit: ' s', pass: usable && settling !== null && settling <= challenge.target.settling + 1e-8 },
    { key: 'sse', label: 'Steady-state error', value: error, limit: challenge.target.sse, unit: '%', pass: usable && error !== null && error <= challenge.target.sse + 1e-8 },
  ];
  // Award 33, 33, and 34 points for the three checks.
  return { status: m.status, checks, score: checks.reduce((n, c, i) => n + (c.pass ? (i === 2 ? 34 : 33) : 0), 0), success: checks.every(c => c.pass), settling, overshoot, sse: error };
}
