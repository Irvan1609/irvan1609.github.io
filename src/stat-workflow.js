const $=selector=>document.querySelector(selector);

function datasetSummary(){
  const data=globalThis.StatisticalWebData?.readActiveDataset?.();
  if(!data)return {name:'Dataset',rows:0,columns:0,blankRate:0,status:'Belum ada data',state:'empty'};
  const rows=Array.isArray(data.rows)?data.rows:[],headers=Array.isArray(data.headers)?data.headers:[];
  const sample=rows.slice(0,250);
  let blank=0,total=0;
  for(const row of sample)for(let column=0;column<headers.length;column++){
    total++;
    if(String(row?.[column]??'').trim()==='')blank++;
  }
  const blankRate=total?blank/total:0;
  let status='Siap',state='ready';
  if(!rows.length||!headers.length){status='Belum ada data';state='empty';}
  else if(rows.length<3||headers.length<2){status='Cek struktur';state='warn';}
  else if(blankRate>=.2){status='Cek nilai kosong';state='warn';}
  return {name:data.name||data.fileName||'Dataset',rows:rows.length,columns:headers.length,blankRate,status,state,sampled:sample.length<rows.length};
}
function analysisDock(){
  return document.querySelector('#analysisResultDock');
}
function hasResults(){
  const dock=analysisDock(),body=document.querySelector('#analysisDockResults');
  return !!dock&&!!body&&body.children.length>0;
}
function setDockOpen(open){
  const dock=analysisDock();
  if(!dock)return false;
  if(open&&!hasResults())return false;
  dock.hidden=!open;dock.dataset.open=String(open);
  document.body.classList.toggle('analysis-results-open',open);
  return true;
}
function openData(){
  setDockOpen(false);
  document.querySelector('#scientificModal')?.classList.remove('open');
  document.querySelector('#fieldLayoutModal')?.classList.remove('open','field-mode');
  document.body.classList.remove('field-layout-open');
  const target=document.querySelector('.workspace')||document.querySelector('#gridWrap');
  target?.scrollIntoView({behavior:'smooth',block:'start'});
  document.querySelector('#gridWrap')?.focus?.({preventScroll:true});
  setActive('data');
}
function openField(){
  setDockOpen(false);
  const button=document.querySelector('#fieldLayoutTool');
  if(button){button.click();setActive('field');return;}
  globalThis.AgrotikFieldLayout?.open?.();
  setActive('field');
}
function openAnalysis(){
  setDockOpen(false);
  document.querySelector('#openAnalysis')?.click();
  setActive('analysis');
}
function openResults(){
  if(setDockOpen(true)){setActive('results');return;}
  const history=document.querySelector('#analysisHistory');
  if(history){history.click();setActive('results');}
}
function setActive(stage){
  const strip=document.querySelector('#statWorkflowStrip');if(!strip)return;
  strip.dataset.stage=stage;
  strip.querySelectorAll('[data-stat-workflow]').forEach(button=>{
    const active=button.dataset.statWorkflow===stage;
    button.setAttribute('aria-current',active?'step':'false');
  });
}
function update(){
  const strip=document.querySelector('#statWorkflowStrip');if(!strip)return;
  const data=datasetSummary(),dataLabel=strip.querySelector('[data-workflow-data-label]'),resultButton=strip.querySelector('[data-stat-workflow="results"]');
  if(dataLabel)dataLabel.textContent=data.rows?`${data.rows}×${data.columns} · ${data.status}`:'Kosong';
  strip.dataset.dataState=data.state;
  const blankText=data.blankRate>0?` · nilai kosong ${data.sampled?'~':''}${Math.round(data.blankRate*100)}%`:'';
  strip.title=`${data.name} · ${data.rows} baris × ${data.columns} kolom${blankText}`;
  if(resultButton){
    resultButton.disabled=!hasResults()&&!document.querySelector('#analysisHistory');
    resultButton.classList.toggle('has-result',hasResults());
  }
}
function markup(){
  return `<nav id="statWorkflowStrip" class="stat-workflow-strip" aria-label="Alur kerja Statistical Web" data-stage="data">
    <button type="button" data-stat-workflow="data" aria-current="step"><b>1</b><span>Data<small data-workflow-data-label>—</small></span></button>
    <button type="button" data-stat-workflow="field"><b>2</b><span>Denah<small>Input plot</small></span></button>
    <button type="button" data-stat-workflow="analysis"><b>3</b><span>Analisis<small>Rancangan & uji</small></span></button>
    <button type="button" data-stat-workflow="results"><b>4</b><span>Hasil<small>Interpretasi</small></span></button>
  </nav>`;
}
export function installStatWorkflow(){
  if(document.querySelector('#statWorkflowStrip'))return;
  const toolbar=document.querySelector('.toolbar'),host=toolbar?.parentElement;
  if(!toolbar||!host)return;
  toolbar.insertAdjacentHTML('afterend',markup());
  const strip=document.querySelector('#statWorkflowStrip');
  strip.addEventListener('click',event=>{
    const button=event.target.closest('[data-stat-workflow]');if(!button)return;
    const action={data:openData,field:openField,analysis:openAnalysis,results:openResults}[button.dataset.statWorkflow];
    action?.();
  });
  document.addEventListener('stat-dataset-changed',()=>{update();if(!document.body.classList.contains('analysis-results-open'))setActive('data');});
  document.addEventListener('agrotik-analysis-complete',event=>{
    const detail=event.detail||{},resultButton=strip.querySelector('[data-stat-workflow="results"]');
    if(resultButton){
      const small=resultButton.querySelector('small');
      if(small)small.textContent=detail.designLabel||detail.design||'Siap dilihat';
    }
    update();setActive('results');
  });
  document.addEventListener('agrotik-workflow-stage',event=>{const stage=String(event.detail?.stage||'');if(stage)setActive(stage);update();});
  document.addEventListener('click',event=>{
    if(event.target.closest('#fieldLayoutTool'))setActive('field');
    else if(event.target.closest('#openAnalysis'))setActive('analysis');
    else if(event.target.closest('#analysisResultDock'))setActive('results');
  },true);
  document.addEventListener('keydown',event=>{
    if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    if(event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
    const action={'1':openData,'2':openField,'3':openAnalysis,'4':openResults}[event.key];
    if(!action)return;
    event.preventDefault();action();
  });
  globalThis.StatisticalWebWorkflow={openData,openField,openAnalysis,openResults,setActive,update,summary:datasetSummary};
  update();
}
