import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, newChallenge, calculateResponse, evaluate } from '../modules/p4/model.js';

test('all six random challenges are feasible with documented reference gains', () => {
  for (const c of CHALLENGES) {
    const { sim, m } = calculateResponse(c, c.solution);
    const result = evaluate(c, sim, m);
    assert.equal(result.success, true, `Challenge ${JSON.stringify(c.plant)}: ${JSON.stringify(result.checks)}`);
    assert.equal(result.score, 100);
  }
});
test('P-only with persistent error cannot earn the SSE target', () => {
  const c = CHALLENGES[0];
  const { sim, m } = calculateResponse(c, { Kp: 1, Ki: 0, Kd: 0 });
  const result = evaluate(c, sim, m);
  assert.equal(result.checks[2].pass, false);
  assert.equal(result.checks[1].pass, false); // settling is against setpoint, not wrong final value
});
test('unsafe or unsettled responses cannot pass any metric', () => {
  const c = CHALLENGES[3];
  const { sim, m } = calculateResponse(c, { Kp: 12, Ki: 12, Kd: 0 });
  const result = evaluate(c, sim, m);
  if (m.status !== 'settled') assert.equal(result.score, 0);
  assert.equal(typeof result.success, 'boolean');
});
test('new random plant never repeats the previous challenge', () => {
  for (let previous = 0; previous < CHALLENGES.length; previous++)
    for (const n of [0, .1, .3, .7, .99]) {
      const c = newChallenge(() => n, previous);
      assert.notEqual(c.index, previous);
      assert.ok(c.index >= 0 && c.index < CHALLENGES.length);
    }
});
test('invalid PID gain rejected', () => {
  assert.throws(() => calculateResponse(CHALLENGES[0], { Kp: -1, Ki: 2, Kd: 0 }), RangeError);
});
test('all six challenges are reachable through initial random selection', () => {
  for (let i = 0; i < CHALLENGES.length; i++)
    assert.equal(newChallenge(() => (i + .5) / CHALLENGES.length).index, i);
});
