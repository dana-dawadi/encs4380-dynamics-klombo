// Small SVG line-chart helper shared by the Control modules (same look as Modules 1–2).

export const fmt = (n, d = 3) => Number.isFinite(n) ? Number(Number(n).toPrecision(d)).toString() : '—';
export const fmtTime = s => !Number.isFinite(s) ? '—' : s < 1 ? `${fmt(s * 1000)} ms` : `${fmt(s)} s`;

// "Nice" tick values (1, 2, 5 × 10^k) between lo and hi.
export function ticks(lo, hi, count = 5) {
  const span = hi - lo || 1, raw = span / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

// series: [{ x, y, cls }] with typed arrays; hlines: [{ y, cls, label }]; vlines: [{ x, cls }]; dots: [{ x, y, cls }]
export function lineChart({ width = 760, height = 300, xmax, ymin, ymax, series = [], hlines = [], vlines = [], dots = [], band = null, xlabel = 'Time (s)', ylabel = '', title = '', xscale = 1, prefix = 'c' }) {
  const W = Math.round(width), H = height, L = W < 500 ? 50 : 66, R = 16, T = 28, B = 46, w = W - L - R, h = H - T - B;
  const x = v => L + v / xmax * w, y = v => T + (ymax - v) / (ymax - ymin) * h;
  const clipId = `${prefix}-clip`;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}"><title>${title}</title><defs><clipPath id="${clipId}"><rect x="${L}" y="${T}" width="${w}" height="${h}"/></clipPath></defs>`;
  if (band) svg += `<rect class="ct-band" x="${L}" y="${y(band[1])}" width="${w}" height="${Math.max(0, y(band[0]) - y(band[1]))}"/>`;
  for (const t of ticks(0, xmax, W < 500 ? 3 : 6)) svg += `<line class="ct-grid" x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${T + h}"/><text x="${x(t)}" y="${T + h + 20}" text-anchor="middle">${fmt(t * xscale)}</text>`;
  for (const v of ticks(ymin, ymax, 5)) svg += `<line class="ct-grid" x1="${L}" x2="${L + w}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  svg += `<text x="${L}" y="16">${ylabel}</text><text x="${L + w / 2}" y="${H - 6}" text-anchor="middle">${xlabel}</text><g clip-path="url(#${clipId})">`;
  for (const l of hlines) svg += `<line class="ct-h ${l.cls || ''}" x1="${L}" x2="${L + w}" y1="${y(l.y)}" y2="${y(l.y)}"/>`;
  for (const l of vlines) svg += `<line class="ct-v ${l.cls || ''}" x1="${x(l.x)}" x2="${x(l.x)}" y1="${T}" y2="${T + h}"/>`;
  for (const s of series) svg += `<path class="ct-line ${s.cls || ''}" d="${path(s.x, s.y, x, y, xmax, s.step)}"/>`;
  for (const d of dots) svg += `<circle class="ct-dot ${d.cls || ''}" cx="${x(d.x)}" cy="${y(d.y)}" r="5"/>`;
  svg += '</g>';
  for (const l of hlines) if (l.label) svg += `<text class="ct-label ${l.cls || ''}" x="${L + w - 4}" y="${y(l.y) - 6}" text-anchor="end">${l.label}</text>`;
  return svg + '</svg>';
}

// Down-sample to about 700 points inside [0, xmax]; keeps the plot light on phones.
function path(xs, ys, x, y, xmax, step = false) {
  let n = xs.length;
  while (n > 1 && xs[n - 2] > xmax) n--;
  const stride = Math.max(1, Math.floor(n / 700));
  let d = '';
  for (let i = 0; i < n; i += stride) {
    const px = x(Math.min(xs[i], xmax)).toFixed(1), py = y(clampY(ys[i])).toFixed(1);
    d += d ? (step ? `H${px}V${py}` : `L${px},${py}`) : `M${px},${py}`;
  }
  return d;
}
const clampY = v => Math.max(-1e6, Math.min(1e6, v));
