
/*
 * ENCS4380 - Module 3
 * Second-Order Response Calculations
 */

// Second-order unit-step response with gain K.
export function stepResponse(t, zeta, wn, K = 1) {
    if (![t, zeta, wn, K].every(Number.isFinite) ||
        t < 0 || zeta < 0 || wn <= 0) {
        throw new Error("Invalid parameters");
    }

    // Underdamped
    if (zeta < 1) {
        const a = Math.sqrt(1 - zeta * zeta);
        const wd = wn * a;

        return K * (
            1 - Math.exp(-zeta * wn * t) *
            (Math.cos(wd * t) + zeta / a * Math.sin(wd * t))
        );
    }

    // Critically damped
    if (zeta === 1) {
        return K * (
            1 - (1 + wn * t) * Math.exp(-wn * t)
        );
    }

    // Overdamped
    const a = Math.sqrt(zeta * zeta - 1);
    const r1 = -wn * (zeta - a);
    const r2 = -wn * (zeta + a);

    return K * (
        1 + (
            r2 * Math.exp(r1 * t) -
            r1 * Math.exp(r2 * t)
        ) / (r1 - r2)
    );
}


// Calculate rise time, peak time,
// overshoot and 2% settling time.
export function responseMetrics(zeta, wn) {
    if (![zeta, wn].every(Number.isFinite) ||
        zeta <= 0 || wn <= 0) {
        throw new Error("Invalid parameters");
    }

    // Slowest decay rate
    const slowRate = zeta <= 1
        ? zeta * wn
        : wn / (zeta + Math.sqrt(zeta * zeta - 1));

    const maxTime = 12 / slowRate;
    const samples = 20000;
    const dt = maxTime / samples;

    let t10 = null;
    let t90 = null;
    let settlingTime = null;

    function interpolate(t, y0, y1, level) {
        if (Math.abs(y1 - y0) < 1e-15) {
            return t;
        }

        return t - dt + dt * (level - y0) / (y1 - y0);
    }

    for (let i = 1; i <= samples; i++) {
        const t = i * dt;
        const previous = stepResponse(t - dt, zeta, wn);
        const current = stepResponse(t, zeta, wn);

        if (t10 === null &&
            previous < 0.1 && current >= 0.1) {
            t10 = interpolate(t, previous, current, 0.1);
        }

        if (t90 === null &&
            previous < 0.9 && current >= 0.9) {
            t90 = interpolate(t, previous, current, 0.9);
        }

        const wasOutside = Math.abs(previous - 1) > 0.02;
        const isOutside = Math.abs(current - 1) > 0.02;

        if (wasOutside !== isOutside) {
            const outsideValue = wasOutside ? previous : current;
            const boundary = outsideValue > 1 ? 1.02 : 0.98;

            settlingTime = interpolate(
                t, previous, current, boundary
            );
        }
    }

    let peakTime = null;
    let overshoot = 0;

    if (zeta < 1) {
        const a = Math.sqrt(1 - zeta * zeta);

        peakTime = Math.PI / (wn * a);
        overshoot = 100 * Math.exp(-Math.PI * zeta / a);
    }

    return {
        riseTime: t10 !== null && t90 !== null
            ? t90 - t10
            : null,
        peakTime,
        overshoot,
        settlingTime
    };
}


// Calculate the two system poles.
export function calculatePoles(zeta, wn) {
    if (![zeta, wn].every(Number.isFinite) ||
        zeta < 0 || wn <= 0) {
        throw new Error("Invalid parameters");
    }

    const real = -zeta * wn;

    // Complex-conjugate poles
    if (zeta < 1) {
        const imaginary = wn * Math.sqrt(1 - zeta * zeta);

        return [
            { re: real, im: imaginary },
            { re: real, im: -imaginary }
        ];
    }

    // Repeated real pole
    if (zeta === 1) {
        return [
            { re: -wn, im: 0 },
            { re: -wn, im: 0 }
        ];
    }

    // Two distinct real poles
    const a = wn * Math.sqrt(zeta * zeta - 1);

    return [
        { re: real + a, im: 0 },
        { re: real - a, im: 0 }
    ];
}

/*
 * STATE-SPACE MODEL
 * Mass-spring-damper system:
 *
 * m*x'' + b*x' + k*x = F(t)
 */

export function stateSpaceModel(m, b, k) {
    if (![m, b, k].every(Number.isFinite) ||
        m <= 0 || b < 0 || k <= 0) {
        throw new Error("Invalid mass, damping, or stiffness");
    }

    // State matrix A
    const A = [
        [0, 1],
        [-k / m, -b / m]
    ];

    // Input matrix B
    const B = [
        [0],
        [1 / m]
    ];

    // Equivalent second-order parameters
    const wn = Math.sqrt(k / m);
    const zeta = b / (2 * Math.sqrt(m * k));

    // Eigenvalues of A = poles of the system
    const eigenvalues = calculatePoles(zeta, wn);

    return { A, B, wn, zeta, eigenvalues };
}


// Simulate displacement and velocity over time.
// Uses fourth-order Runge-Kutta (RK4).
export function phaseTrajectory(
    m, b, k,
    force = 1,
    duration = 12,
    steps = 1200
) {
    stateSpaceModel(m, b, k);

    if (!Number.isFinite(force) ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        !Number.isInteger(steps) ||
        steps < 1) {
        throw new Error("Invalid simulation settings");
    }

    const dt = duration / steps;

    // Initial state: system starts at rest
    let x = 0;
    let v = 0;

    const trajectory = [{ t: 0, x: 0, v: 0 }];

    // State derivatives:
    // dx/dt = v
    // dv/dt = (F - b*v - k*x) / m
    function derivatives(x, v) {
        return {
            dx: v,
            dv: (force - b * v - k * x) / m
        };
    }

    for (let i = 1; i <= steps; i++) {
        const a = derivatives(x, v);

        const c = derivatives(
            x + dt * a.dx / 2,
            v + dt * a.dv / 2
        );

        const d = derivatives(
            x + dt * c.dx / 2,
            v + dt * c.dv / 2
        );

        const e = derivatives(
            x + dt * d.dx,
            v + dt * d.dv
        );

        x += dt / 6 * (
            a.dx + 2 * c.dx + 2 * d.dx + e.dx
        );

        v += dt / 6 * (
            a.dv + 2 * c.dv + 2 * d.dv + e.dv
        );

        trajectory.push({
            t: i * dt,
            x,
            v
        });
    }

    return trajectory;
}
