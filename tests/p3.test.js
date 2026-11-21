import test from 'node:test';
import assert from 'node:assert/strict';
import { createDigitalPID, simulateDigitalPID, measureResponse, generateArduinoCode } from '../modules/p3/calculations.js';

test('first PID sample uses P and I', () => {
  const pid = createDigitalPID(2, 1, 0.5, 0.1);
  assert.ok(Math.abs(pid.update(10, 8).u - 4.2) < 1e-10);
});

test('anti-windup blocks integral while saturated', () => {
  const pid = createDigitalPID(2, 1, 0, 0.1, 0, 10, true);
  assert.equal(pid.update(10, 0).integral, 0);
  assert.equal(pid.update(10, 0).u, 10);
});

test('PID updates 80 times for Ts 0.1 and duration 8', () => {
  const sim = simulateDigitalPID();
  assert.equal(sim.samples.length, 80);
  assert.ok(Math.abs(sim.points.at(-1).output - 0.9869) < 0.002);
  assert.equal(sim.samples[0].control, 2.1);
});

test('both plant types simulate', () => {
  for (const plantType of ['first', 'second']) {
    const sim = simulateDigitalPID({ plantType });
    assert.equal(sim.samples.length, 80);
    assert.ok(sim.points.every(p => Number.isFinite(p.output)));
    assert.ok(Number.isFinite(measureResponse(sim.points, 1).overshoot));
  }
});

test('Arduino sketch uses current gains and anti-windup state', () => {
  const code = generateArduinoCode({ kp: 4, ki: 2, kd: 0.3, ts: 0.05, antiWindup: false });
  assert.match(code, /const float Kp = 4\.0f;/);
  assert.match(code, /const float Ki = 2\.0f;/);
  assert.match(code, /const float Kd = 0\.3f;/);
  assert.match(code, /samplePeriodUs = 50000UL;/);
  assert.match(code, /antiWindup = false;/);
});
