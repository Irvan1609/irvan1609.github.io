import { installAnalysisFlow } from './analysis-flow.js';
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
function renderGrid(){const wrap=$('#gridWrap');if(!wrap)return;if(!state.headers.length){wrap.innerHTML=`<div class="empty-state"><div class="icon">📄</div><h3>${esc(state.active)}</h3><p>File .txt kosong. Gunakan <b>Paste from Excel</b> atau <b>Import CSV</b>.</p></div>`;}else{wrap.innerHTML=`<table class="data-grid"><thead><tr><th class="row-number">#</th>${state.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${state.rows.map((r,i)=>`<tr><td class="row-number">${i+1}</td>${state.headers.map((_,j)=>`<td contenteditable="true" data-r="${i}" data-c="${j}">${esc(r[j])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;wrap.querySelectorAll('[contenteditable=true]').forEach(cell=>cell.addEventListener('input',()=>{state.rows[Number(cell.dataset.r)][Number(cell.dataset.c)]=cell.textContent;persist();}));}$('#info').textContent=`${state.rows.length} × ${state.headers.length}`;$('#activeFile').textContent=state.active;}
function excelRows(text){return text.replace(/\r/g,'').split('\n').filter(Boolean).map(line=>line.split('\t'));}
function detectDelimiter(text){let semis=0,commas=0,quotes=false;for(const c of text.slice(0,10000)){if(c==='"')quotes=!quotes;else if(!quotes&&c===';')semis++;else if(!quotes&&c===',')commas++;}return semis>commas?';':',';}
function csvRows(text,delimiter){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];cell='';}else cell+=c;}if(cell!==''||row.length){row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);}return rows;}
function openModal(){clearError();const m=$('#pasteModal');m.classList.add('open');$('#pasteArea').value='';$('#preview').textContent='';setTimeout(()=>$('#pasteArea').focus(),0);}
function closeModal(){$('#pasteModal').classList.remove('open');}
function previewPaste(){const a=excelRows($('#pasteArea').value);$('#preview').textContent=a.length?`${a.length} baris × ${a[0].length} kolom terdeteksi.`:'';}
function applyPasted(){try{const a=excelRows($('#pasteArea').value);if(!a.length)return showError('Tidak ada data Excel yang ditempel.');const hasHeader=$('#hasHeader').checked;state.headers=hasHeader?a[0].map(v=>v.trim()||'Variable'):a[0].map((_,i)=>`Variable${i+1}`);state.rows=a.slice(hasHeader?1:0).map(r=>state.headers.map((_,i)=>r[i]??''));persist();renderGrid();closeModal();setStatus(`✓ ${state.rows.length} baris × ${state.headers.length} kolom tersimpan di ${state.active}.`);}catch(e){showError('Gagal memasukkan data dari Excel.',e);}}
async function importCSV(event){try{const file=event.target.files?.[0];if(!file)return;const text=await file.text();if(!text.trim())return showError('File CSV kosong.');const delimiter=detectDelimiter(text);const a=csvRows(text,delimiter);if(!a.length)return showError('CSV tidak dapat dibaca.');state.headers=a[0].map(v=>v.trim()||'Variable');state.rows=a.slice(1).map(r=>state.headers.map((_,i)=>r[i]??''));persist();renderGrid();setStatus(`✓ CSV diimpor menggunakan pemisah “${delimiter}”: ${state.rows.length} baris × ${state.headers.length} kolom.`);}catch(e){showError('Gagal mengimpor CSV.',e);}finally{event.target.value='';}}
function newTXT(){let i=1,name='dataset.txt';while(Object.prototype.hasOwnProperty.call(state.files,name))name=`dataset${i++}.txt`;state.files[name]='';state.active=name;state.headers=[];state.rows=[];persist();loadActive(false);setStatus(`✓ ${name} dibuat.`);}
function addRow(){if(!state.headers.length)return showError('Tambahkan data atau kolom terlebih dahulu.');state.rows.push(state.headers.map(()=>''));persist();renderGrid();setStatus('✓ Baris baru ditambahkan.');}
function addColumn(){if(!state.headers.length){state.headers=['Variable1'];state.rows=[];}else state.headers.push(`Variable${state.headers.length+1}`);state.rows.forEach(r=>r.push(''));persist();renderGrid();setStatus('✓ Kolom baru ditambahkan.');}
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
    state.files=files;state.active=target;loadActive(false);$('#datasetNameModal').classList.remove('open');setStatus('Nama dataset diperbarui.');
  }catch(error){box.hidden=false;box.textContent='Nama tidak dapat disimpan. '+error.message;}
}
function deleteDataset() {
  const old=state.active;
  if(!confirm('Hapus dataset “'+old.replace(/\.txt$/i,'')+'” beserta seluruh datanya?'))return;
  const files=Object.fromEntries(Object.entries(state.files).filter(([name])=>name!==old));
  const next=Object.keys(files)[0]||'dataset.txt';
  if(!Object.keys(files).length)files[next]='';
  try{
    localStorage.setItem(FILES_KEY,JSON.stringify(files));localStorage.setItem(ACTIVE_KEY,next);
    state.files=files;state.active=next;loadActive(false);setStatus('Dataset dihapus.'+(Object.keys(files).length===1&&files[next]===''?' Dataset kosong siap digunakan.':''));
  }catch(error){showError('Dataset tidak dapat dihapus.',error);}
}
function placeholder(name){showError(`Fitur ${name} belum tersedia. Tombol berfungsi dan sengaja menampilkan pesan ini.`);}
function populateSelect(id,filterNumeric=false){const el=$(id);if(!el)return;el.innerHTML='';state.headers.forEach((h,i)=>{if(filterNumeric){const vals=state.rows.map(r=>parseNumber(r[i]));if(!vals.some(Number.isFinite))return;}const o=document.createElement('option');o.value=String(i);o.textContent=h;el.appendChild(o);});}
function rakError(text){const box=$('#rakError');if(box){box.hidden=false;box.textContent=`⚠ ${text}`;}setStatus(`⚠ ${text}`);}
function clearRakError(){const box=$('#rakError');if(box){box.hidden=true;box.textContent='';}}

function letterLabel(k){let s='';do{s=String.fromCharCode(97+k%26)+s;k=Math.floor(k/26)-1;}while(k>=0);return s;}
function subset(a,b){for(const v of a)if(!b.has(v))return false;return true;}
function cleanLetterColumns(cols){const unique=[];for(const c of cols){if(!unique.some(u=>u.size===c.size&&subset(c,u)))unique.push(c);}return unique.filter((c,i)=>!unique.some((d,j)=>i!==j&&c.size<d.size&&subset(c,d)));}
function compactLetters(means,significant){const n=means.length;let cols=[new Set(Array.from({length:n},(_,i)=>i))];const pairs=[];for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(significant[i][j])pairs.push([i,j,Math.abs(means[i]-means[j])]);pairs.sort((a,b)=>b[2]-a[2]);for(const [i,j] of pairs){const next=[];for(const col of cols){if(col.has(i)&&col.has(j)){const left=new Set(col),right=new Set(col);left.delete(i);right.delete(j);if(left.size)next.push(left);if(right.size)next.push(right);}else next.push(col);}cols=cleanLetterColumns(next);}cols.sort((a,b)=>Math.max(...[...b].map(i=>means[i]))-Math.max(...[...a].map(i=>means[i])));return means.map((_,i)=>cols.map((c,k)=>c.has(i)?letterLabel(k):'').join(''));}
function shareLetter(a,b){const set=new Set(String(a||'').split(''));return String(b||'').split('').some(x=>set.has(x));}
function safeFilename(value){return String(value||'hasil').replace(/[^a-z0-9._-]+/gi,'-');}

function runRAK(){
  clearRakError();
  $('#rakResult').innerHTML='';
  try{
    if(state.rows.length<2||state.headers.length<3)return rakError('Data RAK belum cukup. Masukkan minimal 2 perlakuan × 2 kelompok dengan peubah respons numerik.');
    const yi=Number($('#rakResponse').value),ti=Number($('#rakTreatment').value),bi=Number($('#rakBlock').value),alpha=Number($('#rakAlpha')?.value||0.05),posthoc=$('#rakPosthoc').value;
    if($('#rakTreatment').value===''||$('#rakBlock').value===''||[yi,ti,bi].some(Number.isNaN)||new Set([yi,ti,bi]).size<3)return rakError('Peubah respons, perlakuan, dan kelompok harus berbeda.');
    if(![0.05,0.01].includes(alpha))return rakError('Pilih taraf nyata BNJ 0.05 atau 0.01.');

    const obs=[];
    for(const [rowIndex,r] of state.rows.entries()){
      const y=parseNumber(r[yi]),t=String(r[ti]??'').trim(),b=String(r[bi]??'').trim();
      if(!r.some(v=>String(v??'').trim()))continue;
      if(t===''||b==='')return rakError(`Perlakuan atau ulangan kosong pada baris ${rowIndex+1}.`);
      if(t!==''&&b!==''&&!Number.isFinite(y))return rakError(`Angka respons pada baris ${rowIndex+1} tidak valid atau kosong. Periksa Pengaturan angka.`);
      if(t!==''&&b!==''&&Number.isFinite(y))obs.push({y,t,b});
    }
    const treatments=[...new Set(obs.map(o=>o.t))],blocks=[...new Set(obs.map(o=>o.b))];
    if(treatments.length<2||blocks.length<2)return rakError('RAK memerlukan sedikitnya 2 taraf perlakuan dan 2 kelompok.');
    if(obs.length!==treatments.length*blocks.length)return rakError(`Data tidak seimbang. Ditemukan ${obs.length} observasi, sedangkan RAK lengkap memerlukan ${treatments.length} × ${blocks.length} = ${treatments.length*blocks.length} observasi.`);

    const keys=new Set(),cellMap=new Map();
    for(const o of obs){const k=`${o.t}\u0000${o.b}`;if(keys.has(k))return rakError(`Terdapat pengamatan ganda untuk perlakuan “${o.t}” pada kelompok “${o.b}”.`);keys.add(k);cellMap.set(k,o.y);}

    const N=obs.length,grand=obs.reduce((s,o)=>s+o.y,0)/N;
    const byT=new Map(),byB=new Map();
    obs.forEach(o=>{byT.set(o.t,(byT.get(o.t)||0)+o.y);byB.set(o.b,(byB.get(o.b)||0)+o.y);});
    const a=treatments.length,b=blocks.length;
    const sst=obs.reduce((s,o)=>s+(o.y-grand)**2,0);
    const ssTr=b*treatments.reduce((s,t)=>s+(byT.get(t)/b-grand)**2,0);
    const ssBl=a*blocks.reduce((s,k)=>s+(byB.get(k)/a-grand)**2,0);
    const sse=sst-ssTr-ssBl;
    const dfTr=a-1,dfBl=b-1,dfE=(a-1)*(b-1),dfTot=N-1;
    const msTr=ssTr/dfTr,msBl=ssBl/dfBl,mse=sse/dfE;
    if(dfE<1||!Number.isFinite(mse)||mse<=0)return rakError('Analisis memerlukan KT galat positif. Periksa struktur dan variasi data.');
    const fTr=msTr/mse,fBl=msBl/mse;
    const fTr05=fCritical(jStat,0.05,dfTr,dfE),fTr01=fCritical(jStat,0.01,dfTr,dfE);
    const fBl05=fCritical(jStat,0.05,dfBl,dfE),fBl01=fCritical(jStat,0.01,dfBl,dfE);
    const treatmentLevel=effectLevel(fTr,fTr05,fTr01),blockLevel=effectLevel(fBl,fBl05,fBl01);
    const selectedFCrit=alpha===0.01?fTr01:fTr05;
    const treatmentSignificant=isSignificantAt(fTr,selectedFCrit);
    const cv=cvPercent(mse,grand);
    const meanValues=treatments.map(t=>byT.get(t)/b);
    const responseName=state.headers[yi]||'Respons';

    const observationRows=treatments.map((t,i)=>`<tr><td>${esc(t)}</td>${blocks.map(block=>`<td>${fmt(cellMap.get(`${t}\u0000${block}`),2)}</td>`).join('')}<td>${fmt(byT.get(t),2)}</td><td>${fmt(meanValues[i],2)}</td></tr>`).join('');
    const blockTotals=blocks.map(block=>byB.get(block));
    const grandTotal=[...byT.values()].reduce((s,x)=>s+x,0);

    let html=`<section class="analysis-result" data-export-scope><h3>Hasil RAK — ${esc(responseName)}</h3>${resultActions(`RAK-${safeFilename(responseName)}`)}<div class="analysis-lead">Data pengamatan ${esc(responseName)} dan sidik ragam disajikan pada Tabel 1 dan Tabel 2.</div><div class="table-caption">Tabel 1. Data Pengamatan ${esc(responseName)} pada Berbagai Perlakuan dan Kelompok</div><table class="result-table observation-table"><thead><tr><th>Perlakuan</th>${blocks.map(block=>`<th>${esc(block)}</th>`).join('')}<th>Total</th><th>Rata-Rata</th></tr></thead><tbody>${observationRows}<tr class="table-total"><td>Total</td>${blockTotals.map(x=>`<td>${fmt(x,2)}</td>`).join('')}<td>${fmt(grandTotal,2)}</td><td>${fmt(grand,2)}</td></tr></tbody></table><div class="table-caption">Tabel 2. Sidik Ragam ${esc(responseName)} pada Berbagai Perlakuan</div><table class="result-table"><thead><tr><th>SK</th><th>db</th><th>JK</th><th>KT</th><th>F. Hitung</th><th>F. Tabel 0.05</th><th>F. Tabel 0.01</th></tr></thead><tbody><tr><td>Perlakuan</td><td>${dfTr}</td><td>${fmt(ssTr)}</td><td>${fmt(msTr)}</td><td>${fmt(fTr)}</td><td>${fmt(fTr05)}</td><td>${fmt(fTr01)}</td></tr><tr><td>Kelompok</td><td>${dfBl}</td><td>${fmt(ssBl)}</td><td>${fmt(msBl)}</td><td>${fmt(fBl)}</td><td>${fmt(fBl05)}</td><td>${fmt(fBl01)}</td></tr><tr><td>Galat</td><td>${dfE}</td><td>${fmt(sse)}</td><td>${fmt(mse)}</td><td>—</td><td>—</td><td>—</td></tr><tr><td>Total</td><td>${dfTot}</td><td>${fmt(sst)}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr></tbody></table><div class="analysis-note"><b>Interpretasi perlakuan:</b> F. Hitung = ${fmt(fTr)}, F. Tabel 0.05 = ${fmt(fTr05)}, dan F. Tabel 0.01 = ${fmt(fTr01)}; pengaruh perlakuan terhadap ${esc(responseName)} adalah <b>${treatmentLevel}</b>.</div><div class="analysis-note"><b>Interpretasi kelompok:</b> F. Hitung = ${fmt(fBl)}, F. Tabel 0.05 = ${fmt(fBl05)}, dan F. Tabel 0.01 = ${fmt(fBl01)}; pengaruh kelompok adalah <b>${blockLevel}</b>. KK = ${fmt(cv,2)}%.</div>`;

    if(treatmentSignificant && posthoc!=='none'){
      const method=posthoc==='bnt'?'BNT':'BNJ';
      let q=NaN;try{q=posthoc==='bnt'?jStat.studentt.inv(1-alpha/2,dfE):jStat.tukey.inv(1-alpha,a,dfE);}catch{}
      if(!Number.isFinite(q)||q<=0)return rakError('Nilai kritis tidak dapat dihitung untuk uji lanjut.');
      const hsd=q*Math.sqrt((posthoc==='bnt'?2:1)*mse/b);
      const significant=Array.from({length:a},()=>Array(a).fill(false));
      for(let i=0;i<a;i++)for(let j=i+1;j<a;j++)significant[i][j]=significant[j][i]=Math.abs(meanValues[i]-meanValues[j])>hsd;
      const notations=compactLetters(meanValues,significant);
      const means=treatments.map((t,i)=>`<tr><td>${esc(t)}</td><td class="posthoc-value">${fmt(meanValues[i],2)}${notations[i]?`<sup>${esc(notations[i])}</sup>`:''}</td></tr>`).join('');
      const high=meanValues.indexOf(Math.max(...meanValues)),low=meanValues.indexOf(Math.min(...meanValues));
      const related=shareLetter(notations[high],notations[low]);
      html+=`<div class="analysis-note"><b>${method} ${alpha*100}%</b>: ${posthoc==='bnt'?'t':'q'} tabel = ${fmt(q)} (k = ${a}, db galat = ${dfE}), SE = ${fmt(Math.sqrt(mse/b))}, nilai ${method} = ${fmt(hsd)}. Huruf superscript yang sama menunjukkan tidak berbeda nyata.</div><div class="table-caption">Tabel 3. Rata-Rata ${esc(responseName)} pada Berbagai Perlakuan</div><table class="result-table posthoc-table"><thead><tr><th>Perlakuan</th><th>${esc(responseName)}</th></tr></thead><tbody>${means}</tbody></table><div class="analysis-note">Rata-rata tertinggi terdapat pada ${esc(treatments[high])} (${fmt(meanValues[high],2)}), sedangkan terendah pada ${esc(treatments[low])} (${fmt(meanValues[low],2)}). Kedua perlakuan tersebut ${related?'masih memiliki huruf yang sama sehingga tidak berbeda nyata':'tidak memiliki huruf yang sama sehingga berbeda nyata'} pada ${method} ${alpha*100}%. Urutan hasil mengikuti urutan perlakuan pada dataset.</div>`;
    }else if(posthoc==='none'){
      html+='<div class="analysis-note">Uji lanjut tidak dilakukan sesuai pilihan Anda.</div>';
      html+=`<table class="result-table posthoc-table"><thead><tr><th>Perlakuan</th><th>${esc(responseName)}</th></tr></thead><tbody>${treatments.map((t,i)=>`<tr><td>${esc(t)}</td><td>${fmt(meanValues[i],2)}</td></tr>`).join('')}</tbody></table>`;
    }else{
      const high=meanValues.indexOf(Math.max(...meanValues)),low=meanValues.indexOf(Math.min(...meanValues));
      html+=`<div class="analysis-note">Pada taraf α = ${fmt(alpha,2)}, F. Hitung perlakuan tidak melebihi F. Tabel yang digunakan sehingga uji lanjut ${posthoc.toUpperCase()} ${alpha*100}% tidak dilakukan. Rata-rata tertinggi (${esc(treatments[high])}: ${fmt(meanValues[high],2)}) dan terendah (${esc(treatments[low])}: ${fmt(meanValues[low],2)}) hanya bersifat deskriptif.</div>${descriptiveMeanChart({labels:treatments,values:meanValues,responseName,figureNo:1,alpha,esc,fmt,method:posthoc.toUpperCase()})}`;
    }

    html+='</section>';
    $('#rakResult').innerHTML=html;
    setStatus(`✓ Analisis RAK ${responseName} selesai.`);
  }catch(e){rakError('Analisis RAK gagal dijalankan.');console.error(e);}
}

function openRAK(){clearError();if(!state.headers.length)return showError('Tidak ada dataset aktif. Masukkan data terlebih dahulu.');populateSelect('#rakResponse',true);populateSelect('#rakTreatment',false);populateSelect('#rakBlock',false);$('#rakTreatment').insertAdjacentHTML('afterbegin','<option value="">Pilih perlakuan</option>');$('#rakTreatment').value='';$('#rakBlock').insertAdjacentHTML('afterbegin','<option value="">Pilih ulangan</option>');$('#rakBlock').value='';$('#rakParameters').innerHTML=state.headers.map((h,i)=>`<label class="ral-check"><input type="checkbox" value="${i}"><span>${esc(h)}</span></label>`).join('');$('#rakResult').innerHTML='';clearRakError();const m=$('#rakModal');m.classList.add('open');}
function closeRAK(){$('#rakModal').classList.remove('open');}
function runRakParameters(){
  const selected=[...document.querySelectorAll('#rakParameters input:checked')].map(el=>el.value);
  $('#rakResult').innerHTML='';clearRakError();
  if(!selected.length)return rakError('Pilih minimal satu parameter.');
  const results=[];
  for(const value of selected){$('#rakResponse').value=value;runRAK();if(!$('#rakError').hidden){$('#rakResult').innerHTML='';return;}results.push($('#rakResult').innerHTML);}
  $('#rakResult').innerHTML=results.join('');
}
function bind(){initNumberSettings();installAnalysisFlow();
$('#renameDataset').addEventListener('click',renameDataset);
$('#deleteDataset').addEventListener('click',deleteDataset);
$('#datasetNameForm').addEventListener('submit',saveDatasetName);
$('#closeDatasetName').addEventListener('click',()=>$('#datasetNameModal').classList.remove('open'));
document.addEventListener('open-analysis-rak',openRAK);
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#datasetNameModal').classList.remove('open');});
installResultExport();$('#openRak')?.addEventListener('click',openRAK);$('#pasteBtn').addEventListener('click',openModal);$('#importBtn').addEventListener('click',()=>$('#file').click());$('#file').addEventListener('change',importCSV);$('#newTxt').addEventListener('click',newTXT);$('#addRow').addEventListener('click',addRow);$('#addCol').addEventListener('click',addColumn);$('#clearData').addEventListener('click',clearData);$('#closeModal').addEventListener('click',closeModal);$('#cancelPaste').addEventListener('click',closeModal);$('#applyPaste').addEventListener('click',applyPasted);$('#pasteArea').addEventListener('input',previewPaste);$('#runRak').addEventListener('click',runRakParameters);$('#closeRak').addEventListener('click',closeRAK);$('#closeRak2').addEventListener('click',closeRAK);$('#outputBtn').addEventListener('click',()=>placeholder('Output'));document.querySelectorAll('[data-menu]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.menu==='Analyze'){openRAK();return;}if(btn.dataset.menu!=='Data')placeholder(btn.dataset.menu);else{clearError();setStatus('✓ Menu Data aktif.');}}));document.querySelectorAll('[data-mobile]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.mobile==='Analyze'){openRAK();return;}if(btn.dataset.mobile!=='Data')placeholder(btn.dataset.mobile);else{clearError();setStatus('✓ Menu Data aktif.');}}));document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeRAK();}});window.addEventListener('error',e=>showError('Terjadi kesalahan JavaScript.',e.error||e.message));window.addEventListener('unhandledrejection',e=>showError('Terjadi kesalahan proses aplikasi.',e.reason));}
try{loadStorage();bind();setStatus('✓ Statistical Web siap digunakan.');}catch(e){showError('Aplikasi gagal diinisialisasi.',e);}
