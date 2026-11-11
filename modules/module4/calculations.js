// Reuse the first- and second-order equations from Modules 1 and 3.
import { step as firstStep } from '../module1/math.js';
import { stepResponse as secondStep } from '../module3/calculations.js';

const between = (min, max, rng) => min + (max - min) * rng();
const round = (value, digits = 2) => +value.toFixed(digits);

// Each new round randomly selects a first-order or underdamped second-order step.
export function createSensor(rng = Math.random) {
  const type = rng() < 0.5 ? 'first' : 'second';
  if (type === 'second') {
    // Underdamped (0 < ζ < 1): overshoot and peak time help identify the parameters.
    const zeta = round(between(0.2, 0.85, rng), 3);
    const wn = round(between(1.2, 6, rng), 3);
    return { type: 'second', mode: 'step', zeta, wn,
      duration: Math.max(5, 8 / (zeta * wn)) };
  }
  const K = round(between(0.7, 2.5, rng), 3);
  const tau = round(between(0.4, 3, rng), 3);
  return { type: 'first', mode: 'step', K, tau, duration: 6 * tau };
}

// Calculate the ideal, noise-free response using the appropriate model.
export function response(sensor, t) {
  if (sensor.type === 'second') return secondStep(t, sensor.zeta, sensor.wn);
  return firstStep(t, sensor.K, sensor.tau);
}

// Add small measurement noise once per round to simulate real sensor readings.
export function measurements(sensor, count = 161, rng = Math.random) {
  const scale = sensor.type === 'first' ? sensor.K : 1;
  return Array.from({ length: count }, (_, i) => {
    const t = sensor.duration * i / (count - 1);
    const noise = i === 0 ? 0 : (rng() + rng() + rng() - 1.5) * scale * 0.024;
    return { t, y: response(sensor, t) + noise };
  });
}

// Use the player's parameters to construct the curve shown after submission.
export function guessSensor(sensor, a, b) {
  if (![a, b].every(Number.isFinite) || a <= 0 || b <= 0) throw new RangeError('Both estimates must be positive numbers.');
  return sensor.type === 'first'
    ? { ...sensor, K: a, tau: b }
    : { ...sensor, zeta: a, wn: b };
}

// Score each parameter by relative percentage error: within 10% earns 50 points.
export function grade(sensor, a, b) {
  const correct = sensor.type === 'first' ? [sensor.K, sensor.tau] : [sensor.zeta, sensor.wn];
  const errors = [a, b].map((v, i) => Math.abs(v - correct[i]) / correct[i] * 100);
  const pointsPerParameter = 50;
  // Partial credit decreases to zero between 10% and 30% error.
  const credit = errors.map(error => error <= 10 + 1e-9 ? pointsPerParameter
    : Math.max(0, pointsPerParameter * (30 - error) / 20));
  return { errors, points: Math.round(credit.reduce((sum, value) => sum + value, 0)),
    fullMarks: errors.every(error => error <= 10 + 1e-9) };
}

// Explain the estimation method without revealing the hidden values.
export function hintFor(sensor) {
  if (sensor.type === 'second') {
    return 'Use peak overshoot and peak time for a second-order step: let Mp = (peak − final level) / final level. Then ζ = −ln(Mp)/√(π² + ln²(Mp)) and ωₙ = π/(tp√(1−ζ²)), where tp is the time of the first peak.';
  }
  return 'For a first-order unit step, the final reading is K, and the output reaches 63.2% of K at t = τ. You can also plot ln((K−y)/K) against time: its slope is −1/τ.';
}
