const $=selector=>document.querySelector(selector);

const FAVORITES='statistical_web_analysis_favorites_v1';
const RECENT='statistical_web_analysis_recent_v1';
const USAGE='statistical_web_analysis_usage_v1';
const CONFIG='statistical_web_analysis_config_v1';
const UI_MODE='statistical_web_analysis_ui_mode_v2';

let scientificReady=false;
async function scientificModule(){
  const mod=await import('./scientific-workflow.js');
  if(!scientificReady&&!document.getElementById('scientificModal')){mod.installScientificWorkflow();scientificReady=true;}
  return mod;
}
async function openScientificLazy(design){const mod=await scientificModule();mod.openScientific(design);}
const lazyOpeners={
  designExt:async value=>(await import('./design-extensions-workflow.js')).openDesignExtension(value),
  augmented:async ()=>(await import('./augmented-design-workflow.js')).openAugmentedDesign(),
  nonparametric:async ()=>(await import('./nonparametric-workflow.js')).openNonparametric(),
  power:async ()=>(await import('./power-workflow.js')).openPowerAnalysis(),
  stabilityIndices:async ()=>(await import('./stability-indices-workflow.js')).openStabilityIndices(),
  association:async value=>(await import('./association-workflow.js')).openAssociation(value),
  advanced:async value=>(await import('./advanced-workflow.js')).openAdvanced(value),
  nextgen:async value=>(await import('./nextgen-workflow.js')).openNextGen(value),
  mixed:async ()=>(await import('./mixed-workflow.js')).openMixedModel()
};

function phoneGuardMode(){return globalThis.matchMedia?.('(max-width:720px)')?.matches||false;}
function readArray(key){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
function readObject(key){try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
function uiMode(){try{return localStorage.getItem(UI_MODE)==='complete'?'complete':'simple';}catch{return 'simple';}}
function setUiMode(mode){try{localStorage.setItem(UI_MODE,mode==='complete'?'complete':'simple');}catch{}}

const analysisGroups=[
  {title:'Rancangan Percobaan',items:[
    ['design','ral','RAL','Satu faktor, acak lengkap'],
    ['design','rak','RAK','Satu faktor dengan kelompok'],
    ['design','fral','Faktorial RAL','Dua faktor, acak lengkap'],
    ['design','frak','Faktorial RAK','Dua faktor dengan kelompok'],
    ['design','split','RPT / Split-plot','Petak utama dan anak petak'],
    ['augmented','augmented','Augmented Design','Galur uji tanpa ulangan + check berulang'],
    ['designExt','nested','Rancangan Tersarang','B tersarang dalam A'],
    ['designExt','repeated','Repeated Measures','Pengamatan berkala / waktu'],
    ['nonparametric','nonparametric','Nonparametrik','Kruskal–Wallis / Friedman']
  ]},
  {title:'Hubungan & Regresi',items:[
    ['association','correlation','Korelasi','Pearson / Spearman'],
    ['association','path','Sidik lintas','Satu Y, beberapa X'],
    ['nextgen','regression','Regresi','Linear, kuadratik, kubik'],
    ['advanced','descriptive','Statistik Deskriptif','Mean, SD, SE, CV, skewness']
  ]},
  {title:'Multivariat',items:[['nextgen','pca','PCA + Biplot','Scree plot, loading, PC1–PC2']]},
  {title:'Genetik & Multilokasi',items:[
    ['nextgen','combined','ANOVA Gabungan','Seimbang / GLM tidak seimbang'],
    ['mixed','mixed','Mixed Model REML','Kelompok(Lokasi) efek acak'],
    ['advanced','genetic','Parameter Genetik','H², KKG, KKP, kemajuan genetik'],
    ['nextgen','stability','AMMI / GGE Biplot','Stabilitas genotipe multilokasi'],
    ['stabilityIndices','stability','Indeks Stabilitas','ASV, YSI, Wricke, Finlay–Wilkinson']
  ]},
  {title:'Perencanaan',items:[['power','power','Power & Jumlah Ulangan','Perencanaan ANOVA satu faktor']]}
];
function itemKey([type,value]){return type+':'+value;}
const flatItems=analysisGroups.flatMap((group,groupIndex)=>group.items.map(item=>({item,groupIndex,key:itemKey(item)})));
function descriptor(key){return flatItems.find(entry=>entry.key===key);}
function favorites(){return readArray(FAVORITES).filter(key=>descriptor(key));}
function recent(){return readArray(RECENT).filter(key=>descriptor(key)).slice(0,3);}
function usage(){return readObject(USAGE);}
function activeDatasetName(){try{return globalThis.StatisticalWebData?.readActiveDataset?.()?.name||'dataset';}catch{return 'dataset';}}
function hasSavedScientificConfigLocal(){
  const saved=readObject(CONFIG)[activeDatasetName()];
  return !!saved&&['ral','rak','fral','frak','split'].includes(saved.design)&&saved.contrastMode!=='custom';
}
function rememberUse(key){
  const counts=usage();counts[key]=(Number(counts[key])||0)+1;write(USAGE,counts);
  write(RECENT,[key,...recent().filter(value=>value!==key)].slice(0,3));
}
function toggleFavorite(key){const list=favorites(),next=list.includes(key)?list.filter(value=>value!==key):[...list,key];write(FAVORITES,next);return next.includes(key);}
function groupUseScore(groupIndex){
  const counts=usage(),fav=new Set(favorites());
  return flatItems.filter(entry=>entry.groupIndex===groupIndex).reduce((sum,entry)=>sum+(Number(counts[entry.key])||0)+(fav.has(entry.key)?20:0),0);
}
function analysisMark(type,value){
  const marks={ral:'RAL',rak:'RAK',fral:'2F',frak:'2F',split:'RPT',augmented:'AD',nested:'N',repeated:'RM',nonparametric:'NP',correlation:'r',path:'β',regression:'R²',descriptive:'Σ',pca:'PCA',combined:'G×E',mixed:'REML',genetic:'H²',stability:'GGE',power:'n'};
  return marks[value]||marks[type]||'A';
}
function analysisButton(item){
  const [type,value,label]=item,key=itemKey(item);
  const attr={design:'data-design',designExt:'data-design-ext',augmented:'data-augmented',nonparametric:'data-nonparametric',association:'data-association',advanced:'data-advanced',nextgen:'data-nextgen',mixed:'data-mixed',stabilityIndices:'data-stability-indices',power:'data-power'}[type];
  const valueAttr=['nonparametric','mixed','stabilityIndices','power'].includes(type)?'':`="${value}"`;
  const pinned=favorites().includes(key);
  return `<div class="analysis-menu-item-wrap" data-analysis-key="${key}"><button type="button" class="analysis-menu-item" ${attr}${valueAttr} data-analysis-key="${key}" aria-pressed="false"><span class="analysis-item-mark">${analysisMark(type,value)}</span><span class="analysis-item-copy"><b>${label}</b></span><span class="analysis-item-arrow" aria-hidden="true">›</span></button><button type="button" class="analysis-favorite" data-favorite-key="${key}" aria-pressed="${pinned}" aria-label="${pinned?'Lepas favorit':'Tambah favorit'}">${pinned?'★':'☆'}</button></div>`;
}
function quickChip(key){
  const found=descriptor(key);if(!found)return '';
  const [type,value,label]=found.item;
  return `<button type="button" class="analysis-quick-chip" data-quick-analysis-key="${key}"><span>${analysisMark(type,value)}</span><b>${label}</b></button>`;
}
function quickMarkup(){
  const fav=favorites(),last=recent();
  return `<div class="analysis-quick-row"><button type="button" data-auto-detect>Deteksi</button><button type="button" data-check-data>Periksa data</button><button type="button" data-quick-run ${hasSavedScientificConfigLocal()?'':'disabled'}>Ulangi terakhir</button></div><div class="analysis-quick-lists"><div data-analysis-favorites ${fav.length?'':'hidden'}><small>Favorit</small><div>${fav.map(quickChip).join('')}</div></div><div data-analysis-recent ${last.length?'':'hidden'}><small>Terakhir</small><div>${last.map(quickChip).join('')}</div></div></div>`;
}
function simpleCard(key,label,mark,sub=''){
  return `<button type="button" class="analysis-simple-card" data-simple-analysis="${key}"><span>${mark}</span><b>${label}</b>${sub?`<small>${sub}</small>`:''}</button>`;
}
function panelMarkup(){
  const groups=analysisGroups.map((group,index)=>`<section class="analysis-menu-group" data-analysis-group data-group-index="${index}"><button type="button" class="analysis-group-toggle" aria-expanded="${index===0?'true':'false'}"><span><b>${group.title}</b></span><span class="analysis-group-meta"><small>${group.items.length}</small><span class="analysis-group-chevron">⌄</span></span></button><div class="analysis-group-items" ${index===0?'':'hidden'}>${group.items.map(analysisButton).join('')}</div></section>`).join('');
  return `<div class="analysis-menu-head"><div><b>Pilih analisis</b><small>Mulai dari rancangan yang paling sesuai</small></div><button type="button" class="analysis-mode-toggle" data-analysis-mode-toggle>Mode Lengkap</button></div>
    <div class="analysis-simple-view" data-analysis-simple-view>
      <div class="analysis-simple-grid">
        ${simpleCard('design:ral','RAL','RAL')}
        ${simpleCard('design:rak','RAK','RAK')}
        ${simpleCard('factorial','Faktorial','2F','RAL / RAK')}
        ${simpleCard('design:split','Split Plot','RPT')}
        ${simpleCard('augmented:augmented','Augmented','AD')}
        ${simpleCard('more','Lainnya','···')}
      </div>
      <div class="analysis-factorial-choice" data-factorial-choice hidden>
        <button type="button" data-simple-analysis="design:fral"><b>Faktorial RAL</b><small>Tanpa kelompok</small></button>
        <button type="button" data-simple-analysis="design:frak"><b>Faktorial RAK</b><small>Dengan kelompok</small></button>
      </div>
      <div class="analysis-simple-foot"><button type="button" data-auto-detect>Deteksi otomatis dari data</button></div>
    </div>
    <div class="analysis-complete-view" data-analysis-complete-view hidden>
      <div id="analysisQuickArea" class="analysis-quick-area">${quickMarkup()}</div>
      <div class="analysis-menu-groups">${groups}</div>
      <div class="analysis-menu-foot"><span id="analysisSelectedLabel">Pilih satu metode</span><button id="confirmAnalysis" type="button" class="primary" disabled>Lanjut</button></div>
    </div>`;
}

export function installAnalysisFlow(){
  const nav=$('.nav'),open=$('#openAnalysis');if(!nav||!open)return;
  const panel=document.createElement('div');panel.id='analysisMenu';panel.className='nav-command-panel analysis-command-panel';panel.hidden=true;
  panel.setAttribute('role','region');panel.setAttribute('aria-label','Analisis');panel.innerHTML=panelMarkup();nav.parentElement.append(panel);
  open.textContent='Analisis';open.setAttribute('aria-controls','analysisMenu');open.setAttribute('aria-expanded','false');
  const confirm=()=>panel.querySelector('#confirmAnalysis'),selectedLabel=()=>panel.querySelector('#analysisSelectedLabel');
  let selectedButton=null;
  function resetSelection(){
    selectedButton=null;
    panel.querySelectorAll('.analysis-menu-item').forEach(button=>{button.classList.remove('selected');button.setAttribute('aria-pressed','false');});
    if(confirm())confirm().disabled=true;if(selectedLabel())selectedLabel().textContent='Pilih satu metode';
  }
  function choose(button){
    selectedButton=button;
    panel.querySelectorAll('.analysis-menu-item').forEach(item=>{const active=item===button;item.classList.toggle('selected',active);item.setAttribute('aria-pressed',String(active));});
    if(confirm())confirm().disabled=false;if(selectedLabel())selectedLabel().textContent=button.querySelector('b')?.textContent||'Metode dipilih';
  }
  function refreshQuick(){
    const target=panel.querySelector('#analysisQuickArea');if(target)target.innerHTML=quickMarkup();
    const fav=new Set(favorites());
    panel.querySelectorAll('[data-favorite-key]').forEach(button=>{const pinned=fav.has(button.dataset.favoriteKey);button.textContent=pinned?'★':'☆';button.setAttribute('aria-pressed',String(pinned));});
  }
  function applyGroupCollapse(){
    const compact=phoneGuardMode();
    panel.querySelectorAll('[data-analysis-group]').forEach((group,index)=>{
      const body=group.querySelector('.analysis-group-items'),toggle=group.querySelector('.analysis-group-toggle');
      const openGroup=!compact||index===0||groupUseScore(index)>0;
      if(body)body.hidden=!openGroup;toggle?.setAttribute('aria-expanded',String(openGroup));
    });
  }
  function applyMode(mode=uiMode()){
    const complete=mode==='complete';setUiMode(mode);
    panel.querySelector('[data-analysis-simple-view]').hidden=complete;
    panel.querySelector('[data-analysis-complete-view]').hidden=!complete;
    const toggle=panel.querySelector('[data-analysis-mode-toggle]');
    if(toggle)toggle.textContent=complete?'Mode Sederhana':'Mode Lengkap';
    panel.dataset.mode=mode;
    if(complete){refreshQuick();applyGroupCollapse();if(phoneGuardMode())resetSelection();}
  }
  function closeMenu(){panel.hidden=true;open.setAttribute('aria-expanded','false');panel.querySelector('[data-factorial-choice]')?.setAttribute('hidden','');}
  function openMenu(){document.dispatchEvent(new Event('close-navigation'));applyMode();panel.hidden=false;open.setAttribute('aria-expanded','true');requestAnimationFrame(()=>panel.querySelector('.analysis-simple-card,.analysis-menu-item')?.focus());}
  async function openDescriptor(found,sourceButton=null){
    if(!found)return;
    const [type,value,label]=found.item;rememberUse(found.key);closeMenu();if(sourceButton)sourceButton.disabled=true;
    try{
      if(type==='design')await openScientificLazy(value);
      else if(type==='augmented')await lazyOpeners.augmented();
      else if(type==='designExt')await lazyOpeners.designExt(value);
      else if(type==='nonparametric')await lazyOpeners.nonparametric();
      else if(type==='power')await lazyOpeners.power();
      else if(type==='stabilityIndices')await lazyOpeners.stabilityIndices();
      else if(type==='association')await lazyOpeners.association(value);
      else if(type==='advanced')await lazyOpeners.advanced(value);
      else if(type==='nextgen')await lazyOpeners.nextgen(value);
      else if(type==='mixed')await lazyOpeners.mixed();
    }catch(error){console.error('Analisis gagal dimuat',error);alert('Modul '+label+' belum dapat dimuat. Coba lagi.');}
    finally{if(sourceButton)sourceButton.disabled=false;}
  }
  const openButton=button=>openDescriptor(descriptor(button?.dataset.analysisKey),button);
  async function autoDetect(button){
    button.disabled=true;
    try{
      const mod=await scientificModule(),suggestion=mod.detectScientificDesign();
      if(!suggestion){button.textContent='Tidak terdeteksi';setTimeout(()=>{button.textContent='Deteksi otomatis dari data';button.disabled=false;},1200);return;}
      rememberUse('design:'+suggestion.design);closeMenu();mod.openScientific(suggestion.design);
    }catch(error){console.error(error);button.disabled=false;}
  }

  open.addEventListener('click',()=>panel.hidden?openMenu():closeMenu());
  panel.addEventListener('click',async event=>{
    const modeToggle=event.target.closest('[data-analysis-mode-toggle]');
    if(modeToggle){applyMode(uiMode()==='complete'?'simple':'complete');return;}
    const simple=event.target.closest('[data-simple-analysis]');
    if(simple){
      const key=simple.dataset.simpleAnalysis;
      if(key==='more'){applyMode('complete');return;}
      if(key==='factorial'){
        const choice=panel.querySelector('[data-factorial-choice]');choice.hidden=!choice.hidden;simple.setAttribute('aria-expanded',String(!choice.hidden));return;
      }
      await openDescriptor(descriptor(key),simple);return;
    }
    const favoriteButton=event.target.closest('[data-favorite-key]');
    if(favoriteButton){event.preventDefault();event.stopPropagation();toggleFavorite(favoriteButton.dataset.favoriteKey);refreshQuick();return;}
    const quick=event.target.closest('[data-quick-analysis-key]');
    if(quick){await openDescriptor(descriptor(quick.dataset.quickAnalysisKey),quick);return;}
    const dataCheck=event.target.closest('[data-check-data]');
    if(dataCheck){closeMenu();document.querySelector('#validateDataset')?.click();return;}
    const auto=event.target.closest('[data-auto-detect]');
    if(auto){await autoDetect(auto);return;}
    const quickRun=event.target.closest('[data-quick-run]');
    if(quickRun){quickRun.disabled=true;try{const mod=await scientificModule(),ok=await mod.quickRunLastScientific();if(!ok)quickRun.textContent='Belum ada';}catch(error){console.error(error);}closeMenu();return;}
    const toggle=event.target.closest('.analysis-group-toggle');
    if(toggle&&phoneGuardMode()){const body=toggle.nextElementSibling,opening=body?.hidden!==false;if(body)body.hidden=!opening;toggle.setAttribute('aria-expanded',String(opening));return;}
    const button=event.target.closest('.analysis-menu-item');
    if(button){if(phoneGuardMode())choose(button);else await openButton(button);}
  });
  confirm()?.addEventListener('click',()=>openButton(selectedButton));
  document.addEventListener('agrotik-open-analysis',event=>{const key=String(event.detail?.key||'');const found=descriptor(key)||flatItems.find(entry=>entry.item[1]===key);if(found)void openDescriptor(found);});
  document.addEventListener('agrotik-run-recipe',async event=>{const recipe=event.detail?.recipe;if(!recipe)return;try{const mod=await scientificModule();mod.openScientificRecipe(recipe);}catch(error){console.error(error);}});
  document.addEventListener('close-navigation',closeMenu);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
}
