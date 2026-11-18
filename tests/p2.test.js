import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, metrics, run } from '../modules/control/sim.js';
import { characteristic, routh, isStable, unstableIntervals, criticalSensorTau, roots, sensorTheory } from '../modules/control/analysis.js';
import { runLoop, sensorMetrics, stabilityMap, sweep, controllerView, oscillationFrequency, validate } from '../modules/p2/model.js';
import { responseMetrics } from '../modules/module3/calculations.js';
const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (±${tol})`);
const lecture = { type: 'first', K: 1, tau: 1 };
const motor = { type: 'first', K: 0.65, tau: 0.06 };
const second = { type: 'second', K: 1, zeta: 0.5, wn: 2 };

test('characteristic polynomial matches the hand-derived ones', () => {
  // P only: ττs·s² + (τ + τs)·s + (1 + KKp)
  assert.deepEqual(characteristic({ plant: lecture, Kp: 9, sensorTau: 0.1 }).map(v => +v.toFixed(12)), [10, 1.1, 0.1]);
  // PI: ττs·s³ + (τ + τs)·s² + (1 + KKp)·s + KKi
  assert.deepEqual(characteristic({ plant: lecture, Kp: 9, Ki: 20, sensorTau: 0.5 }), [20, 10, 1.5, 0.5]);
  // No sensor: P1's loop, τs + (1 + KKp)
  assert.deepEqual(characteristic({ plant: lecture, Kp: 9 }), [10, 1]);
});

test('Routh–Hurwitz agrees with the roots', () => {
  for (const poly of [[2, 3, 1], [20, 10, 1.5, 0.5], [20, 10, 2.5, 1.5], [1, 1, 1, 1, 1], [6, 11, 6, 1]]) {
    const right = roots(poly).some(r => r.re > -1e-9);
    assert.equal(routh(poly).stable, !right, JSON.stringify(poly));
  }
  close(roots([2, 3, 1]).map(r => r.re).sort((a, b) => a - b)[0], -2, 1e-9);
});

test('critical τs for PI: Routh closed form, numerical scan and simulation agree', () => {
  for (const [plant, Kp, Ki] of [[lecture, 9, 20], [lecture, 1, 4], [motor, 2, 60], [{ type: 'first', K: 2, tau: 0.3 }, 1, 30]]) {
    const th = sensorTheory(plant, Kp, Ki, 0);
    const scan = criticalSensorTau({ plant, Kp, Ki });
    close(scan, th.critical, th.critical * 1e-6);
    // The motor loop is barely damped near its critical τs (poles within 0.002 of the jω axis),
    // so its simulation cannot settle or blow up within the window; the other plants are checked by RK4.
    if (plant === motor) continue;
    assert.equal(run({ plant, Kp, Ki, sensorTau: 0.5 * th.critical }).m.status, 'settled');
    assert.equal(run({ plant, Kp, Ki, sensorTau: 1.25 * th.critical }).m.status, 'unstable');
  }
  // τKKi ≤ 1 + KKp: no sensor lag can make it unstable.
  assert.equal(sensorTheory(lecture, 9, 10, 0).critical, null);
  assert.equal(criticalSensorTau({ plant: lecture, Kp: 9, Ki: 9 }), null);
});

test('P only on a first-order plant: never unstable, and ym/r is Module 3’s second-order step', () => {
  assert.deepEqual(unstableIntervals({ plant: lecture, Kp: 9, sensorTau: 0 }, 'sensorTau', 1e-4, 10), []);
  for (const [Kp, ts] of [[9, 0.1], [4, 0.3], [2, 1]]) {
    const th = sensorTheory(lecture, Kp, 0, ts);
    const sim = simulate({ plant: lecture, Kp, sensorTau: ts, T: 40 });
    const m3 = responseMetrics(th.zeta, th.wn).overshoot;
    close(sensorMetrics(sim).overshoot, m3, 0.05);
    close(metrics(sim).sse, 100 / (1 + Kp), 1e-3);       // the sensor does not move the final value
  }
});

test('second-order plant with P: unstable band 2 ± √3 over ωn, as Routh predicts', () => {
  // 2ζx² + (4ζ² − KKp)x + 2ζ < 0 with x = ωn·τs; ζ = 0.5, KKp = 5 gives x = 2 ± √3.
  const [[a, b]] = unstableIntervals({ plant: second, Kp: 5, sensorTau: 0 }, 'sensorTau', 1e-4, 10);
  close(a, (2 - Math.sqrt(3)) / 2, 1e-6);
  close(b, (2 + Math.sqrt(3)) / 2, 1e-6);
  assert.equal(run({ plant: second, Kp: 5, sensorTau: 0.5 }).m.status, 'unstable');
  assert.equal(run({ plant: second, Kp: 5, sensorTau: 0.05 }).m.status, 'settled');
});

test('the overshoot grows with τs up to the critical value (lecture PI loop)', () => {
  const s = sweep({ plant: lecture, Kp: 9, Ki: 20, Kd: 0, r: 1 });
  close(s.critical, 1, 1e-6);
  const stable = s.rows.filter(r => r.y !== null && r.ts > 0.01);
  for (let i = 1; i < stable.length; i++) assert.ok(stable[i].y >= stable[i - 1].y - 0.05, `${stable[i].ts}: ${stable[i].y} < ${stable[i - 1].y}`);
  assert.ok(s.rows.filter(r => r.ts > 1.0001).every(r => r.y === null));
  // The true output overshoots more than the sensor reading says.
  for (const r of stable.filter(r => r.ts > 0.05)) assert.ok(r.y > r.ym);
});

test('the controller acts on the sensor: when y reaches r the reading is still short', () => {
  const { sim } = runLoop({ plant: lecture, Kp: 9, Ki: 20, sensorTau: 0.1 });
  const v = controllerView(sim);
  close(v.y, 1, 1e-12);
  assert.ok(v.ym < 0.6 && v.e > 0.4 && v.u > 0, JSON.stringify(v));
  // Error and control signal are computed from ym, not y.
  for (let i = 0; i < sim.y.length; i += 97) close(sim.e[i], sim.r - sim.ym[i], 1e-12);
});

test('a saturated plant with a slow sensor is not reported as settled too early', () => {
  // The motor holds 65 rad/s at 100% PWM while a 1 s sensor is still catching up.
  const { sim, m } = runLoop({ plant: motor, Kp: 2, Ki: 60, r: 30, sensorTau: 1, uMin: 0, uMax: 100 });
  assert.equal(m.status, 'settled');
  close(m.final, 30, 0.1);
  assert.ok(sim.T > 10);
});

test('with a u limit, a linearly unstable loop becomes a limit cycle, not "unbounded"', () => {
  const { sim, m } = runLoop({ plant: lecture, Kp: 9, Ki: 20, sensorTau: 1.5, uMin: -10, uMax: 10 });
  assert.equal(m.status, 'oscillating');
  assert.ok(!sim.unstable);
  for (const u of sim.u) assert.ok(u >= -10 - 1e-12 && u <= 10 + 1e-12);
});

test('at the critical τs the oscillation frequency is √((1 + KKp)/(ττs))', () => {
  const sim = simulate({ plant: lecture, Kp: 9, Ki: 20, sensorTau: 1, T: 60 });
  close(oscillationFrequency(sim), Math.sqrt(10), 0.01 * Math.sqrt(10));
});

test('τs = 0 is exactly P1’s loop', () => {
  const a = simulate({ plant: lecture, Kp: 9, Ki: 20, T: 5 }), b = simulate({ plant: lecture, Kp: 9, Ki: 20, sensorTau: 0, T: 5 });
  assert.deepEqual([...a.y], [...b.y]);
  assert.deepEqual([...a.ym], [...a.y]);
});

test('all P2 validation rows pass', () => {
  const rows = validate();
  assert.equal(rows.length, 7);
  for (const r of rows) assert.ok(r.pass, `${r.label}: ${r.actual} vs ${r.expected}`);
});

test('stability map and sweep stay fast and finite for extreme settings', () => {
  const t0 = performance.now();
  for (const opts of [{ plant: { type: 'second', K: 5, zeta: 0.05, wn: 20 }, Kp: 20, Ki: 100, Kd: 2, r: 1, uMin: -10, uMax: 10 }, { plant: { type: 'first', K: 5, tau: 0.01 }, Kp: 20, Ki: 100, Kd: 2, r: 50 }]) {
    const s = sweep(opts);
    for (const r of s.rows) assert.ok(r.y === null || Number.isFinite(r.y));
    assert.ok(stabilityMap(opts).intervals.every(([a, b]) => a < b));
  }
  assert.ok(performance.now() - t0 < 4000);
  assert.ok(isStable({ plant: lecture, Kp: 9, Ki: 20, sensorTau: 0.99 }) && !isStable({ plant: lecture, Kp: 9, Ki: 20, sensorTau: 1.01 }));
});
