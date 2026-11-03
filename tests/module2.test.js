import test from 'node:test';
import assert from 'node:assert/strict';
import { amplitudeRatio, phase, magnitudeDb, dynamicError, timeDelay, tauMax, sineResponse, validate, hzToRad, deg } from '../modules/module2/math.js';
const close = (a, b, tol = 1e-10) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('cutoff at w = 1/tau gives 1/sqrt(2), -3 dB and -45 degrees', () => {
  for (const tau of [1e-4, 0.2, 10]) {
    close(amplitudeRatio(1 / tau, tau), Math.SQRT1_2);
    close(magnitudeDb(1 / tau, tau), -10 * Math.log10(2));
    close(deg(phase(1 / tau, tau)), -45);
    close(timeDelay(1 / tau, tau), tau * Math.PI / 4);
  }
});
test('low frequencies pass, high frequencies fall 20 dB per decade towards -90 degrees', () => {
  close(amplitudeRatio(1e-6, 1), 1, 1e-9);
  close(magnitudeDb(1e4, 1) - magnitudeDb(1e3, 1), -20, 1e-5);
  assert.ok(deg(phase(1e6, 1)) > -90 && deg(phase(1e6, 1)) < -89.99);
  close(dynamicError(2, 0.2), amplitudeRatio(2, 0.2) - 1);
});
test('sine response solves the ODE from rest and settles to M sin(wt + phi)', () => {
  for (const tau of [0.05, 0.2, 2]) for (const w of [0.5, 2, 30]) {
    const t = 1.7 * tau, h = 1e-6 * tau, y = s => sineResponse(s, w, tau);
    close(y(0), 0, 1e-12);
    close(tau * (y(t + h) - y(t - h)) / (2 * h) + y(t), Math.sin(w * t), 1e-6);
    const late = 60 * tau;
    close(y(late), amplitudeRatio(w, tau) * Math.sin(w * late + phase(w, tau)), 1e-12);
  }
});
test('tauMax keeps the amplitude ratio exactly at 1 - error and matches the lecture', () => {
  for (const e of [0.01, 0.05, 0.2]) for (const f of [1, 100, 5000]) close(amplitudeRatio(hzToRad(f), tauMax(e, hzToRad(f))), 1 - e);
  close(tauMax(0.05, hzToRad(100)) * 1000, 0.5231, 1e-4);
  const rows = validate();
  assert.equal(rows.length, 4);
  assert.ok(rows.every(r => r.pass));
});
test('doubling frequency raises the phase angle but shortens the time delay', () => {
  for (const tau of [1e-3, 0.2, 5]) for (const w of [0.1, 1 / tau, 50 / tau]) {
    assert.ok(-phase(2 * w, tau) > -phase(w, tau));
    assert.ok(timeDelay(2 * w, tau) < timeDelay(w, tau));
    assert.ok(timeDelay(w, tau) < tau);
  }
  close(timeDelay(2 * Math.PI, 0.2), 0.1430, 1e-4);
  close(timeDelay(4 * Math.PI, 0.2), 0.0949, 1e-4);
});
test('invalid parameters are rejected', () => {
  for (const bad of [0, -1, NaN, Infinity]) {
    assert.throws(() => amplitudeRatio(bad, 1), RangeError);
    assert.throws(() => phase(1, bad), RangeError);
  }
  assert.throws(() => tauMax(0, 10), RangeError);
  assert.throws(() => tauMax(1, 10), RangeError);
  assert.throws(() => sineResponse(-1, 1, 1), RangeError);
});
