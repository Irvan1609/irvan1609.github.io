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
  clone.querySelectorAll('h3,h4,.analysis-lead,.table-caption,.figure-caption,.analysis-note,table').forEach(el => {
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

async function exportScope(scope, filename) {
  const snapshot = cleanClone(scope);
  snapshot.dataset.decimalSeparator = getDecimalSeparator();
  const { downloadReportXlsx } = await import('./xlsx-export.js');
  await downloadReportXlsx(snapshot, filename);
}

export function resultActions(filename='hasil-analisis') {
  return `<div class="result-actions"><button type="button" data-result-action="copy">⧉ Salin ke Excel</button><button type="button" data-result-action="export" data-result-filename="${escAttr(filename)}">⇩ Ekspor Excel (.xlsx)</button><span class="export-status" role="status" aria-live="polite"></span></div>`;
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
    const feedback=button.closest('.result-actions')?.querySelector('.export-status');
    const message=text=>{if(status)status.textContent=text;if(feedback)feedback.textContent=text;};
    const originalLabel=button.textContent;
    if(button.disabled)return;
    button.disabled=true;
    button.textContent='Memproses…';
    try {
      if (button.dataset.resultAction === 'copy') {
        await copyScope(scope);
        message('Hasil disalin. Tempel langsung ke Excel.');
      } else if (button.dataset.resultAction === 'export') {
        await exportScope(scope, button.dataset.resultFilename);
        message('File Excel (.xlsx) siap diunduh.');
      }
    } catch (error) {
      console.error(error);
      message('Hasil belum dapat disalin/diekspor. Coba lagi atau gunakan tombol ekspor Excel.');
    } finally {
      button.disabled=false;
      button.textContent=originalLabel;
    }
  });
}
import { getDecimalSeparator } from './number-format.js';
