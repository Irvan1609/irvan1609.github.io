import {readDataset,openTool} from './data-tools.js';
import {parseNumber,formatNumber} from './number-format.js';
import {augmentedRcbAnova} from './augmented-design-engine.js?v=20260927-work-aug-v2';
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
function structuralAugmentedColumn(header){
  return /^(geno|line|check|line\s*(?:vs\.?|versus)\s*check|line_vs_check)$/i.test(String(header||'').trim());
}
function parameterField(data){
  return `<div class="aug-parameter-head"><span>Parameter numerik dipilih otomatis</span><b id="augParameterCount">0 aktif</b></div><div class="aug-parameter-grid">${data.headers.map((header,index)=>isNumeric(data,index)&&!structuralAugmentedColumn(header)?`<label class="aug-param"><input type="checkbox" data-aug-param value="${index}" checked><span>${esc(header)}</span></label>`:'').join('')}</div>`;
}
function updateAugParameterCount(){
  const inputs=[...document.querySelectorAll('[data-aug-param]')].filter(input=>!input.disabled),selected=inputs.filter(input=>input.checked);
  const target=$('#augParameterCount');if(target)target.textContent=`${selected.length} aktif`;
}
function syncParameters(initial=false){
  const roles=new Set(['augBlock','augTreatment'].map(id=>$('#'+id)?.value).filter(value=>value!=='').map(Number));
  document.querySelectorAll('[data-aug-param]').forEach(input=>{
    const role=roles.has(Number(input.value)),wasRole=input.dataset.wasRole==='true';
    input.disabled=role;
    input.closest('.aug-param')?.toggleAttribute('hidden',role);
    if(role){input.checked=false;input.dataset.wasRole='true';}
    else{
      if(initial||(wasRole&&input.dataset.userTouched!=='true'))input.checked=true;
      input.dataset.wasRole='false';
    }
  });
  updateAugParameterCount();
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
  const incompleteChecks=checks.filter(check=>blocks.some(block=>!rows.some(row=>String(row[blockIndex]??'').trim()===block&&String(row[treatmentIndex]??'').trim()===check)));
  const problems=[];
  if(checks.length<2)problems.push('Minimal 2 check berulang');
  if(incompleteChecks.length)problems.push(incompleteChecks.length+' check tidak lengkap antarblok');
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
const cut2=value=>Number.isFinite(value)?Math.trunc(value*100)/100:value;
function fmtAug(out,value,digits=3,kind='normal'){
  if(!Number.isFinite(value))return '—';
  if(out?.reportMode==='excel'&&(kind==='ss'||kind==='cv'))return fmt(cut2(value),2);
  return fmt(value,digits);
}
function anovaTable(terms,out){
  return `<div class="table-scroll"><table class="result-table anova-table"><thead><tr><th>SK</th><th>db</th><th>JK</th><th>KT</th><th>F</th><th>p</th><th>F 0,05</th><th>F 0,01</th><th>Ket.</th></tr></thead><tbody>${terms.map(term=>`<tr class="${term.component?'aug-anova-component':''}"><td>${esc(term.label)}</td><td>${fmt(term.df,0)}</td><td>${fmtAug(out,term.ss,3,'ss')}</td><td>${fmtAug(out,term.ms)}</td><td>${fmtAug(out,term.f)}</td><td>${fmtAug(out,term.p,4)}</td><td>${fmtAug(out,term.f05)}</td><td>${fmtAug(out,term.f01)}</td><td>${ket(term)}</td></tr>`).join('')}</tbody></table></div>`;
}
function sigP(item,out){return out.comparisonMethod==='holm'?item.pCheckHolm:item.pCheck;}
function sigLabel(item,out){
  if(item.type==='Check')return 'Check';
  const p=sigP(item,out);
  if(!Number.isFinite(p))return '—';
  if(p<.01)return item.deltaCheck>0?'↑ **':'↓ **';
  if(p<out.alpha)return item.deltaCheck>0?'↑ *':'↓ *';
  return 'tn';
}
function adjustedMeansTable(out){
  const pLabel=out.comparisonMethod==='holm'?'p Holm':'p';
  return `<div class="table-scroll"><table class="result-table posthoc-table augmented-means-table"><thead><tr><th>Rank</th><th>Genotipe / Entry</th><th>Tipe</th><th>Blok</th><th>n</th><th>Rataan mentah</th><th>Adjusted mean</th><th>SE</th><th>Δ vs rerata check</th><th>${pLabel}</th><th>Ket.</th></tr></thead><tbody>${out.means.map(item=>`<tr><td>${item.rank}</td><td><b>${esc(item.treatment)}</b></td><td>${item.type==='Check'?'<span class="aug-check-badge">Check</span>':'Test'}</td><td>${esc(item.block)}</td><td>${item.n}</td><td>${fmtAug(out,item.rawMean)}</td><td><b>${fmtAug(out,item.adjusted)}</b></td><td>${fmtAug(out,item.se)}</td><td>${fmtAug(out,item.deltaCheck)}</td><td>${fmtAug(out,sigP(item,out),4)}</td><td>${sigLabel(item,out)}</td></tr>`).join('')}</tbody></table></div>`;
}
function blockTable(out){
  return `<div class="table-scroll"><table class="result-table"><thead><tr><th>Blok</th><th>Rataan model</th><th>Efek blok</th></tr></thead><tbody>${out.blockEffects.map(item=>`<tr><td>${esc(item.block)}</td><td>${fmtAug(out,item.adjustedMean)}</td><td>${item.effect>=0?'+':''}${fmtAug(out,item.effect)}</td></tr>`).join('')}</tbody></table></div>`;
}
function rangeText(summary,key,out){
  if(!summary)return `<tr><td>${esc(key)}</td><td>—</td><td>—</td><td>—</td></tr>`;
  const se=Math.abs(summary.seMax-summary.seMin)<1e-10?fmtAug(out,summary.seMean):`${fmtAug(out,summary.seMin)}–${fmtAug(out,summary.seMax)}`;
  const cd=Math.abs(summary.cdMax-summary.cdMin)<1e-10?fmtAug(out,summary.cdMean):`${fmtAug(out,summary.cdMin)}–${fmtAug(out,summary.cdMax)}`;
  return `<tr><td>${esc(key)}</td><td>${summary.n}</td><td>${se}</td><td>${cd}</td></tr>`;
}
function sedTable(out){
  return `<div class="table-scroll"><table class="result-table"><thead><tr><th>Jenis perbandingan</th><th>Pasangan</th><th>SE beda</th><th>BNT ${fmtAug(out,out.alpha,2)}</th></tr></thead><tbody>
    ${rangeText(out.sed.checkCheck,'Check vs check',out)}
    ${rangeText(out.sed.testSameBlock,'Test vs test · blok sama',out)}
    ${rangeText(out.sed.testDifferentBlock,'Test vs test · blok berbeda',out)}
    ${rangeText(out.sed.testCheck,'Test vs check',out)}
  </tbody></table></div>`;
}
function workSummaryTable(out){
  const w=out.workSummary||{};
  return `<div class="table-scroll"><table class="result-table aug-work-summary"><thead><tr><th>Ringkasan Work / SAS</th><th>Nilai</th></tr></thead><tbody>
    <tr><td>Standard Error (rataan SE DIFFS)</td><td>${fmtAug(out,w.standardError)}</td></tr>
    <tr><td>Grand Mean adjusted</td><td>${fmtAug(out,w.grandMean)}</td></tr>
    <tr><td>db galat</td><td>${fmtAug(out,w.df,0)}</td></tr>
    <tr><td>BNT / LSD</td><td>${fmtAug(out,w.lsd)}</td></tr>
    <tr><td>KK Work / SAS</td><td>${fmtAug(out,w.cv,2,'cv')}${Number.isFinite(w.cv)?'%':''}</td></tr>
  </tbody></table></div>`;
}
function sasField(value){return '"'+String(value??'').replaceAll('"','""').replace(/[\t\r\n]+/g,' ')+'"';}
function sasCode(out){
  const testIndex=new Map(out.tests.map((name,index)=>[name,index+1]));
  const lines=(out.observations||[]).map(item=>{
    const isCheck=out.checks.includes(item.treatment);
    const line=isCheck?0:(testIndex.get(item.treatment)||0);
    return [sasField(item.block),sasField(item.treatment),line,sasField(isCheck?item.treatment:'0'),sasField(isCheck?'Check':'Line'),Number(item.y)].join('\t');
  }).join('\n');
  return `/* Augmented RCBD · kompatibel dengan alur Work/SAS */
data augrcbd;
  infile datalines dsd dlm='09'x truncover;
  length block geno check line_vs_check $100;
  input block $ geno $ line check $ line_vs_check $ yield;
datalines;
${lines}
;
run;

proc glm data=augrcbd;
  class block geno;
  model yield = block geno / ss3;
  title 'ANOVA Augmented RCBD - Block and Whole Treatment Adjusted';
run;

proc glm data=augrcbd;
  class block line_vs_check check line;
  model yield = block line_vs_check check line(check) / ss1;
  title 'ANOVA Augmented RCBD - Treatment Partitions Adjusted';
run;

proc mixed data=augrcbd;
  class block line_vs_check check line;
  model yield = block check line(check);
  lsmeans line(check) / pdiff;
  ods output lsmeans=LSMEANS diffs=DIFFS tests3=DOF;
run;

data adjmeans;
  set LSMEANS;
  AdjMean = Estimate;
  keep line check AdjMean StdErr;
run;
proc sort data=adjmeans;
  by descending AdjMean;
run;

proc means data=DIFFS mean noprint;
  output out=StdErrInd;
  var StdErr;
run;
data StandardError;
  set StdErrInd;
  if _stat_='MEAN';
  Standard_Error=StdErr;
  keep Standard_Error;
run;

proc means data=LSMEANS mean noprint;
  output out=lmeansInd;
run;
data GrandMean;
  set lmeansInd;
  if _stat_='MEAN';
  Grand_Mean=Estimate;
  keep Grand_Mean;
run;

data DOF1;
  set DOF;
  effect=lowcase(effect);
  if effect='line(check)';
  Den_DF=DenDF;
  keep Den_DF;
run;

data LSD_CV;
  merge StandardError DOF1 GrandMean;
  t=tinv(1-${out.alpha}/2,Den_DF);
  LSD=t*Standard_Error;
  CV=(Standard_Error/Grand_Mean)*100;
run;`;
}
function sasPanel(out){
  return `<details class="aug-sas-panel"><summary>Kode SAS</summary><div class="aug-sas-actions"><button type="button" data-copy-aug-sas>Salin kode</button><span data-aug-sas-status role="status"></span></div><textarea class="aug-sas-code" readonly spellcheck="false">${esc(sasCode(out))}</textarea></details>`;
}
function renderAugmented(out,name,dataName){
  const warning=out.warnings.length?`<div class="analysis-smart-warning"><b>Periksa rancangan:</b> ${out.warnings.map(esc).join(' ')}</div>`:'';
  const cv=Number.isFinite(out.cv)?fmtAug(out,out.cv,2,'cv')+'%':'—';
  const modeNote=out.reportMode==='excel'?'<div class="analysis-note">Mode sesuai contoh Excel: nilai respons dihitung dari input 2 desimal; JK dan KK laporan dipotong 2 desimal. Dataset sumber tidak diubah.</div>':'';
  const comparisonNote=out.comparisonMethod==='holm'?'Holm aktif pada perbandingan entry uji terhadap rerata check.':'BNT/LSD memakai p individual entry uji terhadap rerata check.';
  return `<section class="analysis-result augmented-result aug-view-summary" data-export-scope data-dataset-name="${esc(dataName)}" data-parameter="${esc(name)}">
    <h3>Augmented RCBD — ${esc(name)}</h3>
    <div class="aug-result-toolbar"><select data-aug-view-select aria-label="Tampilan hasil augmented"><option value="summary">Rataan</option><option value="anova">ANOVA</option><option value="detail">Detail</option></select></div>
    <div class="aug-summary-pane">
      <div class="aug-result-summary"><span><b>${out.blocks.length}</b><small>Blok</small></span><span><b>${out.checks.length}</b><small>Check</small></span><span><b>${out.tests.length}</b><small>Entry uji</small></span><span><b>${out.dfError}</b><small>db galat</small></span><span><b>${fmtAug(out,out.mse)}</b><small>KT galat</small></span><span><b>${cv}</b><small>CV galat</small></span></div>
      ${warning}
      <div class="table-caption aug-main-caption">Rataan terkoreksi genotipe</div>${adjustedMeansTable(out)}
      <div class="analysis-note">Δ vs check memakai rerata seluruh check. ${comparisonNote} ↑/↓ = arah selisih; * p &lt; 0,05; ** p &lt; 0,01.</div>
      ${modeNote}
    </div>
    <div class="aug-anova-pane"><div class="aug-anova-grid">
      <section><div class="table-caption">Perlakuan | dikoreksi blok (Type III)</div>${anovaTable(out.treatmentAdjusted,out)}</section>
      <section><div class="table-caption">Blok | dikoreksi perlakuan</div>${anovaTable(out.blockAdjusted,out)}</section>
      <section class="aug-partition-section"><div class="table-caption">Partisi perlakuan Work / SAS (Type I)</div>${anovaTable(out.partitionAdjusted,out)}</section>
    </div></div>
    <div class="aug-detail-pane">
      <div class="aug-model-line"><span>${esc(out.model)}</span><span>Check: <b>${out.checks.map(esc).join(', ')}</b></span><span>Rerata check: <b>${fmtAug(out,out.checkAdjustedMean)}</b></span></div>
      <div class="aug-secondary-grid"><section><div class="table-caption">Efek blok</div>${blockTable(out)}</section><section><div class="table-caption">Ketelitian perbandingan</div>${sedTable(out)}</section></div>
      <section class="aug-work-summary-wrap"><div class="table-caption">Ringkasan kompatibilitas Work</div>${workSummaryTable(out)}</section>
      ${sasPanel(out)}
      ${resultActions(`augmented-${name}`)}
    </div>
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
    body.querySelectorAll('[data-aug-view-select]').forEach(select=>select.addEventListener('change',()=>{
      const section=select.closest('.augmented-result'),mode=select.value;
      section.classList.remove('aug-view-summary','aug-view-detail');section.classList.add('aug-view-'+mode);
      section.scrollIntoView({block:'start'});
    }));
    body.querySelectorAll('[data-copy-aug-sas]').forEach(button=>button.addEventListener('click',async()=>{
      const panel=button.closest('.aug-sas-panel'),area=panel?.querySelector('.aug-sas-code'),status=panel?.querySelector('[data-aug-sas-status]');
      if(!area)return;
      try{await navigator.clipboard.writeText(area.value);}
      catch{area.focus();area.select();document.execCommand?.('copy');}
      if(status){status.textContent='Tersalin';setTimeout(()=>{status.textContent='';},1600);}
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
  openTool('Augmented Design',`<div class="augmented-workspace aug-simple-mode">
    <div class="aug-context"><span class="aug-mark">AD</span><div><b>Augmented RCBD</b><small>${esc(data.name)} · ${activeRows(data).length} plot</small></div></div>
    <div class="aug-simple-form aug-two-role-form">
      <label><span>Blok</span><select id="augBlock">${columnOptions(data)}</select></label>
      <label><span>Genotipe</span><select id="augTreatment">${columnOptions(data)}</select></label>
    </div>
    <section class="aug-card aug-parameter-card">${parameterField(data)}</section>
    <div id="augStructure" class="aug-structure-inline"></div>
    <details id="augAdvanced" class="aug-card aug-advanced"><summary>Pengaturan</summary><div class="aug-form"><label class="wide"><span>Check berulang</span><input id="augChecks" type="text" autocomplete="off" placeholder="T1, T2, T3"></label><label><span>α</span><select id="augAlpha"><option value="0.05">0,05</option><option value="0.01">0,01</option></select></label><label><span>Perbandingan</span><select id="augComparison"><option value="lsd">BNT / LSD</option><option value="holm">Holm</option></select></label><label><span>Presisi</span><select id="augPrecision"><option value="full">Presisi penuh</option><option value="excel">Sesuai contoh Excel</option></select></label></div><small class="aug-help">Check dideteksi otomatis dari genotipe yang muncul lebih dari satu kali. Mode contoh Excel tidak mengubah data sumber.</small></details>
    <div id="augmentedError" role="alert"></div>
    <div class="aug-runbar"><span>μ + Blok + Genotipe + ε</span><button id="runAugmented" class="primary" type="button">Analisis</button></div>
  </div>`,'augmented');

  let treatment=choose($('#augTreatment'),/(genotip|genotype|galur|variet|entry|aksesi|perlakuan|treatment)/i,data);
  if(treatment<0){treatment=firstCategorical(data);if(treatment>=0)$('#augTreatment').value=String(treatment);}
  let block=choose($('#augBlock'),/(blok|block|kelompok|ulangan|replicate|rep)/i,data,[treatment]);
  if(block<0){block=firstCategorical(data,[treatment]);if(block>=0)$('#augBlock').value=String(block);}
  fillChecks(data);syncParameters(true);structurePreview(data);
  globalThis.StatisticalWebWorkflow?.setActive?.('setup');
  document.querySelectorAll('[data-aug-param]').forEach(input=>input.addEventListener('change',()=>{input.dataset.userTouched='true';updateAugParameterCount();}));
  $('#augTreatment').addEventListener('change',()=>{fillChecks(data);syncParameters(false);structurePreview(data);});
  $('#augBlock').addEventListener('change',()=>{syncParameters(false);structurePreview(data);});
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
      const comparisonMethod=$('#augComparison')?.value||'lsd',reportMode=$('#augPrecision')?.value||'full';
      const reports=parameters.map(parameter=>{
        if(parameter===blockIndex||parameter===treatmentIndex)throw Error(`${data.headers[parameter]} sedang digunakan sebagai kolom rancangan.`);
        const values=rows.map((row,index)=>{
          const b=String(row[blockIndex]??'').trim(),t=String(row[treatmentIndex]??'').trim();
          let y=parseNumber(row[parameter]);
          if(!b)throw Error(`Baris ${index+1}: blok kosong.`);
          if(!t)throw Error(`Baris ${index+1}: genotipe/entry kosong.`);
          if(!Number.isFinite(y))throw Error(`${data.headers[parameter]}: nilai tidak numerik pada baris ${index+1}.`);
          if(reportMode==='excel')y=Math.round(y*100)/100;
          return [b,t,y];
        });
        const out=augmentedRcbAnova(values,{checks,alpha,requireCompleteChecks:true});
        out.reportMode=reportMode;out.comparisonMethod=comparisonMethod;
        return renderAugmented(out,data.headers[parameter],data.name);
      });
      void backupRawDataset(data);
      $('#dataToolModal')?.classList.remove('open');
      await showResults(reports.join(''),'Augmented RCBD · '+data.name,data,parameters.length);
    }catch(err){error.innerHTML=`<div class="error-box">${esc(err.message)}</div>`;}
  };
}
