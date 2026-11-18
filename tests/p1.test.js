import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, metrics, run, theory, validate } from '../modules/control/sim.js';
const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (±${tol})`);
const first = { type: 'first', K: 1, tau: 1 };

test('validation check 1: P only, Kp = 9 gives τcl = 0.1 s and 10% error', () => {
  const m = metrics(simulate({ plant: first, Kp: 9, T: 3 }));
  close(m.tau63, 0.1, 1e-4);
  close(m.sse, 10, 1e-3);
  assert.equal(m.overshoot, 0);
});
test('P only matches τ/(1 + KKp) and 1/(1 + KKp) for other plants and gains', () => {
  for (const [K, tau, Kp] of [[0.5, 2, 4], [2, 0.3, 1], [0.65, 0.06, 3]]) {
    const plant = { type: 'first', K, tau }, th = theory(plant, Kp, 0);
    const m = metrics(simulate({ plant, Kp }));
    close(m.tau63, th.tau, th.tau * 1e-3);
    close(m.sse, th.sse, 1e-3);
  }
});
test('validation check 2: PI with Kp = Ki = 1 gives ωn = 1, ζ = 1 and the step 1 − e^(−t)', () => {
  const th = theory(first, 1, 1);
  close(th.wn, 1, 1e-12); close(th.zeta, 1, 1e-12);
  const sim = simulate({ plant: first, Kp: 1, Ki: 1, T: 10 });
  for (let i = 0; i < sim.y.length; i += 50) close(sim.y[i], 1 - Math.exp(-sim.t[i]), 1e-6);
});
test('validation check 3: any PI removes the steady-state error', () => {
  // The homework states this for the first-order plant; a PI loop on it is stable for any positive gains.
  for (const plant of [first, { type: 'first', K: 0.65, tau: 0.06 }, { type: 'first', K: 3, tau: 0.4 }])
    for (const [Kp, Ki] of [[1, 1], [0.5, 3], [2, 0.5], [9, 20]]) {
      const { m } = run({ plant, Kp, Ki });
      assert.equal(m.status, 'settled');
      close(m.sse, 0, 0.05);
    }
  assert.ok(validate().every(r => r.pass));
});
test('PI cannot remove the error when u is stuck at its limit', () => {
  // The motor needs 30/0.65 ≈ 46% PWM to hold 30 rad/s; capped at 40% it settles short.
  const sim = simulate({ plant: { type: 'first', K: 0.65, tau: 0.06 }, Kp: 2, Ki: 60, r: 30, uMin: 0, uMax: 40, T: 5 });
  const m = metrics(sim);
  assert.equal(m.status, 'settled');
  close(m.final, 0.65 * 40, 1e-3);
  assert.ok(m.sse > 10);
  assert.equal(sim.u[sim.u.length - 1], 40);
});
test('Kd calms the overshoot of the second-order plant', () => {
  const plant = { type: 'second', K: 1, zeta: 0.5, wn: 2 };
  const without = run({ plant, Kp: 5, Ki: 5 }).m, with_ = run({ plant, Kp: 5, Ki: 5, Kd: 1 }).m;
  assert.ok(with_.overshoot < without.overshoot / 2, `${with_.overshoot} vs ${without.overshoot}`);
  close(with_.sse, 0, 0.05);
});
test('the control signal never leaves its limits', () => {
  const sim = simulate({ plant: first, Kp: 9, Ki: 20, Kd: 0.5, uMin: -2, uMax: 3 });
  for (const u of sim.u) assert.ok(u >= -2 - 1e-12 && u <= 3 + 1e-12);
  assert.equal(Math.max(...sim.u), 3);
});
test('Micromouse motor preset: ζ in 0.6–0.8 and PWM within 0–100%', () => {
  const plant = { type: 'first', K: 0.65, tau: 0.06 };
  const th = theory(plant, 2, 60);
  assert.ok(th.zeta >= 0.6 && th.zeta <= 0.8, `ζ = ${th.zeta}`);
  const sim = simulate({ plant, Kp: 2, Ki: 60, r: 30 });
  assert.ok(Math.min(...sim.u) >= 0 && Math.max(...sim.u) <= 100);
});
test('a slow integral mode is followed until it settles', () => {
  const t0 = performance.now();
  const { m } = run({ plant: { type: 'first', K: 0.65, tau: 0.06 }, Kp: 2, Ki: 0.5 });
  assert.equal(m.status, 'settled');
  assert.ok(performance.now() - t0 < 2000);
});
test('unstable loops are detected, not drawn as settled', () => {
  const { m } = run({ plant: { type: 'second', K: 1, zeta: 0.5, wn: 2 }, Kp: 20, Ki: 100 });
  assert.equal(m.status, 'unstable');
  assert.equal(m.sse, null);
});
test('extreme gains stay numerically finite', () => {
  for (const plant of [{ type: 'first', K: 5, tau: 0.01 }, { type: 'second', K: 5, zeta: 0.05, wn: 20 }]) {
    const sim = simulate({ plant, Kp: 20, Ki: 100, Kd: 2 });
    assert.ok(!sim.unstable && sim.y.every(Number.isFinite));
  }
});
test('invalid inputs are rejected', () => {
  assert.throws(() => simulate({ plant: { type: 'first', K: 0, tau: 1 } }), RangeError);
  assert.throws(() => simulate({ plant: { type: 'third', K: 1, tau: 1 } }), RangeError);
  assert.throws(() => simulate({ plant: first, Kp: -1 }), RangeError);
  assert.throws(() => simulate({ plant: first, uMin: 1, uMax: 1 }), RangeError);
});
