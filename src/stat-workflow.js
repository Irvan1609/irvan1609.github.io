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
  if(open)document.body.classList.add('analysis-mode-active');
  return true;
}
function openData(){
  setDockOpen(false);
  document.body.classList.remove('analysis-mode-active');
  document.querySelector('#scientificModal')?.classList.remove('open');
  document.querySelector('#fieldLayoutModal')?.classList.remove('open','field-mode');
  document.body.classList.remove('field-layout-open');
  const target=document.querySelector('.workspace')||document.querySelector('#gridWrap');
  target?.scrollIntoView({behavior:'smooth',block:'start'});
  document.querySelector('#gridWrap')?.focus?.({preventScroll:true});
  setActive('data');
}
async function openField(){
  setDockOpen(false);
  document.body.classList.remove('analysis-mode-active');
  if(globalThis.AgrotikFieldLayout?.open){globalThis.AgrotikFieldLayout.open();return;}
  try{const {openFieldLayout}=await import('./field-layout.js');openFieldLayout();}
  catch(error){console.error('Denah lahan gagal dibuka',error);}
}
function openSetup(){
  setDockOpen(false);
  const science=document.querySelector('#scientificModal');
  if(science?.classList.contains('open')){document.body.classList.add('analysis-mode-active');setActive('setup');return;}
  const tool=document.querySelector('#dataToolModal');
  if(tool?.classList.contains('open')&&['augmented','parallel-analysis'].includes(tool.dataset.toolMode)){document.body.classList.add('analysis-mode-active');setActive('setup');return;}
  openAnalysis();
}
function openAnalysis(){
  setDockOpen(false);
  document.body.classList.remove('analysis-mode-active');
  document.querySelector('#openAnalysis')?.click();
  setActive('analysis');
}
function openResults(){
  if(setDockOpen(true)){setActive('results');return;}
  const history=document.querySelector('#analysisHistory');
  if(history){history.click();setActive('results');}
}
function setActive(stage){
  document.documentElement.dataset.statStage=stage==='setup'?'analysis':stage==='field'?'data':stage;
}
function update(){
  return {data:datasetSummary(),hasResults:hasResults()};
}
export function installStatWorkflow(){
  document.addEventListener('stat-dataset-changed',()=>{if(!document.body.classList.contains('analysis-results-open'))setActive('data');});
  document.addEventListener('agrotik-analysis-complete',()=>setActive('results'));
  document.addEventListener('agrotik-workflow-stage',event=>{const stage=String(event.detail?.stage||'');if(stage)setActive(stage);});
  document.addEventListener('click',event=>{
    if(event.target.closest('#openAnalysis'))setActive('analysis');
    else if(event.target.closest('#runScience,#runAugmented'))setActive('analysis');
    else if(event.target.closest('#analysisResultDock'))setActive('results');
  },true);
  document.addEventListener('keydown',event=>{
    if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    if(event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
    const action={'1':openData,'2':openAnalysis,'3':openResults}[event.key];
    if(!action)return;
    event.preventDefault();action();
  });
  globalThis.StatisticalWebWorkflow={openData,openField,openAnalysis,openSetup,openResults,setActive,update,summary:datasetSummary};
  setActive('data');
}
