import { lineChart, fmt } from '../control/plot.js';
import { EXAMPLE, derivePI, evaluateMotor, arduinoSketch } from './model.js';

let serial = 0;
const field = (name, label, value, step, unit = '') => `<label class="ms-field"><span>${label}</span><div><input type="number" name="${name}" value="${value}" step="${step}" inputmode="decimal" required> <small>${unit}</small></div></label>`;
const safe = n => Number.isFinite(n) ? fmt(n, 4) : '—';
function sampled(arr, max = 700) { const output = []; const stride = Math.max(1, Math.ceil(arr.length / max)); for (let i = 0; i < arr.length; i += stride) output.push(arr[i]); return output; }

export function mount(root) {
  const uid = ++serial;
  root.classList.add('control-my-system');
  root.innerHTML = `<header class="ms-heading"><p class="ms-eyebrow">CONTROL · HW2 / MY SYSTEM</p><h1>Micromouse motor speed control</h1>
    <p>JGA12-N20 encoder motor · 6 V · 500 RPM. A first-order model of one wheel's speed control.</p></header>
  <div class="ms-notice"><strong>Motor model uses estimates.</strong> K ≈ 0.5236 (rad/s)/PWM % is calculated from the advertised 500 RPM at 6 V, assuming 100% PWM and no load. τ = 0.06 s is an assumed example because no verified time constant is available. These are not measured motor parameters.</div>
  <div class="ms-layout"><section class="ms-panel"><h2>1. Motor model</h2><p class="ms-muted">G(s) = K / (τs + 1)<br>Input: PWM duty (%) · Output: wheel speed (rad/s).</p>
    ${field('K','Motor gain K',EXAMPLE.K,'0.001','(rad/s) / PWM %')}
    ${field('tau','Time constant τ',EXAMPLE.tau,'0.001','seconds')}
    <p class="ms-muted">K is estimated from the 6 V, 500 RPM product listing. τ is assumed for simulation. You can edit both values.</p>
  </section>
  <section class="ms-panel ms-simulation"><h2>2. Simulation and specification checks</h2><div class="ms-stats" data-view="stats"></div><div data-view="speed"></div><div class="ms-legend"><span class="ms-speed">Wheel speed</span><span class="ms-target">Setpoint</span></div><h3>Motor command (PWM duty)</h3><div data-view="pwm"></div><p class="ms-muted">Simulation uses P1's RK4 closed-loop model with PWM limited to 0–100%; results are predictions, not hardware validation.</p></section>
  <section class="ms-panel ms-controller"><h2>3. Controller design</h2>
    ${field('target','Target wheel speed',EXAMPLE.target,'1','rad/s')}
    <h3>Desired response</h3>
    ${field('zeta','Desired damping ζ',0.75,'0.05','target 0.6–0.8')}
    ${field('wn','Desired natural frequency ωn',Math.sqrt(EXAMPLE.K*EXAMPLE.Ki/EXAMPLE.tau).toFixed(2),'0.1','rad/s')}
    <button type="button" class="ms-secondary" data-action="design">Calculate PI gains</button>
    <h3>Controller gains</h3>
    ${field('Kp','Proportional gain Kp',EXAMPLE.Kp,'0.1','PWM % / (rad/s)')}
    ${field('Ki','Integral gain Ki',EXAMPLE.Ki,'1','PWM % / rad')}
    ${field('Kd','Derivative gain Kd',EXAMPLE.Kd,'0.01','PWM %·s / (rad/s)')}
    <p class="ms-muted">Kp and Ki are calculated from the desired ζ and ωn. Kd stays 0 for PI control. You can edit the gains to experiment.</p>
    <p class="ms-feedback" data-view="message" role="status"></p>
</section></div>
  <div class="ms-right"><section class="ms-panel"><h2>4. Arduino-style PID code</h2><p class="ms-muted">Generated using the team’s P3 Arduino-code generator. The resulting sketch still has readPlantOutput() and applyControl() placeholders. Implement encoder speed reading, driver pins, PWM, and voltage limits before testing hardware.</p>
      ${field('sampleMs','Sampling time',10,'1','ms')}<button type="button" data-action="copy">Copy current Arduino code</button><pre><code data-view="sketch"></code></pre><p class="ms-muted">P3 generates sampled derivative-on-error PID with conditional anti-windup; P1 shows a continuous-time approximation. Different sampling and derivative behavior can produce different results.</p></section></div>`;
  const get = name => root.querySelector(`[name="${name}"]`);
  const val = name => Number(get(name).value);
  const view = name => root.querySelector(`[data-view="${name}"]`);
  function refresh() {
    try {
      const K = val('K'), tau = val('tau'), Kp = val('Kp'), Ki = val('Ki'), Kd = val('Kd'), target = val('target');
      const r = evaluateMotor({ K, tau, Kp, Ki, Kd, target });
      const { sim, metrics: m } = r;
      const z = r.predicted?.zeta;
      view('stats').innerHTML = `<div><span>Model parameters</span><strong>Estimated / assumed</strong></div>
        <div><span>Predicted PI damping ζ</span><strong>${z == null ? 'N/A for full PID' : safe(z)}</strong></div>
        <div><span>ζ in 0.6–0.8?</span><strong class="${r.dampingTarget ? 'ms-pass' : 'ms-warn'}">${r.dampingTarget === null ? 'PI check only' : r.dampingTarget ? 'PASS' : 'NOT MET'}</strong></div>
        <div><span>2% settling time</span><strong>${m.settlingTime == null ? m.status : safe(m.settlingTime) + ' s'}</strong></div>
        <div><span>Overshoot</span><strong>${m.settled ? safe(m.overshoot) + '%' : 'Not settled'}</strong></div>
        <div><span>Steady-state error</span><strong>${m.sse == null ? 'Not settled' : safe(m.sse) + '%'}</strong></div>
        <div><span>Required steady PWM</span><strong class="${r.achievable ? 'ms-pass' : 'ms-warn'}">${safe(r.requiredPWM)}% · ${r.achievable ? 'within limits' : 'not achievable'}</strong></div>
        <div><span>Simulated maximum PWM</span><strong>${safe(r.peakPWM)}% (limit 100%)</strong></div>
        <div><span>Settles at target?</span><strong class="${r.tracking ? 'ms-pass' : 'ms-warn'}">${r.tracking ? 'PASS (≤ 1% error)' : 'NOT VERIFIED'}</strong></div>`;
      const xs = sim.t, ys = sim.y;
      const yMax = Math.max(target * 1.2, ...sampled(ys,300)) * 1.05;
      view('speed').innerHTML = lineChart({ prefix:`ms-speed-${uid}`, title:'Micromouse speed closed-loop response', width:740, height:300, xmax:sim.T, ymin:0, ymax:Math.max(1,yMax), series:[{ x:xs,y:ys,cls:'ct-output' }], hlines:[{y:target,cls:'ct-target',label:'Target'}], xlabel:'Time (s)', ylabel:'Speed (rad/s)' });
      view('pwm').innerHTML = lineChart({ prefix:`ms-pwm-${uid}`, title:'PWM command limited to 0 to 100 percent', width:740, height:245, xmax:sim.T, ymin:0,ymax:105,series:[{x:xs,y:sim.u,cls:'ct-output'}],hlines:[{y:100,cls:'ct-target',label:'100% limit'}],xlabel:'Time (s)',ylabel:'PWM duty (%)' });
      view('sketch').textContent = arduinoSketch({ Kp, Ki, Kd, target, sampleMs:val('sampleMs') });
      view('message').textContent = 'Simulation uses an estimated motor model; results are predictions, not measurements.';
    } catch (error) { view('message').textContent = error.message; }
  }
  root.querySelector('[data-action="design"]').addEventListener('click', () => { try { const g=derivePI({K:val('K'),tau:val('tau'),desiredZeta:val('zeta'),desiredWn:val('wn')}); for(const k of ['Kp','Ki','Kd']) get(k).value=g[k].toFixed(5); refresh(); } catch (error) { view('message').textContent=error.message; } });
  root.querySelector('[data-action="copy"]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(view('sketch').textContent); view('message').textContent='Code copied. Review placeholders and encoder calibration before hardware use.'; } catch { view('message').textContent='Clipboard unavailable; select the Arduino code to copy manually.'; } });
  root.querySelectorAll('input').forEach(el=>el.addEventListener('change',refresh));
  refresh();
  return () => root.classList.remove('control-my-system');
}
