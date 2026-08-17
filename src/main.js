const FILES_KEY='statistical_web_txt_files_v2';
const ACTIVE_KEY='statistical_web_active_txt_v2';
const state={files:{},active:'dataset.txt',headers:[],rows:[]};

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function showError(message,errorObj){
  console.error(message,errorObj||'');
  const text=`⚠ ${message}${errorObj?.message?` — ${errorObj.message}`:''}`;
  const box=$('#errorBox');
  if(box){box.hidden=false;box.textContent=text;}
  if($('#status')) $('#status').textContent=text;
}
function clearError(){const box=$('#errorBox');if(box){box.hidden=true;box.textContent='';}}
function setStatus(text){if($('#status'))$('#status').textContent=text;}

function parseTSV(text){
  return text.replace(/\r/g,'').split('\n').filter(line=>line.length>0).map(line=>line.split('\t'));
}
function serialize(){
  if(!state.headers.length)return '';
  return [state.headers.join('\t'),...state.rows.map(r=>state.headers.map((_,i)=>r[i]??'').join('\t'))].join('\n');
}
function persist(){
  try{
    state.files[state.active]=serialize();
    localStorage.setItem(FILES_KEY,JSON.stringify(state.files));
    localStorage.setItem(ACTIVE_KEY,state.active);
    updateStorageStatus();
  }catch(e){showError('Gagal menyimpan dataset sementara di browser.',e);}
}
function updateStorageStatus(){
  const el=$('#storageStatus');
  if(el)el.textContent=`● ${Object.keys(state.files).length} file .txt`;
}
function loadStorage(){
  try{
    state.files=JSON.parse(localStorage.getItem(FILES_KEY)||'{}')||{};
    state.active=localStorage.getItem(ACTIVE_KEY)||Object.keys(state.files)[0]||'dataset.txt';
    if(!(state.active in state.files))state.files[state.active]='';
  }catch(e){
    state.files={'dataset.txt':''};state.active='dataset.txt';
    showError('Penyimpanan browser tidak dapat dibaca; dataset baru dibuat.',e);
  }
  loadActive(false);
}
function loadActive(save=true){
  const text=state.files[state.active]??'';
  const parsed=parseTSV(text);
  state.headers=parsed[0]||[];
  state.rows=parsed.slice(1).map(r=>state.headers.map((_,i)=>r[i]??''));
  if(save)localStorage.setItem(ACTIVE_KEY,state.active);
  renderTree();renderGrid();updateStorageStatus();
  $('#activeFile').textContent=state.active;
}
function renderTree(){
  const tree=$('#fileTree');if(!tree)return;
  tree.innerHTML=Object.keys(state.files).map(name=>`<button type="button" class="tree-item ${name===state.active?'active':''}" data-file="${esc(name)}">📄 ${esc(name)}</button>`).join('');
  tree.querySelectorAll('[data-file]').forEach(btn=>btn.addEventListener('click',()=>{
    clearError();state.active=btn.dataset.file;loadActive();setStatus(`✓ ${state.active} dibuka.`);
  }));
}
function renderGrid(){
  const wrap=$('#gridWrap');if(!wrap)return;
  if(!state.headers.length){
    wrap.innerHTML=`<div class="empty-state"><div class="icon">📄</div><h3>${esc(state.active)}</h3><p>File .txt kosong. Gunakan <b>Paste from Excel</b> atau <b>Import CSV</b>.</p></div>`;
  }else{
    wrap.innerHTML=`<table class="data-grid"><thead><tr><th class="row-number">#</th>${state.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${state.rows.map((r,i)=>`<tr><td class="row-number">${i+1}</td>${state.headers.map((_,j)=>`<td contenteditable="true" data-r="${i}" data-c="${j}">${esc(r[j])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    wrap.querySelectorAll('[contenteditable=true]').forEach(cell=>cell.addEventListener('input',()=>{
      state.rows[Number(cell.dataset.r)][Number(cell.dataset.c)]=cell.textContent;persist();
    }));
  }
  $('#info').textContent=`${state.rows.length} × ${state.headers.length}`;
  $('#activeFile').textContent=state.active;
}

function excelRows(text){return text.replace(/\r/g,'').split('\n').filter(Boolean).map(line=>line.split('\t'));}
function detectDelimiter(text){
  let semis=0,commas=0,quotes=false;
  for(const c of text.slice(0,10000)){
    if(c==='"')quotes=!quotes;
    else if(!quotes&&c===';')semis++;
    else if(!quotes&&c===',')commas++;
  }
  return semis>commas?';':',';
}
function csvRows(text,delimiter){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
    }else if(c===delimiter&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];cell='';
    }else cell+=c;
  }
  if(cell!==''||row.length){row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);}
  return rows;
}

function openModal(){clearError();const m=$('#pasteModal');m.classList.add('open');$('#pasteArea').value='';$('#preview').textContent='';setTimeout(()=>$('#pasteArea').focus(),0);}
function closeModal(){$('#pasteModal').classList.remove('open');}
function previewPaste(){
  const a=excelRows($('#pasteArea').value);$('#preview').textContent=a.length?`${a.length} baris × ${a[0].length} kolom terdeteksi.`:'';
}
function applyPasted(){
  try{
    const a=excelRows($('#pasteArea').value);
    if(!a.length)return showError('Tidak ada data Excel yang ditempel.');
    const hasHeader=$('#hasHeader').checked;
    state.headers=hasHeader?a[0].map(v=>v.trim()||'Variable'):a[0].map((_,i)=>`Variable${i+1}`);
    state.rows=a.slice(hasHeader?1:0).map(r=>state.headers.map((_,i)=>r[i]??''));
    persist();renderGrid();closeModal();setStatus(`✓ ${state.rows.length} baris × ${state.headers.length} kolom tersimpan di ${state.active}.`);
  }catch(e){showError('Gagal memasukkan data dari Excel.',e);}
}
async function importCSV(event){
  try{
    const file=event.target.files?.[0];if(!file)return;
    const text=await file.text();if(!text.trim())return showError('File CSV kosong.');
    const delimiter=detectDelimiter(text);const a=csvRows(text,delimiter);
    if(!a.length)return showError('CSV tidak dapat dibaca.');
    state.headers=a[0].map(v=>v.trim()||'Variable');
    state.rows=a.slice(1).map(r=>state.headers.map((_,i)=>r[i]??''));
    persist();renderGrid();setStatus(`✓ CSV diimpor menggunakan pemisah “${delimiter}”: ${state.rows.length} baris × ${state.headers.length} kolom.`);
  }catch(e){showError('Gagal mengimpor CSV.',e);}finally{event.target.value='';}
}
function newTXT(){
  let i=1,name='dataset.txt';while(Object.prototype.hasOwnProperty.call(state.files,name))name=`dataset${i++}.txt`;
  state.files[name]='';state.active=name;persist();loadActive(false);setStatus(`✓ ${name} dibuat.`);
}
function addRow(){
  if(!state.headers.length)return showError('Tambahkan data atau kolom terlebih dahulu.');
  state.rows.push(state.headers.map(()=>''));persist();renderGrid();setStatus('✓ Baris baru ditambahkan.');
}
function addColumn(){
  if(!state.headers.length){state.headers=['Variable1'];state.rows=[];}else state.headers.push(`Variable${state.headers.length+1}`);
  state.rows.forEach(r=>r.push(''));persist();renderGrid();setStatus('✓ Kolom baru ditambahkan.');
}
function clearData(){
  if(!confirm(`Hapus seluruh isi ${state.active}?`))return;
  state.headers=[];state.rows=[];persist();renderGrid();setStatus(`✓ Isi ${state.active} dikosongkan.`);
}
function placeholder(name){showError(`Fitur ${name} belum tersedia. Tombol berfungsi dan sengaja menampilkan pesan ini.`);}

function bind(){
  $('#pasteBtn').addEventListener('click',openModal);
  $('#importBtn').addEventListener('click',()=>$('#file').click());
  $('#file').addEventListener('change',importCSV);
  $('#newTxt').addEventListener('click',newTXT);
  $('#addRow').addEventListener('click',addRow);
  $('#addCol').addEventListener('click',addColumn);
  $('#clearData').addEventListener('click',clearData);
  $('#closeModal').addEventListener('click',closeModal);
  $('#cancelPaste').addEventListener('click',closeModal);
  $('#applyPaste').addEventListener('click',applyPasted);
  $('#pasteArea').addEventListener('input',previewPaste);
  $('#outputBtn').addEventListener('click',()=>placeholder('Output'));
  document.querySelectorAll('[data-menu]').forEach(btn=>btn.addEventListener('click',()=>{
    if(btn.dataset.menu!=='Data')placeholder(btn.dataset.menu);else{clearError();setStatus('✓ Menu Data aktif.');}
  }));
  document.querySelectorAll('[data-mobile]').forEach(btn=>btn.addEventListener('click',()=>placeholder(btn.dataset.mobile)));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
  window.addEventListener('error',e=>showError('Terjadi kesalahan JavaScript.',e.error||e.message));
  window.addEventListener('unhandledrejection',e=>showError('Terjadi kesalahan proses aplikasi.',e.reason));
}

try{loadStorage();bind();setStatus('✓ Statistical Web siap digunakan.');}catch(e){showError('Aplikasi gagal diinisialisasi.',e);}
