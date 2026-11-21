// ENCS4380 HW2 - P3 digital PID controller and sampled-data simulation.
export function createDigitalPID(kp, ki, kd, ts, minOutput = 0, maxOutput = 100, antiWindup = true) {
    if (![kp, ki, kd, ts, minOutput, maxOutput].every(Number.isFinite) ||
        kp < 0 || ki < 0 || kd < 0 || ts <= 0 || minOutput >= maxOutput) {
        throw new Error('Invalid PID settings');
    }

    let integral = 0;
    let previousError = 0;
    let firstSample = true;

    function update(setpoint, measuredOutput) {
        const error = setpoint - measuredOutput;
        const P = kp * error;
        const derivative = firstSample ? 0 : (error - previousError) / ts;
        const D = kd * derivative;

        const proposedIntegral = integral + error * ts;
        const proposedOutput = P + ki * proposedIntegral + D;
        const pushingHigh = proposedOutput > maxOutput && error > 0;
        const pushingLow = proposedOutput < minOutput && error < 0;
        if (!antiWindup || !(pushingHigh || pushingLow)) {
            integral = proposedIntegral;
        }

        const I = ki * integral;
        const rawOutput = P + I + D;
        const u = Math.max(minOutput, Math.min(maxOutput, rawOutput));

        previousError = error;
        firstSample = false;
        return { u, P, I, D, error, rawOutput, integral };
    }

    return { update };
}

// The plant is integrated in smaller steps while u remains held between PID samples.
export function simulateDigitalPID({
    plantType = 'first', kp = 2, ki = 1, kd = 0, ts = 0.1,
    K = 1, tau = 1, zeta = 0.5, wn = 2, setpoint = 1,
    duration = 8, minOutput = 0, maxOutput = 100, antiWindup = true
} = {}) {
    if (!['first', 'second'].includes(plantType) ||
        ![kp, ki, kd, ts, K, tau, zeta, wn, setpoint, duration, minOutput, maxOutput].every(Number.isFinite) ||
        K <= 0 || tau <= 0 || wn <= 0 || zeta < 0 || duration <= 0 || duration > 60 ||
        ts <= 0 || duration / ts > 40000 || minOutput >= maxOutput) {
        throw new Error('Invalid simulation settings');
    }

    const pid = createDigitalPID(kp, ki, kd, ts, minOutput, maxOutput, antiWindup);
    let y = 0;
    let velocity = 0;
    let u = 0;
    const points = [];
    const samples = [];
    const totalSamples = Math.ceil(duration / ts);

    for (let k = 0; k < totalSamples; k++) {
        const t = k * ts;
        const result = pid.update(setpoint, y);
        u = result.u;
        samples.push({ time: t, output: y, control: u, error: result.error, integral: result.integral });

        const end = Math.min(t + ts, duration);
        const timeScale = plantType === 'first' ? tau : 1 / wn;
        const maxDt = Math.min(0.005, timeScale / 40, ts / 10);
        const steps = Math.max(1, Math.ceil((end - t) / maxDt));
        const dt = (end - t) / steps;

        for (let j = 0; j < steps; j++) {
            points.push({ time: t + j * dt, output: y, control: u, setpoint });
            if (plantType === 'first') {
                y += dt * ((K * u - y) / tau);
            } else {
                const acceleration = wn * wn * (K * u - y) - 2 * zeta * wn * velocity;
                velocity += dt * acceleration;
                y += dt * velocity;
            }
            if (!Number.isFinite(y) || Math.abs(y) > 1e8) {
                throw new Error('Simulation became unstable');
            }
        }
    }

    points.push({ time: duration, output: y, control: u, setpoint });
    return { points, samples };
}

// Performance is measured against the requested setpoint, not an assumed final value.
export function measureResponse(points, setpoint) {
    if (!points.length) throw new Error('No simulation points');
    const tolerance = Math.max(Math.abs(setpoint) * 0.02, 1e-8);
    const threshold10 = 0.1 * setpoint;
    const threshold90 = 0.9 * setpoint;
    const crossingTime = threshold => {
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            if (a.output <= threshold && b.output >= threshold && a.output !== b.output) {
                return a.time + (threshold - a.output) * (b.time - a.time) / (b.output - a.output);
            }
        }
        return null;
    };
    const t10 = crossingTime(threshold10);
    const t90 = crossingTime(threshold90);
    let peak = -Infinity;
    let lastOutside = -1;
    for (let i = 0; i < points.length; i++) {
        peak = Math.max(peak, points[i].output);
        if (Math.abs(points[i].output - setpoint) > tolerance) lastOutside = i;
    }
    const final = points[points.length - 1].output;
    return {
        riseTime: t10 === null || t90 === null ? null : t90 - t10,
        overshoot: Math.max(0, (peak - setpoint) / Math.max(Math.abs(setpoint), 1e-8) * 100),
        settlingTime: lastOutside === points.length - 1 ? null : lastOutside < 0 ? 0 : points[lastOutside + 1].time,
        finalError: setpoint - final
    };
}

// Generates an Arduino sketch from the current UI parameters.
// readPlantOutput() and applyControl() must be implemented for real hardware.
export function generateArduinoCode({
    kp = 2, ki = 1, kd = 0, ts = 0.1, setpoint = 1,
    minOutput = 0, maxOutput = 100, antiWindup = true
} = {}) {
    if (![kp, ki, kd, ts, setpoint, minOutput, maxOutput].every(Number.isFinite) ||
        kp < 0 || ki < 0 || kd < 0 || ts <= 0 || minOutput >= maxOutput) {
        throw new Error('Invalid Arduino settings');
    }
    const periodUs = Math.round(ts * 1000000);
    if (periodUs < 1 || periodUs > 4294967295) throw new Error('Sampling period not supported');

    const literal = n => `${Number(n).toString().includes(".") ? n : `${n}.0`}f`;
    return `// ENCS4380 HW2 - P3: Digital PID, sample and hold
// Replace the two hardware placeholders with your own sensor and motor code.
const float Kp = ${literal(kp)};
const float Ki = ${literal(ki)};
const float Kd = ${literal(kd)};
const float setpoint = ${literal(setpoint)};
const float outputMin = ${literal(minOutput)};
const float outputMax = ${literal(maxOutput)};
const bool antiWindup = ${antiWindup ? 'true' : 'false'};
const unsigned long samplePeriodUs = ${periodUs}UL;
const float Ts = samplePeriodUs / 1000000.0f;

float integral = 0.0f;
float previousError = 0.0f;
bool firstSample = true;
unsigned long lastSampleUs = 0;

float readPlantOutput() {
  // TODO: read motor speed from your encoder, in setpoint-compatible units.
  return 0.0f;
}

void applyControl(float command) {
  // TODO: translate command into PWM/direction for your motor driver.
  // If using a 0..100% limit, map this percentage to the PWM range.
}

void setup() {
  Serial.begin(115200);
  lastSampleUs = micros();
}

void loop() {
  const unsigned long now = micros();
  if ((unsigned long)(now - lastSampleUs) < samplePeriodUs) return;
  lastSampleUs += samplePeriodUs;

  const float measured = readPlantOutput();
  const float error = setpoint - measured;
  const float P = Kp * error;
  const float derivative = firstSample ? 0.0f : (error - previousError) / Ts;
  const float D = Kd * derivative;

  const float proposedIntegral = integral + error * Ts;
  const float proposedOutput = P + Ki * proposedIntegral + D;
  const bool pushingHigh = proposedOutput > outputMax && error > 0.0f;
  const bool pushingLow = proposedOutput < outputMin && error < 0.0f;
  if (!antiWindup || !(pushingHigh || pushingLow)) {
    integral = proposedIntegral;
  }

  const float rawOutput = P + Ki * integral + D;
  const float u = constrain(rawOutput, outputMin, outputMax);
  applyControl(u);

  previousError = error;
  firstSample = false;
}`;
}
