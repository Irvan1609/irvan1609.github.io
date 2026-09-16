import {parseNumber,getDecimalSeparator,formatNumber} from './number-format.js';

const FILES_KEY='statistical_web_txt_files_v2';
const ACTIVE_KEY='statistical_web_active_txt_v2';
const HISTORY_KEY='statistical_web_dataset_history_v1';
const $=s=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(x,d=3)=>formatNumber(x,d);

function dataset(){
  return {name:$('#activeFile')?.textContent||'dataset.txt',headers:[...document.querySelectorAll('.data-grid thead th')].slice(1).map(th=>th.querySelector('.header-name')?.textContent?.trim()||th.textContent.trim()),rows:[...document.querySelectorAll('.data-grid tbody tr')].map(tr=>[...tr.cells].slice(1).map(td=>td.textContent))};
}
function openTool(title,html){$('#dataToolTitle').textContent=title;$('#dataToolBody').innerHTML=html;$('#dataToolModal').classList.add('open');}
function downloadBlob(buffer,name,type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){
  const url=URL.createObjectURL(new Blob([buffer],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function safeName(x){return String(x||'dataset').replace(/\.txt$/i,'').replace(/[^a-z0-9._-]+/gi,'-');}
function numericColumns(data){return data.headers.map((h,i)=>({h,i,values:data.rows.map(r=>parseNumber(r[i]))})).filter(c=>c.values.filter(Number.isFinite).length===data.rows.length&&data.rows.length>0);}

function currentSnapshot(){
  let files='{}',active='dataset.txt';try{files=localStorage.getItem(FILES_KEY)||'{}';active=localStorage.getItem(ACTIVE_KEY)||'dataset.txt';}catch{}
  return {files,active};
}
function loadHistory(){try{const h=JSON.parse(sessionStorage.getItem(HISTORY_KEY)||'null');if(h&&Array.isArray(h.items)&&Number.isInteger(h.index))return h;}catch{}return {items:[],index:-1};}
function saveHistory(h){try{sessionStorage.setItem(HISTORY_KEY,JSON.stringify(h));}catch{}}
function sameSnapshot(a,b){return a&&b&&a.files===b.files&&a.active===b.active;}
function captureSnapshot(){
  const snap=currentSnapshot(),h=loadHistory(),current=h.items[h.index];if(sameSnapshot(snap,current)){updateUndoButtons();return;}
  h.items=h.items.slice(0,h.index+1);h.items.push(snap);if(h.items.length>30)h.items.shift();h.index=h.items.length-1;saveHistory(h);updateUndoButtons();
}
function restoreSnapshot(index){
  const h=loadHistory(),snap=h.items[index];if(!snap)return;
  try{localStorage.setItem(FILES_KEY,snap.files);localStorage.setItem(ACTIVE_KEY,snap.active);h.index=index;saveHistory(h);location.reload();}catch{}
}
function undo(){const h=loadHistory();if(h.index>0)restoreSnapshot(h.index-1);}
function redo(){const h=loadHistory();if(h.index<h.items.length-1)restoreSnapshot(h.index+1);}
function updateUndoButtons(){const h=loadHistory();const u=$('#undoData'),r=$('#redoData');if(u)u.disabled=h.index<=0;if(r)r.disabled=h.index<0||h.index>=h.items.length-1;}

function detectRoles(data){
  const numeric=numericColumns(data),numericSet=new Set(numeric.map(x=>x.i));
  const categorical=data.headers.map((h,i)=>({h,i,values:data.rows.map(r=>String(r[i]??'').trim())})).filter(c=>!numericSet.has(c.i));
  let treatment=categorical.find(c=>/(perlakuan|treatment|genotip|variet|faktor\s*a)/i.test(c.h))||categorical[0]||null;
  const reps=numeric.filter(c=>{
    const v=c.values,levels=[...new Set(v)].sort((a,b)=>a-b);return levels.length>=2&&levels.length<=20&&levels.every((x,i)=>Number.isInteger(x)&&x===i+1);
  });
  let replicate=reps.find(c=>/(ulangan|kelompok|blok|block|rep)/i.test(c.h))||reps[0]||null;
  return {treatment,replicate,numeric};
}
function validateDataset(){
  const data=dataset();if(!data.headers.length)return openTool('Validasi dataset','<p>Dataset belum memiliki kolom.</p>');
  const duplicateHeaders=data.headers.filter((h,i)=>data.headers.indexOf(h)!==i),blankRows=data.rows.map((r,i)=>r.every(v=>!String(v).trim())?i+1:null).filter(Boolean);
  const duplicateRows=[];const seen=new Map();data.rows.forEach((r,i)=>{const k=JSON.stringify(r.map(v=>String(v).trim()));if(seen.has(k))duplicateRows.push([seen.get(k)+1,i+1]);else seen.set(k,i);});
  const missing=[];data.rows.forEach((r,i)=>r.forEach((v,j)=>{if(String(v??'').trim()==='')missing.push({row:i+1,col:j});}));
  const roles=detectRoles(data),numeric=roles.numeric;
  let completeness='';
  if(roles.treatment&&roles.replicate){
    const t=[...new Set(roles.treatment.values.filter(Boolean))],r=[...new Set(roles.replicate.values.map(String))];
    const counts=t.map(tv=>r.map(rv=>data.rows.filter(row=>String(row[roles.treatment.i]??'').trim()===tv&&String(row[roles.replicate.i]??'').trim()===rv).length));
    completeness=`<h4>Kelengkapan ${esc(roles.treatment.h)} × ${esc(roles.replicate.h)}</h4><div class="table-scroll"><table class="result-table"><thead><tr><th>${esc(roles.treatment.h)}</th>${r.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${t.map((tv,i)=>`<tr><td>${esc(tv)}</td>${counts[i].map(n=>`<td${n!==1?' style="font-weight:700;background:#fff0f0"':''}>${n}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const issues=[];
  if(duplicateHeaders.length)issues.push(`Judul kolom ganda: ${[...new Set(duplicateHeaders)].join(', ')}`);
  if(blankRows.length)issues.push(`${blankRows.length} baris kosong penuh.`);
  if(missing.length)issues.push(`${missing.length} sel kosong.`);
  if(duplicateRows.length)issues.push(`${duplicateRows.length} baris duplikat penuh.`);
  const summary=`<div class="analysis-note"><b>${data.rows.length}</b> baris × <b>${data.headers.length}</b> kolom. Kolom numerik lengkap: <b>${numeric.length}</b>. ${roles.treatment?`Perlakuan terdeteksi: <b>${esc(roles.treatment.h)}</b>.`:''} ${roles.replicate?`Ulangan/kelompok terdeteksi: <b>${esc(roles.replicate.h)}</b>.`:''}</div>`;
  openTool('Validasi dataset',summary+(issues.length?`<div class="error-box"><b>${issues.length} kelompok masalah:</b><ul>${issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'<div class="analysis-note"><b>Tidak ditemukan masalah struktur dasar.</b></div>')+completeness+`<h4>Kolom numerik</h4><p>${numeric.length?numeric.map(x=>esc(x.h)).join(' · '):'Tidak ada kolom numerik lengkap.'}</p>`);
}

function boxCox(values){
  if(values.some(v=>!(v>0)))throw Error('Box–Cox hanya dapat digunakan untuk nilai > 0.');
  const logs=values.map(Math.log),sumLog=logs.reduce((a,b)=>a+b,0);let best={lambda:1,ll:-Infinity,values};
  for(let k=-40;k<=40;k++){
    const lambda=k/20,trans=values.map(v=>Math.abs(lambda)<1e-9?Math.log(v):(v**lambda-1)/lambda),m=trans.reduce((a,b)=>a+b,0)/trans.length,sse=trans.reduce((s,v)=>s+(v-m)**2,0);
    const ll=-(values.length/2)*Math.log(Math.max(sse/values.length,Number.MIN_VALUE))+(lambda-1)*sumLog;
    if(ll>best.ll)best={lambda,ll,values:trans};
  }
  return best;
}
function transformValues(values,method){
  if(method==='sqrt')return {values:values.map(v=>{if(v<0)throw Error('√x memerlukan nilai ≥ 0.');return Math.sqrt(v);}),suffix:'sqrt'};
  if(method==='sqrt05')return {values:values.map(v=>{if(v<-.5)throw Error('√(x+0,5) memerlukan x ≥ -0,5.');return Math.sqrt(v+.5);}),suffix:'sqrt05'};
  if(method==='log10')return {values:values.map(v=>{if(v<=0)throw Error('log10(x) memerlukan nilai > 0.');return Math.log10(v);}),suffix:'log10'};
  if(method==='ln')return {values:values.map(v=>{if(v<=0)throw Error('ln(x) memerlukan nilai > 0.');return Math.log(v);}),suffix:'ln'};
  if(method==='log1')return {values:values.map(v=>{if(v<=-1)throw Error('log10(x+1) memerlukan x > -1.');return Math.log10(v+1);}),suffix:'log10p1'};
  if(method==='arcsin')return {values:values.map(v=>{if(v<0||v>100)throw Error('Arcsin √(p/100) memerlukan persentase 0–100.');return Math.asin(Math.sqrt(v/100));}),suffix:'arcsin'};
  if(method==='boxcox'){const b=boxCox(values);return {values:b.values,suffix:`boxcox_${b.lambda.toFixed(2)}`,lambda:b.lambda};}
  throw Error('Metode transformasi tidak dikenal.');
}
function transformationTool(){
  const data=dataset(),num=numericColumns(data);if(!num.length)return openTool('Transformasi data','<p>Tidak ada kolom numerik lengkap yang dapat ditransformasi.</p>');
  openTool('Transformasi data',`<p>Data asli tidak diubah. Sistem membuat <b>dataset baru</b> dengan kolom transformasi tambahan.</p><label>Metode<select id="transformMethod"><option value="sqrt">√x</option><option value="sqrt05">√(x + 0,5)</option><option value="log10">log10(x)</option><option value="ln">ln(x)</option><option value="log1">log10(x + 1)</option><option value="arcsin">arcsin √(p/100)</option><option value="boxcox">Box–Cox (λ otomatis)</option></select></label><div class="ral-title">Parameter</div><div id="transformColumns" class="ral-list">${num.map(c=>`<label class="ral-check"><input type="checkbox" value="${c.i}" checked> ${esc(c.h)}</label>`).join('')}</div><p id="transformStatus" role="status"></p><button id="applyTransform" class="primary">Buat dataset transformasi</button>`);
  $('#applyTransform').onclick=()=>{try{
    const selected=[...document.querySelectorAll('#transformColumns input:checked')].map(x=>Number(x.value));if(!selected.length)throw Error('Pilih minimal satu parameter.');
    const headers=[...data.headers],rows=data.rows.map(r=>[...r]),notes=[];
    for(const i of selected){const values=data.rows.map(r=>parseNumber(r[i])),out=transformValues(values,$('#transformMethod').value),colName=`${data.headers[i]}_${out.suffix}`;headers.push(colName);out.values.forEach((v,row)=>rows[row].push(String(v).replace('.',getDecimalSeparator())));if(out.lambda!==undefined)notes.push(`${data.headers[i]}: λ=${out.lambda.toFixed(2)}`);}
    document.dispatchEvent(new CustomEvent('dataset-import',{detail:{name:safeName(data.name)+'-transformasi',headers,rows}}));$('#dataToolModal').classList.remove('open');const s=$('#status');if(s)s.textContent=`✓ Dataset transformasi dibuat.${notes.length?' '+notes.join('; '):''}`;
  }catch(e){$('#transformStatus').textContent=e.message;}};
}

function transpose(A){return A[0].map((_,j)=>A.map(r=>r[j]));}
function dot(a,b){return a.reduce((s,v,i)=>s+v*b[i],0);}
function solve(A,b){const n=A.length,M=A.map((r,i)=>[...r,b[i]]);for(let k=0;k<n;k++){let p=k;for(let i=k+1;i<n;i++)if(Math.abs(M[i][k])>Math.abs(M[p][k]))p=i;if(Math.abs(M[p][k])<1e-12)throw Error('Prediktor mengalami multikolinearitas sempurna.');[M[k],M[p]]=[M[p],M[k]];const d=M[k][k];for(let j=k;j<=n;j++)M[k][j]/=d;for(let i=0;i<n;i++)if(i!==k){const f=M[i][k];for(let j=k;j<=n;j++)M[i][j]-=f*M[k][j];}}return M.map(r=>r[n]);}
function inverse(A){const I=A.map((_,i)=>A.map((_,j)=>+(i===j)));return transpose(I).map(col=>solve(A,col));}
function outlierDiagnostics(){
  const data=dataset(),num=numericColumns(data);if(num.length<2)return openTool('Diagnostik pencilan','<p>Diperlukan minimal dua kolom numerik lengkap.</p>');
  openTool('Diagnostik pencilan',`<label>Respons (Y)<select id="outlierY">${num.map(c=>`<option value="${c.i}">${esc(c.h)}</option>`).join('')}</select></label><div class="ral-title">Prediktor (X)</div><div id="outlierX" class="ral-list"></div><p class="form-help">Penanda: |studentized residual| &gt; 2; leverage &gt; 2p/n; Cook's D &gt; 4/n. Sistem hanya memberi peringatan dan tidak menghapus data.</p><button id="runOutlier" class="primary">Periksa pencilan</button><div id="outlierResult"></div>`);
  const sync=()=>{$('#outlierX').innerHTML=num.filter(c=>String(c.i)!==$('#outlierY').value).map(c=>`<label class="ral-check"><input type="checkbox" value="${c.i}" checked> ${esc(c.h)}</label>`).join('');};$('#outlierY').onchange=sync;sync();
  $('#runOutlier').onclick=()=>{try{
    const yi=Number($('#outlierY').value),xs=[...document.querySelectorAll('#outlierX input:checked')].map(x=>Number(x.value));if(!xs.length)throw Error('Pilih minimal satu prediktor X.');
    const y=data.rows.map(r=>parseNumber(r[yi])),X=data.rows.map(r=>[1,...xs.map(i=>parseNumber(r[i]))]),n=y.length,p=X[0].length;if(n<=p+2)throw Error('Jumlah pengamatan terlalu sedikit untuk diagnostik regresi.');
    const Xt=transpose(X),XtX=Xt.map(a=>Xt.map(b=>dot(a,b))),inv=inverse(XtX),beta=inv.map(row=>dot(row,Xt.map(col=>dot(col,y)))),fit=X.map(r=>dot(r,beta)),res=y.map((v,i)=>v-fit[i]),sse=res.reduce((s,v)=>s+v*v,0),mse=sse/(n-p),lev=X.map(r=>dot(r,inv.map(row=>dot(row,r))));
    const rows=res.map((e,i)=>{const h=lev[i],stud=e/Math.sqrt(Math.max(Number.MIN_VALUE,mse*(1-h))),cook=e*e/(p*mse)*h/Math.max(Number.MIN_VALUE,(1-h)**2),flag=Math.abs(stud)>2||h>2*p/n||cook>4/n;return {i,stud,h,cook,flag};});
    const flagged=rows.filter(r=>r.flag);$('#outlierResult').innerHTML=`<div class="analysis-note"><b>${flagged.length}</b> dari ${n} baris melewati minimal satu ambang diagnostik. Ini adalah sinyal pemeriksaan, bukan perintah menghapus data.</div><div class="table-scroll"><table class="result-table"><thead><tr><th>Baris</th><th>Studentized residual</th><th>Leverage</th><th>Cook's D</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr${r.flag?' style="font-weight:700"':''}><td>${r.i+1}</td><td>${fmt(r.stud)}</td><td>${fmt(r.h)}</td><td>${fmt(r.cook)}</td><td>${r.flag?'Periksa':'—'}</td></tr>`).join('')}</tbody></table></div>`;
  }catch(e){$('#outlierResult').innerHTML=`<div class="error-box">${esc(e.message)}</div>`;}};
}

function hashSeed(text){let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function rng(seed){let a=hashSeed(seed);return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function shuffle(a,random){for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function parseLevels(text,prefix,min=2){const v=String(text).split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean);if(v.length>=min)return [...new Set(v)];return Array.from({length:min},(_,i)=>`${prefix}${i+1}`);}
function buildFieldbook(design,A,B,reps,seed){
  const random=rng(seed),rows=[];let plot=1;
  if(design==='ral'){const units=[];for(let r=1;r<=reps;r++)for(const a of A)units.push([r,a]);shuffle(units,random).forEach(([r,a])=>rows.push([plot++,r,a]));return {headers:['Petak','Ulangan','Perlakuan'],rows};}
  if(design==='rak'){for(let r=1;r<=reps;r++)for(const a of shuffle([...A],random))rows.push([plot++,r,a]);return {headers:['Petak','Kelompok','Perlakuan'],rows};}
  if(design==='fral'){const units=[];for(let r=1;r<=reps;r++)for(const a of A)for(const b of B)units.push([r,a,b]);shuffle(units,random).forEach(([r,a,b])=>rows.push([plot++,r,a,b,`${a}×${b}`]));return {headers:['Petak','Ulangan','Faktor A','Faktor B','Kombinasi'],rows};}
  if(design==='frak'){for(let r=1;r<=reps;r++){const combos=[];for(const a of A)for(const b of B)combos.push([a,b]);for(const [a,b] of shuffle(combos,random))rows.push([plot++,r,a,b,`${a}×${b}`]);}return {headers:['Petak','Kelompok','Faktor A','Faktor B','Kombinasi'],rows};}
  if(design==='split'){for(let r=1;r<=reps;r++){let main=1;for(const a of shuffle([...A],random)){for(const b of shuffle([...B],random))rows.push([plot++,r,main,a,b]);main++;}}return {headers:['Petak','Kelompok','Petak Utama','Faktor A','Faktor B'],rows};}
  throw Error('Rancangan tidak dikenal.');
}
function fieldbookTool(){
  openTool('Randomisasi & fieldbook',`<div class="form-grid"><label>Rancangan<select id="fieldDesign"><option value="ral">RAL</option><option value="rak">RAK</option><option value="fral">Faktorial RAL</option><option value="frak">Faktorial RAK</option><option value="split">RPT / split-plot</option></select></label><label>Ulangan / kelompok<input id="fieldRep" type="number" min="2" max="20" value="3"></label></div><label>Perlakuan / Faktor A<textarea id="fieldA" rows="3">P0, P1, P2, P3</textarea></label><label id="fieldBWrap" hidden>Faktor B<textarea id="fieldB" rows="3">B0, B1</textarea></label><label>Seed randomisasi<input id="fieldSeed" value="2026"></label><div class="dataset-actions"><button id="previewFieldbook">Randomisasi</button><button id="createFieldbook" class="primary">Buat dataset fieldbook</button><button id="downloadFieldbook">Unduh .xlsx</button></div><div id="fieldResult"></div>`);
  let current=null;const sync=()=>{$('#fieldBWrap').hidden=!['fral','frak','split'].includes($('#fieldDesign').value);current=null;$('#fieldResult').innerHTML='';};$('#fieldDesign').onchange=sync;sync();
  const make=()=>{const d=$('#fieldDesign').value,reps=Number($('#fieldRep').value);if(!Number.isInteger(reps)||reps<2)throw Error('Ulangan/kelompok minimal 2.');const A=parseLevels($('#fieldA').value,'A'),B=parseLevels($('#fieldB').value,'B'),out=buildFieldbook(d,A,B,reps,$('#fieldSeed').value);current=out;$('#fieldResult').innerHTML=`<div class="analysis-note">${out.rows.length} petak berhasil dirandomisasi. Simpan seed jika ingin menghasilkan randomisasi yang sama.</div><div class="table-scroll"><table class="result-table"><thead><tr>${out.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${out.rows.slice(0,30).map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;return out;};
  $('#previewFieldbook').onclick=()=>{try{make();}catch(e){$('#fieldResult').innerHTML=`<div class="error-box">${esc(e.message)}</div>`;}};
  $('#createFieldbook').onclick=()=>{try{const out=current||make();document.dispatchEvent(new CustomEvent('dataset-import',{detail:{name:`fieldbook-${$('#fieldDesign').value}`,headers:out.headers,rows:out.rows.map(r=>r.map(String))}}));$('#dataToolModal').classList.remove('open');}catch(e){$('#fieldResult').innerHTML=`<div class="error-box">${esc(e.message)}</div>`;}};
  $('#downloadFieldbook').onclick=async()=>{try{const out=current||make(),{default:ExcelJS}=await import('exceljs'),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Fieldbook');sheet.addRow(out.headers);out.rows.forEach(r=>sheet.addRow(r));sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];sheet.columns.forEach(c=>c.width=18);downloadBlob(await book.xlsx.writeBuffer(),`fieldbook-${$('#fieldDesign').value}.xlsx`);}catch(e){$('#fieldResult').innerHTML=`<div class="error-box">${esc(e.message)}</div>`;}};
}

function duplicateDataset(){const data=dataset();if(!data.headers.length)return;document.dispatchEvent(new CustomEvent('dataset-import',{detail:{name:safeName(data.name)+'-copy',headers:[...data.headers],rows:data.rows.map(r=>[...r])}}));}

export function installDataEnhancements(){
  const toolbar=$('.toolbar');if(!toolbar||$('#validateDataset'))return;
  toolbar.insertAdjacentHTML('beforeend','<button id="undoData">Undo</button><button id="redoData">Redo</button><button id="validateDataset">Validasi dataset</button><button id="transformData">Transformasi</button><button id="outlierData">Diagnostik pencilan</button><button id="duplicateDataset">Duplikat dataset</button><button id="fieldbookTool">Randomisasi / fieldbook</button>');
  $('#undoData').onclick=undo;$('#redoData').onclick=redo;$('#validateDataset').onclick=validateDataset;$('#transformData').onclick=transformationTool;$('#outlierData').onclick=outlierDiagnostics;$('#duplicateDataset').onclick=duplicateDataset;$('#fieldbookTool').onclick=fieldbookTool;
  let timer=null;const schedule=()=>{clearTimeout(timer);timer=setTimeout(captureSnapshot,120);};
  captureSnapshot();document.addEventListener('input',schedule,true);document.addEventListener('change',schedule,true);document.addEventListener('dataset-import',schedule);document.addEventListener('submit',schedule,true);document.addEventListener('click',event=>{if(event.target.closest('[data-delete-row],[data-delete-column],#clearData,#deleteDataset,#applyPaste,#newTxt'))schedule();},true);
  const tree=$('#fileTree'),grid=$('#gridWrap');if(tree)new MutationObserver(schedule).observe(tree,{childList:true,subtree:true});if(grid)new MutationObserver(schedule).observe(grid,{childList:true,subtree:true});
  document.addEventListener('keydown',event=>{const mod=event.ctrlKey||event.metaKey;if(!mod)return;if(event.key.toLowerCase()==='z'&&!event.shiftKey){event.preventDefault();undo();}else if(event.key.toLowerCase()==='y'||(event.key.toLowerCase()==='z'&&event.shiftKey)){event.preventDefault();redo();}});
  updateUndoButtons();
}
