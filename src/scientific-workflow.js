import {readDataset,openTool} from './data-tools.js';
import {parseNumber,getDecimalSeparator} from './number-format.js';
import {validateData,analyzeParameter,designStructure} from './statistics-engine.js';
import {plannedContrastsFlexible} from './planned-contrasts.js';
import {finalizeAgronomyFactorial} from './agronomy-factorial.js';
import {renderReport,esc,designNames,installChartDownload} from './scientific-report.js';
import {renderAnalysisSummary} from './report-insights.js';
import {inspectDataQuality,renderDataQuality} from './data-quality.js';
import {backupRawDataset,installDriveBackup} from './drive-backup.js';
import {transformationOptions,transformObservations} from './data-transform.js';
import {treatmentMetadataKey,readTreatmentMetadata,saveTreatmentMetadata} from './treatment-metadata.js';
import {readCategoryMetadata,categoryLevelDescription} from './category-metadata.js';
import {auditReports,renderAudit} from './analysis-audit.js';
const $=s=>document.querySelector(s),HISTORY='statistical_web_analysis_history_v1';
function phoneGuardMode(){
  return globalThis.matchMedia?.('(max-width: 720px) and (pointer: coarse)')?.matches
    || globalThis.matchMedia?.('(max-width: 720px)')?.matches
    || false;
}
let currentDesign='ral',data=null,revision=0;
function showResults(reports,container,datasetName=reports[0]?.datasetName||'hasil-analisis'){
  container.innerHTML='<div class="result-actions master-result-actions"><button data-result-action="export-all">Ekspor semua parameter (.xlsx)</button><button data-result-action="export-all-formula">ƒx Ekspor semua (formula)</button><button type="button" data-print-results>Cetak / PDF</button><button type="button" data-thesis-check>Periksa hasil</button><span role="status" class="export-status"></span></div><div data-thesis-audit-host></div>'+renderAnalysisSummary(reports)+reports.map(renderReport).join('');
  container.dataset.datasetName=datasetName;
  container.querySelectorAll('[data-export-scope]').forEach(scope=>scope.dataset.datasetName=datasetName);
  const printButton=container.querySelector('[data-print-results]');
  if(printButton)printButton.onclick=()=>{
    document.body.classList.add('print-analysis-mode');
    const clean=()=>document.body.classList.remove('print-analysis-mode');
    window.addEventListener('afterprint',clean,{once:true});window.print();setTimeout(clean,1500);
  };
  const auditButton=container.querySelector('[data-thesis-check]'),host=container.querySelector('[data-thesis-audit-host]');
  if(auditButton&&host)auditButton.onclick=()=>{
    const audit=auditReports(reports);
    host.innerHTML=renderAudit(audit);
    auditButton.textContent=audit.status==='Siap digunakan'?'✓ Periksa hasil: aman':audit.status==='Perlu diperiksa'?'! Periksa hasil: cek lagi':'✕ Periksa hasil: ada masalah';
    host.scrollIntoView({behavior:'smooth',block:'start'});
  };
}
function getHistory(){try{const items=JSON.parse(localStorage.getItem(HISTORY)||'[]');return Array.isArray(items)?items.filter(x=>x.version===1&&Array.isArray(x.reports)):[];}catch{return [];}}
function saveHistory(reports,options){
  const entry={id:crypto.randomUUID(),version:1,date:new Date().toISOString(),dataset:data.name,design:currentDesign,options,separator:getDecimalSeparator(),reports};
  try{localStorage.setItem(HISTORY,JSON.stringify([entry,...getHistory()].slice(0,20)));return true;}catch{return false;}
}
function history(){
  const entries=getHistory();openTool('Riwayat analisis',entries.length?'<p>Saya simpan sampai 20 analisis terakhir di browser ini. Kalau perlu dipindahkan ke perangkat lain, hasilnya bisa diekspor.</p><div id="historyList"></div><div id="historyResult" data-all-results></div>':'<p>Belum ada riwayat analisis.</p>');
  if(!entries.length)return;
  $('#historyList').innerHTML=entries.map(e=>`<div class="history-row"><button data-history-open="${esc(e.id)}">${esc(e.dataset)} — ${esc(designNames[e.design])} · ${new Date(e.date).toLocaleString('id-ID')}</button><button data-history-delete="${esc(e.id)}" aria-label="Hapus riwayat">Hapus</button></div>`).join('');
  $('#historyList').onclick=event=>{const open=event.target.closest('[data-history-open]'),del=event.target.closest('[data-history-delete]');
    if(open){const entry=entries.find(e=>e.id===open.dataset.historyOpen);try{showResults(entry.reports,$('#historyResult'),entry.dataset);}catch{$('#historyResult').textContent='Riwayat tidak dapat dibaca.';}}
    if(del&&confirm('Hapus hasil analisis ini dari riwayat?')){try{localStorage.setItem(HISTORY,JSON.stringify(entries.filter(e=>e.id!==del.dataset.historyDelete)));history();}catch{$('#historyResult').textContent='Riwayat tidak dapat dihapus.';}}
  };
}
function options(){
  const read=id=>$(id).value===''?null:Number($(id).value);
  const parameters=[...document.querySelectorAll('#scienceParameters input:checked')].map(x=>Number(x.value));
  const transforms=Object.fromEntries([...document.querySelectorAll('[data-transform-param]')].map(select=>[Number(select.dataset.transformParam),select.value]));
  return {design:currentDesign,a:read('#scienceA'),b:read('#scienceB'),rep:read('#scienceRep'),parameters,transforms,alpha:Number($('#scienceAlpha').value),posthoc:$('#sciencePosthoc').value,assumptions:$('#scienceAssumptions').checked,contrastMode:$('#scienceContrastMode').value,contrasts:[],levels:[]};
}
function columnValues(index){return data.rows.map(row=>String(row[index]??'').trim()).filter(Boolean);}
function isNumericColumn(index){const values=columnValues(index);return values.length>0&&values.every(value=>Number.isFinite(parseNumber(value)));}
function selectedColumnIndexes(){
  return String(document.documentElement.dataset.statSelectedColumns||'').split(',').map(Number).filter(index=>Number.isInteger(index)&&index>=0&&index<data.headers.length);
}
function detectTreatmentColumn(){
  const categorical=data.headers.map((_,i)=>i).filter(i=>columnValues(i).length&&!isNumericColumn(i));
  if(!categorical.length)return null;
  const hinted=categorical.find(i=>/(^|\b)(perlakuan|treatment|genotip|genotype|varietas|variety|kode)(\b|$)/i.test(String(data.headers[i]??'')));
  if(hinted!==undefined)return hinted;
  return categorical.includes(0)?0:categorical[0];
}
function replicateProfile(index){
  const values=columnValues(index),numbers=values.map(parseNumber);
  if(!values.length||numbers.some(x=>!Number.isInteger(x)||x<1))return null;
  const levels=[...new Set(numbers)].sort((a,b)=>a-b);
  if(levels.length<2||levels.length>20||levels[0]!==1||levels.some((x,i)=>x!==i+1))return null;
  const counts=levels.map(level=>numbers.filter(x=>x===level).length);
  if(counts.some(n=>n<2||n!==counts[0]))return null;
  return {index,levels:levels.length};
}
function detectReplicateColumn(excluded=[]){
  const blocked=new Set(excluded.filter(i=>i!==null));
  const candidates=data.headers.map((_,i)=>i).filter(i=>!blocked.has(i)).map(replicateProfile).filter(Boolean);
  if(!candidates.length)return null;
  const hinted=candidates.find(item=>/(^|\b)(ulangan|rep|replicate|replication|kelompok|blok|block)(\b|$)/i.test(String(data.headers[item.index]??'')));
  if(hinted)return hinted.index;
  candidates.sort((a,b)=>a.levels-b.levels||a.index-b.index);
  return candidates[0].index;
}
function detectSecondFactorColumn(excluded=[]){
  const blocked=new Set(excluded.filter(i=>i!==null));
  const candidates=data.headers.map((_,i)=>i).filter(i=>!blocked.has(i)&&columnValues(i).length&&!isNumericColumn(i));
  if(!candidates.length)return null;
  const hinted=candidates.find(i=>/(^|\b)(faktor\s*b|factor\s*b|sub\s*plot|anak\s*petak)(\b|$)/i.test(String(data.headers[i]??'')));
  return hinted??candidates[0];
}
function roleIndices(){return new Set([$('#scienceA').value,$('#scienceB').value,$('#scienceRep').value].filter(value=>value!=='').map(Number));}
function updateScienceParameterCount(){
  const target=$('#scienceParameterCount');if(!target)return;
  const inputs=[...document.querySelectorAll('#scienceParameters input')],available=inputs.filter(input=>!input.disabled),selected=available.filter(input=>input.checked);
  target.textContent=selected.length?`${selected.length}/${available.length}`:'0 dipilih';
  target.dataset.empty=selected.length?'false':'true';
}
function syncParameterRoleExclusions(initial=false){
  const roles=roleIndices();
  document.querySelectorAll('#scienceParameters input').forEach(input=>{
    const index=Number(input.value),isRole=roles.has(index);
    input.disabled=isRole;
    if(isRole)input.checked=false;
    else if(initial)input.checked=isNumericColumn(index);
    const transform=document.querySelector(`[data-transform-param="${index}"]`);
    if(transform)transform.disabled=isRole||!input.checked;
  });
  updateScienceParameterCount();
}
function levelsForA(){if($('#scienceA').value==='')return [];const i=Number($('#scienceA').value);return [...new Set(data.rows.map(r=>String(r[i]??'').trim()).filter(Boolean))];}

function levelsForColumn(index){
  if(index===null||index===undefined||!Number.isInteger(index))return [];
  return [...new Set(data.rows.map(row=>String(row[index]??'').trim()).filter(Boolean))];
}
function metadataStoreKey(){
  const a=$('#scienceA').value===''?null:Number($('#scienceA').value),b=$('#scienceB').value===''?null:Number($('#scienceB').value);
  return treatmentMetadataKey(data?.name,data?.headers?.[a]||'',b===null?'':data?.headers?.[b]||'');
}
function collectTreatmentMetadata(){
  const a=$('#scienceA').value===''?null:Number($('#scienceA').value),b=$('#scienceB').value===''?null:Number($('#scienceB').value);
  const saved=readTreatmentMetadata(metadataStoreKey())||{},factorLabels={a:'',b:''},levels={a:{},b:{}};
  const apply=(axis,index)=>{
    if(index===null)return;
    factorLabels[axis]=saved.factorLabels?.[axis]||data.headers[index]||'';
    const editor=readCategoryMetadata(data.name,data.headers[index]);
    for(const level of levelsForColumn(index)){
      const editorValue=categoryLevelDescription(editor.levels?.[level],editor.unit),legacy=saved.levels?.[axis]?.[level]||'';
      if(editorValue||legacy)levels[axis][level]=editorValue||legacy;
    }
  };
  apply('a',a);apply('b',b);
  return {factorLabels,levels};
}

function parseCustomContrasts(){
  const text=$('#scienceContrastText')?.value??'';
  return text.trim().split(/\r?\n/).filter(line=>line.trim()).map((line,index)=>{
    const [name,...coefficients]=line.split(';');
    return {name:name.trim()||`Kontras ${index+1}`,coefficients:coefficients.map(value=>parseNumber(value.trim()))};
  });
}
function validateCustomContrasts(check,o){
  const contrasts=parseCustomContrasts();
  const levels=levelsForA();
  const items=levels.map(level=>({label:level,n:check.observations.filter(obs=>obs.a===level).length,mean:0}));
  const evaluated=plannedContrastsFlexible(items,contrasts,1,Math.max(1,check.observations.length-levels.length));
  o.contrasts=contrasts;
  return evaluated;
}
function contrastFields(){
  const mode=$('#scienceContrastMode').value,levels=levelsForA(),container=$('#scienceContrastFields');
  if(mode==='none'){container.innerHTML='';return;}
  if(!levels.length){container.innerHTML='<p>Pilih kolom perlakuan terlebih dahulu.</p>';return;}
  container.innerHTML=mode==='polynomial'?`<p>Masukkan nilai dosis/tingkat kuantitatif sesuai setiap taraf. Satuan harus sama.</p>${levels.map((level,i)=>`<label>${esc(level)} <input data-level="${i}" placeholder="Nilai kuantitatif" inputmode="decimal"></label>`).join('')}`:`<p><b>Urutan koefisien:</b> ${levels.map(esc).join(' ; ')}.</p><p>Masukkan satu kontras per baris dengan format <b>nama; koefisien 1; koefisien 2; …</b>. Jumlah koefisien pada setiap baris harus nol. Beberapa kontras boleh tidak ortogonal; setiap p-value dilaporkan terpisah tanpa koreksi multipel.</p><textarea id="scienceContrastText" rows="6" placeholder="Kontrol vs Semuanya;-5;1;1;1;1;1\nKontrol vs Mulsa Kulit Kakao;-2;1;1;0;0;0\nMulsa Kulit Kakao Tanpa Fermentasi vs Dengan Fermentasi;0;-1;1;0;-1;1"></textarea><p class="form-help">Gunakan tombol <b>Periksa data & kontras</b> sebelum menjalankan analisis. Sistem akan memeriksa jumlah koefisien, jumlah koefisien = 0, dan hubungan ortogonal antar-kontras.</p>`;
}
function structureHtml(check,o){
  if(check.issues.length||!check.observations.length)return '';
  const s=designStructure(check.observations,o);
  const df=s.terms.map(term=>`<span><b>${esc(term.label)}</b>: ${term.df}</span>`).join('');
  const factors=[`<span><b>Unit</b>: ${s.N}</span>`,`<span><b>Faktor A/Perlakuan</b>: ${s.factorA} taraf</span>`];
  if(s.factorB!==null)factors.push(`<span><b>Faktor B</b>: ${s.factorB} taraf</span>`);
  factors.push(`<span><b>${['rak','frak','split'].includes(o.design)?'Kelompok':'Ulangan'}</b>: ${s.replicates}</span>`);
  const status=s.ready?'<strong class="structure-ok">✓ Struktur layak dianalisis</strong>':'<strong class="structure-warn">Periksa struktur rancangan</strong>';
  return `<section class="design-structure"><div class="design-structure-head"><div><b>Struktur rancangan</b><small>${esc(designNames[o.design]||o.design)}</small></div>${status}</div><div class="structure-grid">${factors.join('')}</div><div class="structure-df"><b>Derajat bebas</b>${df}</div></section>`;
}
function renderStructure(check,o){
  const target=$('#scienceStructure');
  if(target)target.innerHTML=structureHtml(check,o);
}
function validate(){
  const o=options(),check=validateData(data,o,parseNumber),quality=inspectDataQuality(data,o,parseNumber);let contrastInfo='';
  if(phoneGuardMode()&&!o.parameters.length&&!check.issues.some(issue=>/parameter/i.test(issue.message)))check.issues.unshift({message:'Pilih minimal satu parameter.'});
  if(!check.issues.length){
    o.parameters.forEach((column,index)=>{
      const type=o.transforms?.[column]||'none';
      if(type!=='none')try{transformObservations(check.observations,index,type);}catch(error){check.issues.push({message:`${data.headers[column]}: ${error.message}`});}
    });
  }
  for(const finding of quality.findings.filter(item=>item.level==='error')){
    if(!check.issues.some(issue=>issue.message===finding.message))check.issues.push({message:finding.message});
  }
  if(!check.issues.length&&o.contrastMode==='custom'){
    try{
      const evaluated=validateCustomContrasts(check,o);
      contrastInfo=`<p><b>${evaluated.contrasts.length} kontras terencana valid.</b> ${evaluated.nonOrthogonalPairs.length?`${evaluated.nonOrthogonalPairs.length} pasangan tidak ortogonal; analisis tetap dapat dijalankan dan setiap kontras diuji secara terpisah.`:'Semua kontras saling ortogonal untuk jumlah ulangan pada dataset ini.'}</p>`;
    }catch(error){check.issues.push({message:error.message});}
  }
  renderStructure(check,o);
  $('#scienceQuality').innerHTML=renderDataQuality(quality);
  $('#scienceValidation').innerHTML=check.issues.length?`<div class="error-box"><b>${check.issues.length} masalah perlu diperbaiki.</b><ul>${check.issues.slice(0,50).map(x=>`<li>${x.row?'Baris '+x.row+': ':''}${esc(x.message)}</li>`).join('')}</ul>${check.issues.length>50?'<p>Hanya 50 masalah pertama ditampilkan.</p>':''}</div>`:`<div class="analysis-note">${check.observations.length} pengamatan siap dianalisis.${check.warnings.map(x=>'<p>'+esc((x.row?'Baris '+x.row+': ':'')+x.message)+'</p>').join('')}${contrastInfo}</div>`;
  document.querySelectorAll('.data-grid td.data-invalid').forEach(td=>td.classList.remove('data-invalid'));
  check.issues.filter(x=>x.row).forEach(issue=>{const row=document.querySelector(`.data-grid td[data-r="${issue.row-1}"]`)?.closest('tr');if(row){if(issue.column!==undefined)row.querySelector(`td[data-c="${issue.column}"]`)?.classList.add('data-invalid');else [...row.querySelectorAll('td[data-c]')].forEach(c=>c.classList.add('data-invalid'));}});
  const runButton=$('#runScience');
  if(runButton){
    if(phoneGuardMode()){
      const ready=!check.issues.length&&o.parameters.length>0;
      runButton.disabled=!ready;
      runButton.setAttribute('aria-disabled',String(!ready));
      runButton.textContent=ready?'Jalankan':'Lengkapi pilihan';
    }else{
      runButton.disabled=false;
      runButton.setAttribute('aria-disabled','false');
      runButton.textContent='Jalankan analisis';
    }
  }
  return {o,check,quality};
}
async function analyze(){
  const runRevision=revision;
  $('#scienceResults').innerHTML='';const {o,check}=validate();if(check.issues.length)return;
  try{
    if(o.contrastMode==='polynomial')o.levels=[...document.querySelectorAll('[data-level]')].map(el=>parseNumber(el.value));
    const metadata=collectTreatmentMetadata();saveTreatmentMetadata(metadataStoreKey(),metadata);
    const button=$('#runScience');button.disabled=true;button.textContent='Menghitung…';
    const reports=[];
    for(let i=0;i<o.parameters.length;i++){
      await new Promise(resolve=>setTimeout(resolve,0));
      if(runRevision!==revision)return;
      const engineOptions=o.contrastMode==='custom'?{...o,contrastMode:'none'}:o;
      const column=o.parameters[i],transformType=o.transforms?.[column]||'none';
      const transformed=transformObservations(check.observations,i,transformType);
      let beforeTransform=null,beforeTransformError='';
      if(transformType!=='none'){
        try{
          const before=analyzeParameter(check.observations,{...engineOptions,posthoc:'none',assumptions:false,contrastMode:'none'},i,data.headers[column]);
          before.factorLabels=metadata.factorLabels;before.treatmentMeta=metadata;finalizeAgronomyFactorial(before);
          beforeTransform={terms:before.terms,cv:before.cv,cvWhole:before.cvWhole,grand:before.grand};
        }catch(error){beforeTransformError=error.message;}
      }
      const report=analyzeParameter(transformed.observations,engineOptions,i,data.headers[column]);
      report.transform=transformed.meta;
      report.originalObservations=transformType==='none'?null:check.observations.map(obs=>({a:obs.a,b:obs.b,rep:obs.rep,y:obs.values[i]}));
      report.beforeTransform=beforeTransform;report.beforeTransformError=beforeTransformError;
      if(o.contrastMode==='custom'){
        const error=report.terms.find(term=>term.label==='Galat');
        if(!error)throw Error('Galat pembanding untuk uji kontras tidak ditemukan.');
        const evaluated=plannedContrastsFlexible(report.cells,o.contrasts,error.ms,error.df);
        report.contrasts=evaluated.contrasts;
        report.notes.push('Kontras terencana diuji dengan KT galat model tanpa mensyaratkan F perlakuan keseluruhan nyata. p-value yang ditampilkan adalah p-value individual dan belum disesuaikan untuk pengujian multipel.');
        if(evaluated.nonOrthogonalPairs.length){
          const preview=evaluated.nonOrthogonalPairs.slice(0,5).map(pair=>`${pair[0]} ↔ ${pair[1]}`).join('; ');
          report.notes.push(`${evaluated.nonOrthogonalPairs.length} pasangan kontras tidak ortogonal${preview?`: ${preview}`:''}. Hal ini diperbolehkan untuk planned contrasts, tetapi JK antar-kontras tidak boleh dijumlahkan sebagai dekomposisi JK perlakuan.`);
        }else report.notes.push('Semua kontras terencana saling ortogonal untuk jumlah ulangan pada dataset ini.');
      }
      report.datasetName=data.name;
      report.datasetMeta={plant:data.plant||'',treatment:data.treatment||''};
      report.factorLabels={a:metadata.factorLabels.a||data.headers[o.a]||'Perlakuan',b:o.b===null?null:(metadata.factorLabels.b||data.headers[o.b]||'Faktor B')};
      report.treatmentMeta=metadata;
      finalizeAgronomyFactorial(report);
      reports.push(report);
    }
    showResults(reports,$('#scienceResults'));
    const dock=$('#analysisDockResults');
    if(dock){
      showResults(reports,dock,data.name);
      $('#analysisResultDock').hidden=false;
      $('#analysisResultDock').dataset.open='true';
      $('#analysisDockTitle').textContent=`${data.name} · ${designNames[currentDesign]||currentDesign}`;
      $('#scientificModal').classList.remove('open');
    }
    const saved=saveHistory(reports,o);
    $('#scienceRunStatus').textContent=saved?'Selesai · tersimpan':'Selesai · belum tersimpan';
    void backupRawDataset({name:data.name,headers:[...data.headers],rows:data.rows.map(row=>[...row])});
  }catch(error){$('#scienceValidation').innerHTML=`<div class="error-box" role="alert">${esc(error.message)}</div>`;}
  finally{
    if(phoneGuardMode()&&$('#scientificModal').classList.contains('open'))validate();
    else{$('#runScience').disabled=false;$('#runScience').setAttribute('aria-disabled','false');$('#runScience').textContent='Jalankan analisis';}
  }
}
export function openScientific(design){
  revision++;
  data=readDataset();currentDesign=design;
  $('#scienceTitle').textContent=designNames[design]||'Analisis data';
  if($('#scienceDatasetName'))$('#scienceDatasetName').textContent=data.name||'Dataset aktif';
  if($('#scienceDatasetSize'))$('#scienceDatasetSize').textContent=`${data.rows.length} baris · ${data.headers.length} kolom`;
  if($('#scienceDesignBadge'))$('#scienceDesignBadge').textContent=designNames[design]||design;
  const multi=['fral','frak','split'].includes(design),grouped=['rak','frak','split'].includes(design);
  const opt=data.headers.map((h,i)=>`<option value="${i}">${esc(h)}</option>`).join('');
  $('#scienceA').innerHTML='<option value="">Pilih kolom</option>'+opt;
  $('#scienceB').innerHTML='<option value="">Pilih kolom</option>'+opt;
  $('#scienceRep').innerHTML=`<option value="">Pilih ${grouped?'kelompok':'ulangan'}</option>`+opt;
  const detectedA=detectTreatmentColumn();
  if(detectedA!==null)$('#scienceA').value=String(detectedA);
  const detectedB=multi?detectSecondFactorColumn([detectedA]):null;
  if(detectedB!==null)$('#scienceB').value=String(detectedB);
  const detectedRep=detectReplicateColumn([detectedA,detectedB]);
  if(detectedRep!==null)$('#scienceRep').value=String(detectedRep);
  $('#scienceBField').hidden=!multi;$('#scienceALabel').textContent=design==='split'?'Faktor A (petak utama)':multi?'Faktor A':'Perlakuan';
  $('#scienceBLabel').textContent=design==='split'?'Faktor B (anak petak)':'Faktor B';
  $('#scienceRepLabel').textContent=grouped?'Kelompok':'Ulangan';
  $('#scienceRepHelp').textContent=grouped?'Blok ANOVA.':'ID pengamatan.';
  const transformOptions=transformationOptions().map(item=>`<option value="${item.value}">${esc(item.label)}</option>`).join('');
  $('#scienceParameters').innerHTML=data.headers.map((h,i)=>`<div class="parameter-row"><label class="ral-check"><input type="checkbox" value="${i}"><span>${esc(h)}</span></label><select data-transform-param="${i}" aria-label="Transformasi ${esc(h)}" disabled>${transformOptions}</select></div>`).join('');
  syncParameterRoleExclusions(true);
  const selected=selectedColumnIndexes().filter(index=>isNumericColumn(index)&&!roleIndices().has(index));
  if(selected.length){
    document.querySelectorAll('#scienceParameters input').forEach(input=>input.checked=selected.includes(Number(input.value)));
    syncParameterRoleExclusions(false);
  }
  $('#scienceAssumptions').checked=false;
  $('#scienceContrastMode').value='none';$('#scienceContrastMode').disabled=multi;$('#scienceContrastHelp').textContent=multi?'Kontras/polinomial tersedia pada rancangan satu faktor RAL/RAK.':'';
  $('#scienceResults').innerHTML='';$('#scienceValidation').innerHTML=data.headers.length?'':'<p>Masukkan dataset.</p>';$('#scienceRunStatus').textContent='';contrastFields();
  const runButton=$('#runScience');
  if(runButton&&phoneGuardMode()){runButton.disabled=true;runButton.textContent='Lengkapi pilihan';runButton.setAttribute('aria-disabled','true');}
  else if(runButton){runButton.disabled=false;runButton.textContent='Jalankan analisis';runButton.setAttribute('aria-disabled','false');}
  $('#scientificModal').classList.add('open');
  validate();
}
export function installScientificWorkflow(){
  document.body.insertAdjacentHTML('beforeend',`<aside id="analysisResultDock" class="analysis-result-dock" hidden><div class="analysis-dock-head"><div><span class="analysis-dock-kicker">HASIL</span><strong id="analysisDockTitle">Hasil</strong></div><button id="closeAnalysisDock" type="button" aria-label="Tutup hasil">✕</button></div><div id="analysisDockResults" class="analysis-dock-body" data-all-results></div></aside><div id="scientificModal" class="modal-backdrop analysis-workspace-backdrop"><div class="modal analysis-workspace-modal" role="dialog" aria-modal="true" aria-labelledby="scienceTitle"><div class="modal-head analysis-workspace-head"><div class="science-title-stack"><strong id="scienceTitle">Analisis data</strong><div class="science-context"><span id="scienceDesignBadge" class="science-design-badge">Rancangan</span><span id="scienceDatasetName">Dataset</span><span id="scienceDatasetSize">—</span></div></div><button id="closeScience" class="science-close" aria-label="Tutup">✕</button></div><div class="modal-body analysis-workspace-body"><div class="science-layout"><main id="scienceFields" class="science-config"><section class="science-card"><div class="science-card-head"><span class="science-step">1</span><b>Rancangan</b></div><div class="form-grid science-role-grid"><label><span id="scienceALabel">Perlakuan</span><select id="scienceA"></select></label><label id="scienceBField"><span id="scienceBLabel">Faktor B</span><select id="scienceB"></select></label><label><span id="scienceRepLabel">Ulangan</span><select id="scienceRep"></select></label></div><p id="scienceRepHelp" class="form-help science-inline-help"></p></section><section class="science-card"><div class="science-card-head"><span class="science-step">2</span><b>Parameter</b><span id="scienceParameterCount" class="science-card-status" data-empty="true">0 dipilih</span></div><div id="scienceParameters" class="ral-list parameter-list science-parameter-list"></div></section><section class="science-card"><div class="science-card-head"><span class="science-step">3</span><b>Uji</b></div><div class="form-grid science-option-grid"><label>Uji lanjut<select id="sciencePosthoc"><option value="none">Tidak pakai</option><option value="bnt">BNT (LSD)</option><option value="bnj">BNJ (Tukey)</option><option value="dmrt">DMRT (Duncan)</option></select></label><label>α<select id="scienceAlpha"><option value="0.05">0.05</option><option value="0.01">0.01</option></select></label></div><label class="science-switch-row"><input type="checkbox" id="scienceAssumptions"><span><b>Diagnostik residual</b></span></label></section><section class="science-card science-card-advanced"><details><summary><span><b>Kontras / polinomial</b></span><span class="science-details-chevron" aria-hidden="true">⌄</span></summary><div class="science-advanced-body"><div class="science-contrast-box"><label>Jenis<select id="scienceContrastMode"><option value="none">Tidak pakai</option><option value="custom">Kontras terencana</option><option value="polynomial">Polinomial ortogonal</option></select></label><p id="scienceContrastHelp" class="form-help"></p><div id="scienceContrastFields"></div></div></div></details></section></main><aside class="science-review-panel"><div class="science-review-head"><b>Pemeriksaan</b></div><div id="scienceStructure"></div><div id="scienceQuality"></div><button id="validateScience" class="science-validate-button">Periksa</button><div id="scienceValidation"></div></aside></div><div id="scienceResults" data-all-results></div></div><div class="modal-foot analysis-workspace-foot"><button id="backScience" class="science-back-button">← Analisis lain</button><span id="scienceRunStatus" role="status" class="science-run-status"></span><div class="science-foot-actions"><button id="closeScience2">Tutup</button><button id="runScience" class="primary science-run-button">Jalankan</button></div></div></div></div>`);
  const close=()=>$('#scientificModal').classList.remove('open');$('#closeScience').onclick=close;$('#closeScience2').onclick=close;$('#backScience').onclick=()=>{close();$('#openAnalysis').click();$('#openAnalysis').focus();};
  $('#closeAnalysisDock').onclick=()=>{const dock=$('#analysisResultDock');dock.hidden=true;dock.dataset.open='false';};
  $('#validateScience').onclick=validate;$('#runScience').onclick=analyze;
  $('#scienceFields').onchange=event=>{$('#scienceResults').innerHTML='';$('#scienceValidation').innerHTML='';$('#scienceRunStatus').textContent='';if(['scienceA','scienceB','scienceRep'].includes(event.target.id)){syncParameterRoleExclusions(false);}if(event.target.matches('#scienceParameters input'))syncParameterRoleExclusions(false);if(['scienceA','scienceContrastMode'].includes(event.target.id))contrastFields();validate();};
  $('#scienceFields').addEventListener('input',event=>{revision++;$('#scienceResults').innerHTML='';$('#scienceRunStatus').textContent='';if(event.target.matches('textarea,[data-level]'))$('#scienceValidation').innerHTML='';});
  $('#analysisHistory').onclick=history;
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){close();$('#dataToolModal').classList.remove('open');}});
  installChartDownload();
  installDriveBackup();
}
