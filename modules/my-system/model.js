import { run, theory } from '../control/sim.js';
import { generateArduinoCode } from '../p3/calculations.js';

export const DATASHEET = Object.freeze({ratedVoltage:6, noLoadRPM:500, ratio:30, noLoadCurrentmA:40, ratedLoadRPM:375, source:'https://www.fablab.nknu.edu.tw/UploadFile/PBCStoreApplyReportFile/11_Report1_%E5%B8%82%E7%AB%8B%E9%99%BD%E6%98%8E%E9%AB%98%E4%B8%AD_2019417234228.pdf'});
// Nominal no-load linearized gain assumes a regulated 6V motor supply and ideal duty-to-voltage scaling.
// It is NOT a fitted gain for the installed motor, and tau remains an unmeasured example.
export const EXAMPLE = Object.freeze({ K: 500 * 2 * Math.PI / 60 / 100, tau: 0.06, Kp: 2, Ki: 60, Kd: 0, target: 30, voltage: 6 });

export function modelFromStep({ pwmPercent, finalRpm, tauSeconds }) {
  if (![pwmPercent, finalRpm, tauSeconds].every(Number.isFinite) || pwmPercent <= 0 || pwmPercent > 100 || finalRpm <= 0 || tauSeconds <= 0) throw new RangeError('Enter a PWM step (0–100%), positive final RPM and positive 63.2% time.');
  return { K: finalRpm * 2 * Math.PI / 60 / pwmPercent, tau: tauSeconds };
}

export function derivePI({ K, tau, desiredZeta, desiredWn }) {
  if (![K, tau, desiredZeta, desiredWn].every(v => Number.isFinite(v) && v > 0)) throw new RangeError('Plant and design parameters must be positive.');
  const Kp = (2 * desiredZeta * desiredWn * tau - 1) / K;
  const Ki = desiredWn ** 2 * tau / K;
  if (Kp < 0) throw new RangeError('Requested pole locations require a negative Kp. Choose a higher natural frequency or damping.');
  return { Kp, Ki, Kd: 0 };
}

export function evaluateMotor({ K, tau, Kp, Ki, Kd = 0, target = 30 }) {
  if (![K, tau].every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(target) || target <= 0) throw new RangeError('K, tau and target must be positive.');
  const plant = { type: 'first', K, tau };
  const { sim, m } = run({ plant, Kp, Ki, Kd, r: target, uMin: 0, uMax: 100 });
  const predicted = Kd === 0 && Ki > 0 ? theory(plant, Kp, Ki) : null;
  const requiredPWM = target / K;
  const tracking = m.settled && m.sse !== null && Math.abs(m.sse) <= 1;
  const achievable = requiredPWM <= 100;
  const dampingTarget = predicted ? predicted.zeta >= 0.6 && predicted.zeta <= 0.8 : null;
  let peakPWM = 0;
  for (let i = 0; i < sim.u.length; i++) peakPWM = Math.max(peakPWM, sim.u[i]);
  return { plant, sim, metrics: m, predicted, requiredPWM, peakPWM, tracking, achievable, dampingTarget };
}

// Reuse the actual P3 Arduino generator. Hardware IO functions remain placeholders in P3.
export function arduinoSketch({ Kp, Ki, Kd, target, sampleMs = 10 }) {
  if (![Kp, Ki, Kd, target, sampleMs].every(Number.isFinite) || Kp < 0 || Ki < 0 || Kd < 0 || target <= 0 || sampleMs < 1) throw new RangeError('Invalid PID values.');
  return generateArduinoCode({ kp: Kp, ki: Ki, kd: Kd, setpoint: target, ts: sampleMs / 1000, minOutput: 0, maxOutput: 100, antiWindup: true });
}
