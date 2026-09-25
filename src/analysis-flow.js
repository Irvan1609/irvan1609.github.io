const $ = selector => document.querySelector(selector);

let scientificReady=false;
async function openScientificLazy(design){
  const mod=await import('./scientific-workflow.js');
  if(!scientificReady&&!document.getElementById('scientificModal')){
    mod.installScientificWorkflow();
    scientificReady=true;
  }
  mod.openScientific(design);
}
const lazyOpeners={
  designExt:async value=>(await import('./design-extensions-workflow.js')).openDesignExtension(value),
  nonparametric:async ()=>(await import('./nonparametric-workflow.js')).openNonparametric(),
  power:async ()=>(await import('./power-workflow.js')).openPowerAnalysis(),
  stabilityIndices:async ()=>(await import('./stability-indices-workflow.js')).openStabilityIndices(),
  association:async value=>(await import('./association-workflow.js')).openAssociation(value),
  advanced:async value=>(await import('./advanced-workflow.js')).openAdvanced(value),
  nextgen:async value=>(await import('./nextgen-workflow.js')).openNextGen(value),
  mixed:async ()=>(await import('./mixed-workflow.js')).openMixedModel()
};

function phoneGuardMode(){
  return globalThis.matchMedia?.('(max-width: 720px) and (pointer: coarse)')?.matches
    || globalThis.matchMedia?.('(max-width: 720px)')?.matches
    || false;
}

const analysisGroups=[
  {
    title:'Rancangan Percobaan',
    description:'ANOVA dan rancangan penelitian pertanian',
    items:[
      ['design','ral','RAL','Satu faktor, acak lengkap'],
      ['design','rak','RAK','Satu faktor dengan kelompok'],
      ['design','fral','Faktorial RAL','Dua faktor, acak lengkap'],
      ['design','frak','Faktorial RAK','Dua faktor dengan kelompok'],
      ['design','split','RPT / Split-plot','Petak utama dan anak petak'],
      ['designExt','nested','Rancangan Tersarang','B tersarang dalam A'],
      ['designExt','repeated','Repeated Measures','Pengamatan berkala / waktu'],
      ['nonparametric','nonparametric','Nonparametrik','Kruskal–Wallis / Friedman']
    ]
  },
  {
    title:'Hubungan & Regresi',
    description:'Hubungan antarvariabel dan respons dosis',
    items:[
      ['association','correlation','Korelasi','Pearson / Spearman'],
      ['association','path','Sidik lintas','Satu Y, beberapa X'],
      ['nextgen','regression','Regresi','Linear, kuadratik, kubik'],
      ['advanced','descriptive','Statistik Deskriptif','Mean, SD, SE, CV, skewness']
    ]
  },
  {
    title:'Multivariat',
    description:'Eksplorasi banyak peubah sekaligus',
    items:[
      ['nextgen','pca','PCA + Biplot','Scree plot, loading, PC1–PC2']
    ]
  },
  {
    title:'Genetik & Multilokasi',
    description:'Genotipe, lokasi, stabilitas dan mixed model',
    items:[
      ['nextgen','combined','ANOVA Gabungan','Seimbang / GLM tidak seimbang'],
      ['mixed','mixed','Mixed Model REML','Kelompok(Lokasi) efek acak'],
      ['advanced','genetic','Parameter Genetik','H², KKG, KKP, kemajuan genetik'],
      ['nextgen','stability','AMMI / GGE Biplot','Stabilitas genotipe multilokasi'],
      ['stabilityIndices','stability','Indeks Stabilitas','ASV, YSI, Wricke, Finlay–Wilkinson']
    ]
  },
  {
    title:'Perencanaan',
    description:'Membantu merancang percobaan sebelum pengambilan data',
    items:[
      ['power','power','Power & Jumlah Ulangan','Perencanaan ANOVA satu faktor']
    ]
  }
];

function analysisMark(type,value){
  const marks={ral:'RAL',rak:'RAK',fral:'2F',frak:'2F',split:'RPT',nested:'N',repeated:'RM',nonparametric:'NP',correlation:'r',path:'β',regression:'R²',descriptive:'Σ',pca:'PCA',combined:'G×E',mixed:'REML',genetic:'H²',stability:'GGE',power:'n'};
  return marks[value]||marks[type]||'A';
}
function analysisButton([type,value,label,description]){
  const attr={
    design:'data-design',
    designExt:'data-design-ext',
    nonparametric:'data-nonparametric',
    association:'data-association',
    advanced:'data-advanced',
    nextgen:'data-nextgen',
    mixed:'data-mixed',
    stabilityIndices:'data-stability-indices',
    power:'data-power'
  }[type];
  const valueAttr=['nonparametric','mixed','stabilityIndices','power'].includes(type)?'':`="${value}"`;
  return `<button type="button" class="analysis-menu-item" ${attr}${valueAttr} aria-pressed="false"><span class="analysis-item-mark" aria-hidden="true">${analysisMark(type,value)}</span><span class="analysis-item-copy"><b>${label}</b></span><span class="analysis-item-arrow" aria-hidden="true">›</span></button>`;
}

function panelMarkup(){
  const total=analysisGroups.reduce((sum,group)=>sum+group.items.length,0);
  return `<div class="analysis-menu-head"><div><b>Pilih analisis</b></div><span class="analysis-method-count">${total}</span></div><div class="analysis-menu-groups">${analysisGroups.map((group,index)=>`<section class="analysis-menu-group" data-analysis-group><button type="button" class="analysis-group-toggle" aria-expanded="${index===0?'true':'false'}"><span><b>${group.title}</b></span><span class="analysis-group-meta"><small>${group.items.length}</small><span class="analysis-group-chevron" aria-hidden="true">⌄</span></span></button><div class="analysis-group-items" ${index===0?'':'hidden'}>${group.items.map(analysisButton).join('')}</div></section>`).join('')}</div><div class="analysis-menu-foot"><span id="analysisSelectedLabel">Pilih satu metode</span><button id="confirmAnalysis" type="button" class="primary" disabled>Lanjut</button></div>`;
}

export function installAnalysisFlow() {
  const nav=$('.nav'),open=$('#openAnalysis');
  if(!nav||!open)return;

  const panel=document.createElement('div');
  panel.id='analysisMenu';
  panel.className='nav-command-panel analysis-command-panel';
  panel.hidden=true;
  panel.setAttribute('role','region');
  panel.setAttribute('aria-label','Analisis');
  panel.innerHTML=panelMarkup();
  nav.parentElement.append(panel);

  open.textContent='Pilih analisis';
  open.setAttribute('aria-controls','analysisMenu');
  open.setAttribute('aria-expanded','false');

  function closeMenu(){
    panel.hidden=true;
    open.setAttribute('aria-expanded','false');
  }
  function openMenu(){
    document.dispatchEvent(new Event('close-navigation'));
    if(phoneGuardMode())resetSelection();
    else{
      panel.querySelectorAll('[data-analysis-group]').forEach(group=>{
        const toggle=group.querySelector('.analysis-group-toggle'),body=toggle?.nextElementSibling;
        if(body)body.hidden=false;
        toggle?.setAttribute('aria-expanded','true');
      });
    }
    panel.hidden=false;
    open.setAttribute('aria-expanded','true');
    requestAnimationFrame(()=>panel.querySelector('.analysis-menu-item')?.focus());
  }

  open.addEventListener('click',()=>{
    if(panel.hidden)openMenu();
    else closeMenu();
  });

  panel.querySelectorAll('.analysis-group-toggle').forEach(toggle=>toggle.addEventListener('click',()=>{
    if(!phoneGuardMode())return;
    const body=toggle.nextElementSibling,opening=body.hidden;
    body.hidden=!opening;
    toggle.setAttribute('aria-expanded',String(opening));
  }));

  const confirm=$('#confirmAnalysis'),selectedLabel=$('#analysisSelectedLabel');
  let selectedButton=null;
  const resetSelection=()=>{
    selectedButton=null;
    panel.querySelectorAll('.analysis-menu-item').forEach(button=>{button.classList.remove('selected');button.setAttribute('aria-pressed','false');});
    if(confirm)confirm.disabled=true;
    if(selectedLabel)selectedLabel.textContent='Pilih satu metode';
  };
  const choose=button=>{
    selectedButton=button;
    panel.querySelectorAll('.analysis-menu-item').forEach(item=>{const active=item===button;item.classList.toggle('selected',active);item.setAttribute('aria-pressed',String(active));});
    if(confirm)confirm.disabled=false;
    if(selectedLabel)selectedLabel.textContent=button.querySelector('b')?.textContent||'Metode dipilih';
  };
  const openButton=async button=>{
    if(!button)return;
    closeMenu();
    const original=button.querySelector('b')?.textContent||'Analisis';
    button.disabled=true;
    try{
      if(button.matches('[data-design]'))await openScientificLazy(button.dataset.design);
      else if(button.matches('[data-design-ext]'))await lazyOpeners.designExt(button.dataset.designExt);
      else if(button.matches('[data-nonparametric]'))await lazyOpeners.nonparametric();
      else if(button.matches('[data-power]'))await lazyOpeners.power();
      else if(button.matches('[data-stability-indices]'))await lazyOpeners.stabilityIndices();
      else if(button.matches('[data-association]'))await lazyOpeners.association(button.dataset.association);
      else if(button.matches('[data-advanced]'))await lazyOpeners.advanced(button.dataset.advanced);
      else if(button.matches('[data-nextgen]'))await lazyOpeners.nextgen(button.dataset.nextgen);
      else if(button.matches('[data-mixed]'))await lazyOpeners.mixed();
    }catch(error){
      console.error('Analisis gagal dimuat',error);
      alert('Modul '+original+' belum dapat dimuat. Coba lagi.');
    }finally{
      button.disabled=false;
      resetSelection();
    }
  };
  const runSelected=()=>openButton(selectedButton);
  panel.querySelectorAll('.analysis-menu-item').forEach(button=>button.addEventListener('click',()=>{
    if(phoneGuardMode())choose(button);
    else openButton(button);
  }));
  confirm?.addEventListener('click',runSelected);

  document.addEventListener('close-navigation',closeMenu);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
}
