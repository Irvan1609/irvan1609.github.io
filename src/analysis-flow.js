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

const analysisGroups=[
  {title:'Rancangan Percobaan',items:[
    ['design','ral','RAL','RAL'],
    ['design','rak','RAK','RAK'],
    ['design','fral','Faktorial RAL','2F'],
    ['design','frak','Faktorial RAK','2F'],
    ['design','split','Split Plot','RPT'],
    ['augmented','augmented','Augmented Design','AD'],
    ['designExt','nested','Rancangan Tersarang','N'],
    ['designExt','repeated','Repeated Measures','RM'],
    ['nonparametric','nonparametric','Nonparametrik','NP']
  ]},
  {title:'Hubungan & Regresi',items:[
    ['association','correlation','Korelasi','r'],
    ['association','path','Sidik lintas','β'],
    ['nextgen','regression','Regresi','R²'],
    ['advanced','descriptive','Statistik Deskriptif','Σ']
  ]},
  {title:'Multivariat',items:[
    ['nextgen','pca','PCA + Biplot','PCA']
  ]},
  {title:'Genetik & Multilokasi',items:[
    ['nextgen','combined','ANOVA Gabungan','G×E'],
    ['mixed','mixed','Mixed Model REML','REML'],
    ['advanced','genetic','Parameter Genetik','H²'],
    ['nextgen','stability','AMMI / GGE Biplot','GGE'],
    ['stabilityIndices','stability','Indeks Stabilitas','SI']
  ]},
  {title:'Perencanaan',items:[
    ['power','power','Power & Jumlah Ulangan','n']
  ]}
];
const items=analysisGroups.flatMap(group=>group.items);
const keyOf=([type,value])=>type+':'+value;
const byKey=new Map(items.map(item=>[keyOf(item),item]));

function analysisButton(item){
  const [type,value,label,mark]=item;
  return `<button type="button" class="analysis-compact-item" data-analysis-open="${keyOf(item)}"><span>${mark}</span><b>${label}</b></button>`;
}
function panelMarkup(){
  return `<div class="analysis-menu-head"><div><b>Pilih analisis</b><small>Semua metode tersedia · dikelompokkan agar cepat ditemukan</small></div></div>
    <div class="analysis-group-board">
      ${analysisGroups.map(group=>`<section class="analysis-compact-group"><div class="analysis-compact-group-title">${group.title}</div><div class="analysis-compact-items">${group.items.map(analysisButton).join('')}</div></section>`).join('')}
    </div>`;
}

export function installAnalysisFlow(){
  const nav=$('.nav'),open=$('#openAnalysis');if(!nav||!open)return;
  const panel=document.createElement('div');panel.id='analysisMenu';panel.className='nav-command-panel analysis-command-panel';panel.hidden=true;
  panel.setAttribute('role','region');panel.setAttribute('aria-label','Analisis');panel.innerHTML=panelMarkup();nav.parentElement.append(panel);
  open.textContent='Analisis';open.setAttribute('aria-controls','analysisMenu');open.setAttribute('aria-expanded','false');

  function closeMenu(){panel.hidden=true;open.setAttribute('aria-expanded','false');}
  function openMenu(){
    document.dispatchEvent(new Event('close-navigation'));
    panel.hidden=false;open.setAttribute('aria-expanded','true');
    requestAnimationFrame(()=>panel.querySelector('.analysis-compact-item')?.focus());
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
    }catch(error){
      console.error('Analisis gagal dimuat',error);
      alert('Modul '+label+' belum dapat dimuat. Coba lagi.');
    }finally{if(sourceButton)sourceButton.disabled=false;}
  }

  open.addEventListener('click',()=>panel.hidden?openMenu():closeMenu());
  panel.addEventListener('click',async event=>{
    const button=event.target.closest('[data-analysis-open]');
    if(button)await openDescriptor(byKey.get(button.dataset.analysisOpen),button);
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
