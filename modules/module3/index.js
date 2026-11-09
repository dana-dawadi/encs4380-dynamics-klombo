
import {
    stepResponse,
    responseMetrics,
    calculatePoles,
    stateSpaceModel,
    phaseTrajectory
} from "./calculations.js";

export function mount(root) {

    // ========================================
    // 1. BUILD THE WEBPAGE
    // ========================================

    root.innerHTML = `
        <div class="module3">

            <header class="m3-heading">
                <p class="m3-eyebrow">
                    MODULE 03 / SECOND-ORDER RESPONSE
                </p>

                <h1>
                    Why do some sensors oscillate before settling?
                </h1>

                <p>
                    Explore how damping ratio and natural frequency
                    shape a second-order system's response.
                </p>
            </header>

            <!-- MAIN RESPONSE SECTION -->

            <div class="m3-workspace">

                <section class="m3-controls">
                    <h2>Set up the system</h2>

                    <div class="m3-slider">
                        <label for="m3-zeta">
                            Damping ratio (ζ)
                        </label>

                        <output id="m3-zeta-value">0.50</output>

                        <input
                            id="m3-zeta"
                            type="range"
                            min="0.1"
                            max="2"
                            step="0.05"
                            value="0.5"
                        >

                        <div class="m3-range">
                            <span>0.10</span>
                            <span>2.00</span>
                        </div>
                    </div>

                    <div class="m3-slider">
                        <label for="m3-wn">
                            Natural frequency (ωn)
                        </label>

                        <output id="m3-wn-value">
                            2.0 rad/s
                        </output>

                        <input
                            id="m3-wn"
                            type="range"
                            min="0.5"
                            max="10"
                            step="0.5"
                            value="2"
                        >

                        <div class="m3-range">
                            <span>0.5 rad/s</span>
                            <span>10 rad/s</span>
                        </div>
                    </div>

                    <div class="m3-presets">
                        <p>Try a damping case</p>

                        <button type="button" data-preset="0.5">
                            Underdamped
                        </button>

                        <button type="button" data-preset="1">
                            Critically damped
                        </button>

                        <button type="button" data-preset="2">
                            Overdamped
                        </button>
                    </div>

                    <div class="m3-status">
                        <span>Current behavior</span>

                        <strong id="m3-damping-type">
                            Underdamped
                        </strong>

                        <p id="m3-damping-description"></p>
                    </div>

                    <div class="m3-equation">
                        <span>Transfer function</span>

                        <p>
                            G(s) = Kωn² / (s² + 2ζωns + ωn²)
                        </p>
                    </div>
                </section>

                <!-- STEP RESPONSE GRAPH -->

                <section class="m3-chart-card">
                    <div class="m3-chart-heading">
                        <div>
                            <h2>Step response</h2>

                            <p>
                                Unit step · K = 1 · Live simulation
                            </p>
                        </div>

                        <span>Time domain</span>
                    </div>

                    <canvas
                        id="m3-chart"
                        width="800"
                        height="400"
                        role="img"
                        aria-label="Second-order step response"
                    ></canvas>

                    <div class="m3-legend">
                        <span class="m3-output">
                            Sensor response
                        </span>

                        <span class="m3-target">
                            Final value
                        </span>

                        <span class="m3-band">
                            2% settling band
                        </span>
                    </div>
                </section>
            </div>

            <!-- RESPONSE METRICS -->

            <section class="m3-metrics">
                <div>
                    <span>Rise time (10–90%)</span>
                    <strong id="m3-rise">—</strong>
                    <small>Time between 10% and 90%</small>
                </div>

                <div>
                    <span>Peak time</span>
                    <strong id="m3-peak">—</strong>
                    <small>Time of first maximum</small>
                </div>

                <div>
                    <span>Overshoot</span>
                    <strong id="m3-overshoot">—</strong>
                    <small>Percentage above final value</small>
                </div>

                <div>
                    <span>Settling time (2%)</span>
                    <strong id="m3-settling">—</strong>
                    <small>Remains within ±2%</small>
                </div>
            </section>

            <!-- POLE PLOT -->

            <section class="m3-poles">
                <div class="m3-chart-heading">
                    <div>
                        <h2>Poles in the s-plane</h2>

                        <p>
                            Observe how the pole locations change
                            when the system parameters change.
                        </p>
                    </div>

                    <span>Complex plane</span>
                </div>

                <canvas
                    id="m3-poles-chart"
                    width="800"
                    height="350"
                    role="img"
                    aria-label="Poles in the complex plane"
                ></canvas>

                <div class="m3-pole-values">
                    <div>
                        <span>First pole (s₁)</span>
                        <strong id="m3-pole1">—</strong>
                    </div>

                    <div>
                        <span>Second pole (s₂)</span>
                        <strong id="m3-pole2">—</strong>
                    </div>
                </div>

                <p id="m3-pole-explanation" class="m3-note"></p>
            </section>

            <!-- STATE SPACE SECTION -->

            <section class="m3-state-space">
                <div class="m3-chart-heading">
                    <div>
                        <h2>State-space model</h2>

                        <p>
                            Explore the same second-order system
                            using mass, damping, and spring stiffness.
                        </p>
                    </div>

                    <span>Mass-spring-damper</span>
                </div>

                <div class="m3-state-workspace">

                    <!-- PHYSICAL CONTROLS -->

                    <div class="m3-physical-controls">
                        <h3>Physical parameters</h3>

                        <label for="m3-mass">
                            Mass (m)
                            <output id="m3-mass-value">
                                1.00 kg
                            </output>
                        </label>

                        <input
                            id="m3-mass"
                            type="range"
                            min="0.5"
                            max="3"
                            step="0.1"
                            value="1"
                        >

                        <label for="m3-damping">
                            Damping coefficient (b)
                            <output id="m3-damping-value">
                                2.00 N·s/m
                            </output>
                        </label>

                        <input
                            id="m3-damping"
                            type="range"
                            min="0.01"
                            max="120"
                            step="any"
                            value="2"
                        >

                        <label for="m3-stiffness">
                            Spring stiffness (k)
                            <output id="m3-stiffness-value">
                                4.00 N/m
                            </output>
                        </label>

                        <input
                            id="m3-stiffness"
                            type="range"
                            min="0.1"
                            max="300"
                            step="any"
                            value="4"
                        >

                        <button
                            type="button"
                            id="m3-state-reset"
                        >
                            Professor's example: m=1, b=2, k=4
                        </button>
                    </div>

                    <!-- MATRICES AND EIGENVALUES -->

                    <div class="m3-state-results">
                        <h3>State-space matrices</h3>

                        <p class="m3-math-label">
                            x' = Ax + BF(t)
                        </p>

                        <div class="m3-matrix-row">
                            <div>
                                <span>Matrix A</span>

                                <div
                                    class="m3-matrix"
                                    id="m3-matrix-a"
                                ></div>
                            </div>

                            <div>
                                <span>Matrix B</span>

                                <div
                                    class="m3-matrix"
                                    id="m3-matrix-b"
                                ></div>
                            </div>
                        </div>

                        <div class="m3-state-values">
                            <div>
                                <span>Damping ratio ζ</span>

                                <strong id="m3-state-zeta">
                                    0.500
                                </strong>
                            </div>

                            <div>
                                <span>Natural frequency ωn</span>

                                <strong id="m3-state-wn">
                                    2.000 rad/s
                                </strong>
                            </div>
                        </div>

                        <h3>Eigenvalues vs. poles</h3>

                        <p class="m3-note">
                            The eigenvalues of A must equal
                            the transfer-function poles.
                        </p>

                        <div class="m3-eigen-table">
                            <div>
                                <span>Eigenvalues of A</span>

                                <strong id="m3-eigenvalues">
                                    —
                                </strong>
                            </div>

                            <div>
                                <span>Transfer-function poles</span>

                                <strong id="m3-state-poles">
                                    —
                                </strong>
                            </div>
                        </div>

                        <p
                            id="m3-eigen-match"
                            class="m3-match"
                        ></p>
                    </div>
                </div>

                <!-- PHASE PLANE -->

                <div class="m3-phase-section">
                    <h2>Phase-plane trajectory</h2>

                    <p>
                        Displacement x₁ versus velocity x₂
                        during a constant-force step input.
                    </p>

                    <canvas
                        id="m3-phase-chart"
                        width="800"
                        height="400"
                        role="img"
                        aria-label="Phase-plane trajectory"
                    ></canvas>

                    <p
                        id="m3-phase-description"
                        class="m3-note"
                    ></p>
                </div>
            </section>

            <!-- EDUCATIONAL EXPLANATIONS -->

<section class="m3-predict">
    <div>
        <p class="m3-eyebrow">PREDICT, THEN CHECK</p>
        <h2>What happens when damping increases?</h2>
        <p>
            Starting at ζ = 0.5 and ωn = 2 rad/s,
            predict what happens to overshoot when
            ζ increases to 1.
        </p>
    </div>

    <div>
        <label for="m3-prediction">Your prediction</label>

        <select id="m3-prediction">
            <option value="">Choose an answer...</option>
            <option value="increase">Overshoot increases</option>
            <option value="same">Overshoot stays at 16.3%</option>
            <option value="zero">Overshoot becomes 0%</option>
        </select>

        <button type="button" id="m3-check-prediction">
            Apply and check
        </button>

        <p id="m3-prediction-feedback"
           role="status" aria-live="polite"></p>
    </div>
</section>
            <!-- Prediction section -->


<!-- Validation table -->

            
<section class="m3-validation">
    <h2>Module 3 validation checks</h2>
    <p>Automatic checks against the lecture reference values.</p>

    <div class="m3-table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Test</th>
                    <th>Expected</th>
                    <th>Calculated</th>
                    <th>Status</th>
                </tr>
            </thead>

            <tbody id="m3-validation-results"></tbody>
        </table>
    </div>
</section>

        </div>
    `;

    // ========================================
    // 2. GET HTML ELEMENTS
    // ========================================

    const zetaSlider = root.querySelector("#m3-zeta");
    const wnSlider = root.querySelector("#m3-wn");

    const massSlider = root.querySelector("#m3-mass");
    const dampingSlider = root.querySelector("#m3-damping");
    const stiffnessSlider = root.querySelector("#m3-stiffness");

    const resetButton = root.querySelector("#m3-state-reset");

    const presets = [
        ...root.querySelectorAll("[data-preset]")
    ];

    const responseCanvas = root.querySelector("#m3-chart");
    const polesCanvas = root.querySelector("#m3-poles-chart");
    const phaseCanvas = root.querySelector("#m3-phase-chart");

    const responseCtx = responseCanvas.getContext("2d");
    const polesCtx = polesCanvas.getContext("2d");
    const phaseCtx = phaseCanvas.getContext("2d");

    // ========================================
    // 3. HELPER FUNCTIONS
    // ========================================

    function drawLine(ctx, x1, y1, x2, y2, color, width = 1) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);

        ctx.stroke();
    }

    function formatTime(value) {
        if (value === null || !Number.isFinite(value)) {
            return "—";
        }

        return value.toFixed(2) + " s";
    }

    function formatPole(pole) {
        const real = pole.re.toFixed(3);

        if (Math.abs(pole.im) < 1e-9) {
            return real;
        }

        const sign = pole.im >= 0 ? "+" : "−";

        return real + " " + sign +
            " j" + Math.abs(pole.im).toFixed(3);
    }

    function formatPair(poles) {
        return poles.map(formatPole).join(" | ");
    }

    // ========================================
    // 4. STEP RESPONSE GRAPH
    // ========================================

    function drawResponse(zeta, wn, metrics) {
        const ctx = responseCtx;

        const width = responseCanvas.width;
        const height = responseCanvas.height;

        const left = 65;
        const right = 25;
        const top = 30;
        const bottom = 55;

        const plotW = width - left - right;
        const plotH = height - top - bottom;

        const slowRate = zeta <= 1
            ? zeta * wn
            : wn / (
                zeta + Math.sqrt(zeta * zeta - 1)
            );

        const maxTime = Math.max(5, 8 / slowRate);

        const maxY = Math.max(
            1.2,
            1 + metrics.overshoot / 100 + 0.15
        );

        const px = t =>
            left + t / maxTime * plotW;

        const py = y =>
            height - bottom - y / maxY * plotH;

        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        // Draw 2% settling band.
        ctx.fillStyle = "rgba(22,116,83,0.07)";

        ctx.fillRect(
            left,
            py(1.02),
            plotW,
            py(0.98) - py(1.02)
        );

        // Horizontal grid lines.
        for (let i = 0; i <= 8; i++) {
            const value = maxY * i / 8;
            const y = py(value);

            drawLine(
                ctx, left, y,
                width - right, y, "#e7ece5"
            );

            ctx.fillStyle = "#526b65";
            ctx.font = "12px Arial";
            ctx.textAlign = "right";

            ctx.fillText(
                value.toFixed(2),
                left - 9,
                y + 4
            );
        }

        // Vertical grid lines.
        for (let i = 0; i <= 5; i++) {
            const t = maxTime * i / 5;
            const x = px(t);

            drawLine(
                ctx, x, top,
                x, height - bottom, "#e7ece5"
            );

            ctx.fillStyle = "#526b65";
            ctx.textAlign = "center";

            ctx.fillText(
                t.toFixed(1),
                x,
                height - bottom + 21
            );
        }

        // Axes.
        drawLine(
            ctx, left, top,
            left, height - bottom,
            "#71877c", 1.5
        );

        drawLine(
            ctx, left, height - bottom,
            width - right, height - bottom,
            "#71877c", 1.5
        );

        // Final value.
        ctx.save();
        ctx.setLineDash([8, 5]);

        drawLine(
            ctx, left, py(1),
            width - right, py(1),
            "#a96726", 1.5
        );

        ctx.restore();

        // Response curve.
        ctx.save();

        ctx.beginPath();
        ctx.rect(left, top, plotW, plotH);
        ctx.clip();

        ctx.beginPath();
        ctx.strokeStyle = "#167453";
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";

        const samples = 800;

        for (let i = 0; i <= samples; i++) {
            const t = maxTime * i / samples;
            const y = stepResponse(t, zeta, wn);

            if (i === 0) {
                ctx.moveTo(px(t), py(y));
            } else {
                ctx.lineTo(px(t), py(y));
            }
        }

        ctx.stroke();

        // Peak marker.
        if (metrics.peakTime !== null &&
            metrics.peakTime <= maxTime) {

            const t = metrics.peakTime;
            const y = stepResponse(t, zeta, wn);

            ctx.fillStyle = "#a96726";
            ctx.beginPath();
            ctx.arc(px(t), py(y), 5, 0, 2 * Math.PI);
            ctx.fill();
        }

        // Settling time marker.
        if (metrics.settlingTime !== null &&
            metrics.settlingTime <= maxTime) {

            ctx.save();
            ctx.setLineDash([4, 5]);

            drawLine(
                ctx,
                px(metrics.settlingTime),
                top,
                px(metrics.settlingTime),
                height - bottom,
                "#779d86"
            );

            ctx.restore();
        }

        ctx.restore();

        // Axis labels.
        ctx.fillStyle = "#526b65";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";

        ctx.fillText(
            "Time (s)",
            width / 2,
            height - 12
        );

        ctx.save();
        ctx.translate(18, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("Output y(t)", 0, 0);
        ctx.restore();
    }

    // ========================================
    // 5. POLES IN S-PLANE
    // ========================================

    function drawPoles(zeta, wn) {
        const poles = calculatePoles(zeta, wn);
        const ctx = polesCtx;

        const width = polesCanvas.width;
        const height = polesCanvas.height;

        const left = 65;
        const right = 35;
        const top = 30;
        const bottom = 55;

        const plotW = width - left - right;
        const plotH = height - top - bottom;

        const xMin = -2.5 * wn;
        const xMax = 0.3 * wn;

        const yMin = -1.25 * wn;
        const yMax = 1.25 * wn;

        const px = re =>
            left + (re - xMin) / (xMax - xMin) * plotW;

        const py = im =>
            top + (yMax - im) / (yMax - yMin) * plotH;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        // Grid lines.
        for (let i = 0; i <= 8; i++) {
            const x = left + i / 8 * plotW;
            const y = top + i / 8 * plotH;

            drawLine(
                ctx, x, top,
                x, height - bottom,
                "#e7ece5"
            );

            drawLine(
                ctx, left, y,
                width - right, y,
                "#e7ece5"
            );
        }

        // Real axis.
        drawLine(
            ctx,
            left, py(0),
            width - right, py(0),
            "#71877c", 2
        );

        // Imaginary axis.
        drawLine(
            ctx,
            px(0), top,
            px(0), height - bottom,
            "#71877c", 2
        );

        // Pole markers.
        poles.forEach((pole, index) => {
            const x = px(pole.re);
            const y = py(pole.im);

            const repeated =
                index === 1 &&
                pole.re === poles[0].re &&
                pole.im === poles[0].im;

            const size = repeated ? 11 : 7;

            drawLine(
                ctx,
                x - size, y - size,
                x + size, y + size,
                "#167453", 3
            );

            drawLine(
                ctx,
                x + size, y - size,
                x - size, y + size,
                "#167453", 3
            );
        });

        // Labels.
        ctx.fillStyle = "#526b65";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";

        ctx.fillText(
            "Real axis",
            width / 2,
            height - 12
        );

        ctx.save();
        ctx.translate(18, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("Imaginary axis", 0, 0);
        ctx.restore();

        root.querySelector("#m3-pole1").textContent =
            formatPole(poles[0]);

        root.querySelector("#m3-pole2").textContent =
            formatPole(poles[1]);
    }

    // ========================================
    // 6. STATE-SPACE MATRICES
    // ========================================

    function showMatrix(selector, values) {
        const element = root.querySelector(selector);

        element.replaceChildren();

        for (const valuesRow of values) {
            const row = document.createElement("div");
            row.className = "m3-matrix-line";

            for (const value of valuesRow) {
                const cell = document.createElement("span");

                cell.textContent = value.toFixed(3);
                row.appendChild(cell);
            }

            element.appendChild(row);
        }
    }

    // ========================================
    // 7. PHASE-PLANE GRAPH
    // ========================================

    function drawPhasePlane(m, b, k, model) {
        const ctx = phaseCtx;

        const width = phaseCanvas.width;
        const height = phaseCanvas.height;

        const left = 70;
        const right = 35;
        const top = 35;
        const bottom = 55;

        const plotW = width - left - right;
        const plotH = height - top - bottom;

        const poles = model.eigenvalues;

        const slowRate = Math.max(
            0.001,
            Math.min(...poles.map(p => -p.re))
        );

        const duration = Math.min(
            60,
            10 / slowRate
        );

        // Choose a small enough RK4 time step.
        const fastestRate = Math.max(
            model.wn,
            ...poles.map(p => Math.hypot(p.re, p.im))
        );

        const steps = Math.min(
            30000,
            Math.max(
                1600,
                Math.ceil(duration * fastestRate * 25)
            )
        );

        // Simulate constant force F = 1 N.
        const path = phaseTrajectory(
            m, b, k, 1, duration, steps
        );

        const equilibrium = 1 / k;

        let xMin = Math.min(0, equilibrium);
        let xMax = Math.max(0, equilibrium);
        let vMin = 0;
        let vMax = 0;

        for (const point of path) {
            xMin = Math.min(xMin, point.x);
            xMax = Math.max(xMax, point.x);

            vMin = Math.min(vMin, point.v);
            vMax = Math.max(vMax, point.v);
        }

        const xPadding = Math.max(
            0.02,
            (xMax - xMin) * 0.15
        );

        const vPadding = Math.max(
            0.02,
            (vMax - vMin) * 0.20
        );

        const xmin = xMin - xPadding;
        const xmax = xMax + xPadding;

        const ymin = vMin - vPadding;
        const ymax = vMax + vPadding;

        const px = x =>
            left + (x - xmin) / (xmax - xmin) * plotW;

        const py = v =>
            top + (ymax - v) / (ymax - ymin) * plotH;

        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        // Grid.
        for (let i = 0; i <= 8; i++) {
            const x = left + i / 8 * plotW;
            const y = top + i / 8 * plotH;

            drawLine(
                ctx, x, top,
                x, height - bottom,
                "#e7ece5"
            );

            drawLine(
                ctx, left, y,
                width - right, y,
                "#e7ece5"
            );
        }

        // Zero axes.
        drawLine(
            ctx,
            px(0), top,
            px(0), height - bottom,
            "#71877c", 1.5
        );

        drawLine(
            ctx,
            left, py(0),
            width - right, py(0),
            "#71877c", 1.5
        );

        // Draw phase trajectory.
        ctx.save();

        ctx.beginPath();
        ctx.rect(left, top, plotW, plotH);
        ctx.clip();

        ctx.beginPath();
        ctx.strokeStyle = "#167453";
        ctx.lineWidth = 3;

        path.forEach((point, i) => {
            if (i === 0) {
                ctx.moveTo(px(point.x), py(point.v));
            } else {
                ctx.lineTo(px(point.x), py(point.v));
            }
        });

        ctx.stroke();

        // Starting point.
        ctx.fillStyle = "#a96726";
        ctx.beginPath();
        ctx.arc(px(0), py(0), 5, 0, 2 * Math.PI);
        ctx.fill();

        // Equilibrium.
        ctx.fillStyle = "#167453";
        ctx.beginPath();

        ctx.arc(
            px(equilibrium),
            py(0),
            6,
            0,
            2 * Math.PI
        );

        ctx.fill();

        ctx.restore();

        // Labels.
        ctx.fillStyle = "#526b65";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";

        ctx.fillText(
            "Displacement x₁ (m)",
            width / 2,
            height - 12
        );

        ctx.save();

        ctx.translate(18, height / 2);
        ctx.rotate(-Math.PI / 2);

        ctx.fillText(
            "Velocity x₂ (m/s)",
            0,
            0
        );

        ctx.restore();

        let description;

        if (model.zeta < 1 - 1e-9) {
            description =
                "Underdamped: the trajectory spirals toward equilibrium.";
        } else if (model.zeta > 1 + 1e-9) {
            description =
                "Overdamped: the trajectory approaches equilibrium without spiraling.";
        } else {
            description =
                "Critically damped: the trajectory approaches equilibrium without spiraling.";
        }

        root.querySelector("#m3-phase-description").textContent =
            description +
            " Orange dot: starting point. Green dot: equilibrium.";
    }

    // ========================================
    // 8. UPDATE STATE-SPACE PANEL
    // ========================================

    function updateStateSpace() {
        const m = Number(massSlider.value);
        const b = Number(dampingSlider.value);
        const k = Number(stiffnessSlider.value);

        const model = stateSpaceModel(m, b, k);

        root.querySelector("#m3-mass-value").textContent =
            m.toFixed(2) + " kg";

        root.querySelector("#m3-damping-value").textContent =
            b.toFixed(2) + " N·s/m";

        root.querySelector("#m3-stiffness-value").textContent =
            k.toFixed(2) + " N/m";

        showMatrix("#m3-matrix-a", model.A);
        showMatrix("#m3-matrix-b", model.B);

        root.querySelector("#m3-state-zeta").textContent =
            model.zeta.toFixed(3);

        root.querySelector("#m3-state-wn").textContent =
            model.wn.toFixed(3) + " rad/s";

        const eigenvalues = model.eigenvalues;

        const poles = calculatePoles(
            model.zeta,
            model.wn
        );

        root.querySelector("#m3-eigenvalues").textContent =
            formatPair(eigenvalues);

        root.querySelector("#m3-state-poles").textContent =
            formatPair(poles);

        const match = eigenvalues.every((value, i) =>
            Math.abs(value.re - poles[i].re) < 1e-9 &&
            Math.abs(value.im - poles[i].im) < 1e-9
        );

        root.querySelector("#m3-eigen-match").textContent =
            match
                ? "PASS — Eigenvalues equal poles"
                : "FAIL — Eigenvalues differ from poles";

        drawPhasePlane(m, b, k, model);
    }

    // ========================================
    // 9. UPDATE MAIN RESPONSE PANEL
    // ========================================

    function updateMain() {
        const zeta = Number(zetaSlider.value);
        const wn = Number(wnSlider.value);

        root.querySelector("#m3-zeta-value").textContent =
            zeta.toFixed(3);

        root.querySelector("#m3-wn-value").textContent =
            wn.toFixed(3) + " rad/s";

        let type;
        let description;
        let poleExplanation;

        if (zeta < 1 - 1e-9) {
            type = "Underdamped";

            description =
                "The response oscillates and overshoots.";

            poleExplanation =
                "Two complex-conjugate poles. " +
                "Their imaginary parts produce oscillation.";

        } else if (zeta > 1 + 1e-9) {
            type = "Overdamped";

            description =
                "The response rises without oscillation.";

            poleExplanation =
                "Two negative real poles. " +
                "The slower pole dominates the response.";

        } else {
            type = "Critically damped";

            description =
                "The response has no oscillation or overshoot.";

            poleExplanation =
                "Two repeated negative real poles.";
        }

        root.querySelector("#m3-damping-type").textContent =
            type;

        root.querySelector("#m3-damping-description").textContent =
            description;

        root.querySelector("#m3-pole-explanation").textContent =
            poleExplanation;

        const metrics = responseMetrics(zeta, wn);

        root.querySelector("#m3-rise").textContent =
            formatTime(metrics.riseTime);

        root.querySelector("#m3-peak").textContent =
            formatTime(metrics.peakTime);

        root.querySelector("#m3-overshoot").textContent =
            metrics.overshoot.toFixed(1) + "%";

        root.querySelector("#m3-settling").textContent =
            formatTime(metrics.settlingTime);

        drawResponse(zeta, wn, metrics);
        drawPoles(zeta, wn);
    }

    // ========================================
    // 10. SYNCHRONIZE THE SLIDERS
    // ========================================

    // Main sliders -> physical parameters.
    function syncPhysicalFromMain() {
        const m = Number(massSlider.value);
        const zeta = Number(zetaSlider.value);
        const wn = Number(wnSlider.value);

        const b = 2 * zeta * wn * m;
        const k = wn * wn * m;

        dampingSlider.max = Math.max(
            120,
            Math.ceil(b + 1)
        );

        stiffnessSlider.max = Math.max(
            300,
            Math.ceil(k + 1)
        );

        // Allow exact derived physical values.
        dampingSlider.step = "any";
        stiffnessSlider.step = "any";

        dampingSlider.value = b;
        stiffnessSlider.value = k;
    }

    // Physical parameters -> main sliders.
    function syncMainFromPhysical() {
        const m = Number(massSlider.value);
        const b = Number(dampingSlider.value);
        const k = Number(stiffnessSlider.value);

        const model = stateSpaceModel(m, b, k);

        zetaSlider.min = 0.001;
        zetaSlider.max = Math.max(
            2,
            model.zeta + 0.01
        );

        wnSlider.min = 0.01;
        wnSlider.max = Math.max(
            10,
            model.wn + 0.01
        );

        // Avoid rounding values calculated from m, b, k.
        zetaSlider.step = "any";
        wnSlider.step = "any";

        zetaSlider.value = model.zeta;
        wnSlider.value = model.wn;

        updateMain();
        updateStateSpace();
    }

    function onMainChange() {
        syncPhysicalFromMain();

        updateMain();
        updateStateSpace();
    }

    function onPhysicalChange() {
        syncMainFromPhysical();
    }

    // ========================================
    // 11. BUTTON HANDLERS
    // ========================================

    function choosePreset(event) {
        const zeta = Number(
            event.currentTarget.dataset.preset
        );

        zetaSlider.value = zeta;

        onMainChange();
    }

    function resetStateSpace() {
        massSlider.value = 1;
        dampingSlider.value = 2;
        stiffnessSlider.value = 4;

        syncMainFromPhysical();
    }

function checkPrediction() {
    const answer = root.querySelector("#m3-prediction").value;
    const feedback = root.querySelector("#m3-prediction-feedback");

    if (!answer) {
        feedback.textContent = "Choose an answer first.";
        return;
    }

    // Apply the change from the question.
    wnSlider.value = 2;
    zetaSlider.value = 1;

    onMainChange();

    const before = responseMetrics(0.5, 2);
    const after = responseMetrics(1, 2);

    if (answer === "zero") {
        feedback.textContent =
            "Correct! Overshoot drops from " +
            before.overshoot.toFixed(1) + "% to " +
            after.overshoot.toFixed(1) +
            "%. Critical damping produces no overshoot.";
    } else {
        feedback.textContent =
            "Not quite. Overshoot decreases from " +
            before.overshoot.toFixed(1) +
            "% to 0%. At ζ = 1, the system is critically damped.";
    }

    document.querySelector("#m3-chart")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

const predictionButton =
    root.querySelector("#m3-check-prediction");

predictionButton.addEventListener("click", checkPrediction);

function runValidation() {
    const under = responseMetrics(0.5, 2);
    const critical = responseMetrics(1, 2);
    const model = stateSpaceModel(1, 2, 4);

    const expectedPoles = [
        { re: -1, im: Math.sqrt(3) },
        { re: -1, im: -Math.sqrt(3) }
    ];

    const poleMatch = model.eigenvalues.every((p, i) =>
        Math.abs(p.re - expectedPoles[i].re) < 0.001 &&
        Math.abs(p.im - expectedPoles[i].im) < 0.001
    );

    const tests = [
        {
            name: "Underdamped overshoot",
            expected: "16.3%",
            actual: under.overshoot.toFixed(2) + "%",
            pass: Math.abs(under.overshoot - 16.3) < 0.1
        },
        {
            name: "Critical damping",
            expected: "0% overshoot",
            actual: critical.overshoot.toFixed(2) + "%",
            pass: Math.abs(critical.overshoot) < 1e-9
        },
        {
            name: "State-space eigenvalues",
            expected: "-1 ± j1.732",
            actual: formatPair(model.eigenvalues),
            pass: poleMatch
        }
    ];

    const tbody = root.querySelector("#m3-validation-results");
    tbody.replaceChildren();

    for (const result of tests) {
        const tr = document.createElement("tr");

        for (const value of [
            result.name,
            result.expected,
            result.actual,
            result.pass ? "PASS" : "FAIL"
        ]) {
            const td = document.createElement("td");
            td.textContent = value;
            tr.appendChild(td);
        }

        tr.lastElementChild.className =
            result.pass ? "m3-pass" : "m3-fail";

        tbody.appendChild(tr);
    }
}

    // ========================================
    // 12. EVENT LISTENERS
    // ========================================

    zetaSlider.addEventListener(
        "input",
        onMainChange
    );

    wnSlider.addEventListener(
        "input",
        onMainChange
    );

    massSlider.addEventListener(
        "input",
        onPhysicalChange
    );

    dampingSlider.addEventListener(
        "input",
        onPhysicalChange
    );

    stiffnessSlider.addEventListener(
        "input",
        onPhysicalChange
    );

    resetButton.addEventListener(
        "click",
        resetStateSpace
    );

    presets.forEach(button => {
        button.addEventListener(
            "click",
            choosePreset
        );
    });

    // ========================================
    // 13. INITIAL DISPLAY
    // ========================================

    syncPhysicalFromMain();

    updateMain();
    updateStateSpace();
    runValidation();
    // ========================================
    // 14. CLEANUP
    // ========================================

    return () => {
        zetaSlider.removeEventListener(
            "input",
            onMainChange
        );

        wnSlider.removeEventListener(
            "input",
            onMainChange
        );

        massSlider.removeEventListener(
            "input",
            onPhysicalChange
        );

        dampingSlider.removeEventListener(
            "input",
            onPhysicalChange
        );

        stiffnessSlider.removeEventListener(
            "input",
            onPhysicalChange
        );

        resetButton.removeEventListener(
            "click",
            resetStateSpace
        );

        presets.forEach(button => {
            button.removeEventListener(
                "click",
                choosePreset
            );
        });
    };
}
