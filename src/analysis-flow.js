const $=selector=>document.querySelector(selector);

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

const items=[
  ['design','ral','RAL'],
  ['design','rak','RAK'],
  ['design','fral','Faktorial RAL'],
  ['design','frak','Faktorial RAK'],
  ['design','split','Split Plot'],
  ['augmented','augmented','Augmented Design'],
  ['designExt','nested','Rancangan Tersarang'],
  ['designExt','repeated','Repeated Measures'],
  ['nonparametric','nonparametric','Nonparametrik'],
  ['association','correlation','Korelasi'],
  ['association','path','Sidik lintas'],
  ['nextgen','regression','Regresi'],
  ['advanced','descriptive','Statistik Deskriptif'],
  ['nextgen','pca','PCA + Biplot'],
  ['nextgen','combined','ANOVA Gabungan'],
  ['mixed','mixed','Mixed Model REML'],
  ['advanced','genetic','Parameter Genetik'],
  ['nextgen','stability','AMMI / GGE Biplot'],
  ['stabilityIndices','stability','Indeks Stabilitas'],
  ['power','power','Power & Jumlah Ulangan']
];
const keyOf=([type,value])=>type+':'+value;
const byKey=new Map(items.map(item=>[keyOf(item),item]));

function simpleCard(key,label,mark,sub=''){
  return `<button type="button" class="analysis-simple-card" data-analysis-open="${key}"><span>${mark}</span><b>${label}</b>${sub?`<small>${sub}</small>`:''}</button>`;
}
function otherOptions(){
  const option=(key,label)=>`<option value="${key}">${label}</option>`;
  return `<option value="">Pilih metode…</option>
    <optgroup label="Rancangan khusus">
      ${option('designExt:nested','Rancangan Tersarang')}
      ${option('designExt:repeated','Repeated Measures')}
      ${option('nonparametric:nonparametric','Nonparametrik')}
    </optgroup>
    <optgroup label="Hubungan & regresi">
      ${option('association:correlation','Korelasi')}
      ${option('association:path','Sidik lintas')}
      ${option('nextgen:regression','Regresi')}
      ${option('advanced:descriptive','Statistik Deskriptif')}
    </optgroup>
    <optgroup label="Pemuliaan & multilokasi">
      ${option('nextgen:pca','PCA + Biplot')}
      ${option('nextgen:combined','ANOVA Gabungan')}
      ${option('mixed:mixed','Mixed Model REML')}
      ${option('advanced:genetic','Parameter Genetik')}
      ${option('nextgen:stability','AMMI / GGE Biplot')}
      ${option('stabilityIndices:stability','Indeks Stabilitas')}
    </optgroup>
    <optgroup label="Perencanaan">
      ${option('power:power','Power & Jumlah Ulangan')}
    </optgroup>`;
}
function panelMarkup(){
  return `<div class="analysis-menu-head"><div><b>Pilih analisis</b><small>Metode utama di depan, sisanya digabung</small></div></div>
    <div class="analysis-simple-view">
      <div class="analysis-simple-grid">
        ${simpleCard('design:ral','RAL','RAL')}
        ${simpleCard('design:rak','RAK','RAK')}
        <button type="button" class="analysis-simple-card" data-analysis-factorial aria-expanded="false"><span>2F</span><b>Faktorial</b><small>RAL / RAK</small></button>
        ${simpleCard('design:split','Split Plot','RPT')}
        ${simpleCard('augmented:augmented','Augmented','AD')}
        <button type="button" class="analysis-simple-card" data-analysis-more aria-expanded="false"><span>···</span><b>Lainnya</b></button>
      </div>
      <div class="analysis-factorial-choice" data-factorial-choice hidden>
        <button type="button" data-analysis-open="design:fral"><b>Faktorial RAL</b><small>Tanpa kelompok</small></button>
        <button type="button" data-analysis-open="design:frak"><b>Faktorial RAK</b><small>Dengan kelompok</small></button>
      </div>
      <div class="analysis-other-picker" data-other-picker hidden>
        <select id="analysisOtherSelect" aria-label="Metode analisis lainnya">${otherOptions()}</select>
      </div>
    </div>`;
}

export function installAnalysisFlow(){
  const nav=$('.nav'),open=$('#openAnalysis');if(!nav||!open)return;
  const panel=document.createElement('div');panel.id='analysisMenu';panel.className='nav-command-panel analysis-command-panel';panel.hidden=true;
  panel.setAttribute('role','region');panel.setAttribute('aria-label','Analisis');panel.innerHTML=panelMarkup();nav.parentElement.append(panel);
  open.textContent='Analisis';open.setAttribute('aria-controls','analysisMenu');open.setAttribute('aria-expanded','false');

  function closeMenu(){
    panel.hidden=true;open.setAttribute('aria-expanded','false');
    panel.querySelector('[data-factorial-choice]')?.setAttribute('hidden','');
    panel.querySelector('[data-other-picker]')?.setAttribute('hidden','');
    panel.querySelector('[data-analysis-factorial]')?.setAttribute('aria-expanded','false');
    panel.querySelector('[data-analysis-more]')?.setAttribute('aria-expanded','false');
  }
  function openMenu(){
    document.dispatchEvent(new Event('close-navigation'));
    panel.hidden=false;open.setAttribute('aria-expanded','true');
    requestAnimationFrame(()=>panel.querySelector('.analysis-simple-card')?.focus());
  }
  async function openDescriptor(item,sourceButton=null){
    if(!item)return;
    const [type,value,label]=item;closeMenu();if(sourceButton)sourceButton.disabled=true;
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

  open.addEventListener('click',()=>panel.hidden?openMenu():closeMenu());
  panel.addEventListener('click',async event=>{
    const factorial=event.target.closest('[data-analysis-factorial]');
    if(factorial){
      const choice=panel.querySelector('[data-factorial-choice]'),opening=choice.hidden;
      choice.hidden=!opening;panel.querySelector('[data-other-picker]').hidden=true;
      factorial.setAttribute('aria-expanded',String(opening));panel.querySelector('[data-analysis-more]').setAttribute('aria-expanded','false');return;
    }
    const more=event.target.closest('[data-analysis-more]');
    if(more){
      const picker=panel.querySelector('[data-other-picker]'),opening=picker.hidden;
      picker.hidden=!opening;panel.querySelector('[data-factorial-choice]').hidden=true;
      more.setAttribute('aria-expanded',String(opening));panel.querySelector('[data-analysis-factorial]').setAttribute('aria-expanded','false');
      if(opening)requestAnimationFrame(()=>panel.querySelector('#analysisOtherSelect')?.focus());return;
    }
    const direct=event.target.closest('[data-analysis-open]');
    if(direct){await openDescriptor(byKey.get(direct.dataset.analysisOpen),direct);return;}
  });
  panel.querySelector('#analysisOtherSelect')?.addEventListener('change',async event=>{
    const key=event.target.value;if(!key)return;
    const item=byKey.get(key);event.target.value='';
    await openDescriptor(item,event.target);
  });
  document.addEventListener('agrotik-open-analysis',event=>{
    const key=String(event.detail?.key||'');
    const item=byKey.get(key)||items.find(entry=>entry[1]===key);
    if(item)void openDescriptor(item);
  });
  document.addEventListener('agrotik-run-recipe',async event=>{
    const recipe=event.detail?.recipe;if(!recipe)return;
    try{const mod=await scientificModule();mod.openScientificRecipe(recipe);}catch(error){console.error(error);}
  });
  document.addEventListener('close-navigation',closeMenu);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
}
