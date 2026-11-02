import { step, ramp, logError, rampMetrics, validate } from './math.js';

const fmt = n => Number(n.toFixed(3)).toString();
let instance = 0;

// Returns a cleanup function so a future module router can unmount safely.
export function mount(root) {
  const prefix = `m1-${++instance}`;
  const id = name => `${prefix}-${name}`;
  root.classList.add('module-one');
  root.innerHTML = `
    <header class="m1-heading"><p class="m1-eyebrow">MODULE 01 / TIME RESPONSE</p><h1>A sensor takes time to catch up.</h1><p>Explore a first-order thermometer. Change its gain and time constant, then read the response directly from the curves.</p><div class="m1-equation">τ dy/dt + y = Kx <span>G(s) = K / (τs + 1)</span></div></header>
    <div class="m1-workspace">
      <section class="m1-controls" aria-labelledby="${id('controls')}"><h2 id="${id('controls')}">Set up the sensor</h2>
        <label for="${id('mode')}">Input waveform</label><select id="${id('mode')}" data-control="mode"><option value="step">Step — a sudden change</option><option value="ramp">Ramp — a steady increase</option></select>
        ${slider('K','Static gain K',0.1,5,0.1,1,'output / input')}
        ${slider('tau','Time constant τ',0.1,10,0.1,2,'s')}
        ${slider('size','Step amplitude A',0.1,5,0.1,1,'input units')}
        <button type="button" data-action="reset" class="m1-secondary">Reset sensor</button>
        <p class="m1-note">Zero initial output, y(0) = 0. Positive inputs and gain. The horizontal window is always 0–6τ; read the seconds on the axis when changing τ.</p>
      </section>
      <section class="m1-response" aria-labelledby="${id('response')}"><div class="m1-chart-heading"><h2 id="${id('response')}">Step response</h2><span data-view="window"></span></div><div data-view="response-chart"></div><div class="m1-legend"><span class="m1-input">Input x(t)</span><span class="m1-reference">Ideal output Kx(t)</span><span class="m1-output">Sensor y(t)</span></div><div class="m1-metrics" data-view="metrics"></div><p data-view="formula" class="m1-formula"></p><p data-view="explanation"></p></section>
    </div>
    <section class="m1-predict" aria-labelledby="${id('predict')}"><div><p class="m1-eyebrow">PREDICT, THEN CHECK</p><h2 id="${id('predict')}">What happens if τ doubles?</h2><p>Choose a prediction before applying the change. K and the input size stay fixed.</p></div><form data-form="prediction"><label for="${id('guess')}">Your prediction</label><select id="${id('guess')}" data-control="guess"><option value="">Choose an answer…</option><option value="slower">It takes twice as long to reach 95%</option><option value="higher">The final output doubles</option><option value="faster">It reaches 95% twice as fast</option></select><button type="submit">Apply 2×τ and check</button><p data-view="feedback" role="status"></p></form></section>
    <section class="m1-log" aria-labelledby="${id('log')}"><div class="m1-chart-heading"><div><p class="m1-eyebrow">READ THE TIME CONSTANT</p><h2 id="${id('log')}">Step error on a logarithmic axis</h2></div><label for="${id('base')}">Logarithm <select id="${id('base')}" data-control="base"><option value="e">Natural log (ln)</option><option value="10">Base 10 (log₁₀)</option></select></label></div><p>The normalized step error is ε = (KA − y) / KA = exp(−t/τ). Equal vertical distances represent equal ratios of error. This reference step plot remains visible in ramp mode.</p><div data-view="log-chart"></div><p data-view="slope" class="m1-formula"></p></section>
    <section class="m1-validation" aria-labelledby="${id('validation')}"><p class="m1-eyebrow">CHECK THE MODEL</p><h2 id="${id('validation')}">Lecture validation</h2><p>Computed from the current K and τ using the same response function as the plot. The lecture values are rounded; the tolerance is ±0.0005 of KA.</p><div class="m1-table-wrap"><table><caption>First-order step validation</caption><thead><tr><th scope="col">Check</th><th scope="col">Expected</th><th scope="col">Calculated</th><th scope="col">Result</th></tr></thead><tbody data-view="validation"></tbody></table></div></section>`;

  function slider(name, label, min, max, increment, value, unit) {
    return `<div class="m1-slider"><label for="${id(name)}" data-label="${name}">${label}</label><output for="${id(name)}" data-output="${name}">${value} ${unit}</output><input id="${id(name)}" data-control="${name}" type="range" min="${min}" max="${max}" step="${increment}" value="${value}"><span>${min}</span><span>${max}</span></div>`;
  }
  const control = name => root.querySelector(`[data-control="${name}"]`);
  const view = name => root.querySelector(`[data-view="${name}"]`);
  let predictionApplied = false;
  function render() {
    const K = +control('K').value, tau = +control('tau').value, size = +control('size').value;
    const mode = control('mode').value, isStep = mode === 'step', base = control('base').value;
    for (const [name,value,unit] of [['K',K,'output / input'],['tau',tau,'s'],['size',size,isStep?'input units':'input units / s']]) {
      root.querySelector(`[data-output="${name}"]`).textContent = `${fmt(value)} ${unit}`;
      control(name).setAttribute('aria-valuetext',`${fmt(value)} ${unit}`);
    }
    root.querySelector('[data-label="size"]').textContent = isStep ? 'Step amplitude A' : 'Ramp rate r';
    root.querySelector(`#${id('response')}`).textContent = isStep ? 'Step response' : 'Ramp response';
    view('window').textContent = `0–${fmt(6*tau)} seconds`;
    const chartWidth = Math.min(760, Math.max(270, view('response-chart').clientWidth));
    const end=6*tau, ymax=(isStep ? Math.max(size,K*size) : Math.max(size,K*size)*end)*1.16;
    const response = t => isStep ? step(t,K,tau,size) : ramp(t,K,tau,size);
    const input = t => isStep ? size : size*t;
    const extra = isStep ? [{t:tau,y:response(tau),label:'τ · 63.2%'},{t:3*tau,y:response(3*tau),label:'3τ · 95.0%'}] : [];
    view('response-chart').innerHTML = chart({width:chartWidth,end,ymin:0,ymax,ylabel:'Signal (units)',title:`${mode} response for K ${K}, tau ${tau} seconds`,series:[{f:input,cls:'input'},{f:t=>K*input(t),cls:'reference'},{f:response,cls:'output'}],markers:extra,lag:!isStep?{tau,K,size}:null});
    if(isStep) {
      view('metrics').innerHTML = metric('At one time constant',`${fmt(step(tau,K,tau,size))} units`,`${fmt(tau)} s · 63.212% of KA`)+metric('At three time constants',`${fmt(step(3*tau,K,tau,size))} units`,`${fmt(3*tau)} s · 95.021% of KA`)+metric('Final output',`${fmt(K*size)} units`,'KA as t → ∞');
      view('formula').textContent = 'x(t) = A;  y(t) = KA[1 − exp(−t/τ)]';
      view('explanation').textContent = 'K sets the final output; τ sets the response speed. At 3τ the response is approximately 95%; the exact 95% time is −τ ln(0.05) ≈ 2.996τ.';
    } else {
      const {lag,steadyError}=rampMetrics(K,tau,size);
      view('metrics').innerHTML=metric('Asymptotic time lag',`${fmt(lag)} s`,'Horizontal lag relative to Kx')+metric('Steady dynamic error',`${fmt(steadyError)} units`,'Kx − y → Krτ')+metric('Error at 6τ',`${fmt(K*size*end-response(end))} units`,'Finite-time Kx − y');
      view('formula').textContent='x(t) = rt;  y(t) = Kr[t − τ + τ exp(−t/τ)]';
      view('explanation').textContent='The output approaches Kr(t − τ): it trails the ideal output Kx by τ seconds. Dynamic error Kx − y = Krτ[1 − exp(−t/τ)] tends to Krτ. Raw input error x − y = (1 − K)rt + Krτ[1 − exp(−t/τ)] is not constant when K ≠ 1. The lag guide shows the asymptote, so its endpoint is only approximately on the finite-time response.';
    }
    const ymin=logError(end,tau,base);
    view('log-chart').innerHTML=chart({width:Math.min(760, Math.max(270, view('log-chart').clientWidth)),end,ymin,ymax:0,ylabel:base==='e'?'Error fraction ε (ln spacing)':'Error fraction ε (log₁₀ spacing)',title:'Normalized step error on logarithmic scale',series:[{f:t=>logError(t,tau,base),cls:'output'}],markers:[],tickFormat:v=>Math.exp(v*(base==='10'?Math.LN10:1)).toPrecision(2)});
    view('slope').textContent=base==='e'?`ln ε = −t/τ. Slope = −1/τ = ${fmt(-1/tau)} s⁻¹. Estimate τ = −1 / slope.`:`log₁₀ ε = −t/(τ ln 10). Slope = −1/(τ ln 10) = ${fmt(-1/(tau*Math.LN10))} s⁻¹. Estimate τ = −1 / (slope × ln 10).`;
    view('validation').innerHTML=validate(K,tau,size).map(row=>`<tr><th scope="row">${row.label}</th><td>${row.expected.toFixed(3)}</td><td>${row.actual.toFixed(6)}</td><td class="m1-pass">${row.pass?'PASS':'FAIL'}</td></tr>`).join('');
    root.querySelector(`#${id('predict')}`).textContent=isStep?'What happens if τ doubles?':'What happens to ramp lag if τ doubles?';
    control('guess').options[1].textContent=isStep?'It takes twice as long to reach 95%':'The asymptotic lag and dynamic error both double';
    control('guess').options[2].textContent=isStep?'The final output doubles':'The output slope doubles';
    control('guess').options[3].textContent=isStep?'It reaches 95% twice as fast':'The asymptotic lag halves';
  }
  function metric(label,value,note) { return `<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`; }
  function onInput(event) {
    if (!event.target.matches('[data-control]') || event.target===control('guess')) return;
    if(predictionApplied) view('feedback').textContent='Sensor changed. Choose a new prediction to try again.';
    if(event.target===control('mode')) { control('guess').value=''; view('feedback').textContent=''; }
    predictionApplied=false; render();
  }
  function onSubmit(event) {
    event.preventDefault();
    const guess=control('guess').value, old=+control('tau').value;
    if(!guess) {view('feedback').textContent='Choose your prediction before checking.';control('guess').focus();return;}
    if(old>5) {view('feedback').textContent='Set τ to 5 s or less, then predict again; doubling must stay within the 10 s control range.';return;}
    control('tau').value=old*2; render(); predictionApplied=true;
    view('feedback').textContent=`${guess==='slower'?'Correct.':'Check the relationship:'} τ changed from ${fmt(old)} s to ${fmt(2*old)} s. ${control('mode').value==='step'?`The exact 95% time doubles from ${fmt(-old*Math.log(.05))} s to ${fmt(-2*old*Math.log(.05))} s; final output KA stays the same.`:'Both asymptotic lag τ and steady dynamic error Krτ double; output slope Kr stays the same.'}`;
    control('guess').value='';
  }
  function onClick(event) {
    if(!event.target.closest('[data-action="reset"]'))return;
    for(const [name,value] of Object.entries({K:1,tau:2,size:1,mode:'step',base:'e',guess:''}))control(name).value=value;
    predictionApplied=false; view('feedback').textContent='Sensor reset to K = 1, τ = 2 s, A = 1.';render();
  }
  root.addEventListener('input',onInput);root.addEventListener('submit',onSubmit);root.addEventListener('click',onClick);render();
  let lastWidth = root.clientWidth;
  const resizeObserver = new ResizeObserver(() => {
    if (root.clientWidth !== lastWidth) { lastWidth = root.clientWidth; render(); }
  });
  resizeObserver.observe(root);
  return ()=>{resizeObserver.disconnect();root.removeEventListener('input',onInput);root.removeEventListener('submit',onSubmit);root.removeEventListener('click',onClick);root.replaceChildren();root.classList.remove('module-one');};
}

function chart({width=760,end,ymin,ymax,ylabel,title,series,markers,lag,tickFormat=fmt}) {
  const W=width,H=330,L=width<500?57:78,R=22,T=32,B=52,w=W-L-R,h=H-T-B;
  const tickCount=width<500?3:6;
  const x=t=>L+t/end*w,y=v=>T+(ymax-v)/(ymax-ymin)*h;
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}"><title>${title}</title>`;
  for(let i=0;i<=tickCount;i++) {
    const t=end*i/tickCount,v=ymin+(ymax-ymin)*i/tickCount;
    svg+=`<line class="m1-grid" x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H-B}"/><text x="${x(t)}" y="${H-B+23}" text-anchor="middle">${fmt(t)}</text><line class="m1-grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-10}" y="${y(v)+5}" text-anchor="end">${tickFormat(v)}</text>`;
  }
  svg+=`<text x="${L}" y="18">${ylabel}</text><text x="${L+w/2}" y="${H-6}" text-anchor="middle">Time (s)</text>`;
  for(const s of series) {
    const d=Array.from({length:241},(_,i)=>{const t=end*i/240;return `${i?'L':'M'}${x(t).toFixed(2)},${y(s.f(t)).toFixed(2)}`;}).join(' ');
    svg+=`<path class="m1-line m1-${s.cls}" d="${d}"/>`;
  }
  for(const m of markers) svg+=`<line class="m1-marker" x1="${x(m.t)}" x2="${x(m.t)}" y1="${y(m.y)}" y2="${H-B}"/><circle class="m1-dot" cx="${x(m.t)}" cy="${y(m.y)}" r="5"/><text class="m1-marker-label" x="${x(m.t)+8}" y="${y(m.y)-12}">${m.label}</text>`;
  if(lag){const t=4*lag.tau,v=lag.K*lag.size*t;svg+=`<path class="m1-lag" d="M${x(t)},${y(v)} L${x(t+lag.tau)},${y(v)} M${x(t)},${y(v)-5} v10 M${x(t+lag.tau)},${y(v)-5} v10"/><text x="${x(t+lag.tau/2)}" y="${y(v)-10}" text-anchor="middle">lag τ</text>`;}
  return svg+'</svg>';
}
