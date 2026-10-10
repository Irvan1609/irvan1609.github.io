import {getDecimalSeparator} from './number-format.js';
import {templateCatalog,getDataTemplate,rowsForEditor,templateHelp} from './template-catalog.js';
import {installDatasetSidebarEnhancements} from './dataset-sidebar.js?v=20260929-cleanmenus7';
import {installDataEnhancements} from './data-enhancements.js';
import {validateColumnNames,prepareImportedColumnNames} from './dataset-columns.js?v=20261010-import-unique1';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
function importDataset(detail){
  document.dispatchEvent(new CustomEvent('dataset-import',{detail}));
  if(!detail.importResult?.ok)throw Error(detail.importResult?.error||'Editor belum siap menerima dataset. Muat ulang halaman lalu coba lagi.');
}
export function readDataset(){
  const source=globalThis.StatisticalWebData?.readActiveDataset?.();
  if(source?.headers&&source?.rows)return {
    name:source.name||$('#activeFile')?.textContent||'Dataset',
    plant:source.plant||'',treatment:source.treatment||'',
    headers:source.headers.map(String),rows:source.rows.map(row=>row.map(value=>String(value??'')))
  };
  return {
    name:$('#activeFile')?.textContent||'Dataset',
    plant:$('#plantName')?.value.trim()||'',
    treatment:$('#treatmentName')?.value.trim()||'',
    headers:[...document.querySelectorAll('.data-grid thead th[data-column-header]')].map(x=>x.dataset.columnHeader||x.textContent.trim()),
    rows:[...document.querySelectorAll('.data-grid tbody tr:not(.virtual-spacer)')].map(tr=>[...tr.cells].slice(1).map(td=>td.textContent))
  };
}
function templateOptions(){
  const groups=[...new Set(templateCatalog.map(x=>x.group))];
  return groups.map(group=>`<optgroup label="${esc(group)}">${templateCatalog.filter(x=>x.group===group).map(x=>`<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('')}</optgroup>`).join('');
}
function templatePreview(template){
  const separator=getDecimalSeparator(),rows=rowsForEditor(template,separator),preview=rows.slice(0,6);
  return `<div class="analysis-note"><b>${esc(template.label)}</b><br>${esc(template.description)}</div><p><b>Kolom:</b> ${template.headers.map(esc).join(' · ')}</p><div class="table-scroll"><table class="result-table"><thead><tr>${template.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${preview.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="form-help">Menampilkan ${preview.length} dari ${rows.length} baris contoh. Setelah dibuat, datanya bisa langsung diedit.</p>`;
}
function installExampleDatasets(){
  const tree=$('#fileTree');if(!tree||$('#exampleDatasets'))return;
  const section=document.createElement('details');section.id='exampleDatasets';
  section.style.cssText='margin-top:12px;border-top:1px solid #d8dee8;padding-top:10px';
  section.innerHTML='<summary style="cursor:pointer;font-weight:600">Contoh dataset</summary><p class="form-help">Saya sediakan beberapa contoh untuk melihat format data. Buat salinan kalau ingin diedit atau dianalisis.</p>'+
    templateCatalog.map(item=>`<button type="button" class="tree-item" data-example-id="${esc(item.id)}" style="display:block;width:100%;text-align:left;margin-top:4px">${esc(item.label)}</button>`).join('');
  tree.after(section);
  section.addEventListener('click',event=>{
    const button=event.target.closest('[data-example-id]');if(!button)return;
    const template=getDataTemplate(button.dataset.exampleId),rows=rowsForEditor(template,getDecimalSeparator());
    openTool(`Contoh dataset — ${template.label}`,`<p>${esc(template.description)}</p><p class="analysis-note">Contoh ini hanya untuk dilihat. Buat salinan kalau ingin mengubah datanya.</p><div class="table-scroll"><table class="result-table"><thead><tr>${template.headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>${rows.length} baris × ${template.headers.length} kolom</p><button type="button" id="copyExampleDataset">Buat salinan untuk analisis</button><p id="exampleDatasetStatus" role="status"></p>`);
    $('#copyExampleDataset').onclick=()=>{
      try{
        importDataset({name:template.name,headers:[...template.headers],rows:rows.map(row=>[...row])});
        section.open=false;
        $('#dataToolModal').classList.remove('open');
      }catch(error){$('#exampleDatasetStatus').textContent=error.message;}
    };
  });
}
export function installDataTools(){
  installDatasetSidebarEnhancements();
  const toolbar=$('.toolbar');
  toolbar.insertAdjacentHTML('beforeend','<button id="importXlsx">Impor Excel</button><button id="dataTemplate">Template data</button><button id="analysisHistory">Riwayat analisis</button>');
  installDataEnhancements();
  document.body.insertAdjacentHTML('beforeend',`<input id="xlsxInput" type="file" accept=".xlsx" hidden><div id="dataToolModal" class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dataToolTitle"><div class="modal-head data-tool-head"><button id="closeDataTool" aria-label="Tutup">✕</button><strong id="dataToolTitle"></strong><button id="dataToolResultMore" type="button" aria-label="Aksi hasil" aria-expanded="false" hidden>⋮</button><div id="dataToolResultMenu" class="analysis-dock-menu data-tool-result-menu" hidden><button type="button" data-tool-proxy="excel">Excel (.xlsx)</button><button type="button" data-tool-proxy="formula">Excel formula</button><button type="button" data-tool-proxy="print">PDF / Cetak</button></div></div><div id="dataToolBody" class="modal-body"></div></div></div>`);
  $('#closeDataTool').onclick=()=>{const modal=$('#dataToolModal');modal.classList.remove('open','analysis-tool-result-mode');$('#dataToolResultMenu').hidden=true;$('#dataToolResultMore').hidden=true;$('#dataToolResultMore').setAttribute('aria-expanded','false');if(['parallel-analysis','augmented'].includes(modal.dataset.toolMode))document.body.classList.remove('analysis-mode-active');};
  $('#dataToolResultMore').onclick=event=>{event.stopPropagation();const menu=$('#dataToolResultMenu'),opening=menu.hidden;if(opening)document.dispatchEvent(new CustomEvent('stat-close-floating',{detail:{except:'data-tool-result-menu'}}));menu.hidden=!opening;$('#dataToolResultMore').setAttribute('aria-expanded',String(opening));};
  $('#dataToolResultMenu').onclick=event=>{const action=event.target.closest('[data-tool-proxy]')?.dataset.toolProxy;if(!action)return;const host=$('#dataToolBody .analysis-tool-result-active');const selectors={excel:'[data-result-action="export-all"]',formula:'[data-result-action="export-all-formula"]',print:'[data-generic-print-results], [data-print-results]'};host?.querySelector(selectors[action])?.click();$('#dataToolResultMenu').hidden=true;$('#dataToolResultMore').setAttribute('aria-expanded','false');};
  document.addEventListener('click',event=>{if(!event.target.closest('#dataToolResultMore,#dataToolResultMenu')){$('#dataToolResultMenu').hidden=true;$('#dataToolResultMore').setAttribute('aria-expanded','false');}});
  document.addEventListener('stat-close-floating',event=>{if(event.detail?.except!=='data-tool-result-menu'){$('#dataToolResultMenu').hidden=true;$('#dataToolResultMore').setAttribute('aria-expanded','false');}});
  installExampleDatasets();
  $('#importXlsx').onclick=()=>$('#xlsxInput').click();
  $('#xlsxInput').onchange=async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    openTool('Impor Excel','<p>Membaca lembar kerja…</p>');
    try{
      const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();await book.xlsx.load(await file.arrayBuffer());
      const sheets=book.worksheets.filter(s=>s.rowCount>0);if(!sheets.length)throw Error('File tidak memiliki lembar berisi data.');
      $('#dataToolBody').innerHTML=`<label for="importSheet">Pilih lembar kerja</label><select id="importSheet">${sheets.map((s,i)=>`<option value="${i}">${esc(s.name)}</option>`).join('')}</select><p>Baris pertama harus berisi judul kolom. Gunakan satu baris per pengamatan, tanpa total atau rata-rata.</p><div id="sheetPreview" class="table-scroll"></div><p id="importError" role="alert"></p><button id="applyXlsx" class="primary">Impor sebagai dataset baru</button>`;
      const cellValue=cell=>{
        let value=cell.value;
        if(value&&typeof value==='object'){
          if('formula' in value||'sharedFormula' in value){value=value.result;if(value===undefined)throw Error('Ada formula tanpa hasil tersimpan. Hitung dan simpan file di Excel terlebih dahulu.');}
          else if(value.richText)value=value.richText.map(r=>r.text).join('');
          else if(value.text!==undefined)value=value.text;
        }
        if(value===null||value===undefined)return '';
        if(typeof value==='number')return String(value).replace('.',getDecimalSeparator());
        if(typeof value==='string')return value;
        throw Error('Ada nilai tanggal, kesalahan formula, atau tipe sel yang tidak didukung. Ubah menjadi angka atau teks.');
      };
      const extract=()=>{
        const sheet=sheets[Number($('#importSheet').value)],rows=[];
        sheet.eachRow({includeEmpty:true},row=>rows.push(Array.from({length:sheet.columnCount},(_,i)=>cellValue(row.getCell(i+1)))));
        while(rows.length&&rows.at(-1).every(v=>v===''))rows.pop();
        let cols=rows.reduce((m,r)=>Math.max(m,r.findLastIndex(v=>v!=='')+1),0);
        return rows.map(r=>r.slice(0,cols));
      };
      function preview(){try{const rows=extract(),prepared=rows.length?prepareImportedColumnNames(rows[0]):{renamed:[]};$('#sheetPreview').innerHTML=`<table class="result-table">${rows.slice(0,7).map((r,i)=>`<tr>${r.map(v=>`<${i?'td':'th'}>${esc(v)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</table><p>${Math.max(0,rows.length-1)} pengamatan. ${prepared.renamed.length?`${prepared.renamed.length} judul kolom duplikat/kosong akan diperbaiki otomatis saat impor.`:''}</p>`;$('#importError').textContent='';}catch(e){$('#importError').textContent=e.message;}}
      $('#importSheet').onchange=preview;preview();
      $('#applyXlsx').onclick=()=>{try{
        const [headers,...rows]=extract(),prepared=prepareImportedColumnNames(headers),cleanHeaders=prepared.headers;
        if(!rows.length)throw Error('Belum ada baris pengamatan.');
        importDataset({name:file.name.replace(/\.xlsx$/i,'')+'-'+sheets[Number($('#importSheet').value)].name,headers:cleanHeaders,rows});
        if(prepared.renamed.length)document.getElementById('status').textContent=`✓ Excel berhasil diimpor. ${prepared.renamed.length} judul kolom duplikat/kosong diperbaiki otomatis; semua nilai dipertahankan.`;
        $('#dataToolModal').classList.remove('open');
      }catch(e){$('#importError').textContent=e.message;}};
    }catch(e){$('#dataToolBody').innerHTML=`<p role="alert">${esc(e.message)}</p>`;}
  };
  $('#dataTemplate').onclick=()=>{
    openTool('Template data',`<label for="templateDesign">Analisis / rancangan</label><select id="templateDesign">${templateOptions()}</select><div id="templateInfo"></div><div class="dataset-actions"><button id="createTemplateDataset" class="primary">Buat dataset</button><button id="downloadTemplate">Unduh template .xlsx</button></div><p id="templateStatus" role="status"></p>`);
    const updateInfo=()=>{try{$('#templateInfo').innerHTML=templatePreview(getDataTemplate($('#templateDesign').value));$('#templateStatus').textContent='';}catch(e){$('#templateInfo').innerHTML='';$('#templateStatus').textContent=e.message;}};
    $('#templateDesign').onchange=updateInfo;updateInfo();
    $('#createTemplateDataset').onclick=()=>{try{
      const template=getDataTemplate($('#templateDesign').value),rows=rowsForEditor(template,getDecimalSeparator());
      importDataset({name:template.name,headers:template.headers,rows});
      const examples=$('#exampleDatasets');if(examples)examples.open=false;
      const status=$('#status');if(status)status.textContent=`✓ Dataset ${template.label} dibuat dari template dan siap diedit.`;
      $('#dataToolModal').classList.remove('open');
    }catch(e){$('#templateStatus').textContent=e.message;}};
    $('#downloadTemplate').onclick=async()=>{const button=$('#downloadTemplate');button.disabled=true;$('#createTemplateDataset').disabled=true;try{
      const {default:ExcelJS}=await import('exceljs'),template=getDataTemplate($('#templateDesign').value),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Data');
      sheet.addRow(template.headers);template.rows.forEach(row=>sheet.addRow(row));
      sheet.columns.forEach((c,i)=>c.width=Math.max(14,Math.min(28,String(template.headers[i]).length+5)));sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:template.headers.length}};
      const help=book.addWorksheet('Petunjuk');help.getColumn(1).width=115;help.addRow([`${template.label} — ${template.description}`]);templateHelp(template).forEach(x=>help.addRow([x]));help.getRow(1).font={bold:true};
      const info=book.addWorksheet('Struktur');info.columns=[{header:'Kolom',key:'column',width:28},{header:'Contoh',key:'example',width:24}];template.headers.forEach((h,i)=>info.addRow({column:h,example:template.rows[0]?.[i]??''}));info.getRow(1).font={bold:true};
      downloadBlob(await book.xlsx.writeBuffer(),`${template.name}.xlsx`);$('#templateStatus').textContent='Template Excel siap diunduh.';
    }catch(e){$('#templateStatus').textContent=e.message;}finally{button.disabled=false;$('#createTemplateDataset').disabled=false;}};
  };
}
function applyParallelAnalysisLayout(body){
  body.classList.remove('analysis-tool-parallel-body','analysis-tool-results-only');
  body.querySelector('.analysis-tool-parallel-grid')?.replaceWith(...body.querySelector('.analysis-tool-parallel-grid')?.children||[]);
  body.classList.add('analysis-tool-parallel-body');
  const candidates=[...body.children].filter(el=>el.matches('.form-grid,fieldset,details,#associationFields'));
  if(candidates.length>=2){
    const grid=document.createElement('div');grid.className='analysis-tool-parallel-grid';
    candidates[0].before(grid);grid.append(candidates[0],candidates[1]);
  }
  body._analysisResultObserver?.disconnect?.();
  const resultTargets=[...body.querySelectorAll('[data-all-results],#assocResult,#advancedResult,#nextGenResult,#mixedResult,#siResult,#powerResult')];
  const sync=()=>{
    const active=resultTargets.find(target=>target.children.length||String(target.textContent||'').trim());
    resultTargets.forEach(target=>target.classList.toggle('analysis-tool-result-active',target===active));
    body.classList.toggle('analysis-tool-results-only',!!active);
    const modal=$('#dataToolModal'),more=$('#dataToolResultMore');
    modal?.classList.toggle('analysis-tool-result-mode',!!active);
    if(more)more.hidden=!active;
    if(!active){$('#dataToolResultMenu').hidden=true;more?.setAttribute('aria-expanded','false');}
    if(active&&!active.querySelector('.analysis-export-footer')){
      active.setAttribute('data-all-results','');
      const footer=document.createElement('section');footer.className='analysis-export-footer';footer.setAttribute('aria-label','Ekspor hasil');
      footer.innerHTML='<div class="analysis-export-footer-head"><b>Ekspor hasil</b><span>Hasil analisis</span></div><div class="analysis-export-footer-actions"><button data-result-action="export-all">Excel (.xlsx)</button><button data-result-action="export-all-formula">Excel formula</button><button type="button" data-generic-print-results>PDF / Cetak</button></div>';
      active.append(footer);
      footer.querySelector('[data-generic-print-results]').onclick=()=>{document.body.classList.add('print-analysis-mode');const clean=()=>document.body.classList.remove('print-analysis-mode');window.addEventListener('afterprint',clean,{once:true});window.print();setTimeout(clean,1500);};
    }
  };
  const observer=new MutationObserver(sync);resultTargets.forEach(target=>observer.observe(target,{childList:true,subtree:true,characterData:true}));
  body._analysisResultObserver=observer;sync();
}
export function openTool(title,html,mode=''){
  document.dispatchEvent(new CustomEvent('stat-close-floating',{detail:{except:'data-tool-modal'}}));
  document.documentElement.classList.remove('mobile-project-open');
  document.getElementById('projectToggle')?.setAttribute('aria-expanded','false');
  const modal=$('#dataToolModal'),body=$('#dataToolBody');
  $('#dataToolTitle').textContent=title;body.innerHTML=html;
  modal.dataset.toolMode=String(mode||'');
  const analysisMode=mode==='parallel-analysis'||mode==='augmented';
  if(analysisMode)document.body.classList.add('analysis-mode-active');
  if(mode==='parallel-analysis')applyParallelAnalysisLayout(body);
  else body.classList.remove('analysis-tool-parallel-body');
  modal.classList.add('open');requestAnimationFrame(()=>{modal.scrollTop=0;body.scrollTop=0;});
}
export function downloadBlob(buffer,name){const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
