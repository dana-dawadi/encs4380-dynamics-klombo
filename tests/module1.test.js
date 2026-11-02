import test from 'node:test';
import assert from 'node:assert/strict';
import {step,ramp,errorFraction,logError,rampMetrics,validate} from '../modules/module1/math.js';
const close=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<=tol, `${a} != ${b}`);
test('step starts at zero, reaches the lecture landmarks, and scales with KA',()=>{
  for(const K of [.1,1,5]) for(const tau of [.1,2,10]) {
    close(step(0,K,tau),0); close(step(tau,K,tau,3)/(K*3),1-Math.exp(-1));
    close(step(3*tau,K,tau)/(K),1-Math.exp(-3));
    assert.ok(validate(K,tau).every(r=>r.pass));
    close(step(50*tau,K,tau,3),K*3);
  }
});
test('ramp solves the ODE and approaches Kr(t-tau)',()=>{
  for(const K of [.1,1,5]) for(const tau of [.1,2,10]) {
    const r=2,t=2.3*tau,h=1e-5*tau;
    close(ramp(0,K,tau,r),0);
    const derivative=(ramp(t+h,K,tau,r)-ramp(t-h,K,tau,r))/(2*h);
    close(tau*derivative+ramp(t,K,tau,r),K*r*t,1e-7);
    close(K*r*50*tau-ramp(50*tau,K,tau,r),K*r*tau);
    assert.deepEqual(rampMetrics(K,tau,r),{lag:tau,steadyError:K*r*tau});
  }
  assert.ok(ramp(1e-12,1,1)>0);
});
test('error logarithms have the correct base-dependent slopes',()=>{
  for(const tau of [.1,2,10]) {
    close(errorFraction(tau,tau),Math.exp(-1));
    close((logError(3,tau)-logError(1,tau))/2,-1/tau);
    close((logError(3,tau,'10')-logError(1,tau,'10'))/2,-1/(tau*Math.LN10));
  }
});
test('invalid physical parameters and times are rejected',()=>{
  for(const bad of [0,-1,NaN,Infinity]) {
    assert.throws(()=>step(1,1,bad),RangeError);
    assert.throws(()=>ramp(1,bad,1),RangeError);
  }
  assert.throws(()=>step(-1,1,1),RangeError);
  assert.throws(()=>logError(1,1,'2'),RangeError);
});
