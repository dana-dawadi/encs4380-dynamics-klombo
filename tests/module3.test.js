import test from "node:test";
import assert from "node:assert/strict";

import {
    stepResponse,
    responseMetrics,
    calculatePoles,
    stateSpaceModel,
    phaseTrajectory
} from "../modules/module3/calculations.js";
test("Second-order response starts at zero", () => {
    for (const zeta of [0.5, 1, 2]) {
        assert.ok(Math.abs(stepResponse(0, zeta, 2)) < 1e-10);
    }
});

test("Underdamped overshoot is 16.3%", () => {
    const zeta = 0.5;
    const wn = 2;

    const peakTime = Math.PI / (wn * Math.sqrt(1 - zeta ** 2));
    const peakValue = stepResponse(peakTime, zeta, wn);
    const overshoot = (peakValue - 1) * 100;

    assert.ok(Math.abs(overshoot - 16.3) < 0.1);
});

test("Critical damping has no overshoot", () => {
    for (let t = 0; t <= 20; t += 0.01) {
        assert.ok(stepResponse(t, 1, 2) <= 1 + 1e-10);
    }
});

test("Response metrics for zeta=0.5, wn=2", () => {
    const metrics = responseMetrics(0.5, 2);

    assert.ok(Math.abs(metrics.overshoot - 16.3) < 0.1);
    assert.ok(Math.abs(metrics.peakTime - 1.8138) < 0.01);
    assert.ok(metrics.riseTime > 0);
    assert.ok(metrics.settlingTime > metrics.peakTime);
});

test("State-space matrices match professor example", () => {
    const model = stateSpaceModel(1, 2, 4);

    assert.deepEqual(model.A, [
        [0, 1],
        [-4, -2]
    ]);

    assert.deepEqual(model.B, [
        [0],
        [1]
    ]);

    assert.equal(model.zeta, 0.5);
    assert.equal(model.wn, 2);

    assert.ok(
        Math.abs(model.eigenvalues[0].re + 1) < 1e-10
    );

    assert.ok(
        Math.abs(model.eigenvalues[0].im - 1.732) < 0.001
    );
});

test("Phase trajectory approaches equilibrium", () => {
    const path = phaseTrajectory(
        1, 2, 4, 1, 15, 3000
    );

    const start = path[0];
    const end = path[path.length - 1];

    // Starts at rest
    assert.equal(start.x, 0);
    assert.equal(start.v, 0);

    // Constant force: equilibrium x = F/k
    assert.ok(Math.abs(end.x - 0.25) < 0.001);

    // Velocity approaches zero
    assert.ok(Math.abs(end.v) < 0.001);
});
