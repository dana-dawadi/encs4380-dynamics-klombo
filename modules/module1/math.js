// Closed-form, zero-initial-condition solutions of tau*y' + y = K*x.
export function parameters(K, tau, size = 1) {
  if (![K, tau, size].every(Number.isFinite) || K <= 0 || tau <= 0 || size <= 0) {
    throw new RangeError('Gain, time constant, and input size must be finite and positive.');
  }
}
function time(t) {
  if (!Number.isFinite(t) || t < 0) throw new RangeError('Time must be finite and nonnegative.');
}
export function step(t, K, tau, A = 1) {
  parameters(K, tau, A); time(t);
  return K * A * -Math.expm1(-t / tau);
}
export function ramp(t, K, tau, r = 1) {
  parameters(K, tau, r); time(t);
  const u = t / tau;
  // Avoid cancellation near zero when subtracting the exponential transient.
  const shape = u < 1e-4 ? u*u/2 - u*u*u/6 + u**4/24 : u + Math.expm1(-u);
  return K * r * tau * shape;
}
export function errorFraction(t, tau) {
  parameters(1, tau); time(t);
  return Math.exp(-t / tau);
}
export function logError(t, tau, base = 'e') {
  parameters(1, tau); time(t);
  if (!['e', '10'].includes(base)) throw new RangeError('Log base must be e or 10.');
  return -t / tau / (base === '10' ? Math.LN10 : 1);
}
export function rampMetrics(K, tau, r = 1) {
  parameters(K, tau, r);
  return { lag: tau, steadyError: K * r * tau };
}
export function validate(K, tau, A = 1) {
  parameters(K, tau, A);
  return [{ label: 'Step at t = τ, fraction of KA', expected: 0.632, actual: step(tau,K,tau,A)/(K*A), tolerance: 0.0005 },
    { label: 'Step at t = 3τ, fraction of KA', expected: 0.95, actual: step(3*tau,K,tau,A)/(K*A), tolerance: 0.0005 }]
    .map(row => ({ ...row, pass: Math.abs(row.actual-row.expected) <= row.tolerance }));
}
