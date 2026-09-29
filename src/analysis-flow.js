const $=selector=>document.querySelector(selector);

let scientificReady=false;
async function scientificModule(){
  const mod=await import('./scientific-workflow.js?v=20260928-resultfocus1');
  if(!scientificReady&&!document.getElementById('scientificModal')){mod.installScientificWorkflow();scientificReady=true;}
  return mod;
}
async function openScientificLazy(design){const mod=await scientificModule();mod.openScientific(design);}
const lazyOpeners={
  designExt:async value=>(await import('./design-extensions-workflow.js?v=20260928-parallel1')).openDesignExtension(value),
  augmented:async ()=>(await import('./augmented-design-workflow.js?v=20260928-resultfocus2')).openAugmentedDesign(),
  nonparametric:async ()=>(await import('./nonparametric-workflow.js?v=20260928-parallel1')).openNonparametric(),
  power:async ()=>(await import('./power-workflow.js?v=20260928-parallel1')).openPowerAnalysis(),
  stabilityIndices:async ()=>(await import('./stability-indices-workflow.js?v=20260928-parallel1')).openStabilityIndices(),
  association:async value=>(await import('./association-workflow.js?v=20260928-parallel1')).openAssociation(value),
  advanced:async value=>(await import('./advanced-workflow.js?v=20260928-parallel1')).openAdvanced(value),
  nextgen:async value=>(await import('./nextgen-workflow.js?v=20260928-parallel1')).openNextGen(value),
  mixed:async ()=>(await import('./mixed-workflow.js?v=20260928-parallel1')).openMixedModel()
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
function smartAnalysis(){
  const data=globalThis.StatisticalWebData?.readActiveDataset?.();
  if(!data?.headers?.length||!data?.rows?.length)return null;
  const values=index=>data.rows.map(row=>String(row?.[index]??'').trim()).filter(Boolean);
  const normalized=index=>values(index).map(value=>value.replace(',','.'));
  const numeric=index=>{const list=normalized(index);return list.length>0&&list.every(value=>Number.isFinite(Number(value)));};
  const uniqueCount=index=>new Set(values(index)).size;
  const header=index=>String(data.headers[index]||'').trim();
  const structuralName=value=>/(^|\b)(id|petak|plot|unit|kode|no|nomor|baris|row|sampel|sample)(\b|$)/i.test(String(value||''));
  const strongFactorName=value=>/(^|\b)(perlakuan|treatment|geno|genotip|genotype|varietas|variety|galur|entry|aksesi|faktor\s*a|factor\s*a|faktor\s*b|factor\s*b|dosis|dose|nitrogen|pupuk|fertilizer|irigasi|jarak\s*tanam)(\b|$)|^n$/i.test(String(value||''));
  const viableFactor=index=>{
    const n=values(index).length,u=uniqueCount(index);
    if(n<2||u<2||u>=n)return false;
    if(!numeric(index))return u<=50;
    return strongFactorName(header(index))&&u<=12&&n/u>=2;
  };
  const findNamed=(regex,exclude=new Set())=>data.headers.findIndex((name,index)=>!exclude.has(index)&&regex.test(String(name||''))&&values(index).length);
  const environment=findNamed(/(^|\b)(lingkungan|environment|lokasi|location|site|musim|season)(\b|$)/i);
  const genotype=findNamed(/(^|\b)(geno|genotip|genotype|varietas|variety|galur|entry|aksesi)(\b|$)/i);
  const rep=findNamed(/(^|\b)(ulangan|rep|replicate|replication|kelompok|blok|block)(\b|$)/i);
  const candidateParams=()=>data.headers.map((_,index)=>index).filter(index=>numeric(index)&&!structuralName(header(index)));
  if(environment>=0&&genotype>=0&&environment!==genotype){
    const roles=new Set([environment,genotype,rep].filter(index=>index>=0));
    const parameterCount=candidateParams().filter(index=>!roles.has(index)).length;
    return {key:'nextgen:combined',label:'ANOVA Gabungan G×E',parameterCount,detail:`${header(environment)} × ${header(genotype)}${rep>=0?` · ${header(rep)}`:''}`};
  }
  if(genotype>=0&&rep>=0){
    const genoValues=values(genotype),blockValues=values(rep),blocks=[...new Set(blockValues)];
    const counts=new Map(genoValues.map(value=>[value,0]));
    data.rows.forEach(row=>{const value=String(row?.[genotype]??'').trim();if(value)counts.set(value,(counts.get(value)||0)+1);});
    const checks=[...counts].filter(([,count])=>count===blocks.length).map(([value])=>value);
    const tests=[...counts].filter(([,count])=>count===1).map(([value])=>value);
    const irregular=[...counts].filter(([,count])=>count!==1&&count!==blocks.length);
    const completeChecks=checks.every(check=>blocks.every(block=>data.rows.some(row=>String(row?.[genotype]??'').trim()===check&&String(row?.[rep]??'').trim()===block)));
    if(blocks.length>=2&&checks.length>=2&&tests.length>=1&&!irregular.length&&completeChecks){
      const roles=new Set([genotype,rep]);
      const helper=/^(line|check|line\s*(?:vs\.?|versus)\s*check|line_vs_check)$/i;
      const parameterCount=candidateParams().filter(index=>!roles.has(index)&&!helper.test(header(index))).length;
      return {key:'augmented:augmented',label:'Augmented Design',parameterCount,detail:`${blocks.length} blok · ${checks.length} check · ${tests.length} entry uji`};
    }
  }

  let factorA=findNamed(/(^|\b)(perlakuan|treatment|faktor\s*a|factor\s*a|dosis|dose|nitrogen|pupuk|fertilizer|irigasi|jarak\s*tanam)(\b|$)|^n$/i);
  if(factorA<0){
    const namedGenetic=findNamed(/(^|\b)(geno|genotip|genotype|varietas|variety|galur|entry|aksesi)(\b|$)/i);
    if(namedGenetic>=0)factorA=namedGenetic;
  }
  if(factorA<0){
    factorA=data.headers.findIndex((name,index)=>viableFactor(index)&&!numeric(index)&&!structuralName(name)&&index!==rep);
  }

  const excluded=new Set([factorA,rep].filter(index=>index>=0));
  let factorB=findNamed(/(^|\b)(faktor\s*b|factor\s*b|anak\s*petak|sub\s*plot|subplot)(\b|$)/i,excluded);
  if(factorB<0&&factorA>=0){
    factorB=findNamed(/(^|\b)(geno|genotip|genotype|varietas|variety|galur|entry|aksesi|dosis|dose|nitrogen|pupuk|fertilizer|irigasi|jarak\s*tanam)(\b|$)|^n$/i,excluded);
    if(factorB>=0&&!viableFactor(factorB))factorB=-1;
  }
  if(factorA>=0&&!viableFactor(factorA))factorA=-1;
  if(factorB===factorA)factorB=-1;

  const roles=new Set([factorA,factorB,rep].filter(index=>index>=0));
  const parameterCount=candidateParams().filter(index=>!roles.has(index)&&!(strongFactorName(header(index))&&viableFactor(index))).length;
  if(factorA<0)return {key:'advanced:descriptive',label:'Statistik Deskriptif',parameterCount,detail:`${parameterCount} parameter numerik`};

  const splitHint=data.headers.some(name=>/(petak\s*utama|main\s*plot|anak\s*petak|sub\s*plot|subplot)/i.test(String(name||'')));
  const key=factorB>=0?(splitHint&&rep>=0?'design:split':rep>=0?'design:frak':'design:fral'):(rep>=0?'design:rak':'design:ral');
  const label=byKey.get(key)?.[2]||'Analisis';
  const detail=[rep>=0?header(rep):'',factorB>=0?`${header(factorA)} × ${header(factorB)}`:header(factorA),parameterCount?`${parameterCount} parameter`:''].filter(Boolean).join(' · ');
  return {key,label,parameterCount,detail};
}
function refreshSmartSuggestion(){
  const host=$('#analysisSmartSuggestion');if(!host)return;
  if(window.matchMedia?.('(max-width:720px)').matches){
    host.hidden=true;host.innerHTML='';return;
  }
  const smart=smartAnalysis();
  if(!smart){host.hidden=true;host.innerHTML='';return;}
  host.hidden=false;
  host.innerHTML=`<span><b>Saran: ${smart.label}</b><small>${smart.detail||`${smart.parameterCount} parameter`} · periksa sebelum menjalankan</small></span><button type="button" data-analysis-smart-key="${smart.key}">Gunakan</button>`;
}
function panelMarkup(){
  return `<div id="analysisLoadError" class="analysis-load-error" role="alert" hidden></div><div id="analysisSmartSuggestion" class="analysis-smart-suggestion" hidden></div><div class="analysis-group-board">
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
    const loadError=$('#analysisLoadError');if(loadError){loadError.hidden=true;loadError.textContent='';}
    refreshSmartSuggestion();
    panel.hidden=false;open.setAttribute('aria-expanded','true');
    requestAnimationFrame(()=>panel.querySelector('[data-analysis-smart-key],.analysis-compact-item')?.focus());
  }
  async function openDescriptor(item,sourceButton=null){
    if(!item)return;
    const [type,value,label]=item;closeMenu();if(sourceButton)sourceButton.disabled=true;
    document.body.classList.add('analysis-mode-active');
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
      document.body.classList.remove('analysis-mode-active');
      panel.hidden=false;open.setAttribute('aria-expanded','true');
      const loadError=$('#analysisLoadError');if(loadError){loadError.hidden=false;loadError.textContent=`${label} belum dapat dimuat. Coba lagi atau muat ulang halaman.`;}
    }finally{if(sourceButton)sourceButton.disabled=false;}
  }

  open.addEventListener('click',()=>panel.hidden?openMenu():closeMenu());
  panel.addEventListener('click',async event=>{
    const smart=event.target.closest('[data-analysis-smart-key]');
    if(smart){await openDescriptor(byKey.get(smart.dataset.analysisSmartKey),smart);return;}
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
    document.body.classList.add('analysis-mode-active');
    try{const mod=await scientificModule();mod.openScientificRecipe(recipe);}catch(error){document.body.classList.remove('analysis-mode-active');console.error(error);}
  });
  document.addEventListener('stat-dataset-changed',refreshSmartSuggestion);
  document.addEventListener('close-navigation',closeMenu);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
}
