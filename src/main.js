import { installAnalysisFlow } from './analysis-flow.js';
import { installPaymentGate } from './payment-gate.js';
import {nextColumnName,isUniqueColumnName,validateColumnNames} from './dataset-columns.js';
import {installNavigation} from './navigation.js';
import { installDataTools } from './data-tools.js';
import { parseNumber, formatNumber, initNumberSettings } from './number-format.js';
import { resultActions, installResultExport } from './result-export.js';
import {parseParameterHeader,buildParameterHeader} from './parameter-metadata.js';
import {readCategoryMetadata,saveCategoryLevel,moveCategoryDataset,removeCategoryDataset,moveCategoryColumn,removeCategoryColumn} from './category-metadata.js';
import { fCritical, effectLevel, isSignificantAt, cvPercent, descriptiveMeanChart } from './report-utils.js';
import jStat from 'jstat';

const FILES_KEY='statistical_web_csv_files_v1';
const ACTIVE_KEY='statistical_web_active_csv_v1';
const LEGACY_FILES_KEY='statistical_web_txt_files_v2';
const LEGACY_ACTIVE_KEY='statistical_web_active_txt_v2';
const META_KEY='statistical_web_dataset_meta_v1';
const state={files:{},active:'dataset.csv',headers:[],rows:[],meta:{}};
let editingColumnIndex=null;
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=formatNumber;

function showError(message,errorObj){
  console.error(message,errorObj||'');
  const text=`⚠ ${message}${errorObj?.message?` — ${errorObj.message}`:''}`;
  const box=$('#errorBox');
  if(box){box.hidden=false;box.textContent=text;}
  if($('#status'))$('#status').textContent=text;
}
function clearError(){const box=$('#errorBox');if(box){box.hidden=true;box.textContent='';}}
function setStatus(text){if($('#status'))$('#status').textContent=text;}
function parseTSV(text){return text.replace(/\r/g,'').split('\n').filter(line=>line.length>0).map(line=>line.split('\t'));}
function displayDatasetName(name){return String(name||'dataset').replace(/\.(?:csv|txt)$/i,'');}
function csvCell(value){const text=String(value??'');return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;}
function serializeRows(headers,rows){if(!headers?.length)return '';return [headers,...rows].map(row=>row.map(csvCell).join(',')).join('\n');}
function serialize(){return serializeRows(state.headers,state.rows.map(row=>state.headers.map((_,i)=>row[i]??'')));}
function persist(){try{state.files[state.active]=serialize();localStorage.setItem(FILES_KEY,JSON.stringify(state.files));localStorage.setItem(ACTIVE_KEY,state.active);}catch(e){showError('Gagal menyimpan dataset sementara di browser.',e);}}
function updateStorageStatus(){}
function migrateLegacyStorage(){
  const legacy=JSON.parse(localStorage.getItem(LEGACY_FILES_KEY)||'{}')||{};
  if(!Object.keys(legacy).length)return null;
  const files={},nameMap={};
  for(const [oldName,text] of Object.entries(legacy)){
    const base=displayDatasetName(oldName)||'dataset';let name=base+'.csv',suffix=2;
    while(Object.prototype.hasOwnProperty.call(files,name))name=`${base} (${suffix++}).csv`;
    const parsed=parseTSV(text);files[name]=parsed.length?serializeRows(parsed[0],parsed.slice(1)):'';
    nameMap[oldName]=name;
  }
  const legacyActive=localStorage.getItem(LEGACY_ACTIVE_KEY),active=nameMap[legacyActive]||Object.keys(files)[0]||'dataset.csv';
  localStorage.setItem(FILES_KEY,JSON.stringify(files));localStorage.setItem(ACTIVE_KEY,active);
  return {files,active};
}
function activeMeta(){return state.meta[state.active]||{plant:'',treatment:''};}
function renderDatasetMeta(){
  const meta=activeMeta();
  if($('#plantName'))$('#plantName').value=meta.plant||'';
  if($('#treatmentName'))$('#treatmentName').value=meta.treatment||'';
}
function saveDatasetMeta(){
  state.meta[state.active]={plant:$('#plantName')?.value.trim()||'',treatment:$('#treatmentName')?.value.trim()||''};
  try{localStorage.setItem(META_KEY,JSON.stringify(state.meta));}catch(e){showError('Keterangan tanaman/perlakuan tidak dapat disimpan.',e);}
}
function loadStorage(){
  try{
    state.meta=JSON.parse(localStorage.getItem(META_KEY)||'{}')||{};
    const migrated=!localStorage.getItem(FILES_KEY)?migrateLegacyStorage():null;
    state.files=migrated?.files||(JSON.parse(localStorage.getItem(FILES_KEY)||'{}')||{});
    state.active=migrated?.active||localStorage.getItem(ACTIVE_KEY)||Object.keys(state.files)[0]||'dataset.csv';
    if(!(state.active in state.files))state.files[state.active]='';
  }catch(e){state.files={'dataset.csv':''};state.active='dataset.csv';state.meta={};showError('Penyimpanan browser tidak dapat dibaca; dataset baru dibuat.',e);}
  loadActive(false);
}
function loadActive(save=true){
  const text=state.files[state.active]??'',parsed=text.trim()?csvRows(text,','):[];
  state.headers=parsed[0]||[];state.rows=parsed.slice(1).map(row=>state.headers.map((_,i)=>row[i]??''));
  if(save)localStorage.setItem(ACTIVE_KEY,state.active);
  renderTree();renderGrid();renderDatasetMeta();
  if($('#activeFile'))$('#activeFile').textContent=displayDatasetName(state.active);
}
function renderTree(){
  const tree=$('#fileTree');if(!tree)return;
  tree.innerHTML=Object.keys(state.files).map(name=>`<button type="button" class="tree-item ${name===state.active?'active':''}" data-file="${esc(name)}">📄 ${esc(displayDatasetName(name))}</button>`).join('');
  tree.querySelectorAll('[data-file]').forEach(btn=>btn.addEventListener('click',()=>{clearError();state.active=btn.dataset.file;loadActive();setStatus(`✓ ${displayDatasetName(state.active)} dibuka.`);}));
}
function columnHeaderMarkup(header){
  const meta=parseParameterHeader(header);
  if(meta.name){
    return `<span class="parameter-code">${esc(meta.code)}</span><span class="parameter-divider">|</span><span class="parameter-description">${esc(meta.name)}</span>${meta.unit?`<span class="parameter-unit">(${esc(meta.unit)})</span>`:''}`;
  }
  return `<span class="parameter-code">${esc(meta.code)}</span>${meta.unit?`<span class="parameter-unit">(${esc(meta.unit)})</span>`:''}`;
}
function stringLevels(index){
  const values=state.rows.map(row=>String(row[index]??'').trim()).filter(Boolean);
  if(!values.length||!values.every(value=>!Number.isFinite(parseNumber(value))))return [];
  return [...new Set(values)];
}
function categoryMapMarkup(index,header){
  const levels=stringLevels(index);
  if(!levels.length)return '';
  const stored=readCategoryMetadata(displayDatasetName(state.active),header);
  const rows=levels.map(level=>{
    const entry=stored.levels?.[level]||{};
    return `<div class="category-level-row" data-category-level-row><span class="category-level-code" title="${esc(level)}">${esc(level)}</span><input data-category-value data-category-column="${index}" data-category-level="${esc(level)}" value="${esc(entry.value||'')}" placeholder="nilai" inputmode="decimal" aria-label="Nilai untuk ${esc(level)}"><span class="category-map-divider">|</span><input data-category-unit data-category-column="${index}" data-category-level="${esc(level)}" value="${esc(entry.unit||'')}" placeholder="satuan" aria-label="Satuan untuk ${esc(level)}"></div>`;
  }).join('');
  return `<details class="category-map"><summary>Isi nilai string</summary><div class="category-map-body"><small>Opsional: kode = nilai | satuan</small>${rows}</div></details>`;
}
function bindCategoryMappings(wrap){
  wrap.querySelectorAll('[data-category-value],[data-category-unit]').forEach(input=>input.addEventListener('input',()=>{
    const index=Number(input.dataset.categoryColumn),level=input.dataset.categoryLevel,row=input.closest('[data-category-level-row]');
    const value=row?.querySelector('[data-category-value]')?.value??'',unit=row?.querySelector('[data-category-unit]')?.value??'',header=state.headers[index];
    saveCategoryLevel(displayDatasetName(state.active),header,level,{value,unit});
  }));
}
function openColumnName(index){
  editingColumnIndex=index;
  const meta=parseParameterHeader(state.headers[index]||'');
  $('#columnCode').value=meta.code;
  $('#columnFullName').value=meta.name;
  $('#columnUnit').value=meta.unit;
  $('#columnNameError').hidden=true;
  $('#columnNameModal').classList.add('open');
  $('#columnCode').focus();
}
function saveColumnName(event){
  event.preventDefault();
  const code=$('#columnCode').value.trim(),fullName=$('#columnFullName').value.trim(),unit=$('#columnUnit').value.trim(),box=$('#columnNameError');
  const name=buildParameterHeader({code,name:fullName,unit});
  if(editingColumnIndex===null||!code||/[\t\r\n]/.test(name)||!isUniqueColumnName(state.headers,name,editingColumnIndex)){
    box.hidden=false;box.textContent='Kode harus terisi. Kode, nama lengkap, dan satuan tidak boleh mengandung tab/baris baru; judul akhirnya juga harus unik.';return;
  }
  const previous=state.headers[editingColumnIndex];
  state.headers[editingColumnIndex]=name;
  moveCategoryColumn(displayDatasetName(state.active),previous,name);
  persist();renderGrid();$('#columnNameModal').classList.remove('open');setStatus('Nama parameter dan satuan disimpan.');
}
function renderGrid(){
  const wrap=$('#gridWrap');if(!wrap)return;
  if(!state.headers.length){
    wrap.innerHTML=`<div class="empty-state"><h3>${esc(displayDatasetName(state.active))}</h3><p>Tempel/impor data atau mulai dengan kolom baru.</p><button type="button" class="empty-add-column" data-add-col>+ Kolom</button></div>`;
  }else{
    wrap.innerHTML=`<table class="data-grid"><thead><tr><th class="row-number grid-corner"><div class="grid-add-controls"><button type="button" data-add-row>+ Baris</button><button type="button" data-add-col>+ Kolom</button></div></th>${state.headers.map((h,j)=>`<th data-column-header="${esc(h)}">${categoryMapMarkup(j,h)}<div class="header-controls"><button class="header-name" data-rename-column="${j}" title="Ubah nama/keterangan kolom" aria-label="Ubah nama kolom ${esc(h)}">${columnHeaderMarkup(h)}</button><button class="grid-delete" data-delete-column="${j}" aria-label="Hapus kolom ${esc(h)}" title="Hapus kolom"></button></div></th>`).join('')}</tr></thead><tbody>${state.rows.map((r,i)=>`<tr><td class="row-number"><span>${i+1}</span><button class="grid-delete" data-delete-row="${i}" aria-label="Hapus baris ${i+1}" title="Hapus baris"></button></td>${state.headers.map((_,j)=>`<td contenteditable="true" data-r="${i}" data-c="${j}">${esc(r[j])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    wrap.querySelectorAll('[contenteditable=true]').forEach(cell=>cell.addEventListener('input',()=>{state.rows[Number(cell.dataset.r)][Number(cell.dataset.c)]=cell.textContent;persist();}));
    bindCategoryMappings(wrap);
    wrap.querySelectorAll('[data-rename-column]').forEach(button=>button.onclick=()=>openColumnName(Number(button.dataset.renameColumn)));
    wrap.querySelectorAll('[data-delete-column]').forEach(button=>button.onclick=()=>{const j=Number(button.dataset.deleteColumn),header=state.headers[j];if(!confirm(`Hapus kolom ${header} beserta datanya?`))return;removeCategoryColumn(displayDatasetName(state.active),header);state.headers.splice(j,1);state.rows.forEach(row=>row.splice(j,1));if(!state.headers.length)state.rows=[];persist();renderGrid();setStatus('Kolom dihapus.');});
    wrap.querySelectorAll('[data-delete-row]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.deleteRow);if(!confirm(`Hapus baris ${i+1}?`))return;state.rows.splice(i,1);persist();renderGrid();setStatus('Baris dihapus.');});
  }
  wrap.querySelectorAll('[data-add-row]').forEach(button=>button.onclick=addRow);
  wrap.querySelectorAll('[data-add-col]').forEach(button=>button.onclick=addColumn);
  if($('#activeFile'))$('#activeFile').textContent=displayDatasetName(state.active);
}
function excelRows(text){return text.replace(/\r/g,'').split('\n').filter(Boolean).map(line=>line.split('\t'));}
function detectDelimiter(text){let semis=0,commas=0,quotes=false;for(const c of text.slice(0,10000)){if(c==='"')quotes=!quotes;else if(!quotes&&c===';')semis++;else if(!quotes&&c===',')commas++;}return semis>commas?';':',';}
function csvRows(text,delimiter){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];cell='';}else cell+=c;}if(cell!==''||row.length){row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);}return rows;}
function openModal(){clearError();const m=$('#pasteModal');m.classList.add('open');$('#pasteArea').value='';$('#preview').textContent='';setTimeout(()=>$('#pasteArea').focus(),0);}
function closeModal(){$('#pasteModal').classList.remove('open');}
function previewPaste(){const a=excelRows($('#pasteArea').value);$('#preview').textContent=a.length?`${a.length} baris × ${a[0].length} kolom terdeteksi.`:'';}
function applyPasted(){try{const a=excelRows($('#pasteArea').value);if(!a.length)return showError('Tidak ada data Excel yang ditempel.');const hasHeader=$('#hasHeader').checked;state.headers=hasHeader?validateColumnNames(a[0]):a[0].map((_,i)=>`Variable${i+1}`);state.rows=a.slice(hasHeader?1:0).map(r=>state.headers.map((_,i)=>r[i]??''));persist();renderGrid();closeModal();setStatus(`✓ ${state.rows.length} baris × ${state.headers.length} kolom tersimpan di ${displayDatasetName(state.active)}.`);}catch(e){showError('Gagal memasukkan data dari Excel.',e);}}
async function importCSV(event){try{const file=event.target.files?.[0];if(!file)return;const text=await file.text();if(!text.trim())return showError('File CSV kosong.');const delimiter=detectDelimiter(text);const a=csvRows(text,delimiter);if(!a.length)return showError('CSV tidak dapat dibaca.');state.headers=validateColumnNames(a[0]);state.rows=a.slice(1).map(r=>state.headers.map((_,i)=>r[i]??''));persist();renderGrid();setStatus(`✓ CSV diimpor menggunakan pemisah “${delimiter}”: ${state.rows.length} baris × ${state.headers.length} kolom.`);}catch(e){showError('Gagal mengimpor CSV.',e);}finally{event.target.value='';}}
function newTXT(){let i=1,name='dataset.csv';while(Object.prototype.hasOwnProperty.call(state.files,name))name=`dataset${i++}.csv`;state.files[name]='';state.active=name;state.headers=[];state.rows=[];state.meta[name]={plant:'',treatment:''};persist();try{localStorage.setItem(META_KEY,JSON.stringify(state.meta));}catch{}loadActive(false);setStatus(`✓ ${displayDatasetName(name)} dibuat.`);}
function addRow(){if(!state.headers.length)return showError('Tambahkan data atau kolom terlebih dahulu.');state.rows.push(state.headers.map(()=>''));persist();renderGrid();setStatus('✓ Baris baru ditambahkan.');}
function addColumn(){if(!state.headers.length)state.rows=[];state.headers.push(nextColumnName(state.headers));state.rows.forEach(r=>r.push(''));persist();renderGrid();setStatus('✓ Kolom baru ditambahkan.');}
function clearData(){if(!confirm(`Hapus seluruh isi ${displayDatasetName(state.active)}?`))return;state.headers=[];state.rows=[];persist();renderGrid();setStatus(`✓ Isi ${displayDatasetName(state.active)} dikosongkan.`);}
function renameDataset() {
  $('#datasetName').value=displayDatasetName(state.active);
  $('#datasetNameError').hidden=true;
  $('#datasetNameModal').classList.add('open');
  $('#datasetName').focus();
}
function saveDatasetName(event) {
  event.preventDefault();
  const name=$('#datasetName').value.trim().replace(/\.(?:csv|txt)$/i,'');
  const target=name+'.csv', box=$('#datasetNameError');
  if(!name||/[\\/\u0000-\u001f]/.test(name)){box.hidden=false;box.textContent='Masukkan nama tanpa garis miring atau karakter kontrol.';return;}
  if(Object.keys(state.files).some(key=>key.toLowerCase()===target.toLowerCase()&&key!==state.active)){box.hidden=false;box.textContent='Nama tersebut sudah digunakan dataset lain.';return;}
  const files=Object.fromEntries(Object.entries(state.files).map(([key,value])=>[key===state.active?target:key,key===state.active?serialize():value]));
  try{
    localStorage.setItem(FILES_KEY,JSON.stringify(files));localStorage.setItem(ACTIVE_KEY,target);
    const previous=state.active,meta={...state.meta};if(previous!==target){meta[target]=meta[previous]||{plant:'',treatment:''};delete meta[previous];moveCategoryDataset(displayDatasetName(previous),displayDatasetName(target));}
    localStorage.setItem(META_KEY,JSON.stringify(meta));
    state.files=files;state.active=target;state.meta=meta;
    $('#datasetNameModal').classList.remove('open');renderTree();renderGrid();renderDatasetMeta();setStatus(`✓ Dataset diganti nama menjadi ${displayDatasetName(target)}.`);
  }catch(e){box.hidden=false;box.textContent='Nama dataset tidak dapat disimpan.';showError('Gagal mengganti nama dataset.',e);}
}
function deleteDataset(){if(!confirm(`Hapus ${displayDatasetName(state.active)}? Tindakan ini tidak dapat dibatalkan.`))return;const removed=state.active;removeCategoryDataset(displayDatasetName(removed));delete state.files[removed];delete state.meta[removed];state.active=Object.keys(state.files)[0]||'dataset.csv';if(!(state.active in state.files))state.files[state.active]='';try{localStorage.setItem(META_KEY,JSON.stringify(state.meta));}catch{}persist();loadActive(false);setStatus('✓ Dataset dihapus.');}
function downloadDataset(){const blob=new Blob([serialize()],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=state.active;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);setStatus(`✓ ${displayDatasetName(state.active)} diunduh.`);}
function installDataGrid(){
  document.addEventListener('dataset-import',event=>{
    const detail=event.detail;
    try{
      if(!detail||typeof detail!=='object')throw Error('Data impor tidak tersedia.');
      const headers=validateColumnNames(detail.headers);
      if(headers.some(header=>/[\t\r\n]/.test(header)))throw Error('Judul kolom tidak boleh mengandung tab/baris baru.');
      if(!Array.isArray(detail.rows)||!detail.rows.length)throw Error('Belum ada baris pengamatan.');
      const rows=detail.rows.map((row,i)=>{
        if(!Array.isArray(row)||row.length!==headers.length)throw Error(`Jumlah kolom pada baris ${i+1} tidak sesuai header.`);
        return row.map((value,j)=>{
          if(value!==null&&value!==undefined&&typeof value!=='string'&&!(typeof value==='number'&&Number.isFinite(value)))throw Error(`Nilai baris ${i+1}, kolom ${j+1} tidak didukung.`);
          const text=String(value??'');
          if(/[\t\r\n]/.test(text))throw Error(`Hapus tab/baris baru pada baris ${i+1}, kolom ${j+1}.`);
          return text;
        });
      });
      const base=String(detail.name||'dataset').trim().replace(/\.(?:csv|txt)$/i,'').replace(/[\\/\u0000-\u001f]/g,'_')||'dataset';
      let name=base+'.csv',suffix=2;
      const names=new Set(Object.keys(state.files).map(x=>x.toLowerCase()));
      while(names.has(name.toLowerCase()))name=`${base} (${suffix++}).csv`;
      const files={...state.files,[name]:serializeRows(headers,rows)},meta={...state.meta,[name]:{plant:String(detail.plant||'').trim(),treatment:String(detail.treatment||'').trim()}};
      const previousFiles=localStorage.getItem(FILES_KEY),previousActive=localStorage.getItem(ACTIVE_KEY),previousMeta=localStorage.getItem(META_KEY);
      try{localStorage.setItem(FILES_KEY,JSON.stringify(files));localStorage.setItem(ACTIVE_KEY,name);localStorage.setItem(META_KEY,JSON.stringify(meta));}
      catch(error){
        try{for(const [key,value] of [[FILES_KEY,previousFiles],[ACTIVE_KEY,previousActive],[META_KEY,previousMeta]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}}catch{}
        throw error;
      }
      state.files=files;state.active=name;state.headers=headers;state.rows=rows;state.meta=meta;
      clearError();renderTree();renderGrid();renderDatasetMeta();
      detail.importResult={ok:true,name};
      setStatus(`✓ ${displayDatasetName(name)}: ${rows.length} baris × ${headers.length} kolom berhasil diimpor.`);
    }catch(error){
      if(detail&&typeof detail==='object')detail.importResult={ok:false,error:error.message};
      showError('Gagal membuat dataset.',error);
    }
  });
  $('#pasteBtn').onclick=openModal;$('#closeModal').onclick=closeModal;$('#cancelPaste').onclick=closeModal;$('#applyPaste').onclick=applyPasted;$('#pasteArea').oninput=previewPaste;$('#importBtn').onclick=()=>$('#file').click();$('#file').onchange=importCSV;$('#newTxt').onclick=newTXT;$('#addRow').onclick=addRow;$('#addCol').onclick=addColumn;$('#clearData').onclick=clearData;$('#renameDataset').onclick=renameDataset;$('#closeDatasetName').onclick=()=>$('#datasetNameModal').classList.remove('open');$('#datasetNameForm').onsubmit=saveDatasetName;$('#deleteDataset').onclick=deleteDataset;$('#closeColumnName').onclick=()=>$('#columnNameModal').classList.remove('open');$('#columnNameForm').onsubmit=saveColumnName;$('#plantName').oninput=saveDatasetMeta;$('#treatmentName').oninput=saveDatasetMeta;
  $('#fileTree').addEventListener('click',event=>{const item=event.target.closest('[data-file]');if(!item)return;state.active=item.dataset.file;loadActive();});
}

initNumberSettings();loadStorage();installDataGrid();installDataTools();installNavigation();installAnalysisFlow();installPaymentGate();installResultExport();
