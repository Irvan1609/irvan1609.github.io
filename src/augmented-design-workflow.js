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
  return `<div class="aug-parameter-grid">${data.headers.map((header,index)=>isNumeric(data,index)?`<label class="aug-param"><input type="checkbox" data-aug-param value="${index}" checked><span>${esc(header)}</span></label>`:'').join('')}</div>`;
}
function syncSimpleAugParameter(forceSingle=false){
  const select=$('#augSimpleParameter');if(!select)return;
  const inputs=[...document.querySelectorAll('[data-aug-param]')].filter(input=>!input.disabled);
  const previous=select.value;
  select.innerHTML=inputs.map(input=>`<option value="${input.value}">${esc(dataForAug?.headers?.[Number(input.value)]||'Parameter')}</option>`).join('');
  const selected=inputs.find(input=>input.value===previous)||inputs.find(input=>input.checked)||inputs[0];
  if(selected)select.value=selected.value;
  if(forceSingle&&selected)inputs.forEach(input=>{input.checked=input===selected;});
}
let dataForAug=null;
function applyAugUiMode(){
  const root=document.querySelector('.augmented-workspace');if(!root)return;
  root.classList.remove('aug-simple-mode','aug-complete-mode');
  root.classList.add('aug-unified-mode');
  const advanced=$('#augAdvanced');if(advanced)advanced.open=false;
  const parameters=$('#augMultiParameters');if(parameters)parameters.open=false;
  syncSimpleAugParameter(false);
}
function syncParameters(){
  const roles=new Set(['augBlock','augTreatment'].map(id=>$('#'+id)?.value).filter(value=>value!=='').map(Number));
  document.querySelectorAll('[data-aug-param]').forEach(input=>{
    const role=roles.has(Number(input.value));
    input.disabled=role;
    if(role)input.checked=false;
  });
  syncSimpleAugParameter(false);
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
function uniqueValues(data,index){
  if(index===null||index===undefined||index<0)return [];
  return [...new Set(activeRows(data).map(row=>String(row[index]??'').trim()).filter(Boolean))];
}
function structurePreview(data){
  const host=$('#augStructure');
  if(!host)return;
  const blockValue=$('#augBlock')?.value,treatmentValue=$('#augTreatment')?.value;
  if(blockValue===''||treatmentValue===''){
    host.innerHTML='<div class="aug-review-empty">Pilih blok dan genotipe.</div>';return;
  }
  const blockIndex=Number(blockValue),treatmentIndex=Number(treatmentValue),blocks=uniqueValues(data,blockIndex),treatments=uniqueValues(data,treatmentIndex);
  const checks=parseChecks($('#augChecks')?.value),checkSet=new Set(checks);
  const tests=treatments.filter(value=>!checkSet.has(value));
  const rows=activeRows(data),duplicates=[];
  const seen=new Set();
  for(const row of rows){
    const key=String(row[blockIndex]??'').trim()+'\u0000'+String(row[treatmentIndex]??'').trim();
    if(seen.has(key))duplicates.push(key);else seen.add(key);
  }
  const repeatedNonChecks=tests.filter(value=>rows.filter(row=>String(row[treatmentIndex]??'').trim()===value).length>1);
  const problems=[];
  if(checks.length<2)problems.push('Minimal 2 check berulang');
  if(duplicates.length)problems.push(duplicates.length+' unit duplikat');
  if(repeatedNonChecks.length)problems.push(repeatedNonChecks.length+' test berulang');
  const status=problems.length?'Periksa':'Siap';
  host.innerHTML=`<div class="aug-review-status ${problems.length?'warn':'good'}"><b>${status}</b><span>${problems.length?esc(problems.join(' · ')):'Struktur dasar sesuai augmented RCBD'}</span></div>
    <div class="aug-review-metrics"><span><b>${blocks.length}</b><small>Blok</small></span><span><b>${checks.length}</b><small>Check</small></span><span><b>${tests.length}</b><small>Entry uji</small></span><span><b>${rows.length}</b><small>Plot</small></span></div>`;
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
  const cv=Number.isFinite(out.cv)?fmt(out.cv,2)+'%':'—';
  return `<section class="analysis-result augmented-result aug-view-summary" data-export-scope data-dataset-name="${esc(dataName)}" data-parameter="${esc(name)}">
    <h3>Augmented RCBD — ${esc(name)}</h3>
    <div class="simple-result-tabs" role="tablist"><button type="button" data-aug-view="summary" aria-pressed="true">Rataan</button><button type="button" data-aug-view="anova" aria-pressed="false">ANOVA</button><button type="button" data-aug-view="detail" aria-pressed="false">Detail</button></div>
    <div class="aug-summary-pane">
      <div class="aug-result-summary"><span><b>${out.blocks.length}</b><small>Blok</small></span><span><b>${out.checks.length}</b><small>Check</small></span><span><b>${out.tests.length}</b><small>Entry uji</small></span><span><b>${out.dfError}</b><small>db galat</small></span><span><b>${fmt(out.mse)}</b><small>KT galat</small></span><span><b>${cv}</b><small>CV</small></span></div>
      ${warning}
      <div class="table-caption aug-main-caption">Rataan terkoreksi genotipe</div>${adjustedMeansTable(out)}
      <div class="analysis-note">Δ vs check memakai rerata seluruh check. ↑/↓ = arah selisih; * p &lt; 0,05; ** p &lt; 0,01.</div>
    </div>
    <div class="aug-anova-pane"><div class="aug-anova-grid"><section><div class="table-caption">Perlakuan | dikoreksi blok</div>${anovaTable(out.treatmentAdjusted)}</section><section><div class="table-caption">Blok | dikoreksi perlakuan</div>${anovaTable(out.blockAdjusted)}</section></div></div>
    <div class="aug-detail-pane"><div class="aug-model-line"><span>${esc(out.model)}</span><span>Check: <b>${out.checks.map(esc).join(', ')}</b></span><span>Rerata check: <b>${fmt(out.checkAdjustedMean)}</b></span></div><div class="aug-secondary-grid"><section><div class="table-caption">Efek blok</div>${blockTable(out)}</section><section><div class="table-caption">Ketelitian perbandingan</div>${sedTable(out)}</section></div>${resultActions(`augmented-${name}`)}</div>
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
    body.querySelectorAll('[data-aug-view]').forEach(button=>button.addEventListener('click',()=>{
      const section=button.closest('.augmented-result'),mode=button.dataset.augView;
      section.classList.remove('aug-view-summary','aug-view-anova','aug-view-detail');section.classList.add('aug-view-'+mode);
      section.querySelectorAll('[data-aug-view]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
      section.scrollIntoView({block:'start'});
    }));
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
  dataForAug=data;
  openTool('Augmented Design',`<div class="augmented-workspace aug-unified-mode">
    <div class="aug-context"><span class="aug-mark">AD</span><div><b>Augmented RCBD</b><small>${esc(data.name)} · ${activeRows(data).length} plot</small></div></div>
    <div class="aug-simple-form">
      <label><span>Blok</span><select id="augBlock">${columnOptions(data)}</select></label>
      <label><span>Genotipe</span><select id="augTreatment">${columnOptions(data)}</select></label>
      <label><span>Parameter</span><select id="augSimpleParameter"></select></label>
    </div>
    <div id="augStructure" class="aug-structure-inline"></div>
    <details id="augMultiParameters" class="aug-card aug-multi-parameters"><summary>Parameter lainnya</summary>${parameterField(data)}</details>
    <details id="augAdvanced" class="aug-card aug-advanced"><summary>Pengaturan</summary><div class="aug-form"><label class="wide"><span>Check berulang</span><input id="augChecks" type="text" autocomplete="off" placeholder="T1, T2, T3"></label><label><span>α</span><select id="augAlpha"><option value="0.05">0,05</option><option value="0.01">0,01</option></select></label></div><small class="aug-help">Check dideteksi otomatis dari genotipe yang muncul lebih dari satu kali.</small></details>
    <div id="augmentedError" role="alert"></div>
    <div class="aug-runbar"><span>μ + Blok + Genotipe + ε</span><button id="runAugmented" class="primary" type="button">Analisis</button></div>
  </div>`,'augmented');

  let treatment=choose($('#augTreatment'),/(genotip|genotype|galur|variet|entry|aksesi|perlakuan|treatment)/i,data);
  if(treatment<0){treatment=firstCategorical(data);if(treatment>=0)$('#augTreatment').value=String(treatment);}
  let block=choose($('#augBlock'),/(blok|block|kelompok|ulangan|replicate|rep)/i,data,[treatment]);
  if(block<0){block=firstCategorical(data,[treatment]);if(block>=0)$('#augBlock').value=String(block);}
  fillChecks(data);syncParameters();applyAugUiMode();structurePreview(data);
  globalThis.StatisticalWebWorkflow?.setActive?.('setup');
  $('#augSimpleParameter').addEventListener('change',event=>{document.querySelectorAll('[data-aug-param]').forEach(input=>{input.checked=input.value===event.target.value;});});
  $('#augTreatment').addEventListener('change',()=>{fillChecks(data);syncParameters();structurePreview(data);});
  $('#augBlock').addEventListener('change',()=>{syncParameters();structurePreview(data);});
  $('#augChecks').addEventListener('input',()=>structurePreview(data));
  document.querySelector('.augmented-workspace')?.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&!event.repeat){event.preventDefault();$('#runAugmented')?.click();}
  });

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
