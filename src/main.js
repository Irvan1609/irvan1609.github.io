import { installAnalysisFlow } from './analysis-flow.js';
import { installPaymentGate } from './payment-gate.js';
import {nextColumnName,isUniqueColumnName,validateColumnNames} from './dataset-columns.js';
import {installNavigation} from './navigation.js';
import { installDataTools } from './data-tools.js';
import { parseNumber, formatNumber, initNumberSettings } from './number-format.js';
import { installResultExport } from './result-export.js';
import {parseParameterHeader,buildParameterHeader} from './parameter-metadata.js';
import {recognizedAgronomicHeaders,saveUserParameterAlias,suggestAgronomicParameters} from './agronomic-data-dictionary.js';
import {readCategoryMetadata,saveCategoryMetadata,moveCategoryDataset,copyCategoryDataset,removeCategoryDataset,moveCategoryColumn,removeCategoryColumn} from './category-metadata.js';
import {detectColumnType,normalizeCellRange,rangeMatrix,matrixTsv,columnTooltip} from './editor-features.js';
import {moveTreatmentMetadataDataset,copyTreatmentMetadataDataset,removeTreatmentMetadataDataset} from './treatment-metadata.js';
import {isLocalPointer,localPointer,shouldOffloadDataset,saveLocalDataset,loadLocalDataset,deleteLocalDataset,saveLocalSnapshot,listLocalSnapshots,getLocalSnapshot,deleteLocalSnapshots,renameLocalSnapshots,requestPersistentStorage} from './local-dataset-store.js';
import {virtualWindow,VIRTUALIZE_AFTER_ROWS} from './virtual-grid.js';
import {installResearchWorkspace} from './research-workspace.js';

const FILES_KEY='statistical_web_csv_files_v1';
const ACTIVE_KEY='statistical_web_active_csv_v1';
const LEGACY_FILES_KEY='statistical_web_txt_files_v2';
const LEGACY_ACTIVE_KEY='statistical_web_active_txt_v2';
const META_KEY='statistical_web_dataset_meta_v1';
const EDITOR_HISTORY_KEY='statistical_web_editor_history_v1';
const COMPACT_KEY='statistical_web_editor_compact_v1';
const COLUMN_WIDTHS_KEY='statistical_web_column_widths_v1';
const EXTERNAL_IMPORT_KEY='agrotik_stat_import_queue_v1';
const state={files:{},active:'dataset.csv',headers:[],rows:[],meta:{},undo:[],redo:[],selection:{anchor:null,focus:null}};
let editingColumnIndex=null,activeEditCell=null,saveIndicatorTimer=null,lastHistoryWrite=0,localHydrationPromise=null,gridFindQuery='';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=formatNumber;

function dictionaryRecognitionText(headers,datasetName=''){
  const recognized=recognizedAgronomicHeaders(headers,{datasetName});
  return recognized.length?` · ${recognized.length} saran parameter tersedia`:'';
}

function showError(message,errorObj){
  console.error(message,errorObj||'');
  const text=`⚠ ${message}${errorObj?.message?` — ${errorObj.message}`:''}`;
  const box=$('#errorBox');
  if(box){box.hidden=false;box.textContent=text;}
  if($('#status'))$('#status').textContent=text;
}
function clearError(){const box=$('#errorBox');if(box){box.hidden=true;box.textContent='';}}
function setStatus(text){if($('#status'))$('#status').textContent=text;}
function notifyDatasetChange(detail={}){
  try{document.dispatchEvent(new CustomEvent('stat-dataset-changed',{detail}));}catch{}
}
function indicateSaved(){
  const el=$('#saveIndicator');if(!el)return;
  el.textContent='●';el.setAttribute('aria-label','Tersimpan di perangkat ini');el.title='Tersimpan di perangkat ini';
  el.classList.add('visible');
  clearTimeout(saveIndicatorTimer);
}
function parseTSV(text){return text.replace(/\r/g,'').split('\n').filter(line=>line.length>0).map(line=>line.split('\t'));}
function displayDatasetName(name){return String(name||'dataset').replace(/\.(?:csv|txt)$/i,'');}
function csvCell(value){const text=String(value??'');return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;}
function serializeRows(headers,rows){if(!headers?.length)return '';return [headers,...rows].map(row=>row.map(csvCell).join(',')).join('\n');}
function serialize(){return serializeRows(state.headers,state.rows.map(row=>state.headers.map((_,i)=>row[i]??'')));}
function activeDatasetPayload(){
  const meta=state.meta[state.active]||{plant:'',treatment:''};
  return {name:displayDatasetName(state.active),fileName:state.active,plant:meta.plant||'',treatment:meta.treatment||'',headers:[...state.headers],rows:state.rows.map(row=>[...row])};
}
if(typeof globalThis!=='undefined')globalThis.StatisticalWebData={
  readActiveDataset:()=>activeDatasetPayload(),
  readDatasetContent:async name=>{
    const file=String(name||state.active);
    if(file===state.active)return serialize();
    const stored=state.files[file]??'';
    if(typeof isLocalPointer==='function'&&isLocalPointer(stored))return await loadLocalDataset(file)??'';
    return String(stored??'');
  },
  focusCell:(row,column=0)=>{
    const r=Math.max(0,Number(row)||0),c=Math.max(0,Number(column)||0);
    setSelection(r,c,{focus:true});
    document.querySelector('#gridWrap')?.scrollIntoView({behavior:'smooth',block:'center'});
    return true;
  },
  replaceRow:(row,values,reason='edit denah lahan')=>{
    const r=Number(row);
    if(!Number.isInteger(r)||r<0||r>=state.rows.length)return {ok:false,error:'Baris dataset tidak ditemukan.'};
    if(!Array.isArray(values)||values.length!==state.headers.length)return {ok:false,error:'Jumlah nilai tidak sesuai kolom dataset.'};
    const next=values.map(value=>String(value??''));
    const current=state.rows[r]||[];
    if(next.every((value,index)=>value===String(current[index]??'')))return {ok:true,changed:false,row:r};
    pushUndo(reason);
    state.rows[r]=next;
    persist(reason,true,{kind:'set_range',row:r,col:0,values:[next]});
    renderGrid();
    setStatus(`✓ Baris ${r+1} diperbarui dari denah lahan.`);
    return {ok:true,changed:true,row:r};
  },
  appendColumn:(name,reason='tambah parameter dari denah lahan')=>{
    const base=String(name??'').trim();
    if(!base)return {ok:false,error:'Nama parameter belum diisi.'};
    if(state.headers.some(header=>header.toLocaleLowerCase('id-ID')===base.toLocaleLowerCase('id-ID')))return {ok:false,error:'Nama kolom sudah ada.'};
    let header=base;
    try{header=validateColumnNames([...state.headers,base]).at(-1)||base;}catch(error){return {ok:false,error:error.message};}
    pushUndo(reason);
    state.headers.push(header);state.rows.forEach(row=>row.push(''));
    persist(reason,true);
    renderGrid();
    setStatus(`✓ Parameter ${header} ditambahkan dari denah lahan.`);
    return {ok:true,header,index:state.headers.length-1};
  },
  updateCells:(changes,reason='edit massal dari denah lahan')=>{
    if(!Array.isArray(changes)||!changes.length)return {ok:false,error:'Tidak ada perubahan.'};
    const clean=[];
    for(const item of changes){
      const row=Number(item?.row),col=Number(item?.col);
      if(!Number.isInteger(row)||row<0||row>=state.rows.length||!Number.isInteger(col)||col<0||col>=state.headers.length)continue;
      const value=String(item?.value??'');
      if(String(state.rows[row]?.[col]??'')===value)continue;
      clean.push({row,col,value});
    }
    if(!clean.length)return {ok:true,changed:false,count:0};
    pushUndo(reason);
    for(const item of clean)state.rows[item.row][item.col]=item.value;
    try{
      const content=serialize();storeDatasetContent(state.active,content);indicateSaved();recordEditorHistory(reason,false);
      if(clean.length<=250){
        for(const item of clean)notifyDatasetChange({type:'upsert',name:state.active,reason,patch:{kind:'set_cell',row:item.row,col:item.col,value:item.value}});
      }else notifyDatasetChange({type:'upsert',name:state.active,reason});
    }catch(error){showError('Gagal menyimpan perubahan denah.',error);return {ok:false,error:error.message};}
    renderGrid();setStatus(`✓ ${clean.length} sel diperbarui dari denah lahan.`);
    return {ok:true,changed:true,count:clean.length};
  },
  snapshotActiveDataset:(reason='sebelum analisis')=>{
    recordEditorHistory(reason,true);
    return activeDatasetPayload();
  }
};
function localStoreReady(){return typeof indexedDB!=='undefined'&&typeof isLocalPointer==='function'&&typeof saveLocalDataset==='function';}
function manifestValue(name,content){
  const current=state.files[name];
  return localStoreReady()&&(isLocalPointer(current)||shouldOffloadDataset(content))?localPointer(name):String(content??'');
}
function saveFilesManifest(){localStorage.setItem(FILES_KEY,JSON.stringify(state.files));localStorage.setItem(ACTIVE_KEY,state.active);}
function storeDatasetContent(name,content){
  const next=manifestValue(name,content),offloaded=localStoreReady()&&isLocalPointer(next);
  state.files[name]=next;saveFilesManifest();
  if(offloaded)void saveLocalDataset(name,content).catch(error=>showError('Penyimpanan lokal besar gagal.',error));
  return offloaded;
}
async function hydrateDatasetContent(name){
  const stored=state.files[name]??'';
  if(localStoreReady()&&isLocalPointer(stored))return await loadLocalDataset(name)??'';
  return String(stored??'');
}
async function migrateLargeLocalDatasets(){
  if(!localStoreReady())return;
  let changed=false;
  for(const [name,value] of Object.entries(state.files)){
    if(isLocalPointer(value)||!shouldOffloadDataset(value))continue;
    await saveLocalDataset(name,value);state.files[name]=localPointer(name);changed=true;
  }
  if(changed)saveFilesManifest();
}
function editorSnapshot(){
  return {active:state.active,headers:[...state.headers],rows:state.rows.map(row=>[...row]),meta:{...(state.meta[state.active]||{plant:'',treatment:''})}};
}
function snapshotFingerprint(snapshot){
  if(snapshot.rows.length>VIRTUALIZE_AFTER_ROWS)return null;
  return JSON.stringify([snapshot.headers,snapshot.rows,snapshot.meta]);
}
function undoLimit(){
  if(state.rows.length>5000)return 3;
  if(state.rows.length>VIRTUALIZE_AFTER_ROWS)return 8;
  return 60;
}
function pushUndo(reason='perubahan'){
  const snapshot=editorSnapshot(),fingerprint=snapshotFingerprint(snapshot),last=state.undo.at(-1);
  if(fingerprint&&last?.fingerprint===fingerprint)return;
  state.undo.push({snapshot,reason,fingerprint});
  while(state.undo.length>undoLimit())state.undo.shift();
  state.redo=[];
}
function restoreSnapshot(snapshot){
  if(!snapshot)return;
  state.headers=[...snapshot.headers];state.rows=snapshot.rows.map(row=>[...row]);
  state.meta[state.active]={...(snapshot.meta||{plant:'',treatment:''})};
  persist('pemulihan',false);renderGrid();renderDatasetMeta();clearSelection();
}
function undoEditor(){
  const item=state.undo.pop();if(!item)return setStatus('Tidak ada perubahan untuk diurungkan.');
  const current=editorSnapshot();state.redo.push({snapshot:current,reason:item.reason,fingerprint:snapshotFingerprint(current)});
  restoreSnapshot(item.snapshot);setStatus('↶ Perubahan diurungkan.');
}
function redoEditor(){
  const item=state.redo.pop();if(!item)return setStatus('Tidak ada perubahan untuk diulangi.');
  const current=editorSnapshot();state.undo.push({snapshot:current,reason:item.reason,fingerprint:snapshotFingerprint(current)});
  restoreSnapshot(item.snapshot);setStatus('↷ Perubahan diulangi.');
}
function editorHistoryStore(){
  try{const value=JSON.parse(localStorage.getItem(EDITOR_HISTORY_KEY)||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}
}
function recordEditorHistory(reason='edit',force=false){
  const now=Date.now();if(!force&&now-lastHistoryWrite<2500)return;
  lastHistoryWrite=now;
  try{
    const csv=serialize(),meta={...(state.meta[state.active]||{})};
    if(localStoreReady()&&shouldOffloadDataset(csv)){
      void saveLocalSnapshot(state.active,{date:new Date(now).toISOString(),reason,csv,meta}).catch(()=>{});
      return;
    }
    const all=editorHistoryStore(),key=displayDatasetName(state.active),list=Array.isArray(all[key])?all[key]:[];
    const entry={date:new Date(now).toISOString(),reason,csv,meta};
    if(list[0]?.csv===entry.csv&&JSON.stringify(list[0]?.meta||{})===JSON.stringify(entry.meta))return;
    all[key]=[entry,...list].slice(0,12);localStorage.setItem(EDITOR_HISTORY_KEY,JSON.stringify(all));
  }catch{}
}
function persist(reason='edit',history=true,patch=null){
  try{
    const content=serialize();storeDatasetContent(state.active,content);
    indicateSaved();if(history)recordEditorHistory(reason,false);notifyDatasetChange({type:'upsert',name:state.active,reason,patch});
  }catch(e){showError('Gagal menyimpan dataset sementara di browser.',e);}
}
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
function updateDatasetMetaSummary(meta=activeMeta()){
  if($('#plantNameSummary'))$('#plantNameSummary').textContent=meta.plant||'—';
  if($('#treatmentNameSummary'))$('#treatmentNameSummary').textContent=meta.treatment||'—';
}
function renderDatasetMeta(){
  const meta=activeMeta();
  if($('#plantName'))$('#plantName').value=meta.plant||'';
  if($('#treatmentName'))$('#treatmentName').value=meta.treatment||'';
  updateDatasetMetaSummary(meta);
}
function saveDatasetMeta(){
  state.meta[state.active]={plant:$('#plantName')?.value.trim()||'',treatment:$('#treatmentName')?.value.trim()||''};
  updateDatasetMetaSummary(state.meta[state.active]);
  try{localStorage.setItem(META_KEY,JSON.stringify(state.meta));indicateSaved();recordEditorHistory('metadata',false);notifyDatasetChange({type:'upsert',name:state.active,reason:'metadata'});}catch(e){showError('Keterangan tanaman/perlakuan tidak dapat disimpan.',e);}
}
function saveInlineDatasetMeta(field,value){
  if(!['plant','treatment'].includes(field))return;
  const limit=field==='plant'?80:140,clean=String(value??'').replace(/\s+/g,' ').trim().slice(0,limit);
  state.meta[state.active]={...activeMeta(),[field]:clean};
  const input=$(field==='plant'?'#plantName':'#treatmentName');if(input)input.value=clean;
  try{
    localStorage.setItem(META_KEY,JSON.stringify(state.meta));indicateSaved();recordEditorHistory('metadata',false);
    notifyDatasetChange({type:'upsert',name:state.active,reason:'metadata'});
  }catch(e){showError('Informasi dataset tidak dapat disimpan.',e);}
}
function bindInlineDatasetMeta(){
  const fields=document.querySelectorAll?.('[data-meta-field]')||[];
  fields.forEach(el=>{
    if(el.dataset.metaBound==='1')return;el.dataset.metaBound='1';
    el.addEventListener('focus',()=>{if(el.textContent.trim()==='—')el.textContent='';});
    el.addEventListener('input',()=>{
      const field=el.dataset.metaField,limit=field==='plant'?80:140;
      if(el.textContent.length>limit)el.textContent=el.textContent.slice(0,limit);
      saveInlineDatasetMeta(field,el.textContent);
    });
    el.addEventListener('blur',()=>{
      const field=el.dataset.metaField,clean=String(el.textContent||'').replace(/\s+/g,' ').trim();
      el.textContent=clean||'—';saveInlineDatasetMeta(field,clean);
    });
    el.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();el.blur();}
      if(event.key==='Escape'){event.preventDefault();renderDatasetMeta();el.blur();}
    });
  });
}
function applyActiveCsv(text,{history=true}={}){
  const parsed=String(text||'').trim()?csvRows(String(text),','):[];
  state.headers=parsed[0]||[];state.rows=parsed.slice(1).map(row=>state.headers.map((_,i)=>row[i]??''));
  state.undo=[];state.redo=[];state.selection={anchor:null,focus:null};
  renderTree();renderGrid();renderDatasetMeta();
  if($('#activeFile'))$('#activeFile').textContent=displayDatasetName(state.active);
  if(history)recordEditorHistory('dibuka',true);
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
  const active=state.active,stored=state.files[active]??'';
  if(save)localStorage.setItem(ACTIVE_KEY,active);
  if(localStoreReady()&&isLocalPointer(stored)){
    state.headers=[];state.rows=[];state.undo=[];state.redo=[];state.selection={anchor:null,focus:null};
    renderTree();renderGrid();renderDatasetMeta();if($('#activeFile'))$('#activeFile').textContent=displayDatasetName(active);
    localHydrationPromise=hydrateDatasetContent(active).then(text=>{if(state.active===active)applyActiveCsv(text);}).catch(error=>showError('Dataset lokal tidak dapat dibuka.',error));
    return localHydrationPromise;
  }
  applyActiveCsv(stored);localHydrationPromise=Promise.resolve();
  return localHydrationPromise;
}
function renderTree(){
  const tree=$('#fileTree');if(!tree)return;
  const query=($('#datasetSearch')?.value||'').trim().toLocaleLowerCase('id-ID');
  const names=Object.keys(state.files).filter(name=>!query||displayDatasetName(name).toLocaleLowerCase('id-ID').includes(query));
  tree.innerHTML=names.length?names.map(name=>`<button type="button" class="tree-item ${name===state.active?'active':''}" data-file="${esc(name)}">📄 ${esc(displayDatasetName(name))}</button>`).join(''):'<div class="dataset-empty-search">Tidak ada dataset yang cocok.</div>';
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
function isStringColumn(index){return stringLevels(index).length>0;}
function renderStringColumnEditor(index){
  const section=$('#columnStringSection'),levelsHost=$('#columnStringLevels'),unitInput=$('#columnStringUnit');
  const levels=stringLevels(index),header=state.headers[index]||'';
  if(!levels.length){
    section.hidden=true;levelsHost.innerHTML='';unitInput.value='';return;
  }
  const stored=readCategoryMetadata(displayDatasetName(state.active),header);
  section.hidden=false;unitInput.value=stored.unit||'';
  levelsHost.innerHTML=levels.map(level=>`<label class="column-string-row"><span title="${esc(level)}">${esc(level)} =</span><input data-column-string-level="${esc(level)}" value="${esc(stored.levels?.[level]?.value||'')}" placeholder="nilai" inputmode="decimal" autocomplete="off" aria-label="Nilai untuk ${esc(level)}"></label>`).join('');
}
function renderParameterSuggestions(index){
  const host=$('#parameterSuggestion'),header=state.headers[index]||'',meta=parseParameterHeader(header);
  if(!host)return;
  const suggestions=header.includes('|')?[]:suggestAgronomicParameters(meta.code,{datasetName:displayDatasetName(state.active)});
  if(!suggestions.length){host.hidden=true;host.innerHTML='';return;}
  host.hidden=false;
  host.innerHTML='<div class="parameter-suggestion-head"><b>Saran kamus parameter</b><small>Data belum diubah. Pilih salah satu saran jika sesuai.</small></div><div class="parameter-suggestion-list">'+suggestions.map((item,i)=>{
    const language=item.language==='id'?'Indonesia':item.language==='en'?'English':'Kustom';
    const unit=item.unit?' ('+esc(item.unit)+')':'';
    return '<button type="button" class="parameter-suggestion-item" data-parameter-suggestion="'+i+'"><span><strong>'+esc(item.code)+'</strong> <span class="parameter-suggestion-arrow">→</span> '+esc(item.name)+unit+'</span><small>'+esc(language)+'</small></button>';
  }).join('')+'</div>';
  host.querySelectorAll('[data-parameter-suggestion]').forEach(button=>button.addEventListener('click',()=>{
    const item=suggestions[Number(button.dataset.parameterSuggestion)];if(!item)return;
    $('#columnCode').value=item.code;$('#columnFullName').value=item.name;$('#columnUnit').value=item.unit||'';
    $('#columnNameForm').dataset.suggestionLanguage=item.language||'';
    host.querySelectorAll('.parameter-suggestion-item').forEach(el=>el.classList.toggle('selected',el===button));
    setStatus('Saran diterapkan ke formulir. Klik Simpan untuk mengubah header kolom.');
  }));
}
function openColumnName(index){
  editingColumnIndex=index;
  const meta=parseParameterHeader(state.headers[index]||'');
  $('#columnCode').value=meta.code;
  $('#columnFullName').value=meta.name;
  $('#columnUnit').value=meta.unit;
  $('#columnNameForm').dataset.suggestionLanguage='';
  renderParameterSuggestions(index);
  renderStringColumnEditor(index);
  $('#columnNameError').hidden=true;
  $('#columnNameModal').classList.add('open');
  $('#columnCode').focus();
}
function collectStringMetadata(){
  if($('#columnStringSection').hidden)return null;
  const levels={};
  document.querySelectorAll('#columnStringLevels [data-column-string-level]').forEach(input=>{
    const value=input.value.trim();if(value)levels[input.dataset.columnStringLevel]={value};
  });
  return {unit:$('#columnStringUnit').value.trim(),levels};
}
function saveColumnName(event){
  event.preventDefault();
  const code=$('#columnCode').value.trim(),fullName=$('#columnFullName').value.trim(),unit=$('#columnUnit').value.trim(),box=$('#columnNameError');
  const name=buildParameterHeader({code,name:fullName,unit});
  if(editingColumnIndex===null||!code||/[\t\r\n]/.test(name)||!isUniqueColumnName(state.headers,name,editingColumnIndex)){
    box.hidden=false;box.textContent='Kode harus terisi. Kode, nama lengkap, dan satuan tidak boleh mengandung tab/baris baru; judul akhirnya juga harus unik.';return;
  }
  const previous=state.headers[editingColumnIndex],datasetName=displayDatasetName(state.active),stringMeta=collectStringMetadata();
  if(fullName&&!previous.includes('|'))saveUserParameterAlias(previous,{code,name:fullName,unit,language:$('#columnNameForm').dataset.suggestionLanguage||'custom'});
  pushUndo('ubah kolom');state.headers[editingColumnIndex]=name;
  moveCategoryColumn(datasetName,previous,name);
  if(stringMeta)saveCategoryMetadata(datasetName,name,stringMeta);
  else removeCategoryColumn(datasetName,name);
  persist('ubah kolom',true);renderGrid();$('#columnNameModal').classList.remove('open');setStatus(stringMeta?'Nama kolom dan nilai kategori disimpan.':'Nama parameter dan satuan disimpan.');
}
function clearSelection(){
  state.selection={anchor:null,focus:null};
  document.querySelectorAll('.data-grid td.cell-selected,.data-grid td.cell-active').forEach(cell=>cell.classList.remove('cell-selected','cell-active'));
}
function selectionRange(){return normalizeCellRange(state.selection.anchor,state.selection.focus);}
function paintSelection(){
  const range=selectionRange(),wrap=$('#gridWrap');if(!wrap)return;
  wrap.querySelectorAll('td.cell-selected,td.cell-active').forEach(cell=>cell.classList.remove('cell-selected','cell-active'));
  if(!range)return;
  wrap.querySelectorAll('td[data-r][data-c]').forEach(cell=>{
    const r=Number(cell.dataset.r),c=Number(cell.dataset.c);
    if(r>=range.r1&&r<=range.r2&&c>=range.c1&&c<=range.c2)cell.classList.add('cell-selected');
  });
  const focus=state.selection.focus;wrap.querySelector(`td[data-r="${focus.r}"][data-c="${focus.c}"]`)?.classList.add('cell-active');
  requestAnimationFrame(positionFillHandle);
}
function setSelection(r,c,{extend=false,focus=true}={}){
  if(r<0||c<0||r>=state.rows.length||c>=state.headers.length)return;
  if(!extend||!state.selection.anchor)state.selection.anchor={r,c};
  state.selection.focus={r,c};ensureGridRowVisible(r);paintSelection();
  const cell=$('#gridWrap')?.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
  if(focus&&cell)selectEditableCell(cell);
}
function selectEditableCell(cell){
  cell.focus();
  const selection=window.getSelection?.(),range=document.createRange?.();
  if(selection&&range){range.selectNodeContents(cell);selection.removeAllRanges();selection.addRange(range);}
}
function ensureGridSize(rowCount,colCount){
  while(state.headers.length<colCount){state.headers.push(nextColumnName(state.headers));state.rows.forEach(row=>row.push(''));}
  while(state.rows.length<rowCount)state.rows.push(state.headers.map(()=>''));
  state.rows.forEach(row=>{while(row.length<state.headers.length)row.push('');});
}
function pasteIntoGrid(text,r0,c0){
  const matrix=excelRows(text);if(!matrix.length)return;
  const oldRows=state.rows.length,oldCols=state.headers.length,maxCols=Math.max(...matrix.map(row=>row.length));
  pushUndo('tempel sel');ensureGridSize(r0+matrix.length,c0+maxCols);
  matrix.forEach((row,ri)=>row.forEach((value,ci)=>{state.rows[r0+ri][c0+ci]=value;}));
  const patch=(state.rows.length===oldRows&&state.headers.length===oldCols)?{kind:'set_range',row:r0,col:c0,values:matrix}:null;
  persist('tempel sel',true,patch);renderGrid();
  state.selection.anchor={r:r0,c:c0};state.selection.focus={r:r0+matrix.length-1,c:c0+Math.max(...matrix.map(row=>row.length))-1};paintSelection();
  setStatus(`✓ ${matrix.length} × ${Math.max(...matrix.map(row=>row.length))} sel ditempel.`);
}
function clearSelectedCells(){
  const range=selectionRange();if(!range)return;
  pushUndo('kosongkan sel');
  const values=[];
  for(let r=range.r1;r<=range.r2;r++){
    const row=[];
    for(let c=range.c1;c<=range.c2;c++){if(state.rows[r])state.rows[r][c]='';row.push('');}
    values.push(row);
  }
  persist('kosongkan sel',true,{kind:'set_range',row:range.r1,col:range.c1,values});renderGrid();state.selection.anchor={r:range.r1,c:range.c1};state.selection.focus={r:range.r1,c:range.c1};paintSelection();
}
async function copySelectedCells(){
  const range=selectionRange();if(!range)return false;
  const text=matrixTsv(rangeMatrix(state.rows,range));
  try{await navigator.clipboard.writeText(text);setStatus('✓ Sel terpilih disalin.');return true;}catch{return false;}
}
function bindGridArrowNavigation(wrap){
  wrap.querySelectorAll('[contenteditable=true]').forEach(cell=>{
    cell.addEventListener('focus',()=>{
      const r=Number(cell.dataset.r),c=Number(cell.dataset.c);
      if(!state.selection.focus||state.selection.focus.r!==r||state.selection.focus.c!==c)setSelection(r,c,{focus:false});
    });
    cell.addEventListener('beforeinput',()=>{
      const r=Number(cell.dataset.r),c=Number(cell.dataset.c),key=`${r},${c}`;
      if(activeEditCell!==key){pushUndo('edit sel');activeEditCell=key;}
    });
    cell.addEventListener('blur',()=>{if(activeEditCell!==null)recordEditorHistory('edit sel',true);activeEditCell=null;});
    cell.addEventListener('click',event=>setSelection(Number(cell.dataset.r),Number(cell.dataset.c),{extend:event.shiftKey,focus:false}));
    cell.addEventListener('paste',event=>{
      const text=event.clipboardData?.getData('text/plain');if(!text)return;
      event.preventDefault();pasteIntoGrid(text,Number(cell.dataset.r),Number(cell.dataset.c));
    });
    cell.addEventListener('keydown',event=>{
      const r=Number(cell.dataset.r),c=Number(cell.dataset.c);
      if((event.key==='Delete'||event.key==='Backspace')&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
        const range=selectionRange();
        if(range&&(range.r1!==range.r2||range.c1!==range.c2||event.key==='Delete')){event.preventDefault();clearSelectedCells();return;}
      }
      if(event.key==='Enter'||event.key==='Tab'){
        event.preventDefault();
        let nr=r,nc=c;
        if(event.key==='Enter')nr+=event.shiftKey?-1:1;
        else nc+=event.shiftKey?-1:1;
        if(nc>=state.headers.length){nc=0;nr++;}
        if(nc<0){nc=state.headers.length-1;nr--;}
        if(nr<0||nr>=state.rows.length)return;
        setSelection(nr,nc);return;
      }
      if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey)return;
      const next={ArrowUp:[r-1,c],ArrowDown:[r+1,c],ArrowLeft:[r,c-1],ArrowRight:[r,c+1]}[event.key];
      if(next[0]<0||next[0]>=state.rows.length||next[1]<0||next[1]>=state.headers.length)return;
      event.preventDefault();setSelection(next[0],next[1],{extend:event.shiftKey});
    });
  });
}
function columnTypeInfo(index){return detectColumnType(state.rows.map(row=>row[index]));}
function refreshColumnType(index,wrap=$('#gridWrap')){
  if(!wrap||index<0||index>=state.headers.length)return;
  const type=columnTypeInfo(index),isString=['category','text'].includes(type.type),header=state.headers[index];
  const th=wrap.querySelector(`th[data-column-index="${index}"]`);
  if(th){
    th.dataset.columnType=type.type;
    th.classList.remove('string-column','type-numeric','type-date','type-category','type-text','type-empty');
    th.classList.add('type-'+type.type);
    th.classList.toggle('string-column',isString);
    const category=readCategoryMetadata(displayDatasetName(state.active),header);
    const name=th.querySelector('.header-name');if(name)name.title=columnTooltip(header,type,category);
  }
  wrap.querySelectorAll(`td[data-c="${index}"]`).forEach(cell=>cell.classList.toggle('string-column-cell',isString));
}
function moveColumn(from,to){
  from=Number(from);to=Number(to);
  if(!Number.isInteger(from)||!Number.isInteger(to)||from===to||from<0||to<0||from>=state.headers.length||to>=state.headers.length)return;
  pushUndo('pindah kolom');
  const [header]=state.headers.splice(from,1);state.headers.splice(to,0,header);
  state.rows.forEach(row=>{const [value]=row.splice(from,1);row.splice(to,0,value);});
  persist('pindah kolom',true,{kind:'move_column',from,to});clearSelection();renderGrid();setStatus('Kolom dipindahkan.');
}

function columnWidthStore(){
  try{const value=JSON.parse(localStorage.getItem(COLUMN_WIDTHS_KEY)||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}
}
function savedColumnWidth(index){
  const store=columnWidthStore(),dataset=displayDatasetName(state.active),header=state.headers[index];
  const value=Number(store?.[dataset]?.[header]);return Number.isFinite(value)?Math.max(72,Math.min(420,value)):null;
}
function saveColumnWidth(index,width){
  const store=columnWidthStore(),dataset=displayDatasetName(state.active),header=state.headers[index];
  store[dataset]??={};store[dataset][header]=Math.round(Math.max(72,Math.min(420,width)));
  try{localStorage.setItem(COLUMN_WIDTHS_KEY,JSON.stringify(store));}catch{}
}
function setColumnVisualWidth(wrap,index,width){
  const value=Math.round(Math.max(72,Math.min(420,width))),th=wrap.querySelector(`th[data-column-index="${index}"]`);
  if(th){th.style.width=value+'px';th.style.minWidth=value+'px';th.style.maxWidth=value+'px';}
  wrap.querySelectorAll(`td[data-c="${index}"]`).forEach(cell=>{cell.style.width=value+'px';cell.style.minWidth=value+'px';cell.style.maxWidth=value+'px';});
}
function autoSizeColumn(wrap,index){
  const th=wrap.querySelector(`th[data-column-index="${index}"]`);if(!th)return;
  let width=Math.max(90,th.querySelector('.header-controls')?.scrollWidth||th.scrollWidth||90);
  wrap.querySelectorAll(`td[data-c="${index}"]`).forEach(cell=>{width=Math.max(width,Math.min(380,cell.scrollWidth+24));});
  width=Math.min(380,width+12);setColumnVisualWidth(wrap,index,width);saveColumnWidth(index,width);
}
function bindColumnResize(wrap){
  wrap.querySelectorAll('[data-resize-column]').forEach(handle=>{
    handle.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();autoSizeColumn(wrap,Number(handle.dataset.resizeColumn));});
    handle.addEventListener('pointerdown',event=>{
      event.preventDefault();event.stopPropagation();
      const index=Number(handle.dataset.resizeColumn),th=handle.closest('th'),startX=event.clientX,startWidth=th?.getBoundingClientRect().width||120;
      handle.setPointerCapture?.(event.pointerId);document.documentElement.classList.add('column-resizing');
      const move=moveEvent=>setColumnVisualWidth(wrap,index,startWidth+(moveEvent.clientX-startX));
      const stop=stopEvent=>{
        handle.releasePointerCapture?.(stopEvent.pointerId);handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',stop);handle.removeEventListener('pointercancel',stop);
        document.documentElement.classList.remove('column-resizing');const current=wrap.querySelector(`th[data-column-index="${index}"]`);if(current)saveColumnWidth(index,current.getBoundingClientRect().width);
      };
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);
    });
  });
}
function duplicateColumn(index){
  if(index<0||index>=state.headers.length)return;
  const source=state.headers[index],name=nextColumnName(state.headers),values=state.rows.map(row=>row[index]??'');
  pushUndo('duplikat kolom');state.headers.splice(index+1,0,name);state.rows.forEach((row,r)=>row.splice(index+1,0,values[r]));
  persist('duplikat kolom',true);renderGrid();setStatus(`Kolom ${source} disalin.`);
}
function deleteColumnAt(index){
  const j=Number(index),header=state.headers[j];if(!header)return;
  const filled=state.rows.filter(row=>String(row[j]??'').trim()!=='').length,warning=filled>=100?`Kolom ini berisi ${filled} nilai. `:'';
  if(!confirm(`${warning}Hapus kolom ${header} beserta datanya?`))return;
  pushUndo('hapus kolom');removeCategoryColumn(displayDatasetName(state.active),header);state.headers.splice(j,1);state.rows.forEach(row=>row.splice(j,1));if(!state.headers.length)state.rows=[];
  persist('hapus kolom',true);clearSelection();renderGrid();setStatus('Kolom dihapus.');
}
function ensureColumnContextMenu(){
  let menu=document.getElementById('columnContextMenu');if(menu)return menu;
  menu=document.createElement('div');menu.id='columnContextMenu';menu.className='column-context-menu';menu.hidden=true;
  menu.innerHTML='<button data-col-action="rename">Ubah nama</button><button data-col-action="duplicate">Duplikat</button><button data-col-action="left">← Kiri</button><button data-col-action="right">Kanan →</button><button data-col-action="delete" class="danger-text">Hapus</button>';
  document.body.append(menu);
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#columnContextMenu'))menu.hidden=true;});
  return menu;
}
function bindColumnLongPress(button,index){
  let timer=null,startX=0,startY=0;
  const clear=()=>{clearTimeout(timer);timer=null;};
  button.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse')return;startX=event.clientX;startY=event.clientY;clear();
    timer=setTimeout(()=>{button.dataset.longPress='1';openColumnContextMenu({preventDefault(){},clientX:startX,clientY:startY},index);},520);
  });
  button.addEventListener('pointermove',event=>{if(Math.hypot(event.clientX-startX,event.clientY-startY)>12)clear();});
  button.addEventListener('pointerup',clear);button.addEventListener('pointercancel',clear);
}
function openColumnContextMenu(event,index){
  event.preventDefault();const menu=ensureColumnContextMenu();menu.dataset.column=String(index);menu.hidden=false;
  menu.style.left=Math.min(event.clientX,window.innerWidth-170)+'px';menu.style.top=Math.min(event.clientY,window.innerHeight-210)+'px';
  menu.onclick=click=>{
    const action=click.target.closest('[data-col-action]')?.dataset.colAction;if(!action)return;
    const col=Number(menu.dataset.column);menu.hidden=true;
    if(action==='rename')openColumnName(col);
    else if(action==='duplicate')duplicateColumn(col);
    else if(action==='left'&&col>0)moveColumn(col,col-1);
    else if(action==='right'&&col<state.headers.length-1)moveColumn(col,col+1);
    else if(action==='delete')deleteColumnAt(col);
  };
}
function ensureGridFind(){
  const workspace=document.querySelector('.workspace');if(!workspace||typeof workspace.prepend!=='function'||typeof document.createElement!=='function')return null;
  let bar=document.getElementById('gridFindBar');if(bar)return bar;
  bar=document.createElement('div');bar.id='gridFindBar';bar.className='grid-find-bar';bar.hidden=true;
  bar.innerHTML='<input id="gridFindInput" type="search" autocomplete="off" placeholder="Cari data"><span id="gridFindCount"></span><button type="button" aria-label="Tutup">×</button>';
  workspace.prepend(bar);
  const input=bar.querySelector('input'),count=bar.querySelector('span'),close=bar.querySelector('button');
  const clear=()=>{gridFindQuery='';document.querySelectorAll('.cell-find-match').forEach(cell=>cell.classList.remove('cell-find-match'));};
  const run=()=>{
    gridFindQuery=input.value.trim().toLocaleLowerCase('id-ID');
    if(!gridFindQuery){count.textContent='';renderGrid();return;}
    const matches=[];
    state.rows.forEach((row,r)=>row.forEach((value,col)=>{if(String(value??'').toLocaleLowerCase('id-ID').includes(gridFindQuery))matches.push({r,col});}));
    count.textContent=String(matches.length);
    if(matches[0]){ensureGridRowVisible(matches[0].r);setSelection(matches[0].r,matches[0].col,{focus:false});}
    else renderGrid();
  };
  input.addEventListener('input',run);close.onclick=()=>{bar.hidden=true;input.value='';count.textContent='';clear();renderGrid();};
  return bar;
}
function openGridFind(){
  const bar=ensureGridFind();if(!bar)return;bar.hidden=false;const input=bar.querySelector('input');input.focus();input.select();
}
function installPanelResize(){
  const panel=$('#projectPanel'),main=document.querySelector('.main');
  if(!panel||!main||typeof panel.append!=='function'||typeof document.createElement!=='function'||panel.querySelector?.('.project-panel-resizer'))return;
  const handle=document.createElement('div');handle.className='project-panel-resizer';handle.title='Geser lebar panel';panel.append(handle);
  handle.addEventListener('pointerdown',event=>{
    if(matchMedia('(max-width:720px)').matches)return;event.preventDefault();handle.setPointerCapture?.(event.pointerId);
    const start=panel.getBoundingClientRect().width,startX=event.clientX;
    const move=e=>{const width=Math.max(170,Math.min(420,start+(e.clientX-startX)));document.documentElement.style.setProperty('--dataset-panel-width',width+'px');};
    const stop=e=>{handle.releasePointerCapture?.(e.pointerId);handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',stop);handle.removeEventListener('pointercancel',stop);};
    handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);
  });
  handle.ondblclick=()=>document.documentElement.style.removeProperty('--dataset-panel-width');
}
function positionFillHandle(){
  const wrap=$('#gridWrap'),handle=wrap?.querySelector('.fill-handle'),cell=wrap?.querySelector('td.cell-active');
  if(!wrap||!handle||!cell){if(handle)handle.hidden=true;return;}
  const wr=wrap.getBoundingClientRect(),cr=cell.getBoundingClientRect();
  handle.hidden=false;handle.style.left=(cr.right-wr.left+wrap.scrollLeft-5)+'px';handle.style.top=(cr.bottom-wr.top+wrap.scrollTop-5)+'px';
}
function installFillHandle(wrap){
  let handle=wrap.querySelector('.fill-handle');
  if(!handle){handle=document.createElement('div');handle.className='fill-handle';handle.hidden=true;handle.title='Tarik untuk mengisi';wrap.append(handle);}
  handle.onpointerdown=event=>{
    const source=selectionRange();if(!source)return;event.preventDefault();event.stopPropagation();let target={...state.selection.focus};
    handle.setPointerCapture?.(event.pointerId);
    const move=e=>{const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('td[data-r][data-c]');if(cell)target={r:Number(cell.dataset.r),c:Number(cell.dataset.c)};};
    const stop=e=>{
      handle.releasePointerCapture?.(e.pointerId);handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',stop);handle.removeEventListener('pointercancel',stop);
      const r1=Math.min(source.r1,target.r),r2=Math.max(source.r2,target.r),c1=Math.min(source.c1,target.c),c2=Math.max(source.c2,target.c);
      if(r1===source.r1&&r2===source.r2&&c1===source.c1&&c2===source.c2)return;
      const pattern=rangeMatrix(state.rows,source);if(!pattern.length)return;pushUndo('isi otomatis');
      const mod=(value,size)=>((value%size)+size)%size;
      for(let r=r1;r<=r2;r++)for(let col=c1;col<=c2;col++)state.rows[r][col]=pattern[mod(r-source.r1,pattern.length)][mod(col-source.c1,pattern[0].length)];
      const values=[];for(let r=r1;r<=r2;r++)values.push(state.rows[r].slice(c1,c2+1));
      persist('isi otomatis',true,{kind:'set_range',row:r1,col:c1,values});renderGrid();state.selection.anchor={r:r1,c:c1};state.selection.focus={r:r2,c:c2};paintSelection();
    };
    handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);
  };
  wrap.addEventListener('scroll',positionFillHandle,{passive:true});
}

function bindColumnDrag(wrap){
  let touchFrom=null,touchTo=null;
  const clearMarks=()=>wrap.querySelectorAll('.column-dragging,.column-drop-target').forEach(el=>el.classList.remove('column-dragging','column-drop-target'));
  wrap.querySelectorAll('[data-drag-column]').forEach(handle=>{
    handle.addEventListener('dragstart',event=>{
      const index=Number(handle.dataset.dragColumn);event.dataTransfer?.setData('text/plain',String(index));
      if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
      handle.closest('th')?.classList.add('column-dragging');
    });
    handle.addEventListener('dragend',clearMarks);
    handle.addEventListener('keydown',event=>{
      const from=Number(handle.dataset.dragColumn);
      if(event.key==='ArrowLeft'&&from>0){event.preventDefault();moveColumn(from,from-1);}
      else if(event.key==='ArrowRight'&&from<state.headers.length-1){event.preventDefault();moveColumn(from,from+1);}
    });
    handle.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse')return;
      event.preventDefault();touchFrom=Number(handle.dataset.dragColumn);touchTo=touchFrom;
      handle.setPointerCapture?.(event.pointerId);handle.closest('th')?.classList.add('column-dragging');
    });
    handle.addEventListener('pointermove',event=>{
      if(touchFrom===null)return;
      const th=document.elementFromPoint(event.clientX,event.clientY)?.closest?.('th[data-column-index]');
      if(!th)return;touchTo=Number(th.dataset.columnIndex);clearMarks();handle.closest('th')?.classList.add('column-dragging');th.classList.add('column-drop-target');
    });
    handle.addEventListener('pointerup',event=>{
      if(touchFrom===null)return;
      handle.releasePointerCapture?.(event.pointerId);const from=touchFrom,to=touchTo;touchFrom=null;touchTo=null;clearMarks();moveColumn(from,to);
    });
    handle.addEventListener('pointercancel',()=>{touchFrom=null;touchTo=null;clearMarks();});
  });
  wrap.querySelectorAll('th[data-column-index]').forEach(th=>{
    th.addEventListener('dragover',event=>{event.preventDefault();clearMarks();th.classList.add('column-drop-target');});
    th.addEventListener('drop',event=>{event.preventDefault();const from=Number(event.dataTransfer?.getData('text/plain')),to=Number(th.dataset.columnIndex);clearMarks();moveColumn(from,to);});
  });
}
function bindColumnFormArrowNavigation(){
  const form=$('#columnNameForm');
  form.addEventListener('keydown',event=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey)return;
    const current=event.target.closest('input');if(!current)return;
    const inputs=[...form.querySelectorAll('input')].filter(input=>!input.closest('[hidden]')&&!input.disabled);
    const index=inputs.indexOf(current);if(index<0)return;
    let nextIndex=index;
    if(event.key==='ArrowUp')nextIndex=index-1;
    else if(event.key==='ArrowDown')nextIndex=index+1;
    else if(event.key==='ArrowLeft'){
      if(current.selectionStart!==0||current.selectionEnd!==0)return;
      nextIndex=index-1;
    }else if(event.key==='ArrowRight'){
      const end=current.value.length;if(current.selectionStart!==end||current.selectionEnd!==end)return;
      nextIndex=index+1;
    }
    const target=inputs[nextIndex];if(!target)return;
    event.preventDefault();target.focus();target.select?.();
  });
}

function gridQualityModel(){
  const signatures=new Map(),numeric=state.headers.map(()=>({filled:0,numeric:0}));
  state.rows.forEach((row,index)=>{
    const normalized=row.map(value=>String(value??'').trim()).join('\u001f');
    if(normalized.replace(/\u001f/g,'').length)signatures.set(normalized,[...(signatures.get(normalized)||[]),index]);
    row.forEach((value,col)=>{
      const text=String(value??'').trim();if(!text)return;
      numeric[col].filled++;if(Number.isFinite(parseNumber(text)))numeric[col].numeric++;
    });
  });
  const duplicateRows=new Set();
  for(const indexes of signatures.values())if(indexes.length>1)indexes.forEach(index=>duplicateRows.add(index));
  return {duplicateRows,mostlyNumeric:numeric.map(item=>item.filled>=3&&item.numeric/item.filled>=.7)};
}
function virtualRowHeight(){return document.documentElement?.classList?.contains('compact-data-editor')?32:40;}
function rowMarkup(row,rowIndex,types,widths,quality){
  const duplicate=quality.duplicateRows.has(rowIndex)?' duplicate-row':'';
  const rowHasData=row.some(value=>String(value??'').trim()!=='');
  return '<tr class="'+duplicate.trim()+'"><td class="row-number"><span data-select-row="'+rowIndex+'">'+(rowIndex+1)+'</span><button class="grid-delete" data-delete-row="'+rowIndex+'" aria-label="Hapus baris '+(rowIndex+1)+'" title="Hapus baris"></button></td>'+state.headers.map((_,col)=>{
    const width=widths[col],style=width?' style="width:'+width+'px;min-width:'+width+'px;max-width:'+width+'px"':'',text=String(row[col]??''),trim=text.trim();
    const classes=[['category','text'].includes(types[col].type)?'string-column-cell':'',rowHasData&&!trim?'cell-missing':'',trim&&quality.mostlyNumeric[col]&&!Number.isFinite(parseNumber(trim))?'cell-type-warning':'',gridFindQuery&&trim.toLocaleLowerCase('id-ID').includes(gridFindQuery)?'cell-find-match':''].filter(Boolean).join(' ');
    return '<td class="'+classes+'" contenteditable="true" spellcheck="false" data-r="'+rowIndex+'" data-c="'+col+'"'+style+'>'+esc(text)+'</td>';
  }).join('')+'</tr>';
}
function bindGridBody(wrap){
  wrap.querySelectorAll('.data-grid [contenteditable=true]').forEach(cell=>cell.addEventListener('input',()=>{
    const r=Number(cell.dataset.r),col=Number(cell.dataset.c);state.rows[r][col]=cell.textContent;persist('edit sel',false,{kind:'set_cell',row:r,col,value:cell.textContent});refreshColumnType(col,wrap);
  }));
  bindGridArrowNavigation(wrap);
  wrap.querySelectorAll('[data-select-row]').forEach(label=>label.onclick=event=>{
    const row=Number(label.dataset.selectRow);if(!state.headers.length)return;
    const anchor=event.shiftKey?(state.selection.anchor?.r??row):row;
    state.selection.anchor={r:Math.min(anchor,row),c:0};state.selection.focus={r:Math.max(anchor,row),c:state.headers.length-1};paintSelection();
  });
  wrap.querySelectorAll('[data-delete-row]').forEach(button=>button.onclick=()=>{
    const i=Number(button.dataset.deleteRow);if(!confirm('Hapus baris '+(i+1)+'?'))return;
    pushUndo('hapus baris');state.rows.splice(i,1);persist('hapus baris',true,{kind:'delete_row',row:i});clearSelection();renderGrid();setStatus('Baris dihapus.');
  });
}
function renderGridRows(wrap,types,widths,quality,{force=false}={}){
  const tbody=wrap.querySelector('.data-grid tbody');if(!tbody)return;
  const viewport=Math.max(240,wrap.clientHeight||600),rowHeight=virtualRowHeight();
  const windowInfo=virtualWindow({rowCount:state.rows.length,scrollTop:wrap.scrollTop,viewportHeight:viewport,rowHeight});
  if(windowInfo.virtualized&&!force&&Number(wrap.dataset.virtualStart)===windowInfo.start&&Number(wrap.dataset.virtualEnd)===windowInfo.end)return;
  wrap.dataset.virtualized=windowInfo.virtualized?'1':'0';wrap.dataset.virtualStart=String(windowInfo.start);wrap.dataset.virtualEnd=String(windowInfo.end);
  const span=state.headers.length+1,top=windowInfo.top?'<tr class="virtual-spacer" aria-hidden="true"><td colspan="'+span+'" style="height:'+windowInfo.top+'px"></td></tr>':'';
  const bottom=windowInfo.bottom?'<tr class="virtual-spacer" aria-hidden="true"><td colspan="'+span+'" style="height:'+windowInfo.bottom+'px"></td></tr>':'';
  tbody.innerHTML=top+state.rows.slice(windowInfo.start,windowInfo.end).map((row,offset)=>rowMarkup(row,windowInfo.start+offset,types,widths,quality)).join('')+bottom;
  bindGridBody(wrap);paintSelection();positionFillHandle();
}
function ensureGridRowVisible(row){
  const wrap=$('#gridWrap');if(!wrap||wrap.dataset.virtualized!=='1')return;
  const start=Number(wrap.dataset.virtualStart||0),end=Number(wrap.dataset.virtualEnd||0);
  if(row>=start&&row<end)return;
  wrap.scrollTop=Math.max(0,row*virtualRowHeight()-virtualRowHeight()*3);
  const types=state.headers.map((header,index)=>detectColumnType(state.rows.map(item=>item[index]))),widths=state.headers.map((_,index)=>savedColumnWidth(index)),quality=gridQualityModel();
  renderGridRows(wrap,types,widths,quality,{force:true});
}
function bindGridHeader(wrap){
  bindColumnDrag(wrap);bindColumnResize(wrap);installFillHandle(wrap);
  wrap.querySelectorAll('[data-rename-column]').forEach(button=>{
    bindColumnLongPress(button,Number(button.dataset.renameColumn));
    button.onclick=event=>{
      if(button.dataset.longPress==='1'){button.dataset.longPress='';event.preventDefault();return;}
      const col=Number(button.dataset.renameColumn);
      if((event.shiftKey||event.ctrlKey||event.metaKey)&&state.rows.length){
        const anchor=event.shiftKey?(state.selection.anchor?.c??col):col;
        state.selection.anchor={r:0,c:Math.min(anchor,col)};state.selection.focus={r:state.rows.length-1,c:Math.max(anchor,col)};paintSelection();
        document.documentElement.dataset.statSelectedColumns=Array.from({length:Math.abs(col-anchor)+1},(_,i)=>Math.min(anchor,col)+i).join(',');
        return;
      }
      openColumnName(col);
    };
    button.closest('th')?.addEventListener('contextmenu',event=>openColumnContextMenu(event,Number(button.dataset.renameColumn)));
  });
  wrap.querySelectorAll('[data-delete-column]').forEach(button=>button.onclick=()=>deleteColumnAt(Number(button.dataset.deleteColumn)));
}
function renderGrid(){
  const wrap=$('#gridWrap');if(!wrap)return;
  if(!state.headers.length){
    delete wrap.dataset.virtualized;wrap.innerHTML='<div class="empty-state"><div class="empty-state-icon" aria-hidden="true">▦</div><h3>'+esc(displayDatasetName(state.active))+'</h3><div class="empty-state-actions"><button type="button" class="primary" data-empty-paste>Tempel dari Excel</button><button type="button" data-empty-import>Impor berkas</button><button type="button" data-empty-example>Coba contoh</button></div><button type="button" class="empty-add-column" data-add-col>+ Kolom</button></div>';
  }else{
    const types=state.headers.map((header,index)=>detectColumnType(state.rows.map(row=>row[index]))),widths=state.headers.map((_,index)=>savedColumnWidth(index)),quality=gridQualityModel();
    const heads=state.headers.map((h,j)=>{
      const type=types[j],category=readCategoryMetadata(displayDatasetName(state.active),h),tip=columnTooltip(h,type,category),isText=['category','text'].includes(type.type),width=widths[j],style=width?' style="width:'+width+'px;min-width:'+width+'px;max-width:'+width+'px"':'';
      return '<th data-column-header="'+esc(h)+'" data-column-index="'+j+'" data-column-type="'+esc(type.type)+'" class="type-'+esc(type.type)+' '+(isText?'string-column':'')+'"'+style+'><div class="header-controls"><span class="column-drag-handle" data-drag-column="'+j+'" draggable="true" role="button" tabindex="0" aria-label="Geser kolom '+esc(h)+'" title="Geser kolom">⋮⋮</span><button class="header-name" data-rename-column="'+j+'" title="'+esc(tip)+'" aria-label="Ubah nama kolom '+esc(h)+'">'+columnHeaderMarkup(h)+'</button><span class="column-resizer" data-resize-column="'+j+'" title="Tarik untuk ubah lebar; klik ganda untuk otomatis"></span><button class="grid-delete" data-delete-column="'+j+'" aria-label="Hapus kolom '+esc(h)+'" title="Hapus kolom"></button></div></th>';
    }).join('');
    wrap.innerHTML='<table class="data-grid"><thead><tr><th class="row-number grid-corner"><div class="grid-add-controls"><button type="button" data-add-row>+ Baris</button><button type="button" data-add-col>+ Kolom</button></div></th>'+heads+'</tr></thead><tbody></tbody></table>';
    bindGridHeader(wrap);renderGridRows(wrap,types,widths,quality,{force:true});
    if(state.rows.length>VIRTUALIZE_AFTER_ROWS){
      let raf=0;
      wrap.onscroll=()=>{positionFillHandle();cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>renderGridRows(wrap,types,widths,quality));};
    }else wrap.onscroll=positionFillHandle;
  }
  wrap.querySelector('[data-empty-paste]')?.addEventListener('click',openModal);
  wrap.querySelector('[data-empty-import]')?.addEventListener('click',()=>$('#quickImportFile')?.click());
  wrap.querySelector('[data-empty-example]')?.addEventListener('click',()=>{
    const first=document.querySelector('#exampleDatasets [data-example-id]');
    if(first)first.click();else $('#dataTemplate')?.click();
  });
  wrap.querySelectorAll('[data-add-row]').forEach(button=>button.onclick=addRow);
  wrap.querySelectorAll('[data-add-col]').forEach(button=>button.onclick=addColumn);
  if($('#activeFile'))$('#activeFile').textContent=displayDatasetName(state.active);
  paintSelection();positionFillHandle();
}
function excelRows(text){return text.replace(/\r/g,'').split('\n').filter(Boolean).map(line=>line.split('\t'));}
function detectDelimiter(text){let semis=0,commas=0,quotes=false;for(const c of text.slice(0,10000)){if(c==='"')quotes=!quotes;else if(!quotes&&c===';')semis++;else if(!quotes&&c===',')commas++;}return semis>commas?';':',';}
function csvRows(text,delimiter){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];cell='';}else cell+=c;}if(cell!==''||row.length){row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);}return rows;}
function openModal(){clearError();const m=$('#pasteModal');m.classList.add('open');$('#pasteArea').value='';$('#preview').textContent='';setTimeout(()=>$('#pasteArea').focus(),0);}
function closeModal(){$('#pasteModal').classList.remove('open');}
function previewPaste(){const a=excelRows($('#pasteArea').value);$('#preview').textContent=a.length?`${a.length} baris × ${a[0].length} kolom terdeteksi.`:'';}
function applyPasted(){try{const a=excelRows($('#pasteArea').value);if(!a.length)return showError('Tidak ada data Excel yang ditempel.');pushUndo('tempel dataset');const hasHeader=$('#hasHeader').checked;state.headers=hasHeader?validateColumnNames(a[0]):a[0].map((_,i)=>`Variable${i+1}`);state.rows=a.slice(hasHeader?1:0).map(r=>state.headers.map((_,i)=>r[i]??''));persist('tempel dataset',true);clearSelection();renderGrid();closeModal();setStatus(`✓ ${state.rows.length} baris × ${state.headers.length} kolom tersimpan di ${displayDatasetName(state.active)}${dictionaryRecognitionText(state.headers,displayDatasetName(state.active))}.`);}catch(e){showError('Gagal memasukkan data dari Excel.',e);}}
async function importCSV(event){try{const file=event.target.files?.[0];if(!file)return;const text=await file.text();if(!text.trim())return showError('File CSV kosong.');const delimiter=detectDelimiter(text);const a=csvRows(text,delimiter);if(!a.length)return showError('CSV tidak dapat dibaca.');pushUndo('impor CSV');state.headers=validateColumnNames(a[0]);state.rows=a.slice(1).map(r=>state.headers.map((_,i)=>r[i]??''));persist('impor CSV',true);clearSelection();renderGrid();setStatus(`✓ CSV diimpor menggunakan pemisah “${delimiter}”: ${state.rows.length} baris × ${state.headers.length} kolom${dictionaryRecognitionText(state.headers,displayDatasetName(state.active))}.`);}catch(e){showError('Gagal mengimpor CSV.',e);}finally{event.target.value='';}}
function quickImport(event){
  const input=event.target,file=input.files?.[0];input.value='';if(!file)return;
  const isXlsx=/\.xlsx$/i.test(file.name)||file.type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const target=isXlsx?$('#xlsxInput'):$('#file');
  if(!target)return showError(isXlsx?'Impor Excel belum siap. Muat ulang halaman lalu coba lagi.':'Impor CSV belum siap.');
  try{
    const transfer=new DataTransfer();transfer.items.add(file);target.files=transfer.files;
    target.dispatchEvent(new Event('change',{bubbles:true}));
  }catch(error){
    showError('Berkas belum dapat diteruskan ke pengimpor. Gunakan tombol impor pada toolbar.',error);
  }
}
function newTXT(){let i=1,name='dataset.csv';while(Object.prototype.hasOwnProperty.call(state.files,name))name=`dataset${i++}.csv`;state.files[name]='';state.active=name;state.headers=[];state.rows=[];state.meta[name]={plant:'',treatment:''};persist();try{localStorage.setItem(META_KEY,JSON.stringify(state.meta));}catch{}loadActive(false);setStatus(`✓ ${displayDatasetName(name)} dibuat.`);}
function addRow(){if(!state.headers.length)return showError('Tambahkan data atau kolom terlebih dahulu.');pushUndo('tambah baris');const row=state.headers.map(()=>'');state.rows.push(row);persist('tambah baris',true,{kind:'append_row',values:row});renderGrid();setStatus('✓ Baris baru ditambahkan.');}
function addColumn(){pushUndo('tambah kolom');if(!state.headers.length)state.rows=[];state.headers.push(nextColumnName(state.headers));state.rows.forEach(r=>r.push(''));persist('tambah kolom',true);renderGrid();setStatus('✓ Kolom baru ditambahkan.');}
function clearData(){
  const name=displayDatasetName(state.active),filled=state.rows.reduce((sum,row)=>sum+row.filter(value=>String(value??'').trim()!=='').length,0);
  const scope=filled?`${filled} nilai pada ${state.rows.length} baris × ${state.headers.length} kolom`:'seluruh struktur tabel yang masih kosong';
  if(!confirm(`Kosongkan seluruh isi dataset “${name}”?\n\nCakupan: ${scope}.\nDataset tetap ada. Setelah tindakan ini Anda dapat menekan Ctrl+Z untuk memulihkan isi selama sesi ini.`))return;
  pushUndo('kosongkan dataset');state.headers=[];state.rows=[];persist('kosongkan dataset',true);clearSelection();renderGrid();
  setStatus(`Isi “${name}” dikosongkan. Tekan Ctrl+Z untuk memulihkan selama sesi ini.`);
}
function renameDataset() {
  $('#datasetName').value=displayDatasetName(state.active);
  $('#datasetNameError').hidden=true;
  $('#datasetNameModal').classList.add('open');
  $('#datasetName').focus();
}
function saveDatasetName(event) {
  event.preventDefault();
  const name=$('#datasetName').value.trim().replace(/\.(?:csv|txt)$/i,'');
  const target=name+'.csv',box=$('#datasetNameError'),previous=state.active,content=serialize();
  if(!name||/[\\/\u0000-\u001f]/.test(name)){box.hidden=false;box.textContent='Masukkan nama tanpa garis miring atau karakter kontrol.';return;}
  if(Object.keys(state.files).some(key=>key.toLowerCase()===target.toLowerCase()&&key!==previous)){box.hidden=false;box.textContent='Nama tersebut sudah digunakan dataset lain.';return;}
  try{
    const previousStored=state.files[previous],offloaded=localStoreReady()&&(isLocalPointer(previousStored)||shouldOffloadDataset(content));
    const files=Object.fromEntries(Object.entries(state.files).filter(([key])=>key!==previous));
    files[target]=offloaded?localPointer(target):content;
    const meta={...state.meta},oldKey=displayDatasetName(previous),newKey=displayDatasetName(target);
    meta[target]=meta[previous]||{plant:'',treatment:''};delete meta[previous];
    localStorage.setItem(FILES_KEY,JSON.stringify(files));localStorage.setItem(ACTIVE_KEY,target);localStorage.setItem(META_KEY,JSON.stringify(meta));
    if(previous!==target){moveCategoryDataset(oldKey,newKey);moveTreatmentMetadataDataset(oldKey,newKey);}
    const allHistory=editorHistoryStore();if(allHistory[oldKey]){allHistory[newKey]=allHistory[oldKey];delete allHistory[oldKey];localStorage.setItem(EDITOR_HISTORY_KEY,JSON.stringify(allHistory));}
    state.files=files;state.active=target;state.meta=meta;
    if(offloaded)void saveLocalDataset(target,content).then(()=>deleteLocalDataset(previous)).catch(error=>showError('Dataset besar gagal diganti nama.',error));
    else if(localStoreReady()&&isLocalPointer(previousStored))void deleteLocalDataset(previous);
    if(localStoreReady())void renameLocalSnapshots(previous,target).catch(()=>{});
    notifyDatasetChange({type:'rename',name:target,previous});
    $('#datasetNameModal').classList.remove('open');renderTree();renderGrid();renderDatasetMeta();setStatus(`✓ Dataset diganti nama menjadi ${displayDatasetName(target)}.`);
  }catch(e){box.hidden=false;box.textContent='Nama dataset tidak dapat disimpan.';showError('Gagal mengganti nama dataset.',e);}
}
function deleteDataset(){
  const name=displayDatasetName(state.active),rows=state.rows.length,cols=state.headers.length;
  const detail=rows||cols?`${rows} baris × ${cols} kolom beserta metadata dan riwayat lokal`:'dataset kosong beserta metadata dan riwayat lokal';
  if(!confirm(`Hapus dataset “${name}” secara permanen dari perangkat ini?\n\nCakupan: ${detail}.\nTindakan ini tidak dapat diurungkan.`))return;
  const removed=state.active,removedStored=state.files[removed];removeCategoryDataset(name);removeTreatmentMetadataDataset(name);delete state.files[removed];delete state.meta[removed];
  try{const all=editorHistoryStore();delete all[name];localStorage.setItem(EDITOR_HISTORY_KEY,JSON.stringify(all));}catch{}
  state.active=Object.keys(state.files)[0]||'dataset.csv';if(!(state.active in state.files))state.files[state.active]='';
  try{saveFilesManifest();localStorage.setItem(META_KEY,JSON.stringify(state.meta));}catch(error){return showError('Dataset tidak dapat dihapus.',error);}
  if(localStoreReady()&&isLocalPointer(removedStored))void deleteLocalDataset(removed);
  if(localStoreReady())void deleteLocalSnapshots(removed).catch(()=>{});
  notifyDatasetChange({type:'delete',name:removed});loadActive(false);setStatus(`Dataset “${name}” dihapus dari perangkat ini.`);
}
function downloadDataset(){const blob=new Blob([serialize()],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=state.active;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);setStatus(`✓ ${displayDatasetName(state.active)} diunduh.`);}
function duplicateDataset(){
  const source=state.active,content=serialize(),base=displayDatasetName(source)+' - salinan';let name=base+'.csv',n=2;
  while(Object.prototype.hasOwnProperty.call(state.files,name))name=`${base} (${n++}).csv`;
  const offloaded=localStoreReady()&&shouldOffloadDataset(content);
  state.files[name]=offloaded?localPointer(name):content;state.meta[name]={...(state.meta[source]||{plant:'',treatment:''})};
  copyCategoryDataset(displayDatasetName(source),displayDatasetName(name));copyTreatmentMetadataDataset(displayDatasetName(source),displayDatasetName(name));
  try{
    localStorage.setItem(FILES_KEY,JSON.stringify(state.files));localStorage.setItem(META_KEY,JSON.stringify(state.meta));state.active=name;localStorage.setItem(ACTIVE_KEY,name);
    if(offloaded)void saveLocalDataset(name,content).catch(error=>showError('Salinan besar gagal disimpan.',error));
    notifyDatasetChange({type:'upsert',name,reason:'duplikat'});applyActiveCsv(content,{history:false});setStatus(`✓ Salinan dibuat: ${displayDatasetName(name)}.`);
  }catch(error){showError('Gagal membuat salinan dataset.',error);}
}
function openDatasetView(title,html){
  $('#datasetViewTitle').textContent=title;$('#datasetViewBody').innerHTML=html;$('#datasetViewModal').classList.add('open');
}
function showRawDataset(){
  openDatasetView('Data mentah',`<p class="form-help">Format CSV yang tersimpan pada browser.</p><textarea class="raw-dataset-preview" readonly>${esc(serialize())}</textarea><div class="dataset-view-actions"><button type="button" id="copyRawDataset">Salin CSV</button><button type="button" id="downloadRawDataset">Unduh CSV</button></div>`);
  $('#copyRawDataset').onclick=async()=>{try{await navigator.clipboard.writeText(serialize());setStatus('✓ CSV disalin.');}catch{setStatus('CSV tidak dapat disalin dari browser ini.');}};
  $('#downloadRawDataset').onclick=downloadDataset;
}
function showDatasetMetadata(){
  const datasetName=displayDatasetName(state.active),meta=activeMeta();
  const rows=state.headers.map((header,index)=>{
    const type=detectColumnType(state.rows.map(row=>row[index])),parameter=parseParameterHeader(header),category=readCategoryMetadata(datasetName,header),mappings=Object.entries(category.levels||{}).map(([code,entry])=>`${code} = ${entry.value}${category.unit?' '+category.unit:''}`).join('; ');
    return `<tr><td>${esc(parameter.code||header)}</td><td>${esc(parameter.name||'—')}</td><td>${esc(parameter.unit||'—')}</td><td>${esc(type.label)}</td><td>${esc(mappings||'—')}</td></tr>`;
  }).join('');
  openDatasetView('Metadata dataset',`<div class="dataset-meta-summary"><b>${esc(datasetName)}</b><span>Tanaman: ${esc(meta.plant||'—')}</span><span>Perlakuan: ${esc(meta.treatment||'—')}</span><span>${state.rows.length} baris × ${state.headers.length} kolom</span></div><div class="table-scroll"><table class="result-table"><thead><tr><th>Kode</th><th>Nama lengkap</th><th>Satuan</th><th>Tipe</th><th>Arti kategori</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}
function applyHistoryEntry(entry){
  if(!entry)return;
  if(!confirm(`Pulihkan versi ${new Date(entry.date).toLocaleString('id-ID')}? Data saat ini tetap masuk ke riwayat.`))return;
  pushUndo('pulihkan riwayat');recordEditorHistory('sebelum pemulihan',true);
  const parsed=entry.csv?.trim()?csvRows(entry.csv,','):[];
  state.headers=parsed[0]||[];state.rows=parsed.slice(1).map(row=>state.headers.map((_,i)=>row[i]??''));state.meta[state.active]={...(entry.meta||{})};
  try{localStorage.setItem(META_KEY,JSON.stringify(state.meta));}catch{}
  persist('pulihkan riwayat',true);renderGrid();renderDatasetMeta();$('#datasetViewModal').classList.remove('open');setStatus('✓ Versi lama dipulihkan.');
}
function restoreHistoryEntry(index){
  const key=displayDatasetName(state.active),all=editorHistoryStore(),entry=all[key]?.[index];applyHistoryEntry(entry);
}
async function showDatasetHistory(){
  const key=displayDatasetName(state.active),small=editorHistoryStore()[key]||[];
  let large=[];
  if(localStoreReady())large=await listLocalSnapshots(state.active,12).catch(()=>[]);
  const entries=[
    ...small.map((entry,index)=>({...entry,source:'small',index})),
    ...large.map(entry=>({...entry,source:'large'}))
  ].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,12);
  openDatasetView('Riwayat perubahan',entries.length?`<p class="form-help">Versi lokal disimpan di perangkat ini.</p><div class="editor-history-list">${entries.map((entry,index)=>`<button type="button" data-history-entry="${index}"><b>${esc(new Date(entry.date).toLocaleString('id-ID'))}</b><span>${esc(entry.reason||'perubahan')}</span></button>`).join('')}</div>`:'<p>Belum ada riwayat perubahan.</p>');
  $('#datasetViewBody').querySelectorAll('[data-history-entry]').forEach(button=>button.onclick=async()=>{
    const entry=entries[Number(button.dataset.historyEntry)];if(!entry)return;
    if(entry.source==='large'){const full=await getLocalSnapshot(entry.id).catch(()=>null);applyHistoryEntry(full);}
    else restoreHistoryEntry(entry.index);
  });
}
function toggleCompactEditor(){
  const enabled=!document.documentElement.classList.contains('compact-data-editor');
  document.documentElement.classList.toggle('compact-data-editor',enabled);
  localStorage.setItem(COMPACT_KEY,enabled?'1':'0');$('#compactEditor').textContent=enabled?'Normal':'Ringkas';setStatus(enabled?'Tampilan ringkas aktif.':'Tampilan normal aktif.');
}
function ensureMobileDatasetBackdrop(){
  if(typeof document.createElement!=='function')return null;
  let backdrop=document.getElementById('mobileDatasetBackdrop');
  if(backdrop)return backdrop;
  backdrop=document.createElement('div');
  backdrop.id='mobileDatasetBackdrop';
  backdrop.className='mobile-dataset-backdrop';
  backdrop.setAttribute('aria-hidden','true');
  backdrop.addEventListener('click',()=>toggleMobileProjectPanel(false));
  document.body.append(backdrop);
  return backdrop;
}
function toggleMobileProjectPanel(force){
  const root=document.documentElement,button=$('#projectToggle');
  if(!root||!button)return;
  ensureMobileDatasetBackdrop();
  const opening=force===undefined?!root.classList.contains('mobile-project-open'):Boolean(force);
  root.classList.toggle('mobile-project-open',opening);
  button.setAttribute?.('aria-expanded',String(opening));
  button.textContent=opening?'✕':'☰';button.setAttribute('aria-label',opening?'Tutup dataset':'Dataset');button.title=opening?'Tutup dataset':'Dataset';
}


function installEditorShortcuts(){
  document.addEventListener('keydown',async event=>{
    const key=event.key.toLowerCase(),modifier=event.ctrlKey||event.metaKey;
    const inField=event.target.matches?.('input,textarea,select')&&!event.target.matches?.('[contenteditable=true]');
    if(modifier&&key==='z'&&!event.shiftKey&&!inField){event.preventDefault();undoEditor();return;}
    if(modifier&&(key==='y'||(key==='z'&&event.shiftKey))&&!inField){event.preventDefault();redoEditor();return;}
    if(modifier&&key==='s'&&!inField){
      event.preventDefault();
      if(event.shiftKey){downloadDataset();return;}
      persist('simpan manual',true);recordEditorHistory('simpan manual',true);setStatus('✓ Tersimpan di perangkat.');
      return;
    }
    if(modifier&&key==='f'&&!inField&&!document.querySelector('.modal-backdrop.open')){event.preventDefault();openGridFind();return;}
    if(!modifier&&key==='/'&&!inField&&!document.querySelector('.modal-backdrop.open')){event.preventDefault();$('#globalSearchButton')?.click();return;}
    if(modifier&&key==='a'&&!inField&&state.rows.length&&state.headers.length){event.preventDefault();state.selection.anchor={r:0,c:0};state.selection.focus={r:state.rows.length-1,c:state.headers.length-1};paintSelection();return;}
    if(modifier&&key==='enter'&&!inField){event.preventDefault();const run=$('#runScience'),modal=$('#scientificModal');if(modal?.classList.contains('open')&&run&&!run.disabled)run.click();else $('#openAnalysis')?.click();return;}
    if(modifier&&key==='c'&&!inField&&selectionRange()){event.preventDefault();await copySelectedCells();return;}
    if(key==='f2'&&!inField&&state.selection.focus){event.preventDefault();openColumnName(state.selection.focus.c);return;}
  });
}

function consumeExternalDatasetImport(){
  let payload=null;
  try{payload=JSON.parse(localStorage.getItem(EXTERNAL_IMPORT_KEY)||'null');}catch{}
  if(!payload||payload.source!=='field-zero')return false;
  const datasets=Array.isArray(payload.datasets)?payload.datasets:(Array.isArray(payload.headers)&&Array.isArray(payload.rows)?[payload]:[]);
  if(!datasets.length)return false;
  let imported=0;
  for(const source of datasets){
    if(!source||!Array.isArray(source.headers)||!Array.isArray(source.rows))continue;
    const detail={...source,source:'field-zero'};document.dispatchEvent(new CustomEvent('dataset-import',{detail}));
    if(detail.importResult?.ok)imported++;
  }
  if(imported===datasets.length){
    try{localStorage.removeItem(EXTERNAL_IMPORT_KEY);}catch{}
    const design=String(payload.design||datasets.at(-1)?.design||'').toUpperCase();
    setStatus(`✓ ${imported} dataset Field Zero dibuka · DATA SIMULASI GAME${design?` · Analisis → ${design}`:''}.`);
    return true;
  }
  return false;
}

function installDataGrid(){
  document.addEventListener('stat-cloud-sync-applied',event=>{
    loadStorage();
    const detail=event.detail||{},parts=[];
    if(detail.downloaded)parts.push(`${detail.downloaded} dataset dari cloud`);
    if(detail.conflicts)parts.push(`${detail.conflicts} konflik diamankan`);
    setStatus(parts.length?`✓ Sinkronisasi akun: ${parts.join(' · ')}.`:'✓ Dataset akun tersinkron.');
  });
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
      const csv=serializeRows(headers,rows),value=localStoreReady()&&shouldOffloadDataset(csv)?localPointer(name):csv;
      const files={...state.files,[name]:value},meta={...state.meta,[name]:{plant:String(detail.plant||'').trim(),treatment:String(detail.treatment||'').trim()}};
      const previousFiles=localStorage.getItem(FILES_KEY),previousActive=localStorage.getItem(ACTIVE_KEY),previousMeta=localStorage.getItem(META_KEY);
      try{localStorage.setItem(FILES_KEY,JSON.stringify(files));localStorage.setItem(ACTIVE_KEY,name);localStorage.setItem(META_KEY,JSON.stringify(meta));}
      catch(error){
        try{for(const [key,value] of [[FILES_KEY,previousFiles],[ACTIVE_KEY,previousActive],[META_KEY,previousMeta]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}}catch{}
        throw error;
      }
      state.files=files;state.active=name;state.headers=headers;state.rows=rows;state.meta=meta;
      if(localStoreReady()&&isLocalPointer(value))void saveLocalDataset(name,csv).catch(error=>showError('Dataset besar gagal disimpan.',error));
      notifyDatasetChange({type:'upsert',name,reason:'impor'});
      clearError();renderTree();renderGrid();renderDatasetMeta();
      detail.importResult={ok:true,name};
      setStatus(`✓ ${displayDatasetName(name)}: ${rows.length} baris × ${headers.length} kolom berhasil diimpor${dictionaryRecognitionText(headers,displayDatasetName(name))}.`);
    }catch(error){
      if(detail&&typeof detail==='object')detail.importResult={ok:false,error:error.message};
      showError('Gagal membuat dataset.',error);
    }
  });
  $('#pasteBtn').onclick=openModal;$('#closeModal').onclick=closeModal;$('#cancelPaste').onclick=closeModal;$('#applyPaste').onclick=applyPasted;$('#pasteArea').oninput=previewPaste;$('#importBtn').onclick=()=>$('#file').click();$('#file').onchange=importCSV;$('#quickImportFile').onchange=quickImport;$('#newTxt').onclick=newTXT;$('#addRow').onclick=addRow;$('#addCol').onclick=addColumn;$('#clearData').onclick=clearData;$('#renameDataset').onclick=renameDataset;$('#activeFile').onclick=renameDataset;$('#activeFile').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();renameDataset();}};$('#duplicateDataset').onclick=duplicateDataset;$('#closeDatasetName').onclick=()=>$('#datasetNameModal').classList.remove('open');$('#datasetNameForm').onsubmit=saveDatasetName;$('#deleteDataset').onclick=deleteDataset;$('#viewRawDataset').onclick=showRawDataset;$('#viewDatasetMeta').onclick=showDatasetMetadata;$('#datasetHistory').onclick=showDatasetHistory;$('#closeDatasetView').onclick=()=>$('#datasetViewModal').classList.remove('open');$('#compactEditor').onclick=toggleCompactEditor;$('#projectToggle').onclick=()=>toggleMobileProjectPanel();$('#datasetSearch').oninput=renderTree;$('#closeColumnName').onclick=()=>$('#columnNameModal').classList.remove('open');$('#columnNameForm').onsubmit=saveColumnName;bindInlineDatasetMeta();bindColumnFormArrowNavigation();installEditorShortcuts();installPanelResize();ensureGridFind();ensureMobileDatasetBackdrop();
  const rootClassList=document.documentElement?.classList,compactSaved=localStorage.getItem(COMPACT_KEY)==='1';rootClassList?.toggle?.('compact-data-editor',compactSaved);if($('#compactEditor'))$('#compactEditor').textContent=rootClassList?.contains?.('compact-data-editor')?'Normal':'Ringkas';
  $('#fileTree').addEventListener('click',event=>{const item=event.target.closest('[data-file]');if(!item)return;clearError();state.active=item.dataset.file;loadActive();if(globalThis.matchMedia?.('(max-width:720px)').matches)toggleMobileProjectPanel(false);setStatus(`✓ ${displayDatasetName(state.active)} dibuka.`);});
}

async function boot(){
  loadStorage();
  if(localStoreReady())void requestPersistentStorage();
  try{await migrateLargeLocalDatasets();if(localHydrationPromise)await localHydrationPromise;}catch(error){console.warn('Migrasi penyimpanan lokal dilewati',error);}
  installDataGrid();consumeExternalDatasetImport();installDataTools();installNavigation();installAnalysisFlow();installResearchWorkspace();installPaymentGate();installResultExport();

function installDeferredFeatures(){
  const start=()=>import('./account-dataset-sync.js')
    .then(({installAccountDatasetSync})=>installAccountDatasetSync())
    .catch(error=>console.warn('Sinkronisasi akun tidak dapat dimuat.',error));
  if('requestIdleCallback' in window)window.requestIdleCallback(start,{timeout:1800});
  else window.setTimeout(start,250);
}
installDeferredFeatures();
}
initNumberSettings();void boot();
