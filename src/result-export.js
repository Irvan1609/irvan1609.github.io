const escAttr = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));

function cleanClone(scope) {
  const clone = scope.cloneNode(true);
  clone.querySelectorAll('.result-actions, button, input, select, textarea').forEach(el => el.remove());
  clone.querySelectorAll('[hidden]').forEach(el => el.remove());
  return clone;
}

function tableToTsv(table) {
  return [...table.rows].map(row => [...row.cells].map(cell => {
    const text = cell.textContent.replace(/\s+/g, ' ').trim();
    return /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join('\t')).join('\n');
}

function scopeToTsv(scope) {
  const clone = cleanClone(scope);
  const parts = [];
  clone.querySelectorAll('h3,h4,.analysis-note,table').forEach(el => {
    if (el.tagName === 'TABLE') parts.push(tableToTsv(el));
    else {
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (text) parts.push(text);
    }
  });
  return parts.join('\n\n');
}

function scopeToHtml(scope) {
  const clone = cleanClone(scope);
  return clone.innerHTML;
}

async function copyScope(scope) {
  const html = `<div>${scopeToHtml(scope)}</div>`;
  const text = scopeToTsv(scope);
  if (navigator.clipboard && window.ClipboardItem) {
    const item = new ClipboardItem({
      'text/html': new Blob([html], {type:'text/html'}),
      'text/plain': new Blob([text], {type:'text/plain'})
    });
    await navigator.clipboard.write([item]);
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function exportScope(scope, filename) {
  const safe = String(filename || 'hasil-analisis').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'hasil-analisis';
  const body = scopeToHtml(scope);
  const doc = `<!doctype html><html><head><meta charset="UTF-8"><style>
    body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000;background:#fff;margin:0;padding:0}
    h3,h4{font-family:Calibri,Arial,sans-serif;font-size:11pt;font-weight:700;margin:0;padding:5px 6px;border:1px solid #7f7f7f;border-bottom:0;background:#fff;color:#000}
    table{border-collapse:collapse;border-spacing:0;margin:0;width:100%;table-layout:fixed;font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#000;background:#fff}
    th,td{border:1px solid #7f7f7f;padding:3px 6px;height:18px;background:#fff;color:#000;vertical-align:middle}
    th{font-weight:700;text-align:center}
    td{text-align:right}
    th:first-child,td:first-child{text-align:left}
    .analysis-note{font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#000;background:#fff;border:1px solid #7f7f7f;padding:4px 6px;margin:10px 0 0}
    .analysis-note+.analysis-note{margin-top:0;border-top:0}
    .posthoc-table{margin-top:10px}
    .posthoc-table th,.posthoc-table td{text-align:center}
    .posthoc-table th:first-child,.posthoc-table td:first-child{text-align:left}
    .posthoc-value{white-space:nowrap;font-weight:400}
    sup{vertical-align:super;font-size:70%;font-weight:700}
  </style></head><body>${body}</body></html>`;
  const blob = new Blob(['\ufeff', doc], {type:'application/vnd.ms-excel;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function resultActions(filename='hasil-analisis') {
  return `<div class="result-actions"><button type="button" data-result-action="copy">⧉ Salin ke Excel</button><button type="button" data-result-action="export" data-result-filename="${escAttr(filename)}">⇩ Ekspor Excel (.xls)</button></div>`;
}

export function installResultExport() {
  if (document.documentElement.dataset.resultExportBound) return;
  document.documentElement.dataset.resultExportBound = '1';
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-result-action]');
    if (!button) return;
    const scope = button.closest('[data-export-scope]');
    if (!scope) return;
    const status = document.querySelector('#status');
    try {
      if (button.dataset.resultAction === 'copy') {
        await copyScope(scope);
        if (status) status.textContent = '✓ Hasil analisis disalin. Tempel langsung ke Excel.';
      } else if (button.dataset.resultAction === 'export') {
        exportScope(scope, button.dataset.resultFilename);
        if (status) status.textContent = '✓ Hasil analisis diekspor ke file Excel-compatible (.xls).';
      }
    } catch (error) {
      console.error(error);
      if (status) status.textContent = '⚠ Hasil tidak dapat disalin/diekspor oleh browser ini.';
    }
  });
}
