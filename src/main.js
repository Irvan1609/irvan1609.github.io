import { installAnalysisFlow } from './analysis-flow.js';
import { installPaymentGate } from './payment-gate.js';
import {nextColumnName,isUniqueColumnName,validateColumnNames} from './dataset-columns.js';
import {installNavigation} from './navigation.js';
import { installDataTools } from './data-tools.js';
import { parseNumber, formatNumber, initNumberSettings } from './number-format.js';
import { resultActions, installResultExport } from './result-export.js';
import { fCritical, effectLevel, isSignificantAt, cvPercent, descriptiveMeanChart } from './report-utils.js';
import jStat from 'jstat';

const FILES_KEY='statistical_web_txt_files_v2';
const ACTIVE_KEY='statistical_web_active_txt_v2';
const state={files:{},active:'dataset.txt',headers:[],rows:[]};
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
function serialize(){if(!state.headers.length)return '';return [state.headers.join('\t'),...state.rows.map(r=>state.headers.map((_,i)=>r[i]??'').join('\t'))].join('\n');}
function persist(){try{state.files[state.active]=serialize();localStorage.setItem(FILES_KEY,JSON.stringify(state.files));localStorage.setItem(ACTIVE_KEY,state.active);updateStorageStatus();}catch(e){showError('Gagal menyimpan dataset sementara di browser.',e);}}
function updateStorageStatus(){const el=$('#storageStatus');if(el)el.textContent=`● ${Object.keys(state.files).length} file .txt`;}
function loadStorage(){try{state.files=JSON.parse(localStorage.getItem(FILES_KEY)||'{}')||{};state.active=localStorage.getItem(ACTIVE_KEY)||Object.keys(state.files)[0]||'dataset.txt';if(!(state.active in state.files))state.files[state.active]='';}catch(e){state.files={'dataset.txt':''};state.active='dataset.txt';showError('Penyimpanan browser tidak dapat dibaca; dataset baru dibuat.',e);}loadActive(false);}
function loadActive(save=true){const text=state.files[state.active]??'';const parsed=parseTSV(text);state.headers=parsed[0]||[];state.rows=parsed.slice(1).map(r=>state.headers.map((_,i)=>r[i]??''));if(save)localStorage.setItem(ACTIVE_KEY,state.active);renderTree();renderGrid();updateStorageStatus();$('#activeFile').textContent=state.active;}
function renderTree(){const tree=$('#fileTree');if(!tree)return;tree.innerHTML=Object.keys(state.files).map(name=>`<button type="button" class="tree-item ${name===state.active?'active':''}" data-file="${esc(name)}">📄 ${esc(name)}</button>`).join('');tree.querySelectorAll('[data-file]').forEach(btn=>btn.addEventListener('click',()=>{clearError();state.active=btn.dataset.file;loadActive();setStatus(`✓ ${state.active} dibuka.`);}));}
function renderGrid(){
  const wrap=$('#gridWrap');if(!wrap)return;
  if(!state.headers.length)wrap.innerHTML=`<div class="empty-state"><h3>${esc(state.active)}</h3><p>Gunakan menu File atau Tambah kolom untuk memasukkan data.</p></div>`;
  else{
    wrap.innerHTML=`<table class="data-grid"><thead><tr><th class="row-number">#</th>${state.headers.map((h,j)=>`<th><div class="header-controls"><button class="header-name" data-rename-column="${j}" title="Ubah nama kolom" aria-label="Ubah nama kolom ${esc(h)}">${esc(h)}</button><button class="grid-delete" data-delete-column="${j}" aria-label="Hapus kolom ${esc(h)}" title="Hapus kolom"></button></div></th>`).join('')}</tr></thead><tbody>${state.rows.map((r,i)=>`<tr><td class="row-number">${i+1}<button class="grid-delete" data-delete-row="${i}" aria-label="Hapus baris ${i+1}" title="Hapus baris"></button></td>${state.headers.map((_,j)=>`<td contenteditable="true" data-r="${i}" data-c="${j}">${esc(r[j])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    wrap.querySelectorAll('[contenteditable=true]').forEach(cell=>cell.addEventListener('input',()=>{state.rows[Number(cell.dataset.r)][Number(cell.dataset.c)]=cell.textContent;persist();}));
    wrap.querySelectorAll('[data-rename-column]').forEach(button=>button.onclick=()=>{const j=Number(button.dataset.renameColumn),value=prompt('Nama kolom:',state.headers[j]);if(value===null)return;const name=value.trim();if(!name||/[\t\r\n]/.test(name)||!isUniqueColumnName(state.headers,name,j))return showError('Nama kolom harus terisi, unik (tanpa membedakan huruf besar-kecil), dan tanpa tab/baris baru.');state.headers[j]=name;persist();renderGrid();setStatus('Nama kolom disimpan.');});
    wrap.querySelectorAll('[data-delete-column]').forEach(button=>button.onclick=()=>{const j=Number(button.dataset.deleteColumn);if(!confirm(`Hapus kolom ${state.headers[j]} beserta datanya?`))return;state.headers.splice(j,1);state.rows.forEach(row=>row.splice(j,1));if(!state.headers.length)state.rows=[];persist();renderGrid();setStatus('Kolom dihapus.');});
    wrap.querySelectorAll('[data-delete-row]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.deleteRow);if(!confirm(`Hapus baris ${i+1}?`))return;state.rows.splice(i,1);persist();renderGrid();setStatus('Baris dihapus.');});
  }
  $('#info').textContent=`${state.rows.length} × ${state.headers.length}`;$('#activeFile').textContent=state.active;
}
function excelRows(text){return text.replace(/\r/g,'').split('\n').filter(Boolean).map(line=>line.split('\t'));}
function detectDelimiter(text){let semis=0,commas=0,quotes=false;for(const c of text.slice(0,10000)){if(c==='"')quotes=!quotes;else if(!quotes&&c===';')semis++;else if(!quotes&&c===',')commas++;}return semis>commas?';':',';}
function csvRows(text,delimiter){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];cell='';}else cell+=c;}if(cell!==''||row.length){row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);}return rows;}
function openModal(){clearError();const m=$('#pasteModal');m.classList.add('open');$('#pasteArea').value='';$('#preview').textContent='';setTimeout(()=>$('#pasteArea').focus(),0);}
function closeModal(){$('#pasteModal').classList.remove('open');}
function previewPaste(){const a=excelRows($('#pasteArea').value);$('#preview').textContent=a.length?`${a.length} baris × ${a[0].length} kolom terdeteksi.`:'';}
function applyPasted(){try{const a=excelRows($('#pasteArea').value);if(!a.length)return showError('Tidak ada data Excel yang ditempel.');const hasHeader=$('#hasHeader').checked;state.headers=hasHeader?validateColumnNames(a[0]):a[0].map((_,i)=>`Variable${i+1}`);state.rows=a.slice(hasHeader?1:0).map(r=>state.headers.map((_,i)=>r[i]??''));persist();renderGrid();closeModal();setStatus(`✓ ${state.rows.length} baris × ${state.headers.length} kolom tersimpan di ${state.active}.`);}catch(e){showError('Gagal memasukkan data dari Excel.',e);}}
async function importCSV(event){try{const file=event.target.files?.[0];if(!file)return;const text=await file.text();if(!text.trim())return showError('File CSV kosong.');const delimiter=detectDelimiter(text);const a=csvRows(text,delimiter);if(!a.length)return showError('CSV tidak dapat dibaca.');state.headers=validateColumnNames(a[0]);state.rows=a.slice(1).map(r=>state.headers.map((_,i)=>r[i]??''));persist();renderGrid();setStatus(`✓ CSV diimpor menggunakan pemisah “${delimiter}”: ${state.rows.length} baris × ${state.headers.length} kolom.`);}catch(e){showError('Gagal mengimpor CSV.',e);}finally{event.target.value='';}}
function newTXT(){let i=1,name='dataset.txt';while(Object.prototype.hasOwnProperty.call(state.files,name))name=`dataset${i++}.txt`;state.files[name]='';state.active=name;state.headers=[];state.rows=[];persist();loadActive(false);setStatus(`✓ ${name} dibuat.`);}
function addRow(){if(!state.headers.length)return showError('Tambahkan data atau kolom terlebih dahulu.');state.rows.push(state.headers.map(()=>''));persist();renderGrid();setStatus('✓ Baris baru ditambahkan.');}
function addColumn(){if(!state.headers.length)state.rows=[];state.headers.push(nextColumnName(state.headers));state.rows.forEach(r=>r.push(''));persist();renderGrid();setStatus('✓ Kolom baru ditambahkan.');}
function clearData(){if(!confirm(`Hapus seluruh isi ${state.active}?`))return;state.headers=[];state.rows=[];persist();renderGrid();setStatus(`✓ Isi ${state.active} dikosongkan.`);}
function renameDataset() {
  $('#datasetName').value=state.active.replace(/\.txt$/i,'');
  $('#datasetNameError').hidden=true;
  $('#datasetNameModal').classList.add('open');
  $('#datasetName').focus();
}
function saveDatasetName(event) {
  event.preventDefault();
  const name=$('#datasetName').value.trim().replace(/\.txt$/i,'');
  const target=name+'.txt', box=$('#datasetNameError');
  if(!name||/[\\/\u0000-\u001f]/.test(name)){box.hidden=false;box.textContent='Masukkan nama tanpa garis miring atau karakter kontrol.';return;}
  if(Object.keys(state.files).some(key=>key.toLowerCase()===target.toLowerCase()&&key!==state.active)){box.hidden=false;box.textContent='Nama tersebut sudah digunakan dataset lain.';return;}
  const files=Object.fromEntries(Object.entries(state.files).map(([key,value])=>[key===state.active?target:key,key===state.active?serialize():value]));
  try{
    localStorage.setItem(FILES_KEY,JSON.stringify(files));localStorage.setItem(ACTIVE_KEY,target);
    state.files=files;state.active=target;
    $('#datasetNameModal').classList.remove('open');renderTree();renderGrid();updateStorageStatus();setStatus(`✓ Dataset diganti nama menjadi ${target}.`);
  }catch(e){box.hidden=false;box.textContent='Nama dataset tidak dapat disimpan.';showError('Gagal mengganti nama dataset.',e);}
}
function deleteDataset(){if(!confirm(`Hapus ${state.active}? Tindakan ini tidak dapat dibatalkan.`))return;delete state.files[state.active];state.active=Object.keys(state.files)[0]||'dataset.txt';if(!(state.active in state.files))state.files[state.active]='';persist();loadActive(false);setStatus('✓ Dataset dihapus.');}
function downloadDataset(){const blob=new Blob([serialize()],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=state.active;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);setStatus(`✓ ${state.active} diunduh.`);}
function installDataGrid(){
  $('#pasteBtn').onclick=openModal;$('#closeModal').onclick=closeModal;$('#cancelPaste').onclick=closeModal;$('#applyPaste').onclick=applyPasted;$('#pasteArea').oninput=previewPaste;$('#importBtn').onclick=()=>$('#file').click();$('#file').onchange=importCSV;$('#newTxt').onclick=newTXT;$('#addRow').onclick=addRow;$('#addCol').onclick=addColumn;$('#clearData').onclick=clearData;$('#renameDataset').onclick=renameDataset;$('#closeDatasetName').onclick=()=>$('#datasetNameModal').classList.remove('open');$('#datasetNameForm').onsubmit=saveDatasetName;$('#deleteDataset').onclick=deleteDataset;
  $('#fileTree').addEventListener('click',event=>{const item=event.target.closest('[data-file]');if(!item)return;state.active=item.dataset.file;loadActive();});
}

initNumberSettings();loadStorage();installDataGrid();installDataTools();installNavigation();installAnalysisFlow();installPaymentGate();installResultExport();
