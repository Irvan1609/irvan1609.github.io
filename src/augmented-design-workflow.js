import {readDataset,openTool} from './data-tools.js';
import {parseNumber,formatNumber} from './number-format.js';
import {augmentedRcbAnova} from './augmented-design-engine.js';
import {resultActions} from './result-export.js';
import {backupRawDataset} from './drive-backup.js';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=(value,digits=3)=>Number.isFinite(value)?formatNumber(value,digits):'—';
const activeRows=data=>data.rows.filter(row=>row.some(value=>String(value??'').trim()!==''));
function isNumeric(data,index){
  const rows=activeRows(data);
  return rows.length>0&&rows.every(row=>Number.isFinite(parseNumber(row[index])));
}
function columnOptions(data){return '<option value="">Pilih kolom</option>'+data.headers.map((header,index)=>`<option value="${index}">${esc(header)}</option>`).join('');}
function choose(select,regex,data,exclude=[]){
  const index=data.headers.findIndex((header,i)=>!exclude.includes(i)&&regex.test(String(header)));
  if(index>=0)select.value=String(index);
  return index;
}
function firstCategorical(data,exclude=[]){return data.headers.findIndex((_,index)=>!exclude.includes(index)&&!isNumeric(data,index));}
function parameterField(data){
  return `<fieldset><legend>Parameter terpilih</legend><p class="form-help">Semua kolom numerik dipilih otomatis. Kolom Blok dan Genotipe akan dikeluarkan dari parameter.</p><div class="ral-list">${data.headers.map((header,index)=>isNumeric(data,index)?`<label class="ral-check"><input type="checkbox" data-aug-param value="${index}" checked><span>${esc(header)}</span></label>`:'').join('')}</div></fieldset>`;
}
function syncParameters(){
  const roles=new Set(['augBlock','augTreatment'].map(id=>$('#'+id)?.value).filter(value=>value!=='').map(Number));
  document.querySelectorAll('[data-aug-param]').forEach(input=>{
    const role=roles.has(Number(input.value));
    input.disabled=role;
    if(role)input.checked=false;
  });
}
function repeatedTreatments(data,index){
  if(index===null||index===undefined||index<0)return [];
  const counts=new Map();
  for(const row of activeRows(data)){
    const value=String(row[index]??'').trim();
    if(value)counts.set(value,(counts.get(value)||0)+1);
  }
  return [...counts].filter(([,count])=>count>1).map(([value])=>value);
}
function fillChecks(data){
  const treatment=$('#augTreatment')?.value;
  if(treatment===''||treatment===undefined)return;
  const checks=repeatedTreatments(data,Number(treatment));
  const input=$('#augChecks');
  if(input){input.value=checks.join(', ');input.dataset.autoChecks=checks.join('\u0000');}
}
function parseChecks(text){
  return [...new Set(String(text||'').split(/[,;\n]+/).map(value=>value.trim()).filter(Boolean))];
}
function ket(term){
  if(!Number.isFinite(term?.p))return '';
  return term.p<.01?'**':term.p<.05?'*':'tn';
}
function anovaTable(terms){
  return `<div class="table-scroll"><table class="result-table anova-table"><thead><tr><th>SK</th><th>db</th><th>JK</th><th>KT</th><th>F</th><th>p</th><th>F 0,05</th><th>F 0,01</th><th>Ket.</th></tr></thead><tbody>${terms.map(term=>`<tr class="${term.component?'aug-anova-component':''}"><td>${esc(term.label)}</td><td>${fmt(term.df,0)}</td><td>${fmt(term.ss)}</td><td>${fmt(term.ms)}</td><td>${fmt(term.f)}</td><td>${fmt(term.p,4)}</td><td>${fmt(term.f05)}</td><td>${fmt(term.f01)}</td><td>${ket(term)}</td></tr>`).join('')}</tbody></table></div>`;
}
function sigLabel(item,alpha){
  if(item.type==='Check')return 'Check';
  if(!Number.isFinite(item.pCheck))return '—';
  if(item.pCheck<.01)return item.deltaCheck>0?'↑ **':'↓ **';
  if(item.pCheck<alpha)return item.deltaCheck>0?'↑ *':'↓ *';
  return 'tn';
}
function adjustedMeansTable(out){
  return `<div class="table-scroll"><table class="result-table posthoc-table augmented-means-table"><thead><tr><th>Rank</th><th>Genotipe / Entry</th><th>Tipe</th><th>Blok</th><th>n</th><th>Rataan mentah</th><th>Adjusted mean</th><th>SE</th><th>Δ vs rerata check</th><th>p</th><th>Ket.</th></tr></thead><tbody>${out.means.map(item=>`<tr><td>${item.rank}</td><td><b>${esc(item.treatment)}</b></td><td>${item.type==='Check'?'<span class="aug-check-badge">Check</span>':'Test'}</td><td>${esc(item.block)}</td><td>${item.n}</td><td>${fmt(item.rawMean)}</td><td><b>${fmt(item.adjusted)}</b></td><td>${fmt(item.se)}</td><td>${fmt(item.deltaCheck)}</td><td>${fmt(item.pCheck,4)}</td><td>${sigLabel(item,out.alpha)}</td></tr>`).join('')}</tbody></table></div>`;
}
function blockTable(out){
  return `<div class="table-scroll"><table class="result-table"><thead><tr><th>Blok</th><th>Rataan model</th><th>Efek blok</th></tr></thead><tbody>${out.blockEffects.map(item=>`<tr><td>${esc(item.block)}</td><td>${fmt(item.adjustedMean)}</td><td>${item.effect>=0?'+':''}${fmt(item.effect)}</td></tr>`).join('')}</tbody></table></div>`;
}
function rangeText(summary,key){
  if(!summary)return `<tr><td>${esc(key)}</td><td>—</td><td>—</td><td>—</td></tr>`;
  const se=Math.abs(summary.seMax-summary.seMin)<1e-10?fmt(summary.seMean):`${fmt(summary.seMin)}–${fmt(summary.seMax)}`;
  const cd=Math.abs(summary.cdMax-summary.cdMin)<1e-10?fmt(summary.cdMean):`${fmt(summary.cdMin)}–${fmt(summary.cdMax)}`;
  return `<tr><td>${esc(key)}</td><td>${summary.n}</td><td>${se}</td><td>${cd}</td></tr>`;
}
function sedTable(out){
  return `<div class="table-scroll"><table class="result-table"><thead><tr><th>Jenis perbandingan</th><th>Pasangan</th><th>SE beda</th><th>BNT ${fmt(out.alpha,2)}</th></tr></thead><tbody>
    ${rangeText(out.sed.checkCheck,'Check vs check')}
    ${rangeText(out.sed.testSameBlock,'Test vs test · blok sama')}
    ${rangeText(out.sed.testDifferentBlock,'Test vs test · blok berbeda')}
    ${rangeText(out.sed.testCheck,'Test vs check')}
  </tbody></table></div>`;
}
function renderAugmented(out,name,dataName){
  const warning=out.warnings.length?`<div class="analysis-smart-warning"><b>Periksa rancangan:</b> ${out.warnings.map(esc).join(' ')}</div>`:'';
  return `<section class="analysis-result augmented-result" data-export-scope data-dataset-name="${esc(dataName)}" data-parameter="${esc(name)}">
    <h3>Augmented RCBD — ${esc(name)}</h3>
    ${resultActions(`augmented-${name}`)}
    <div class="analysis-lead">N=${out.n}; blok=${out.blocks.length}; check=${out.checks.length}; entry uji=${out.tests.length}; db galat=${out.dfError}; KT galat=${fmt(out.mse)}; CV=${Number.isFinite(out.cv)?fmt(out.cv,2)+'%':'—'}.</div>
    ${warning}
    <div class="analysis-note"><b>Model:</b> ${esc(out.model)}. Check: ${out.checks.map(esc).join(', ')}. Rerata check terkoreksi = ${fmt(out.checkAdjustedMean)}.</div>
    <div class="table-caption">ANOVA — perlakuan dikoreksi terhadap blok</div>
    ${anovaTable(out.treatmentAdjusted)}
    <div class="table-caption">ANOVA — blok dikoreksi terhadap perlakuan</div>
    ${anovaTable(out.blockAdjusted)}
    <div class="table-caption">Rataan genotipe terkoreksi blok</div>
    ${adjustedMeansTable(out)}
    <div class="analysis-note">Δ vs rerata check membandingkan setiap entry uji terhadap rerata marginal seluruh check menggunakan ragam kovarians model. ↑/↓ menunjukkan arah selisih; * p &lt; 0,05; ** p &lt; 0,01; tn = tidak nyata. Ranking hanya berdasarkan adjusted mean dan bukan keputusan seleksi otomatis.</div>
    <div class="table-caption">Efek blok</div>
    ${blockTable(out)}
    <div class="table-caption">Ketelitian perbandingan</div>
    ${sedTable(out)}
    <div class="analysis-note">BNT ditampilkan per tipe pasangan karena SE beda pada augmented design dapat berbeda antara test dalam blok yang sama, test antarblok, dan test–check. Galur uji tidak memperoleh galat dari replikasi sendiri; presisi berasal dari check berulang yang menghubungkan blok.</div>
  </section>`;
}
async function showResults(html,title,data,parameterCount){
  try{
    if(!document.querySelector('#analysisResultDock')){
      const module=await import('./scientific-workflow.js');
      if(!document.querySelector('#scientificModal'))module.installScientificWorkflow();
    }
    const dock=$('#analysisResultDock'),body=$('#analysisDockResults'),heading=$('#analysisDockTitle');
    if(!dock||!body)throw Error('dock unavailable');
    body.innerHTML=html;
    body.dataset.datasetName=data.name||'Dataset';
    if(heading)heading.textContent=title;
    dock.hidden=false;dock.dataset.open='true';
    document.body.classList.add('analysis-results-open');
    globalThis.StatisticalWebWorkflow?.setActive?.('results');
    document.dispatchEvent(new CustomEvent('agrotik-analysis-complete',{detail:{dataset:data.name,design:'augmented',designLabel:'Augmented RCBD',parameters:parameterCount}}));
  }catch{
    openTool(title,html);
  }
}
export function openAugmentedDesign(){
  const data=readDataset();
  if(!data.headers.length)return openTool('Augmented Design','<p>Dataset belum berisi data.</p>');
  openTool('Augmented Design / Augmented RCBD',`<p>Untuk skrining galur awal: <b>entry uji umumnya hanya satu kali</b>, sedangkan <b>check diulang pada beberapa blok</b>. Efek blok diestimasi dari check dan digunakan untuk memperoleh adjusted mean setiap entry.</p>
    <div class="form-grid">
      <label>Blok / Kelompok<select id="augBlock">${columnOptions(data)}</select></label>
      <label>Genotipe / Entry<select id="augTreatment">${columnOptions(data)}</select></label>
      <label>Check berulang<input id="augChecks" type="text" autocomplete="off" placeholder="mis. T1, T2, T3"></label>
      <label>Taraf nyata<select id="augAlpha"><option value="0.05">0,05 (5%)</option><option value="0.01">0,01 (1%)</option></select></label>
    </div>
    <p class="form-help">Pisahkan nama check dengan koma. Jika kolom genotipe diganti, daftar check dideteksi ulang dari genotipe yang muncul lebih dari satu kali.</p>
    ${parameterField(data)}
    <button id="runAugmented" class="primary" type="button">Jalankan Augmented Design</button>
    <div id="augmentedError" role="alert"></div>
    <div id="augmentedPreview"></div>`);

  let treatment=choose($('#augTreatment'),/(genotip|genotype|galur|variet|entry|aksesi|perlakuan|treatment)/i,data);
  if(treatment<0){treatment=firstCategorical(data);if(treatment>=0)$('#augTreatment').value=String(treatment);}
  let block=choose($('#augBlock'),/(blok|block|kelompok|ulangan|replicate|rep)/i,data,[treatment]);
  if(block<0){block=firstCategorical(data,[treatment]);if(block>=0)$('#augBlock').value=String(block);}
  fillChecks(data);syncParameters();
  $('#augTreatment').addEventListener('change',()=>{fillChecks(data);syncParameters();});
  $('#augBlock').addEventListener('change',syncParameters);

  $('#runAugmented').onclick=async()=>{
    const error=$('#augmentedError');error.innerHTML='';
    try{
      const blockValue=$('#augBlock').value,treatmentValue=$('#augTreatment').value;
      if(blockValue===''||treatmentValue==='')throw Error('Pilih kolom Blok/Kelompok dan Genotipe/Entry.');
      const blockIndex=Number(blockValue),treatmentIndex=Number(treatmentValue);
      if(blockIndex===treatmentIndex)throw Error('Kolom Blok dan Genotipe harus berbeda.');
      const parameters=[...document.querySelectorAll('[data-aug-param]:checked')].map(input=>Number(input.value));
      if(!parameters.length)throw Error('Pilih minimal satu parameter numerik.');
      const checks=parseChecks($('#augChecks').value),alpha=Number($('#augAlpha').value),rows=activeRows(data);
      const reports=parameters.map(parameter=>{
        if(parameter===blockIndex||parameter===treatmentIndex)throw Error(`${data.headers[parameter]} sedang digunakan sebagai kolom rancangan.`);
        const values=rows.map((row,index)=>{
          const b=String(row[blockIndex]??'').trim(),t=String(row[treatmentIndex]??'').trim(),y=parseNumber(row[parameter]);
          if(!b)throw Error(`Baris ${index+1}: blok kosong.`);
          if(!t)throw Error(`Baris ${index+1}: genotipe/entry kosong.`);
          if(!Number.isFinite(y))throw Error(`${data.headers[parameter]}: nilai tidak numerik pada baris ${index+1}.`);
          return [b,t,y];
        });
        const out=augmentedRcbAnova(values,{checks,alpha});
        return renderAugmented(out,data.headers[parameter],data.name);
      });
      void backupRawDataset(data);
      $('#dataToolModal')?.classList.remove('open');
      await showResults(reports.join(''),'Augmented RCBD · '+data.name,data,parameters.length);
    }catch(err){error.innerHTML=`<div class="error-box">${esc(err.message)}</div>`;}
  };
}
