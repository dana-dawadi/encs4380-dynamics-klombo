// First-order sensor tau*y' + y = K*x driven by x(t) = A sin(wt).
// G(jw) = K / (1 + jwτ): amplitude ratio M = 1/sqrt(1 + (wτ)^2), phase φ = −atan(wτ).
export function parameters(tau, w) {
  if (![tau, w].every(Number.isFinite) || tau <= 0 || w <= 0) {
    throw new RangeError('Time constant and frequency must be finite and positive.');
  }
}
export const hzToRad = f => 2 * Math.PI * f;
export const radToHz = w => w / (2 * Math.PI);
export const deg = rad => rad * 180 / Math.PI;

export function amplitudeRatio(w, tau) {
  parameters(tau, w);
  return 1 / Math.hypot(1, w * tau);
}
// Radians, negative because the output lags the input.
export function phase(w, tau) {
  parameters(tau, w);
  return -Math.atan(w * tau);
}
export function magnitudeDb(w, tau) {
  return 20 * Math.log10(amplitudeRatio(w, tau));
}
// δ = M − 1, so a 5% amplitude loss is δ = −0.05.
export function dynamicError(w, tau) {
  return amplitudeRatio(w, tau) - 1;
}
// Output peaks arrive |φ|/w seconds after the matching input peaks.
export function timeDelay(w, tau) {
  return -phase(w, tau) / w;
}
// Largest τ that keeps |δ| ≤ maxError for every frequency up to w.
export function tauMax(maxError, w) {
  if (!Number.isFinite(maxError) || maxError <= 0 || maxError >= 1) {
    throw new RangeError('Allowed error must be between 0 and 1.');
  }
  parameters(1, w);
  return Math.sqrt(1 / (1 - maxError) ** 2 - 1) / w;
}
// Full response from rest (y(0) = 0): steady sine plus a decaying transient.
export function sineResponse(t, w, tau, K = 1, A = 1, transient = true) {
  parameters(tau, w);
  if (!Number.isFinite(t) || t < 0) throw new RangeError('Time must be finite and nonnegative.');
  const M = amplitudeRatio(w, tau), p = phase(w, tau);
  const steady = K * A * M * Math.sin(w * t + p);
  return transient ? steady - K * A * M * Math.sin(p) * Math.exp(-t / tau) : steady;
}
export function validate() {
  const w100 = hzToRad(100), tmax = tauMax(0.05, w100);
  return [
    { label: 'τ = 0.2 s, input sin 2t: amplitude ratio M', expected: 0.93, actual: amplitudeRatio(2, 0.2), tolerance: 0.005, digits: 2, unit: '' },
    { label: 'τ = 0.2 s, input sin 2t: phase lag', expected: 21.8, actual: -deg(phase(2, 0.2)), tolerance: 0.05, digits: 1, unit: '°' },
    { label: '≤ 5% dynamic error up to 100 Hz: τmax', expected: 0.52, actual: tmax * 1000, tolerance: 0.005, digits: 2, unit: ' ms' },
    { label: 'Phase lag at 50 Hz with τmax', expected: 9.3, actual: -deg(phase(hzToRad(50), tmax)), tolerance: 0.05, digits: 1, unit: '°' },
  ].map(row => ({ ...row, pass: Math.abs(row.actual - row.expected) <= row.tolerance }));
}
