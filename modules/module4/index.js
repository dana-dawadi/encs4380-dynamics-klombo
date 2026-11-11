import { createSensor, response, measurements, guessSensor, grade, hintFor } from './calculations.js';

let instance = 0;
const format = n => Number(n.toFixed(3)).toString();

// The router calls mount() when the user opens Module 4.
export function mount(root) {
  const prefix = `m4-${++instance}`;
  const id = name => `${prefix}-${name}`;
  root.classList.add('module-four');
  root.innerHTML = `
    <div class="m4-shell">
      <header class="m4-heading"><p class="m4-eyebrow">MODULE 04 / ENGINEERING CHALLENGE</p>
        <h1>Guess the sensor.</h1><p>Read a noisy measurement curve, estimate the hidden parameters, then compare your model with the real sensor.</p></header>
      <div class="m4-summary"><div><span>Round</span><strong data-view="round">1</strong></div>
        <div><span>Total points</span><strong data-view="total">0</strong></div>
        <div><span>Average / 100</span><strong data-view="average">—</strong></div>
        <div><span>Perfect rounds</span><strong data-view="perfect">0</strong></div></div>
      <div class="m4-workspace">
        <section class="m4-panel m4-plot-panel"><div class="m4-chart-heading"><div><h2>Unknown sensor output</h2>
          </div><button type="button" data-action="new" class="m4-outline">New sensor</button></div>
          <div class="m4-chart-wrap"><canvas data-view="plot" width="840" height="410" role="img" aria-label="Noisy measured sensor output versus time"></canvas></div>
          <p class="m4-inspector" data-view="inspector" aria-live="off">Move your mouse over the graph to inspect exact measured X and Y coordinates.</p>
          <div class="m4-legend"><span class="m4-dot">Measured (noisy)</span><span class="m4-dash">Your guess</span><span class="m4-solid">True response after reveal</span></div>
          <p class="m4-note" data-view="signal"></p><p class="m4-note">Hover or drag across the graph to see the time and measured output at the nearest sample. Readings include measurement noise.</p>
        </section>
        <section class="m4-panel m4-guess"><h2>Estimate the parameters</h2>
          <p>Use the graph and the methods from Modules 1 and 3. Each parameter within ±10% earns full credit.</p>
          <form data-form="guess"><label for="${id('a')}" data-view="label-a">Gain K</label>
            <input id="${id('a')}" name="a" type="number" min="0.001" max="100" step="any" required placeholder="Your estimate" />
            <label for="${id('b')}" data-view="label-b">Time constant τ (s)</label>
            <input id="${id('b')}" name="b" type="number" min="0.001" max="100" step="any" required placeholder="Your estimate" />
            <button type="submit" data-action="reveal">Reveal & score</button>
          </form>
          <button type="button" class="m4-outline" data-action="hint">Show a hint</button>
          <p class="m4-hint" data-view="hint" hidden></p>
          <p class="m4-error" data-view="error" role="alert"></p>
        </section>
      </div>
      <section class="m4-panel m4-reveal" data-view="reveal" hidden aria-live="polite">
        <h2>Result: your model vs. the true sensor</h2><div class="m4-result" data-view="result"></div>
        <p data-view="explanation"></p>
        <button type="button" data-action="new">Try another sensor</button>
      </section>
      <section class="m4-panel m4-how"><h2>How to estimate from a curve</h2>
        <p><strong>First-order step:</strong> Final level ≈ K for a unit step; 63.2% of that level occurs at t = τ.</p>
        <p><strong>Underdamped (0 &lt; ζ &lt; 1):</strong> Use overshoot to calculate ζ, then peak time for ωₙ.</p>
        <p class="m4-note">Scoring: 50 points for each parameter. Relative error ≤ 10% gets full marks; 10–30% earns partial credit; ≥ 30% gets zero. One submission per round.</p>
      </section>
    </div>`;

  const view = name => root.querySelector(`[data-view="${name}"]`);
  const form = root.querySelector('[data-form="guess"]');
  let sensor, measured, guess = null, revealed = false;
  let rounds = 0, total = 0, perfect = 0;
  let roundNumber = 0;
  let hoverSample = null;

  // Reset the interface and generate a new hidden sensor for each round.
  function startRound() {
    sensor = createSensor(Math.random);
    measured = measurements(sensor);
    guess = null; revealed = false; hoverSample = null; roundNumber++;
    view('round').textContent = roundNumber;
    view('signal').textContent = sensor.type === 'first'
      ? 'Input: unit step, x(t) = 1 for t ≥ 0. The response begins at y(0) = 0.'
      : 'Input: unit step, x(t) = 1 for t ≥ 0. The steady-state output is 1.';
    view('label-a').textContent = sensor.type === 'first' ? 'Static gain K' : 'Damping ratio ζ';
    view('label-b').textContent = sensor.type === 'first' ? 'Time constant τ (seconds)' : 'Natural frequency ωₙ (rad/s)';
    form.reset(); form.querySelectorAll('input,select,button').forEach(e => e.disabled = false);
    form.elements.a.readOnly = false;
    view('inspector').textContent = 'Move your mouse over the graph to inspect exact measured X and Y coordinates.';
    view('hint').hidden = true; view('hint').textContent = '';
    view('error').textContent = ''; view('reveal').hidden = true;
    draw();
  }

  // Draw the measured response, followed by guess/true curves only after reveal.
  function draw() {
    const canvas = view('plot');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, L = 66, R = 22, T = 26, B = 58;
    const all = measured.map(p => p.y);
    for (const s of [guess, revealed ? sensor : null]) {
      if (s) for (let i = 0; i <= 260; i++) all.push(response(s, sensor.duration * i / 260));
    }
    let ymin = Math.min(0, ...all), ymax = Math.max(0, ...all);
    const padding = Math.max(0.15, (ymax - ymin) * 0.15);
    ymin -= padding; ymax += padding;
    const x = t => L + (t / sensor.duration) * (W - L - R);
    const y = v => H - B - ((v - ymin) / (ymax - ymin)) * (H - T - B);
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.font = '12px Arial'; ctx.fillStyle = '#526b65'; ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const t = sensor.duration * i / 5, v = ymin + (ymax - ymin) * i / 5;
      ctx.strokeStyle = '#e7ece5'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x(t), T); ctx.lineTo(x(t), H-B); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(W-R, y(v)); ctx.stroke();
      ctx.fillStyle = '#526b65'; ctx.textAlign = 'center'; ctx.fillText(t.toFixed(1), x(t), H-B+22);
      ctx.textAlign = 'right'; ctx.fillText(v.toFixed(2), L-10, y(v)+4);
    }
    ctx.fillStyle = '#526b65'; ctx.textAlign = 'center'; ctx.font = '14px Arial';
    ctx.fillText('Time (seconds)', W/2, H-10);
    ctx.save(); ctx.translate(18,H/2); ctx.rotate(-Math.PI/2); ctx.fillText('Output y(t)', 0, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(L,T,W-L-R,H-T-B); ctx.clip();
    ctx.beginPath(); measured.forEach((p,i) => i ? ctx.lineTo(x(p.t),y(p.y)) : ctx.moveTo(x(p.t),y(p.y)));
    ctx.strokeStyle='#8995a3';ctx.lineWidth=1.6;ctx.stroke();
    measured.forEach((p,i)=>{if(i%3!==0)return;ctx.beginPath();ctx.arc(x(p.t),y(p.y),2.3,0,Math.PI*2);ctx.fillStyle='#64748b';ctx.fill();});
    function curve(s,color,dashed) {
      ctx.beginPath(); for(let i=0;i<=400;i++) {const t=sensor.duration*i/400;
        if(i===0)ctx.moveTo(x(t),y(response(s,t)));else ctx.lineTo(x(t),y(response(s,t)));}
      ctx.strokeStyle=color;ctx.lineWidth=3;ctx.setLineDash(dashed?[8,5]:[]);ctx.stroke();ctx.setLineDash([]);
    }
    if (guess) curve(guess,'#b26b27',true);
    if (revealed) curve(sensor,'#147453',false);
    ctx.restore();

    // Hover crosshair shows the nearest noisy reading, not the hidden parameters.
    if (hoverSample !== null) {
      const p = measured[hoverSample];
      const px = x(p.t), py = y(p.y);
      ctx.save();
      ctx.strokeStyle = '#a96726';
      ctx.lineWidth = 1.3;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(px, T); ctx.lineTo(px, H - B);
      ctx.moveTo(L, py); ctx.lineTo(W - R, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#a96726';
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();

      const label = `t = ${p.t.toFixed(3)} s   |   y = ${p.y.toFixed(4)}`;
      ctx.font = 'bold 14px Arial';
      const boxW = Math.min(W - L - R, ctx.measureText(label).width + 24);
      const boxX = Math.max(L + 3, Math.min(px + 12, W - R - boxW - 3));
      const boxY = Math.max(T + 4, py - 42);
      ctx.fillStyle = '#243b34';
      ctx.fillRect(boxX, boxY, boxW, 30);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(label, boxX + 12, boxY + 20);
      ctx.restore();
    }
  }

  function onPlotMove(event) {
    const canvas = view('plot');
    const rect = canvas.getBoundingClientRect();
    const cx = (event.clientX - rect.left) * canvas.width / rect.width;
    const cy = (event.clientY - rect.top) * canvas.height / rect.height;
    const L = 66, R = 22, T = 26, B = 58;
    if (cx < L || cx > canvas.width - R || cy < T || cy > canvas.height - B) {
      if (hoverSample !== null) { hoverSample = null; draw(); }
      return;
    }
    const fraction = (cx - L) / (canvas.width - L - R);
    const index = Math.max(0, Math.min(measured.length - 1, Math.round(fraction * (measured.length - 1))));
    if (index !== hoverSample) { hoverSample = index; const p = measured[index]; view('inspector').textContent = `X (time) = ${p.t.toFixed(3)} s  •  Y (measured output) = ${p.y.toFixed(4)}`; draw(); }
  }
  function onPlotLeave() {
    if (hoverSample !== null) { hoverSample = null; view('inspector').textContent = 'Move your mouse over the graph to inspect exact measured X and Y coordinates.'; draw(); }
  }

  // Reveal once per round, calculate the score, and update session statistics.
  function submit(event) {
    event.preventDefault();
    if (revealed) return;
    const a = Number(form.elements.a.value), b = Number(form.elements.b.value);
    if (!form.elements.a.value.trim() || !form.elements.b.value.trim() ||
        !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
      view('error').textContent = 'Enter positive values for both parameters.'; return;
    }
    // Incorrect guesses are scored rather than rejected.
    guess = guessSensor(sensor,a,b);
    const result = grade(sensor,a,b);
    rounds++;total+=result.points;if(result.fullMarks)perfect++;
    view('total').textContent=total;
    view('average').textContent=String(Math.round(total/rounds));
    view('perfect').textContent=perfect;
    const names = sensor.type==='first' ? ['K','τ'] : ['ζ','ωₙ'];
    const trueValues = sensor.type==='first' ? [sensor.K,sensor.tau] : [sensor.zeta,sensor.wn];
    view('result').replaceChildren();
    const heading=document.createElement('strong');heading.textContent=`${result.points} / 100 points ${result.fullMarks?'— full marks!':''}`;
    view('result').append(heading);
    names.forEach((name,i)=>{const p=document.createElement('p');
      p.textContent=`${name}: your guess ${format([a,b][i])} | true ${format(trueValues[i])} | error ${result.errors[i].toFixed(1)}%`;
      view('result').append(p);});
    view('explanation').textContent = sensor.type === 'second'
      ? 'Underdamped: peak overshoot identifies ζ; peak time helps estimate ωₙ.'
      : 'The final step height estimates K and the 63.2% rise time estimates τ.';
    form.querySelectorAll('input,select,button').forEach(e=>e.disabled=true);
    view('error').textContent='';view('reveal').hidden=false;revealed=true;draw();
  }
  function onClick(event) {
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='new') startRound();
    if(action==='hint') {view('hint').textContent=hintFor(sensor);view('hint').hidden=!view('hint').hidden;}
  }
  const plot = view('plot');
  plot.style.cursor = 'crosshair';
  plot.addEventListener('pointermove', onPlotMove);
  plot.addEventListener('pointerleave', onPlotLeave);
  root.addEventListener('click',onClick);form.addEventListener('submit',submit);
  startRound();
  return ()=>{plot.removeEventListener('pointermove',onPlotMove);plot.removeEventListener('pointerleave',onPlotLeave);
    root.removeEventListener('click',onClick);form.removeEventListener('submit',submit);
    root.replaceChildren();root.classList.remove('module-four');};
}
