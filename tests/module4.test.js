import test from 'node:test';
import assert from 'node:assert/strict';
import { createSensor, response, measurements, guessSensor, grade, hintFor } from '../modules/module4/calculations.js';

test('random generator returns valid sensor models', () => {
  const first=createSensor(()=>0.1), second=createSensor(()=>0.8);
  assert.equal(first.type,'first');assert.equal(second.type,'second');
  assert.ok(first.K>0&&first.tau>0);assert.ok(second.zeta>0&&second.zeta<1&&second.wn>0);
});
test('first-order step reaches 63.2% at tau',()=>{
  const s={type:'first',mode:'step',K:2,tau:3};
  assert.ok(Math.abs(response(s,3)/2-(1-Math.exp(-1)))<1e-12);
});
test('second-order overshoot is about 16.3% at zeta=0.5',()=>{
  const s={type:'second',mode:'step',zeta:.5,wn:2};
  const peak=Math.PI/(2*Math.sqrt(1-.25));
  assert.ok(Math.abs(response(s,peak)-1.16303)<0.0001);
});
test('10% relative error earns full points',()=>{
  const s={type:'first',mode:'step',K:2,tau:1};
  assert.equal(grade(s,2.2,1.1).points,100);
  assert.equal(grade(s,2.8,1.8).points,0);
});
test('measurements, guesses and hints are defined',()=>{
  const s={type:'second',mode:'step',zeta:0.5,wn:2,duration:8};
  assert.equal(measurements(s,161,()=>.5).length,161);
  assert.equal(guessSensor(s,.6,3).wn,3);
  assert.ok(hintFor(s).includes('Overshoot')||hintFor(s).includes('overshoot'));
});

test('random selection is 50/50 first-order vs underdamped second-order', () => {
  for (const random of [0, 0.1, 0.25, 0.49]) {
    const sensor = createSensor(() => random);
    assert.equal(sensor.type, 'first');
    assert.equal(sensor.mode, 'step');
  }
  for (const random of [0.5, 0.51, 0.8, 0.99]) {
    const sensor = createSensor(() => random);
    assert.equal(sensor.type, 'second');
    assert.ok(sensor.zeta > 0 && sensor.zeta < 1);
    assert.ok(sensor.wn > 0);
    assert.equal(sensor.mode, 'step');
  }
});

test('generated first and second order step responses start at zero', () => {
  for (const random of [0, .2, .49, .5, .7, .99]) {
    const sensor = createSensor(() => random);
    assert.equal(response(sensor, 0), 0);
    assert.equal(sensor.omega, undefined);
  }
});

test('second-order hints teach parameter identification without revealing numbers', () => {
  const sensor = { type: 'second', mode: 'step', zeta: 0.5, wn: 2 };
  const hint = hintFor(sensor);
  assert.match(hint, /peak/i);
  assert.doesNotMatch(hint, /ζ = 0\.5|ωₙ = 2/);
  assert.equal(grade(sensor, .5, 2).points, 100);
});
