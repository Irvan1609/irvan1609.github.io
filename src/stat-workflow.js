const $=selector=>document.querySelector(selector);

function datasetSummary(){
  const data=globalThis.StatisticalWebData?.readActiveDataset?.();
  if(!data)return {name:'Dataset',rows:0,columns:0};
  return {name:data.name||data.fileName||'Dataset',rows:Array.isArray(data.rows)?data.rows.length:0,columns:Array.isArray(data.headers)?data.headers.length:0};
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
  if(dataLabel)dataLabel.textContent=data.rows?data.rows+'×'+data.columns:'Kosong';
  strip.title=data.name;
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
  globalThis.StatisticalWebWorkflow={openData,openField,openAnalysis,openResults,setActive,update};
  update();
}
