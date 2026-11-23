import { lineChart, fmt } from '../control/plot.js';
import { calculateResponse, evaluate, newChallenge, CONTROL_LIMITS } from './model.js';

// Give each page instance a unique ID for its inputs.
let serial = 0;
// Build the P4 page when the user opens it.
export function mount(root) {
  const uid = ++serial;
  let challenge = newChallenge();
  let gains = { Kp: 1, Ki: 0, Kd: 0 };
  let checked = false;
  let last = null;
  let raf = 0;
  root.classList.add('control-p4');
  // Create the sliders, graph, score area, and prediction question.
  root.innerHTML = `
    <header class="p4-heading"><p class="p4-eyebrow">CONTROL · P4 / TUNING CHALLENGE</p>
      <h1>Can you tune a hidden plant?</h1>
      <p>HW1 Module 4 gave you a mystery response to identify. Now take control: choose PID gains and make a randomly selected first- or second-order plant meet all three specifications.</p>
    </header>
    <div class="p4-layout">
      <section class="p4-panel p4-controls" aria-labelledby="p4-controls-${uid}">
        <div class="p4-panel-heading"><h2 id="p4-controls-${uid}">Your challenge</h2><span class="p4-pill" data-view="round"></span></div>
        <p class="p4-muted">The plant parameters are hidden. The setpoint is 1; the controller signal is limited to −10 through +10.</p>
        <div class="p4-targets" data-view="targets"></div>
        <h3>Tune the gains</h3>
        ${gainSlider('Kp', 'Proportional · Kp', 12, .1, 1)}
        ${gainSlider('Ki', 'Integral · Ki', 12, .1, 0)}
        ${gainSlider('Kd', 'Derivative · Kd', 4, .05, 0)}
        <p class="p4-muted">Try proportional control first. Add integral to remove lasting error, then derivative if the response overshoots.</p>
        <div class="p4-actions"><button type="button" data-action="check">Check my tuning</button><button type="button" class="p4-outline" data-action="new">New random plant</button><button type="button" class="p4-outline" data-action="reset">Reset gains</button></div>
      </section>
      <div class="p4-right">
        <section class="p4-panel"><div class="p4-panel-heading"><h2>Closed-loop response</h2><span>Setpoint = 1</span></div>
          <div data-view="chart"></div><div class="p4-legend"><span class="p4-key-output">Plant output y(t)</span><span class="p4-key-target">Target r</span><span class="p4-key-band">±2% band</span></div>
          <p class="p4-muted" data-view="chart-note" role="status">Move the gains to preview the response. Check to see your marks.</p>
        </section>
        <section class="p4-panel"><div class="p4-panel-heading"><h2>Evaluation</h2><span data-view="status">Not checked yet</span></div>
          <div data-view="grading" aria-live="polite"><p class="p4-muted">Predict the outcome, then press Check my tuning to reveal the three results and score.</p></div>
        </section>
      </div>
    </div>
    <section class="p4-panel p4-predict"><div><p class="p4-eyebrow">PREDICT, THEN CHECK</p><h2>Will these gains pass all three targets?</h2>
      <p class="p4-muted">Make a prediction before checking. You'll see whether your prediction matched the simulation.</p></div>
      <fieldset><legend>My prediction</legend><label><input name="p4-prediction-${uid}" type="radio" value="yes"> Yes, all will pass</label><label><input name="p4-prediction-${uid}" type="radio" value="no"> No, at least one will fail</label>
        <p data-view="prediction" class="p4-feedback" aria-live="polite"></p></fieldset>
    </section>
    <p class="p4-footnote">Uses the same RK4 closed-loop simulator as P1, including a filtered derivative. The controller limits stay at −10 to +10, but each round has different performance targets. Steady-state “zero” is evaluated against that round’s stated error tolerance; a response that has not settled cannot pass.</p>`;

  const el = key => root.querySelector(`[data-view="${key}"]`);
  const input = key => root.querySelector(`[data-gain="${key}"]`);
  // Show the limits for the current random challenge.
  function renderTargets() {
    el('round').textContent = `Mystery #${challenge.index + 1} · ${challenge.plant.type === 'first' ? '1st' : '2nd'} order`;
    el('targets').innerHTML = `<div><span>Max overshoot</span><strong>≤ ${challenge.target.overshoot}%</strong></div><div><span>Max settling time</span><strong>≤ ${fmt(challenge.target.settling)} s</strong></div><div><span>Steady-state error</span><strong>≤ ${challenge.target.sse}%</strong></div>`;
  }
  // Draw the output graph using the shared plotting tool.
  function makeChart(sim) {
    const { t, y, r } = sim;
    const max = Math.max(1.2, Math.min(3, Math.max(...sample(y)) * 1.12));
    const min = Math.min(-.25, Math.max(-2, Math.min(...sample(y)) * 1.12));
    const x = t[t.length - 1] || 1;
    el('chart').innerHTML = lineChart({ prefix: `p4-${uid}`, width: 750, height: 320, xmax: x, ymin: min, ymax: max,
      series: [{ x: t, y, cls: 'ct-output' }], hlines: [{ y: r, cls: 'ct-target', label: 'Setpoint' }], band: [r * .98, r * 1.02],
      title: 'PID-controlled output against the target', xlabel: 'Time (s)', ylabel: 'Output' });
  }
  function sample(array) { const out = []; const stride = Math.max(1, Math.floor(array.length / 500)); for (let i = 0; i < array.length; i += stride) out.push(array[i]); return out; }
  // Run the simulation whenever the PID gains change.
  function recalc() {
    try { last = calculateResponse(challenge, gains); makeChart(last.sim); el('chart-note').textContent = `Current response: ${last.m.status}. Graph changes as you tune the gains.`; }
    catch (err) { last = null; el('chart-note').textContent = `Unable to simulate: ${err.message}`; }
  }
  // Hide old scores after the user changes a gain.
  function invalidate() {
    checked = false;
    el('status').textContent = 'Not checked yet';
    el('grading').innerHTML = '<p class="p4-muted">Press Check my tuning to reveal PASS/FAIL and your score.</p>';
    el('prediction').textContent = '';
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; recalc(); });
  }
  // Update slider positions and their displayed numbers.
  function updateSliders() {
    for (const key of Object.keys(gains)) {
      input(key).value = String(gains[key]);
      root.querySelector(`[data-output="${key}"]`).textContent = gains[key].toFixed(key === 'Kd' ? 2 : 1);
    }
  }
  // Listen for changes to Kp, Ki, and Kd.
  for (const key of Object.keys(gains)) input(key).addEventListener('input', e => {
    gains[key] = Number(e.target.value);
    root.querySelector(`[data-output="${key}"]`).textContent = gains[key].toFixed(key === 'Kd' ? 2 : 1);
    invalidate();
  });
  // Check the response and show PASS/FAIL and the score.
  root.querySelector('[data-action="check"]').addEventListener('click', () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    recalc(); // Use the latest slider values.
    if (!last) return;
    const result = evaluate(challenge, last.sim, last.m);
    checked = true;
    el('status').textContent = result.success ? 'All requirements met' : 'Keep tuning';
    el('grading').innerHTML = `<div class="p4-score"><strong>${result.score}<small>/100</small></strong><span>${result.success ? 'Challenge passed' : 'Requirements passed: ' + result.checks.filter(c => c.pass).length + '/3'}</span></div>
      <div class="p4-grades">${result.checks.map(c => `<div><span>${c.label}<small>Measured: ${c.value === null ? 'Not settled' : fmt(c.value, 4) + c.unit} · Limit: ≤ ${c.limit}${c.unit}</small></span><strong class="${c.pass ? 'p4-pass' : 'p4-fail'}">${c.pass ? 'PASS' : 'FAIL'}</strong></div>`).join('')}</div>
      <p class="p4-muted">${result.status !== 'settled' ? 'The response did not settle reliably. Try lowering gains or changing their balance.' : result.success ? 'Nice work. These gains satisfy the specification.' : 'Adjust the gains and check again. There may be more than one correct combination.'}</p>`;
    const prediction = root.querySelector(`input[name="p4-prediction-${uid}"]:checked`)?.value;
    el('prediction').textContent = prediction ? ((prediction === 'yes') === result.success ? 'Prediction matched the simulation.' : 'The simulation contradicted your prediction. Compare the measurements above.') : 'For the next round, predict before checking.';
  });
  // Start a new random plant challenge.
  root.querySelector('[data-action="new"]').addEventListener('click', () => {
    challenge = newChallenge(Math.random, challenge.index);
    gains = { Kp: 1, Ki: 0, Kd: 0 };
    root.querySelectorAll(`input[name="p4-prediction-${uid}"]`).forEach(x => { x.checked = false; });
    updateSliders(); renderTargets(); invalidate();
  });
  // Return all PID gains to their starting values.
  root.querySelector('[data-action="reset"]').addEventListener('click', () => { gains = { Kp: 1, Ki: 0, Kd: 0 }; updateSliders(); invalidate(); });
  renderTargets(); updateSliders(); recalc();
  // Clean up when the user switches to another module.
  return () => { if (raf) cancelAnimationFrame(raf); root.classList.remove('control-p4'); };
}
// Build one slider for a PID gain.
function gainSlider(key, title, max, step, value) {
  return `<label class="p4-slider"><span>${title}</span><output data-output="${key}">${value}</output><input type="range" data-gain="${key}" min="0" max="${max}" step="${step}" value="${value}" aria-label="${title}"><small>0</small><small>${max}</small></label>`;
}
