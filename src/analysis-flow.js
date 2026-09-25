const $ = selector => document.querySelector(selector);
import {openAssociation} from './association-workflow.js';
import {openAdvanced} from './advanced-workflow.js';
import {openNextGen} from './nextgen-workflow.js';
import {openMixedModel} from './mixed-workflow.js';
import {openDesignExtension} from './design-extensions-workflow.js';
import {openNonparametric} from './nonparametric-workflow.js';
import {openPowerAnalysis} from './power-workflow.js';
import {openStabilityIndices} from './stability-indices-workflow.js';
import {installScientificWorkflow,openScientific} from './scientific-workflow.js';

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
  return `<button type="button" class="analysis-menu-item" ${attr}${valueAttr}><b>${label}</b><span>${description}</span></button>`;
}

function panelMarkup(){
  return `<div class="analysis-menu-head"><div><b>Pilih analisis</b><span>Gunakan tombol Cari di bagian atas untuk pencarian seluruh web.</span></div></div><div class="analysis-menu-groups">${analysisGroups.map((group,index)=>`<section class="analysis-menu-group" data-analysis-group><button type="button" class="analysis-group-toggle" aria-expanded="${index===0?'true':'false'}"><span><b>${group.title}</b><small>${group.description}</small></span><span class="analysis-group-chevron" aria-hidden="true">⌄</span></button><div class="analysis-group-items" ${index===0?'':'hidden'}>${group.items.map(analysisButton).join('')}</div></section>`).join('')}</div>`;
}

export function installAnalysisFlow() {
  installScientificWorkflow();
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

  open.textContent='Analisis';
  open.setAttribute('aria-controls','analysisMenu');
  open.setAttribute('aria-expanded','false');

  function closeMenu(){
    panel.hidden=true;
    open.setAttribute('aria-expanded','false');
  }
  function openMenu(){
    document.dispatchEvent(new Event('close-navigation'));
    panel.hidden=false;
    open.setAttribute('aria-expanded','true');
    requestAnimationFrame(()=>panel.querySelector('.analysis-group-toggle')?.focus());
  }

  open.addEventListener('click',()=>{
    if(panel.hidden)openMenu();
    else closeMenu();
  });

  panel.querySelectorAll('.analysis-group-toggle').forEach(toggle=>toggle.addEventListener('click',()=>{
    const body=toggle.nextElementSibling,opening=body.hidden;
    body.hidden=!opening;
    toggle.setAttribute('aria-expanded',String(opening));
  }));

  const run=fn=>{closeMenu();fn();};
  panel.querySelectorAll('[data-design]').forEach(button=>button.addEventListener('click',()=>run(()=>openScientific(button.dataset.design))));
  panel.querySelectorAll('[data-design-ext]').forEach(button=>button.addEventListener('click',()=>run(()=>openDesignExtension(button.dataset.designExt))));
  panel.querySelector('[data-nonparametric]')?.addEventListener('click',()=>run(openNonparametric));
  panel.querySelector('[data-power]')?.addEventListener('click',()=>run(openPowerAnalysis));
  panel.querySelector('[data-stability-indices]')?.addEventListener('click',()=>run(openStabilityIndices));
  panel.querySelectorAll('[data-association]').forEach(button=>button.addEventListener('click',()=>run(()=>openAssociation(button.dataset.association))));
  panel.querySelectorAll('[data-advanced]').forEach(button=>button.addEventListener('click',()=>run(()=>openAdvanced(button.dataset.advanced))));
  panel.querySelectorAll('[data-nextgen]').forEach(button=>button.addEventListener('click',()=>run(()=>openNextGen(button.dataset.nextgen))));
  panel.querySelector('[data-mixed]')?.addEventListener('click',()=>run(openMixedModel));

  document.addEventListener('close-navigation',closeMenu);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
}
