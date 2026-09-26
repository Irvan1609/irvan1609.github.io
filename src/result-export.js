import {tableLayout} from './table-layout.js';
const escAttr = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function cleanClone(scope) {
  const clone = scope.cloneNode(true);
  const annotate=section=>{
    const button=section.querySelector?.('[data-result-action="export-formula"],[data-result-action="export"]');
    const key=button?.dataset?.resultFilename;
    if(key&&!section.dataset.analysisKey)section.dataset.analysisKey=key;
  };
  if(clone.matches?.('[data-export-scope]'))annotate(clone);
  clone.querySelectorAll?.('[data-export-scope]').forEach(annotate);
  clone.querySelectorAll('.result-actions, button, input, select, textarea').forEach(el => el.remove());
  clone.querySelectorAll('[hidden]').forEach(el => el.remove());
  return clone;
}

async function formulaRawDataset(){
  try{
    const {readDataset}=await import('./data-tools.js');
    return readDataset();
  }catch{
    return null;
  }
}

export function tableToTsv(table) {
  const layout=tableLayout([...table.rows].map(row=>[...row.cells]));
  const grid=Array.from({length:layout.height},()=>Array(layout.width).fill(''));
  for(const {source,row,col} of layout.cells){
    const text=source.textContent.replace(/\s+/g,' ').trim();
    grid[row][col]=/[\t\n"]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
  }
  return grid.map(row=>row.join('\t')).join('\n');
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

function safeFilename(value){return String(value||'hasil').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim()||'hasil';}
function exportBab4Doc(scope){
  const sections=[...scope.querySelectorAll('.analysis-result')],parts=[];
  for(const section of sections){
    const title=section.querySelector(':scope > h3')?.textContent?.trim();
    const table=section.querySelector('[data-bab4-table]');
    const interpretation=section.querySelector('[data-chapter-interpretation]');
    if(!table&&!interpretation)continue;
    if(title)parts.push(`<h2>${title.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</h2>`);
    if(table){const clone=cleanClone(table);parts.push(clone.innerHTML);}
    if(interpretation){
      const paragraphs=[...interpretation.querySelectorAll('.interpretation-paragraph')].map(node=>`<p>${node.textContent.trim().replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</p>`).join('');
      if(paragraphs)parts.push('<h3>Interpretasi</h3>'+paragraphs);
    }
  }
  if(!parts.length)throw Error('Tabel BAB IV belum tersedia.');
  const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:10pt;color:#000}h2{font-size:11pt;margin:18pt 0 6pt}h3{font-size:10pt;margin:10pt 0 4pt}table{width:100%;border-collapse:collapse;margin:4pt 0 8pt}th,td{padding:4pt 5pt;border-left:0;border-right:0}thead th{border-top:1.5pt solid #000;border-bottom:1pt solid #000}tbody tr:last-child td{border-bottom:1.5pt solid #000}.table-caption{font-weight:700;margin:4pt 0}.analysis-note{font-size:9pt;margin:3pt 0}.publication-table-tools{display:none}sup{vertical-align:super;font-size:75%}</style></head><body>${parts.join('\n')}<p style="margin-top:18pt;padding-top:4pt;border-top:1px solid #bbb;font-size:8pt;text-align:right;color:#555">Agrotik · v0.1.0 · https://irvan1609.github.io</p></body></html>`;
  const blob=new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=safeFilename(scope.dataset.datasetName||'hasil')+' - BAB IV.doc';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}

async function exportScope(scope, filename, formulas=false) {
  const snapshot = cleanClone(scope);
  snapshot.dataset.decimalSeparator = getDecimalSeparator();
  if(filename&&!snapshot.dataset.analysisKey)snapshot.dataset.analysisKey=filename;
  const rawDataset=formulas?await formulaRawDataset():null;
  const { downloadReportXlsx } = await import('./xlsx-export.js');
  await downloadReportXlsx(snapshot, filename, {formulas,rawDataset});
}

export function resultActions(filename='hasil-analisis') {
  const safe=escAttr(filename);
  return `<div class="result-actions result-card-actions"><button type="button" class="result-card-copy" data-result-action="copy">Salin</button><button type="button" class="result-card-export" data-result-action="export" data-result-filename="${safe}">Ekspor</button><details class="result-card-more"><summary aria-label="Aksi lain untuk hasil ini">⋯</summary><div class="result-card-more-menu"><button type="button" class="result-card-mobile-export" data-result-action="export" data-result-filename="${safe}">Ekspor Excel</button><button type="button" data-result-action="export-formula" data-result-filename="${safe}">Excel formula</button></div></details><span class="export-status" role="status" aria-live="polite"></span></div>`;
}

function decorateCollapsibleResults(root=document){
  const sections=[];
  if(root.matches?.('.analysis-result'))sections.push(root);
  root.querySelectorAll?.('.analysis-result').forEach(section=>sections.push(section));
  sections.forEach(section=>{
    if(section.dataset.collapseBound==='1')return;
    const heading=section.querySelector(':scope > h3, :scope > h4');if(!heading)return;
    section.dataset.collapseBound='1';
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='result-collapse-toggle';
    toggle.textContent='Ciutkan';
    toggle.setAttribute('aria-expanded','true');
    toggle.title='Buka/tutup hasil parameter';
    toggle.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      const collapsed=section.classList.toggle('result-collapsed');
      toggle.textContent=collapsed?'Buka':'Ciutkan';
      toggle.setAttribute('aria-expanded',String(!collapsed));
    });
    heading.append(toggle);
  });
}

function installResultCollapseObserver(){
  decorateCollapsibleResults();
  const observer=new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)decorateCollapsibleResults(node);
  });
  observer.observe(document.body,{childList:true,subtree:true});
}

export function installResultExport() {
  if (document.documentElement.dataset.resultExportBound) return;
  document.documentElement.dataset.resultExportBound = '1';
  installResultCollapseObserver();
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-result-action]');
    if (!button) return;
    const action=button.dataset.resultAction,isAll=['export-all','export-all-formula','export-bab4'].includes(action);
    const scope = action==='copy-publication'?button.closest('[data-bab4-table]'):isAll?button.closest('[data-all-results]'):button.closest('[data-export-scope]');
    if (!scope) return;
    const status = document.querySelector('#status');
    const feedback=button.closest('.result-actions')?.querySelector('.export-status');
    const message=text=>{if(status)status.textContent=text;if(feedback)feedback.textContent=text;};
    const originalLabel=button.textContent;
    if(button.disabled)return;
    button.disabled=true;
    button.textContent='Memproses…';
    try {
      if(action==='copy-publication'){
        await copyScope(scope);
        message('Tabel siap ditempel ke Word/Excel.');
      } else if(action==='export-bab4'){
        exportBab4Doc(scope);
        message('BAB IV siap dibuka di Word.');
      } else if(action==='copy-interpretation'){
        const block=button.closest('[data-chapter-interpretation]');
        const text=[...(block?.querySelectorAll('.interpretation-paragraph')||[])].map(el=>el.textContent.trim()).filter(Boolean).join('\n\n');
        if(!text)throw Error('Interpretasi belum tersedia.');
        await navigator.clipboard.writeText(text);
        message('Interpretasi BAB IV disalin.');
      } else if(isAll){
        const snapshot=cleanClone(scope);snapshot.dataset.decimalSeparator=getDecimalSeparator();
        const formulas=action==='export-all-formula',rawDataset=formulas?await formulaRawDataset():null;
        const {downloadAllReportsXlsx}=await import('./xlsx-export.js');await downloadAllReportsXlsx(snapshot,{formulas,rawDataset});
        message(formulas?'Seluruh parameter diekspor: data mentah tetap berupa nilai, sedangkan keluaran numerik disimpan sebagai formula Excel.':'Seluruh parameter diekspor; satu lembar per parameter.');
      } else if (button.dataset.resultAction === 'copy') {
        await copyScope(scope);
        message('Hasil disalin. Tempel langsung ke Excel.');
      } else if (action === 'export' || action === 'export-formula') {
        const formulas=action==='export-formula';
        await exportScope(scope, button.dataset.resultFilename, formulas);
        message(formulas?'File formula siap: data mentah berupa nilai, hasil analisis berupa formula Excel dan dihitung ulang saat dibuka.':'File Excel (.xlsx) siap diunduh.');
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
