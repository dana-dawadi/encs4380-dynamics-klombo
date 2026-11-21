import { lineChart, fmt, fmtTime } from '../control/plot.js';
import { simulateDigitalPID, measureResponse, generateArduinoCode } from './calculations.js';

const DEFAULTS = {
    plantType: 'first', kp: 2, ki: 1, kd: 0, ts: 0.1,
    K: 1, tau: 1, zeta: 0.5, wn: 2, setpoint: 1,
    duration: 8, minOutput: 0, maxOutput: 100, antiWindup: true
};

const SLIDERS = {
    kp: ['Proportional gain Kp', 0, 20, 0.1],
    ki: ['Integral gain Ki', 0, 20, 0.1],
    kd: ['Derivative gain Kd', 0, 2, 0.01],
    ts: ['Sampling time Ts (s)', 0.01, 0.5, 0.01],
    setpoint: ['Setpoint', 0.1, 10, 0.1],
    K: ['Plant gain K', 0.1, 5, 0.1],
    tau: ['Time constant tau (s)', 0.1, 5, 0.1],
    zeta: ['Damping ratio zeta', 0, 2, 0.05],
    wn: ['Natural frequency wn (rad/s)', 0.5, 20, 0.5]
};

let instanceCount = 0;

function slider(key, id) {
    const [label, min, max, step] = SLIDERS[key];
    return `<div class="p3-slider">
        <label for="${id}-${key}">${label}</label>
        <output data-value="${key}"></output>
        <input id="${id}-${key}" type="range" data-key="${key}"
            min="${min}" max="${max}" step="${step}">
        <span>${min}</span><span>${max}</span>
    </div>`;
}

const metric = (value, unit = '') => value === null ? 'Not reached' : `${fmt(value, 4)}${unit}`;

export function mount(root) {
    const id = `p3-${++instanceCount}`;
    const state = { ...DEFAULTS };
    let frame = 0;
    let active = true;
    root.classList.add('control-p3');

    root.innerHTML = `
        <header class="p3-header">
            <p class="p3-eyebrow">CONTROL · HW2 / P3</p>
            <h1>Digital PID Controller</h1>
            <p>Change the sampling interval and watch how a sampled PID controller changes a plant response. The control command stays constant between samples.</p>
            <div class="p3-equation">u[k] = Kp e[k] + Ki Ts Σe[j] + Kd (e[k] − e[k−1]) / Ts</div>
        </header>
        <div class="p3-layout">
            <section class="p3-panel p3-controls">
                <h2>Controller Settings</h2>
                <h3>Choose the plant</h3>
                <div class="p3-plant-switch" role="group" aria-label="Plant model">
                    <button type="button" data-plant="first" aria-pressed="true">First order <small>Module 1</small></button>
                    <button type="button" data-plant="second" aria-pressed="false">Second order <small>Module 3</small></button>
                </div>
                <p class="p3-help" data-plant-description></p>
                <h3>PID Gains</h3>
                ${slider('kp', id)}
                ${slider('ki', id)}
                ${slider('kd', id)}
                <h3>Digital Sampling</h3>
                ${slider('ts', id)}
                ${slider('setpoint', id)}
                <h3>Plant Parameters</h3>
                ${slider('K', id)}
                <div data-first>${slider('tau', id)}</div>
                <div data-second hidden>${slider('zeta', id)}${slider('wn', id)}</div>
                <h3>Control Limits</h3>
                <div class="p3-limits">
                    <label>Minimum u <input type="number" step="any" data-key="minOutput"></label>
                    <label>Maximum u <input type="number" step="any" data-key="maxOutput"></label>
                </div>
                <label class="p3-checkbox"><input type="checkbox" data-key="antiWindup"> Enable anti-windup</label>
                <button type="button" class="p3-reset" data-action="reset">Reset settings</button>
                <p class="p3-error" data-error role="status"></p>
            </section>
            <div class="p3-results">
                <section class="p3-panel">
                    <h2>Plant Output vs Setpoint</h2>
                    <div data-chart="output"></div>
                    <div class="p3-legend"><span class="p3-out">Plant output</span><span class="p3-set">Setpoint</span></div>
                    <div class="p3-metrics" data-metrics></div>
                </section>
                <section class="p3-panel">
                    <h2>Digital Control Signal</h2>
                    <p>Each flat step is the command held until the next sample.</p>
                    <div data-chart="control"></div>
                    <div class="p3-legend"><span class="p3-u">Control u</span><span class="p3-lim">Control limits</span></div>
                    <p class="p3-help" data-sampling></p>
                </section>
                <section class="p3-panel p3-predict">
                    <h2>Predict, then check</h2>
                    <p>With the plant and gains unchanged, what might happen if we make Ts five times larger?</p>
                    <div class="p3-choices">
                        <label><input type="radio" name="${id}-prediction" value="better"> It must become more stable</label>
                        <label><input type="radio" name="${id}-prediction" value="worse"> Overshoot or oscillation may increase</label>
                        <label><input type="radio" name="${id}-prediction" value="same"> The response must stay identical</label>
                    </div>
                    <button type="button" data-action="predict">Check prediction</button>
                    <p data-feedback aria-live="polite"></p>
                    <div data-comparison></div>
                </section>
                <section class="p3-panel">
                    <h2>Arduino PID Code</h2>
                    <p>This sketch uses your current gains, Ts, output limits, and anti-windup setting. Sensor and motor functions are hardware-dependent placeholders.</p>
                    <div class="p3-code-actions">
                        <button type="button" data-action="copy">Copy Arduino code</button>
                        <span data-copy-status role="status"></span>
                    </div>
                    <pre class="p3-code"><code data-arduino></code></pre>
                </section>
            </div>
        </div>`;

    const find = selector => root.querySelector(selector);

    function sync(force = false) {
        root.querySelectorAll('[data-key]').forEach(input => {
            const key = input.dataset.key;
            if (input.type === 'checkbox') input.checked = state[key];
            else if (force || document.activeElement !== input) input.value = state[key];
        });
        root.querySelectorAll('[data-value]').forEach(output => {
            output.textContent = fmt(state[output.dataset.value], 5);
        });
        root.querySelectorAll('[data-plant]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.plant === state.plantType));
        });
        find('[data-first]').hidden = state.plantType !== 'first';
        find('[data-second]').hidden = state.plantType !== 'second';
        find('[data-plant-description]').textContent = state.plantType === 'first'
            ? 'Model: tau · y′ + y = K · u'
            : 'Model: y″ + 2·zeta·wn·y′ + wn²·y = K·wn²·u';
    }

    function draw() {
        if (!active) return;
        sync();
        try {
            const { points, samples } = simulateDigitalPID(state);
            const metrics = measureResponse(points, state.setpoint);
            const ys = points.map(p => p.output);
            const low = Math.min(0, state.setpoint, ...ys);
            const high = Math.max(0, state.setpoint, ...ys);
            const pad = Math.max(0.1, (high - low) * 0.12);
            find('[data-chart="output"]').innerHTML = lineChart({
                xmax: state.duration, ymin: low - pad, ymax: high + pad,
                ylabel: 'Plant output', title: 'Digital PID plant response', prefix: `${id}-out`,
                series: [{ x: points.map(p => p.time), y: ys, cls: 'p3-out-line' }],
                hlines: [{ y: state.setpoint, cls: 'p3-set-line', label: 'Setpoint' }]
            });

            // Include the last held command at simulation end; step:true makes the staircases.
            const controlTimes = samples.map(p => p.time);
            const commands = samples.map(p => p.control);
            controlTimes.push(state.duration);
            commands.push(commands[commands.length - 1]);
            const lo = Math.min(state.minOutput, ...commands);
            const hi = Math.max(state.maxOutput, ...commands);
            const uPad = Math.max(0.1, (hi - lo) * 0.08);
            find('[data-chart="control"]').innerHTML = lineChart({
                xmax: state.duration, ymin: lo - uPad, ymax: hi + uPad,
                ylabel: 'Control u', title: 'Zero-order-hold control command', prefix: `${id}-control`,
                series: [{ x: controlTimes, y: commands, cls: 'p3-u-line', step: true }],
                hlines: [
                    { y: state.minOutput, cls: 'p3-limit-line', label: 'Minimum' },
                    { y: state.maxOutput, cls: 'p3-limit-line', label: 'Maximum' }
                ]
            });

            find('[data-metrics]').innerHTML = [
                ['Rise time (10–90%)', metric(metrics.riseTime, ' s')],
                ['Overshoot', metric(metrics.overshoot, '%')],
                ['Settling time (2%)', metric(metrics.settlingTime, ' s')],
                ['Error at end', metric(metrics.finalError)]
            ].map(([name, value]) => `<div><small>${name}</small><strong>${value}</strong></div>`).join('');
            find('[data-sampling]').textContent = `Ts = ${fmtTime(state.ts)}; ${fmt(1 / state.ts)} updates/s; ${samples.length} updates over ${state.duration} s.`;
            find('[data-arduino]').textContent = generateArduinoCode(state);
            find('[data-error]').textContent = '';
        } catch (err) {
            find('[data-error]').textContent = err.message;
        }
    }

    function queueDraw() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(draw);
    }

    function clearPrediction() {
        find('[data-feedback]').textContent = '';
        find('[data-comparison]').innerHTML = '';
    }

    function onInput(event) {
        const input = event.target;
        const key = input.dataset.key;
        if (!key) return;
        state[key] = input.type === 'checkbox' ? input.checked : Number(input.value);
        clearPrediction();
        queueDraw();
    }

    async function onClick(event) {
        const button = event.target.closest('button');
        if (!button || !root.contains(button)) return;

        if (button.dataset.plant) {
            state.plantType = button.dataset.plant;
            clearPrediction();
            sync(true);
            queueDraw();
            return;
        }
        if (button.dataset.action === 'reset') {
            Object.assign(state, DEFAULTS);
            root.querySelectorAll(`input[name="${id}-prediction"]`).forEach(r => { r.checked = false; });
            clearPrediction();
            sync(true);
            queueDraw();
            return;
        }
        if (button.dataset.action === 'copy') {
            const code = generateArduinoCode(state);
            try {
                await navigator.clipboard.writeText(code);
                find('[data-copy-status]').textContent = 'Copied!';
            } catch {
                find('[data-copy-status]').textContent = 'Clipboard unavailable; select the code and copy manually.';
            }
            return;
        }
        if (button.dataset.action === 'predict') {
            const selected = find(`input[name="${id}-prediction"]:checked`);
            if (!selected) {
                find('[data-feedback]').textContent = 'Select your prediction first.';
                return;
            }
            const slowTs = Math.min(state.ts * 5, state.duration / 2);
            if (slowTs <= state.ts) {
                find('[data-feedback]').textContent = 'Use a smaller Ts first for this experiment.';
                return;
            }
            try {
                const baseline = simulateDigitalPID(state);
                const slower = simulateDigitalPID({ ...state, ts: slowTs });
                const baseMetrics = measureResponse(baseline.points, state.setpoint);
                const slowMetrics = measureResponse(slower.points, state.setpoint);
                find('[data-feedback]').textContent =
                    `${selected.value === 'worse' ? 'Good prediction. ' : 'The response may worsen, but it depends on the gains and plant. '}` +
                    `Overshoot: ${fmt(baseMetrics.overshoot)}% at Ts=${fmtTime(state.ts)}, versus ${fmt(slowMetrics.overshoot)}% at Ts=${fmtTime(slowTs)}.`;
                const combined = [...baseline.points.map(p => p.output), ...slower.points.map(p => p.output)];
                const low = Math.min(0, ...combined, state.setpoint);
                const high = Math.max(0, ...combined, state.setpoint);
                const pad = Math.max(0.1, (high - low) * 0.12);
                find('[data-comparison]').innerHTML = lineChart({
                    xmax: state.duration, ymin: low - pad, ymax: high + pad, height: 245,
                    ylabel: 'Output', title: 'Current Ts (green) vs slower Ts (orange)', prefix: `${id}-compare`,
                    series: [
                        { x: baseline.points.map(p => p.time), y: baseline.points.map(p => p.output), cls: 'p3-out-line' },
                        { x: slower.points.map(p => p.time), y: slower.points.map(p => p.output), cls: 'p3-set-line' }
                    ]
                });
            } catch (err) {
                find('[data-feedback]').textContent = err.message;
            }
        }
    }

    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('click', onClick);
    sync(true);
    draw();

    return () => {
        active = false;
        cancelAnimationFrame(frame);
        root.removeEventListener('input', onInput);
        root.removeEventListener('change', onInput);
        root.removeEventListener('click', onClick);
        root.classList.remove('control-p3');
        root.innerHTML = '';
    };
}
