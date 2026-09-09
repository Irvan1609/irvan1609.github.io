const escAttr = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

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
    body{font-family:Arial,sans-serif;font-size:11pt;color:#111}table{border-collapse:collapse;margin:10px 0 18px}th,td{border:1px solid #777;padding:6px 8px}th{font-weight:bold;background:#eee}sup{vertical-align:super;font-size:70%}.analysis-note{margin:8px 0 12px}h3,h4{margin:14px 0 6px}
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
