function installReportStyles() {
  if (document.querySelector('#statisticalReportStyles')) return;
  const style = document.createElement('style');
  style.id = 'statisticalReportStyles';
  style.textContent = `
    .analysis-result .analysis-lead{margin:0;padding:7px 8px;border-bottom:1px solid #b7b7b7;background:#fff;color:#111;font-family:Calibri,"Segoe UI",Arial,sans-serif;font-size:12px;line-height:1.35}
    .analysis-result .table-caption,.analysis-result .figure-caption{padding:6px 8px;background:#fff;color:#111;font-family:Calibri,"Segoe UI",Arial,sans-serif;font-size:12px;line-height:1.35;text-align:left}
    .analysis-result .table-caption{font-weight:700;border-top:1px solid #7f7f7f}
    .analysis-result .figure-caption{font-style:italic;border-top:1px solid #b7b7b7}
    .analysis-result .observation-table th,.analysis-result .observation-table td{text-align:center}
    .analysis-result .observation-table th:first-child,.analysis-result .observation-table td:first-child{text-align:left}
    .analysis-result .table-total td{font-weight:700}
    .analysis-result .mean-chart{padding:10px 8px;background:#fff;border-top:1px solid #7f7f7f;font-family:Calibri,"Segoe UI",Arial,sans-serif}
    .analysis-result .mean-chart-rows{display:grid;gap:5px}
    .analysis-result .mean-chart-row{display:grid;grid-template-columns:minmax(130px,1.2fr) minmax(150px,3fr) 72px;gap:8px;align-items:center;font-size:12px}
    .analysis-result .mean-chart-label{overflow-wrap:anywhere}
    .analysis-result .mean-chart-track{height:16px;border:1px solid #a5a5a5;background:#fff;position:relative;overflow:hidden}
    .analysis-result .mean-chart-bar{height:100%;background:#d9e2f3;border-right:1px solid #7f8fa8}
    .analysis-result .mean-chart-value{text-align:right;font-variant-numeric:tabular-nums}
    @media(max-width:720px){.analysis-result .mean-chart-row{grid-template-columns:minmax(100px,1fr) minmax(120px,2fr) 64px}}
  `;
  document.head.appendChild(style);
}

if (typeof document !== 'undefined') installReportStyles();

export function fCritical(jStat, alpha, df1, df2) {
  if (!Number.isFinite(df1) || !Number.isFinite(df2) || df1 <= 0 || df2 <= 0) return NaN;
  try { return jStat.centralF.inv(1 - alpha, df1, df2); } catch { return NaN; }
}

export function effectLevel(f, f05, f01) {
  if (!Number.isFinite(f) && f !== Infinity) return 'tidak dapat ditentukan';
  if (f > f01) return 'sangat nyata';
  if (f > f05) return 'nyata';
  return 'tidak nyata';
}

export function isSignificantAt(f, fCriticalSelected) {
  return Number.isFinite(fCriticalSelected) && f > fCriticalSelected;
}

export function cvPercent(mse, grandMean) {
  if (!Number.isFinite(mse) || mse < 0 || !Number.isFinite(grandMean) || grandMean === 0) return NaN;
  return Math.sqrt(mse) / Math.abs(grandMean) * 100;
}

export function descriptiveMeanChart({ labels, values, responseName, figureNo, alpha, esc, fmt }) {
  const maxAbs = Math.max(1, ...values.map(v => Math.abs(v)));
  const rows = labels.map((label, i) => {
    const value = values[i];
    const width = Math.max(1.5, Math.abs(value) / maxAbs * 100);
    return `<div class="mean-chart-row"><div class="mean-chart-label">${esc(label)}</div><div class="mean-chart-track"><div class="mean-chart-bar" style="width:${width}%"></div></div><div class="mean-chart-value">${fmt(value,2)}</div></div>`;
  }).join('');
  return `<div class="mean-chart" role="img" aria-label="Grafik rata-rata ${esc(responseName)}"><div class="mean-chart-rows">${rows}</div></div><div class="figure-caption">Gambar ${figureNo}. Rata-rata ${esc(responseName)} pada berbagai perlakuan (deskriptif; uji lanjut BNJ ${alpha * 100}% tidak dilakukan).</div>`;
}
