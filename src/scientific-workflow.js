import {readDataset,openTool} from './data-tools.js';
import {parseNumber,getDecimalSeparator} from './number-format.js';
import {validateData,analyzeParameter} from './statistics-engine.js';
import {plannedContrastsFlexible} from './planned-contrasts.js';
import {finalizeAgronomyFactorial} from './agronomy-factorial.js';
import {renderReport,esc,designNames,installChartDownload} from './scientific-report.js';
import {backupRawDataset,installDriveBackup} from './drive-backup.js';
const $=s=>document.querySelector(s),HISTORY='statistical_web_analysis_history_v1';
let currentDesign='ral',data=null,revision=0;
function showResults(reports,container){container.innerHTML='<div class="result-actions"><button data-result-action="export-all">Ekspor semua parameter (.xlsx)</button><span role="status" class="export-status"></span></div>'+reports.map(renderReport).join('');}
function getHistory(){try{const items=JSON.parse(localStorage.getItem(HISTORY)||'[]');return Array.isArray(items)?items.filter(x=>x.version===1&&Array.isArray(x.reports)):[];}catch{return [];}}
function saveHistory(reports,options){
  const entry={id:crypto.randomUUID(),version:1,date:new Date().toISOString(),dataset:data.name,design:currentDesign,options,separator:getDecimalSeparator(),reports};
  try{localStorage.setItem(HISTORY,JSON.stringify([entry,...getHistory()].slice(0,20)));return true;}catch{return false;}
}
function history(){
  const entries=getHistory();openTool('Riwayat analisis',entries.length?'<p>Hingga 20 analisis terakhir tersimpan pada browser ini. Ekspor hasil untuk menyimpan salinan di perangkat lain.</p><div id="historyList"></div><div id="historyResult" data-all-results></div>':'<p>Belum ada riwayat analisis.</p>');
  if(!entries.length)return;
  $('#historyList').innerHTML=entries.map(e=>`<div class="history-row"><button data-history-open="${esc(e.id)}">${esc(e.dataset)} — ${esc(designNames[e.design])} · ${new Date(e.date).toLocaleString('id-ID')}</button><button data-history-delete="${esc(e.id)}" aria-label="Hapus riwayat">Hapus</button></div>`).join('');
  $('#historyList').onclick=event=>{const open=event.target.closest('[data-history-open]'),del=event.target.closest('[data-history-delete]');
    if(open){const entry=entries.find(e=>e.id===open.dataset.historyOpen);try{showResults(entry.reports,$('#historyResult'));}catch{$('#historyResult').textContent='Riwayat tidak dapat dibaca.';}}
    if(del&&confirm('Hapus hasil analisis ini dari riwayat?')){try{localStorage.setItem(HISTORY,JSON.stringify(entries.filter(e=>e.id!==del.dataset.historyDelete)));history();}catch{$('#historyResult').textContent='Riwayat tidak dapat dihapus.';}}
  };
}
function options(){
  const read=id=>$(id).value===''?null:Number($(id).value);
  return {design:currentDesign,a:read('#scienceA'),b:read('#scienceB'),rep:read('#scienceRep'),parameters:[...document.querySelectorAll('#scienceParameters input:checked')].map(x=>Number(x.value)),alpha:Number($('#scienceAlpha').value),posthoc:$('#sciencePosthoc').value,assumptions:$('#scienceAssumptions').checked,contrastMode:$('#scienceContrastMode').value,contrasts:[],levels:[]};
}
function columnValues(index){return data.rows.map(row=>String(row[index]??'').trim()).filter(Boolean);}
function isNumericColumn(index){const values=columnValues(index);return values.length>0&&values.every(value=>Number.isFinite(parseNumber(value)));}
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
function roleIndices(){return new Set([$('#scienceA').value,$('#scienceB').value,$('#scienceRep').value].filter(value=>value!=='').map(Number));}
function syncParameterRoleExclusions(initial=false){
  const roles=roleIndices();
  document.querySelectorAll('#scienceParameters input').forEach(input=>{
    const index=Number(input.value),isRole=roles.has(index);
    input.disabled=isRole;
    if(isRole)input.checked=false;
    else if(initial)input.checked=isNumericColumn(index);
  });
}
function levelsForA(){if($('#scienceA').value==='')return [];const i=Number($('#scienceA').value);return [...new Set(data.rows.map(r=>String(r[i]??'').trim()).filter(Boolean))];}
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
function validate(){
  const o=options(),check=validateData(data,o,parseNumber);let contrastInfo='';
  if(!check.issues.length&&o.contrastMode==='custom'){
    try{
      const evaluated=validateCustomContrasts(check,o);
      contrastInfo=`<p><b>${evaluated.contrasts.length} kontras terencana valid.</b> ${evaluated.nonOrthogonalPairs.length?`${evaluated.nonOrthogonalPairs.length} pasangan tidak ortogonal; analisis tetap dapat dijalankan dan setiap kontras diuji secara terpisah.`:'Semua kontras saling ortogonal untuk jumlah ulangan pada dataset ini.'}</p>`;
    }catch(error){check.issues.push({message:error.message});}
  }
  $('#scienceValidation').innerHTML=check.issues.length?`<div class="error-box"><b>${check.issues.length} masalah perlu diperbaiki.</b><ul>${check.issues.slice(0,50).map(x=>`<li>${x.row?'Baris '+x.row+': ':''}${esc(x.message)}</li>`).join('')}</ul>${check.issues.length>50?'<p>Hanya 50 masalah pertama ditampilkan.</p>':''}</div>`:`<div class="analysis-note">${check.observations.length} pengamatan siap dianalisis.${check.warnings.map(x=>'<p>'+esc((x.row?'Baris '+x.row+': ':'')+x.message)+'</p>').join('')}${contrastInfo}</div>`;
  document.querySelectorAll('.data-grid td.data-invalid').forEach(td=>td.classList.remove('data-invalid'));
  check.issues.filter(x=>x.row).forEach(issue=>{const row=document.querySelectorAll('.data-grid tbody tr')[issue.row-1];if(row){if(issue.column!==undefined)row.cells[issue.column+1]?.classList.add('data-invalid');else [...row.cells].slice(1).forEach(c=>c.classList.add('data-invalid'));}});
  return {o,check};
}
async function analyze(){
  const runRevision=revision;
  $('#scienceResults').innerHTML='';const {o,check}=validate();if(check.issues.length)return;
  try{
    if(o.contrastMode==='polynomial')o.levels=[...document.querySelectorAll('[data-level]')].map(el=>parseNumber(el.value));
    const button=$('#runScience');button.disabled=true;button.textContent='Menghitung…';
    const reports=[];
    for(let i=0;i<o.parameters.length;i++){
      await new Promise(resolve=>setTimeout(resolve,0));
      if(runRevision!==revision)return;
      const engineOptions=o.contrastMode==='custom'?{...o,contrastMode:'none'}:o;
      const report=analyzeParameter(check.observations,engineOptions,i,data.headers[o.parameters[i]]);
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
      finalizeAgronomyFactorial(report);
      reports.push(report);
    }
    showResults(reports,$('#scienceResults'));
    const saved=saveHistory(reports,o);
    $('#scienceRunStatus').textContent=saved?'Analisis selesai dan tersimpan dalam riwayat.':'Analisis selesai. Penyimpanan browser penuh; ekspor hasil untuk menyimpannya.';
    void backupRawDataset({name:data.name,headers:[...data.headers],rows:data.rows.map(row=>[...row])});
  }catch(error){$('#scienceValidation').innerHTML=`<div class="error-box" role="alert">${esc(error.message)}</div>`;}
  finally{$('#runScience').disabled=false;$('#runScience').textContent='Jalankan analisis';}
}
export function openScientific(design){
  revision++;
  data=readDataset();currentDesign=design;
  $('#scienceTitle').textContent='Analisis data — '+designNames[design];
  const multi=['fral','frak','split'].includes(design),grouped=['rak','frak','split'].includes(design);
  const opt=data.headers.map((h,i)=>`<option value="${i}">${esc(h)}</option>`).join('');
  $('#scienceA').innerHTML='<option value="">Pilih kolom</option>'+opt;
  $('#scienceB').innerHTML='<option value="">Pilih kolom</option>'+opt;
  $('#scienceRep').innerHTML=`<option value="">Pilih ${grouped?'kelompok':'ulangan'}</option>`+opt;
  const detectedA=detectTreatmentColumn();
  if(detectedA!==null)$('#scienceA').value=String(detectedA);
  const detectedRep=detectReplicateColumn([detectedA]);
  if(detectedRep!==null)$('#scienceRep').value=String(detectedRep);
  $('#scienceBField').hidden=!multi;$('#scienceALabel').textContent=design==='split'?'Faktor A (petak utama)':multi?'Faktor A':'Perlakuan';
  $('#scienceBLabel').textContent=design==='split'?'Faktor B (anak petak)':'Faktor B';
  $('#scienceRepLabel').textContent=grouped?'Kelompok':'Ulangan';
  $('#scienceRepHelp').textContent=grouped?'Kelompok digunakan sebagai blok dalam ANOVA. Data harus lengkap dan seimbang.':'Ulangan digunakan sebagai identitas pengamatan dan tidak menjadi sumber keragaman dalam ANOVA RAL.';
  $('#scienceParameters').innerHTML=data.headers.map((h,i)=>`<label class="ral-check"><input type="checkbox" value="${i}"><span>${esc(h)}</span></label>`).join('');
  syncParameterRoleExclusions(true);
  $('#scienceAssumptions').checked=false;
  $('#scienceContrastMode').value='none';$('#scienceContrastMode').disabled=multi;$('#scienceContrastHelp').textContent=multi?'Kontras/polinomial tersedia pada rancangan satu faktor RAL/RAK.':'';
  $('#scienceResults').innerHTML='';$('#scienceValidation').innerHTML=data.headers.length?'':'<p>Masukkan dataset terlebih dahulu.</p>';$('#scienceRunStatus').textContent='';contrastFields();
  $('#scientificModal').classList.add('open');
}
export function installScientificWorkflow(){
  document.body.insertAdjacentHTML('beforeend',`<div id="scientificModal" class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="scienceTitle"><div class="modal-head"><strong id="scienceTitle">Analisis data</strong><button id="closeScience" aria-label="Tutup">✕</button></div><div class="modal-body"><div id="scienceFields"><div class="form-grid"><label><span id="scienceALabel">Perlakuan</span><select id="scienceA"></select></label><label id="scienceBField"><span id="scienceBLabel">Faktor B</span><select id="scienceB"></select></label><label><span id="scienceRepLabel">Ulangan</span><select id="scienceRep"></select></label></div><p id="scienceRepHelp" class="form-help"></p><div class="ral-title">Parameter (boleh lebih dari satu)</div><div id="scienceParameters" class="ral-list"></div><div class="form-grid"><label>Uji lanjut<select id="sciencePosthoc"><option value="none">Tidak pakai</option><option value="bnt">BNT (LSD)</option><option value="bnj">BNJ (Tukey)</option><option value="dmrt">DMRT (Duncan)</option></select></label><label>Taraf nyata<select id="scienceAlpha"><option value="0.05">0.05 (5%)</option><option value="0.01">0.01 (1%)</option></select></label></div><label class="ral-check"><input type="checkbox" id="scienceAssumptions"> Pemeriksaan asumsi dan grafik residual</label><details open><summary>Uji kontras terencana / polinomial</summary><label>Jenis analisis<select id="scienceContrastMode"><option value="none">Tidak pakai</option><option value="custom">Kontras terencana (boleh beberapa)</option><option value="polynomial">Polinomial ortogonal</option></select></label><p id="scienceContrastHelp"></p><div id="scienceContrastFields"></div></details></div><button id="validateScience">Periksa data & kontras</button><div id="scienceValidation"></div><p id="scienceRunStatus" role="status"></p><div id="scienceResults" data-all-results></div></div><div class="modal-foot"><button id="backScience">Kembali</button><button id="runScience" class="primary">Jalankan analisis</button><button id="closeScience2">Tutup</button></div></div></div>`);
  const close=()=>$('#scientificModal').classList.remove('open');$('#closeScience').onclick=close;$('#closeScience2').onclick=close;$('#backScience').onclick=()=>{close();$('#analysisChoice').classList.add('open');};
  $('#validateScience').onclick=validate;$('#runScience').onclick=analyze;
  $('#scienceFields').onchange=event=>{$('#scienceResults').innerHTML='';$('#scienceValidation').innerHTML='';$('#scienceRunStatus').textContent='';if(['scienceA','scienceB','scienceRep'].includes(event.target.id))syncParameterRoleExclusions(false);if(['scienceA','scienceContrastMode'].includes(event.target.id))contrastFields();};
  $('#scienceFields').addEventListener('input',()=>{revision++;$('#scienceResults').innerHTML='';$('#scienceValidation').innerHTML='';$('#scienceRunStatus').textContent='';});
  $('#analysisHistory').onclick=history;
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){close();$('#dataToolModal').classList.remove('open');}});
  installChartDownload();
  installDriveBackup();
}
