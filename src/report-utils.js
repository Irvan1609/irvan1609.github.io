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
