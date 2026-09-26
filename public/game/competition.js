const TENDERS={
  drought:{name:'Hemat Air',icon:'◇',desc:'Utamakan WUE, hasil, dan stabilitas.',weights:{yield:.30,wue:.35,stability:.20,cost:.15}},
  early:{name:'Genjah',icon:'⚡',desc:'Utamakan ASI pendek tanpa kehilangan hasil.',weights:{yield:.25,early:.40,stability:.20,cost:.15}},
  disease:{name:'Tahan Penyakit',icon:'◈',desc:'Utamakan penyakit rendah dan kestabilan.',weights:{yield:.25,disease:.40,stability:.20,cost:.15}},
  profit:{name:'Menguntungkan',icon:'Rp',desc:'Utamakan margin, hasil, dan biaya pengembangan.',weights:{yield:.20,margin:.45,stability:.15,cost:.20}}
};
const STRATEGIES={
  wide:{name:'8 galur × 3 ulangan',lines:8,reps:3,desc:'Cakupan genetik luas, presisi tiap galur lebih rendah.'},
  balanced:{name:'6 galur × 4 ulangan',lines:6,reps:4,desc:'Kompromi antara cakupan galur dan ketelitian.'},
  precise:{name:'4 galur × 6 ulangan',lines:4,reps:6,desc:'Presisi tinggi, tetapi peluang menemukan galur langka lebih kecil.'}
};
const MANAGEMENTS={
  low:{name:'Input hemat',cost:1200000,yield:-.28,n:.78,water:.82,desc:'Biaya rendah; genotipe efisien sumber daya lebih diuntungkan.'},
  standard:{name:'Standar',cost:1800000,yield:0,n:1,water:1,desc:'Input moderat sebagai pembanding utama.'},
  precision:{name:'Presisi',cost:2600000,yield:.24,n:1.16,water:1.12,desc:'Input lebih mahal; stres berkurang, tetapi perbedaan efisiensi dapat mengecil.'}
};
const ENVS=[
  {id:'dry',name:'Kering panas',yield:-.35,drought:1,disease:18,humidity:-.25},
  {id:'wet',name:'Basah lembap',yield:.18,drought:-.2,disease:42,humidity:.55},
  {id:'rust',name:'Tekanan penyakit',yield:-.12,drought:.15,disease:62,humidity:.25},
  {id:'normal',name:'Musim sedang',yield:.10,drought:.1,disease:26,humidity:0}
];
const DIAGNOSTICS={
  soil:{name:'Uji tanah',icon:'◫',cost:750000},
  plant:{name:'Analisis tanaman',icon:'🌿',cost:650000},
  disease:{name:'Uji penyakit',icon:'◈',cost:850000}
};
const PARAMETERS=['Hasil (t ha-1)','ASI (hari)','Penyakit (%)','WUE (kg m-3)','Margin (Rp ha-1)'];
const FAILURE_ACTIONS={
  nitrogen:{name:'Tambah N',icon:'N',cost:350000},
  drainage:{name:'Perbaiki drainase',icon:'≋',cost:450000},
  protect:{name:'Kendalikan penyakit',icon:'◈',cost:500000}
};
const FAILURE_CAUSES=['nitrogen','drainage','protect'];
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));
const round=(v,d=1)=>Number(Number(v).toFixed(d));
function hashString(text){
  let h=2166136261;
  for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
function seededUnit(seed){
  let x=seed>>>0;x+=0x6D2B79F5;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);
  return ((x^(x>>>14))>>>0)/4294967296;
}
function unit(seed,key){return seededUnit(hashString(seed+':'+key));}
function normal(seed,key){
  const u1=Math.max(1e-9,unit(seed,key+':a')),u2=unit(seed,key+':b');
  return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
}
function money(value){
  return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Math.round(value||0));
}
function plotMeta(index,seed){
  const x=index%6,y=Math.floor(index/6),xn=(x-2.5)/2.5,yn=(y-1.5)/1.5;
  return {x:x+1,y:y+1,fertility:round(.42*xn+.18*yn+normal(seed,'soil:'+index)*.08,2),moisture:round(-.28*xn+.32*yn+normal(seed,'water:'+index)*.07,2)};
}
function line(seed,index){
  return {
    id:'B'+String(index+1).padStart(2,'0'),
    code:'G'+String(index+1).padStart(2,'0'),
    gYield:round(normal(seed,'gy:'+index)*.72,3),
    early:round(normal(seed,'early:'+index)*.72,3),
    diseaseRes:clamp(.5+normal(seed,'dres:'+index)*.18,.08,.92),
    wue:clamp(1+normal(seed,'wue:'+index)*.13,.72,1.34),
    nue:clamp(1+normal(seed,'nue:'+index)*.14,.7,1.36),
    stability:clamp(.58+normal(seed,'stab:'+index)*.17,.18,.95),
    devCost:Math.round(900000+unit(seed,'cost:'+index)*1300000),
    gxe:{
      dry:normal(seed,'gxe:dry:'+index)*.42,
      wet:normal(seed,'gxe:wet:'+index)*.34,
      rust:normal(seed,'gxe:rust:'+index)*.38,
      normal:normal(seed,'gxe:normal:'+index)*.24
    }
  };
}
function designCost(strategyId,managementId){
  const strategy=STRATEGIES[strategyId],management=MANAGEMENTS[managementId];
  return 24*135000+strategy.lines*180000+management.cost;
}
function observation(comp,hiddenLine,unitDef,env,phase,rep){
  const management=MANAGEMENTS[comp.management]||MANAGEMENTS.standard;
  const soil=plotMeta(unitDef.plot,comp.seed);
  const key=phase+':'+env.id+':'+unitDef.plot+':'+hiddenLine.id+':'+rep;
  const block=(rep-(comp.reps+1)/2)*.05;
  const gxE=(hiddenLine.gxe[env.id]||0)*(1.18-hiddenLine.stability*.42);
  const gxM=(hiddenLine.nue-1)*(management.n-.9)*1.15+(hiddenLine.wue-1)*(management.water-.9)*(env.drought+.35)*1.05;
  const spatial=.82*soil.fertility+.48*soil.moisture*(env.drought+.25);
  const residual=normal(comp.seed,key)*(.62-.24*hiddenLine.stability);
  const y=Math.max(2.2,7.05+hiddenLine.gYield+env.yield+management.yield+gxE+gxM+spatial+block+residual);
  const asi=Math.max(.4,3.8+hiddenLine.early+env.drought*.85-management.yield*.35+normal(comp.seed,key+':asi')*.42);
  const disease=clamp(env.disease+env.humidity*11+soil.moisture*7-hiddenLine.diseaseRes*39+normal(comp.seed,key+':dis')*5.4,0,100);
  const wue=Math.max(.45,1.08+(hiddenLine.wue-1)*1.45-env.drought*.06+management.water*.08+normal(comp.seed,key+':wue')*.07);
  const inputCost=4800000+management.cost+hiddenLine.devCost;
  const margin=y*1000*5200-inputCost-disease*22000;
  return {'Hasil (t ha-1)':round(y,2),'ASI (hari)':round(asi,2),'Penyakit (%)':round(disease,1),'WUE (kg m-3)':round(wue,2),'Margin (Rp ha-1)':Math.round(margin)};
}
function score(metrics,tenderId,devCost){
  const w=(TENDERS[tenderId]||TENDERS.drought).weights;
  const values={
    yield:clamp((metrics.meanYield-3.5)/6*100),
    wue:clamp((metrics.wue-.55)/1.1*100),
    early:clamp(100-(metrics.asi-1)*18),
    disease:clamp(100-metrics.disease),
    margin:clamp((metrics.margin-8000000)/30000000*100),
    stability:clamp(100-metrics.sdYield*32),
    cost:clamp(100-(devCost/3500000)*100)
  };
  return round(Object.entries(w).reduce((sum,item)=>sum+(values[item[0]]||0)*item[1],0),1);
}
export function createBreedingCup(api){
  const state=()=>api.getState();
  const esc=api.esc;
  function active(){return state().experiment&&state().experiment.kind==='competition'&&!!state().competition;}
  function plotClass(index){
    const comp=state().competition;
    if(!comp||!comp.diagnostics.includes('soil'))return '';
    const soil=plotMeta(index,comp.seed);
    return soil.fertility>.18?' soil-high':soil.fertility<-.18?' soil-low':' soil-mid';
  }
  function inspector(index){
    const st=state(),comp=st.competition,exp=st.experiment;
    if(!comp||!exp||exp.kind!=='competition')return null;
    const u=exp.units.find(item=>item.plot===index),t=u&&exp.treatments.find(item=>item.id===u.treatmentId),soil=plotMeta(index,comp.seed);
    let soilHtml='';
    if(comp.diagnostics.includes('soil')){
      soilHtml='<div class="competition-plot-soil"><small>Kesuburan relatif</small><b>'+(soil.fertility>=0?'+':'')+soil.fertility.toFixed(2)+'</b><small>Kelembapan relatif</small><b>'+(soil.moisture>=0?'+':'')+soil.moisture.toFixed(2)+'</b></div>';
    }
    return '<div class="competition-plot-card"><span>SELEKSI BUTA</span><b>'+esc(t?t.code:'—')+' · K'+(u?u.rep:'—')+'</b><p>Potensi genetik disembunyikan. Nilai fenotip muncul setelah uji lapang.</p>'+soilHtml+'<button id="openCupFromPlot" class="primary" type="button">🏆 Buka Breeding Cup</button></div>';
  }
  function start(values){
    const st=state();
    if(st.field.some(Boolean)){api.toast('Kosongkan lahan sebelum Breeding Cup');return;}
    const strategy=STRATEGIES[values.strategy]||STRATEGIES.balanced;
    const tender=TENDERS[values.tender]||TENDERS.drought;
    const management=MANAGEMENTS[values.management]||MANAGEMENTS.standard;
    const dailyKey=String(values.dailyKey||''),providedSeed=Number(values.seed),seed=Number.isFinite(providedSeed)?(providedSeed>>>0):hashString(api.uid('cup')+':'+st.season);
    const treatments=Array.from({length:strategy.lines},(_,i)=>({id:'B'+String(i+1).padStart(2,'0'),code:'G'+String(i+1).padStart(2,'0'),name:'Galur '+String(i+1).padStart(2,'0')}));
    const cost=designCost(values.strategy,values.management),initialBudget=Math.max(6000000,Number(values.budget)||12000000);
    st.challenge='trial24';st.maxDay=12;st.daily=dailyKey?{...(st.daily||{}),key:dailyKey,type:'breeding'}:null;st.monoSeedId=null;
    const design=values.design==='ral'?'ral':'rak';
    st.experiment={id:api.uid('exp'),name:'Breeding Cup · '+tender.name,design,kind:'competition',treatments,reps:strategy.reps,parameters:[...PARAMETERS],units:api.randomize(design,treatments,strategy.reps),createdAt:new Date().toISOString()};
    st.competition={id:api.uid('cup'),seed,dailyKey:dailyKey||null,strategy:values.strategy,tender:values.tender,management:values.management,design,reps:strategy.reps,initialBudget,budget:initialBudget-cost,spent:cost,stage:'design',trialEnv:ENVS[Math.floor(unit(seed,'trial-env')*ENVS.length)].id,hiddenLines:Array.from({length:strategy.lines},(_,i)=>line(seed,i)),diagnostics:[],selected:[],decisions:[{type:'design',text:design.toUpperCase()+' · '+strategy.name+' · '+management.name}],failure:{symptom:'Daun menguning dan pertumbuhan terhambat',cause:FAILURE_CAUSES[Math.floor(unit(seed,'failure-cause')*FAILURE_CAUSES.length)],action:null,correct:null},final:null};
    st.selectedPlot=0;api.setTool('');api.addLog('🏆 Breeding Cup dimulai: '+strategy.name+' · tender '+tender.name+'.');api.save();api.render();open();
  }
  function simulate(){
    const st=state(),comp=st.competition,exp=st.experiment;
    if(!comp||!exp||comp.stage!=='design')return;
    const env=ENVS.find(item=>item.id===comp.trialEnv)||ENVS[0];
    exp.units.forEach(u=>{
      const hiddenLine=comp.hiddenLines.find(item=>item.id===u.treatmentId);
      if(!hiddenLine)return;
      u.observations=observation(comp,hiddenLine,u,env,'trial',u.rep);u.applied=true;
    });
    comp.stage='selection';comp.decisions.push({type:'trial',text:'Uji lapang selesai pada '+env.name+'.'});
    api.addLog('📊 Data Breeding Cup tersedia untuk seleksi buta.');api.save();api.render();open();
  }
  function summaries(){
    const st=state(),exp=st.experiment;
    if(!exp)return[];
    return exp.treatments.map(t=>{
      const units=exp.units.filter(u=>u.treatmentId===t.id);
      const mean=key=>units.reduce((a,u)=>a+(Number(u.observations&&u.observations[key])||0),0)/Math.max(1,units.length);
      const ys=units.map(u=>Number(u.observations&&u.observations['Hasil (t ha-1)'])||0),ym=ys.reduce((a,b)=>a+b,0)/Math.max(1,ys.length);
      const se=ys.length>1?Math.sqrt(ys.reduce((a,v)=>a+(v-ym)*(v-ym),0)/(ys.length-1))/Math.sqrt(ys.length):0;
      return {id:t.id,code:t.code,yield:mean('Hasil (t ha-1)'),asi:mean('ASI (hari)'),disease:mean('Penyakit (%)'),wue:mean('WUE (kg m-3)'),margin:mean('Margin (Rp ha-1)'),se};
    });
  }
  function proxy(row,tenderId){
    const w=(TENDERS[tenderId]||TENDERS.drought).weights;
    const values={yield:clamp((row.yield-3.5)/6*100),wue:clamp((row.wue-.55)/1.1*100),early:clamp(100-(row.asi-1)*18),disease:clamp(100-row.disease),margin:clamp((row.margin-8000000)/30000000*100),stability:clamp(100-row.se*45),cost:70};
    return Object.entries(w).reduce((sum,item)=>sum+(values[item[0]]||0)*item[1],0);
  }
  function pickLine(id,checked){
    const comp=state().competition;if(!comp)return;
    const selected=new Set(comp.selected||[]);
    if(checked&&selected.size>=2&&!selected.has(id)){api.toast('Maksimal 2 galur untuk uji akhir');open();return;}
    checked?selected.add(id):selected.delete(id);comp.selected=[...selected];api.save();
  }
  function diagnosticText(type){
    const comp=state().competition,env=ENVS.find(item=>item.id===comp.trialEnv);
    if(type==='soil')return 'Gradien kesuburan meningkat ke sisi kanan lahan; kelembapan cenderung meningkat ke baris bawah. '+(comp.design==='rak'?'RAK menyebarkan setiap galur di dalam kelompok sehingga sebagian variasi posisi dapat dipisahkan.':'RAL mengacak seluruh petak, tetapi gradien spasial dapat tetap masuk ke galat dan memperbesar ketidakpastian.')+(comp.failure?.cause==='nitrogen'?' Sampel petak bermasalah menunjukkan N mineral rendah.':comp.failure?.cause==='drainage'?' N mineral cukup, tetapi kadar air tanah sangat tinggi.':' N mineral dan aerasi tidak menjelaskan gejala utama.');
    if(type==='plant'){
      const rows=summaries(),avg=rows.reduce((a,r)=>a+r.se,0)/Math.max(1,rows.length);
      return 'SE hasil rata-rata '+avg.toFixed(2)+' t ha⁻¹. Ulangan lebih banyak menurunkan ketidakpastian rerata, tetapi mengurangi jumlah galur. '+(comp.failure?.cause==='nitrogen'?'Analisis jaringan menunjukkan N daun rendah.':comp.failure?.cause==='drainage'?'N jaringan cukup, tetapi indikator hipoksia akar meningkat.':'N jaringan cukup; pola kerusakan tidak konsisten dengan defisiensi N.');
    }
    if(type==='disease')return 'Tekanan penyakit musim awal sekitar '+Math.round(env.disease)+'%. Gejala juga dipengaruhi kelembapan, ketahanan genetik, posisi petak, dan galat. '+(comp.failure?.cause==='protect'?'Uji patogen positif pada petak bermasalah.':'Uji patogen tidak menunjukkan infeksi primer sebagai penyebab utama.');
    return '';
  }
  function buyDiagnostic(type){
    const comp=state().competition,diag=DIAGNOSTICS[type];
    if(!comp||!diag||comp.diagnostics.includes(type))return;
    if(comp.budget<diag.cost){api.toast('Anggaran tidak cukup');return;}
    comp.budget-=diag.cost;comp.spent+=diag.cost;comp.diagnostics.push(type);comp.decisions.push({type:'diagnostic',text:diag.name+' · '+money(diag.cost)});
    api.addLog(diag.icon+' '+diag.name+' dibeli untuk investigasi kegagalan.');api.save();api.render();open();
  }
  function resolveFailure(actionId){
    const comp=state().competition,action=FAILURE_ACTIONS[actionId];
    if(!comp?.failure||comp.failure.action||!action)return;
    if(comp.budget<action.cost){api.toast('Anggaran tidak cukup');return;}
    comp.budget-=action.cost;comp.spent+=action.cost;comp.failure.action=actionId;comp.failure.correct=actionId===comp.failure.cause;
    const verdict=comp.failure.correct?'tepat':'tidak tepat';
    comp.decisions.push({type:'failure',text:action.name+' · '+verdict+' · '+money(action.cost)});
    api.addLog(action.icon+' Tindakan '+action.name+' '+verdict+' untuk gejala lapang.');
    api.save();api.render();open();
  }
  function failureHtml(){
    const comp=state().competition,failure=comp?.failure;
    if(!failure)return '';
    const result=failure.action?'<div class="failure-result '+(failure.correct?'correct':'wrong')+'"><b>'+(failure.correct?'✓ Diagnosis tepat':'! Diagnosis meleset')+'</b><span>Penyebab sebenarnya: '+esc(FAILURE_ACTIONS[failure.cause].name)+'. Biaya tindakan tetap terpakai.</span></div>':'';
    const actions=failure.action?'':Object.entries(FAILURE_ACTIONS).map(entry=>'<button data-failure-action="'+entry[0]+'" '+(comp.budget<entry[1].cost?'disabled':'')+'><b>'+entry[1].icon+' '+esc(entry[1].name)+'</b><span>'+money(entry[1].cost)+'</span></button>').join('');
    return '<section class="failure-case"><small>INVESTIGASI KEGAGALAN</small><b>'+esc(failure.symptom)+'</b><p>Gejala sengaja tidak spesifik. Gunakan bukti yang Anda beli sebelum memilih tindakan.</p>'+result+(actions?'<div class="failure-actions">'+actions+'</div>':'')+'</section>';
  }
  function evaluateLine(comp,hiddenLine,tag){
    const observations=[];
    ENVS.filter(e=>e.id!=='normal').forEach((env,eIndex)=>{
      for(let rep=1;rep<=2;rep++){
        const plot=(eIndex*8+rep*3+Number(hiddenLine.id.slice(1)))%24;
        observations.push(observation(comp,hiddenLine,{plot,rep},env,tag,rep));
      }
    });
    const vals=key=>observations.map(o=>Number(o[key])||0),mean=arr=>arr.reduce((a,b)=>a+b,0)/Math.max(1,arr.length);
    const y=vals('Hasil (t ha-1)'),my=mean(y),sd=Math.sqrt(y.reduce((a,v)=>a+(v-my)*(v-my),0)/Math.max(1,y.length-1));
    const metrics={meanYield:my,sdYield:sd,asi:mean(vals('ASI (hari)')),disease:mean(vals('Penyakit (%)')),wue:mean(vals('WUE (kg m-3)')),margin:mean(vals('Margin (Rp ha-1)'))};
    return {...metrics,score:score(metrics,comp.tender,hiddenLine.devCost),observations};
  }
  function finalTest(){
    const comp=state().competition;
    if(!comp||comp.stage!=='selection')return;
    if((comp.selected||[]).length!==2){api.toast('Pilih tepat 2 galur');return;}
    const finalists=comp.selected.map(id=>comp.hiddenLines.find(l=>l.id===id)).filter(Boolean);
    const results=finalists.map(l=>({id:l.id,code:l.code,...evaluateLine(comp,l,'final')})).sort((a,b)=>b.score-a.score);
    const oracle=comp.hiddenLines.map(l=>({id:l.id,code:l.code,...evaluateLine(comp,l,'oracle')})).sort((a,b)=>b.score-a.score);
    const trial=summaries().sort((a,b)=>proxy(b,comp.tender)-proxy(a,comp.tender));
    const keptTrialBest=comp.selected.includes(trial[0]&&trial[0].id),oracleBest=oracle[0],rejectedBest=!comp.selected.includes(oracleBest.id);
    const bestDecision=keptTrialBest?'Mempertahankan '+trial[0].code+' berdasarkan bukti fenotipik terbaik pada uji awal.':(comp.diagnostics.length?'Menggunakan '+DIAGNOSTICS[comp.diagnostics[0]].name+' untuk membaca variasi non-genetik.':'Menjaga randomisasi RAK pada seluruh 24 petak.');
    const mistake=rejectedBest?'Melepas '+oracleBest.code+'; uji rahasia menunjukkan skor '+oracleBest.score+', lebih tinggi daripada kandidat yang lolos.':'Biaya keputusan terbesar berasal dari '+MANAGEMENTS[comp.management].name+' dan diagnostik: '+money(comp.spent)+'.';
    comp.final={results,oracleBest:{id:oracleBest.id,code:oracleBest.code,score:oracleBest.score},bestDecision,mistake,completedAt:new Date().toISOString()};
    comp.stage='final';comp.decisions.push({type:'final',text:'Uji akhir rahasia selesai pada 3 lingkungan.'});
    if(comp.dailyKey){const key='daily-breeding:'+comp.dailyKey,best=Number(results[0]?.score)||0;state().records[key]=Math.max(Number(state().records[key]||0),best);state().reputation=Math.max(0,Number(state().reputation||0)+2);state().partnerTrust=clamp(Number(state().partnerTrust??50)+2,0,100);}
    api.save();api.render();open();
  }
  function reset(){
    const st=state();st.competition=null;st.experiment=null;st.challenge='standard';st.maxDay=12;st.selectedPlot=0;if(st.daily?.type==='breeding')st.daily=null;api.setTool('');api.save();api.render();api.openExperiment();
  }
  function diagnosticsHtml(){
    const comp=state().competition;
    return '<div class="competition-diagnostics">'+Object.entries(DIAGNOSTICS).map(entry=>{
      const id=entry[0],d=entry[1];
      if(comp.diagnostics.includes(id))return '<article><b>'+d.icon+' '+esc(d.name)+'</b><p>'+esc(diagnosticText(id))+'</p></article>';
      return '<button data-comp-diagnostic="'+id+'" '+(comp.budget<d.cost?'disabled':'')+'><b>'+d.icon+' '+esc(d.name)+'</b><span>'+money(d.cost)+'</span></button>';
    }).join('')+'</div>';
  }
  function summaryHtml(){
    const comp=state().competition,rows=summaries().sort((a,b)=>proxy(b,comp.tender)-proxy(a,comp.tender));
    return '<div class="experiment-table-wrap"><table class="experiment-table competition-table"><thead><tr><th>Finalis</th><th>Galur</th><th>Hasil</th><th>SE</th><th>ASI</th><th>Penyakit</th><th>WUE</th><th>Margin</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><input type="checkbox" data-comp-pick="'+r.id+'" '+(comp.selected.includes(r.id)?'checked':'')+'></td><td><b>'+r.code+'</b></td><td>'+r.yield.toFixed(2)+'</td><td>'+r.se.toFixed(2)+'</td><td>'+r.asi.toFixed(2)+'</td><td>'+r.disease.toFixed(1)+'%</td><td>'+r.wue.toFixed(2)+'</td><td>'+money(r.margin)+'</td></tr>').join('')+'</tbody></table></div>';
  }
  function finalHtml(){
    const comp=state().competition,rows=comp.final&&comp.final.results||[];
    return '<div class="competition-final"><div class="competition-podium">'+rows.map((r,i)=>'<article><span>#'+(i+1)+'</span><b>'+r.code+'</b><strong>'+r.score+'</strong><small>hasil '+r.meanYield.toFixed(2)+' t ha⁻¹ · SD '+r.sdYield.toFixed(2)+' · WUE '+r.wue.toFixed(2)+'</small></article>').join('')+'</div><div class="decision-review"><article><small>KEPUTUSAN TERBAIK</small><b>✓ '+esc(comp.final.bestDecision)+'</b></article><article><small>KESALAHAN TERMAHAL</small><b>! '+esc(comp.final.mistake)+'</b></article></div></div>';
  }
  function bind(){
    const body=document.querySelector('#metaModalBody');
    body.querySelectorAll('[data-comp-diagnostic]').forEach(b=>b.onclick=()=>buyDiagnostic(b.dataset.compDiagnostic));
    body.querySelectorAll('[data-comp-pick]').forEach(box=>box.onchange=()=>pickLine(box.dataset.compPick,box.checked));
    const simulateButton=body.querySelector('[data-comp-simulate]');if(simulateButton)simulateButton.onclick=simulate;
    const finalButton=body.querySelector('[data-comp-final]');if(finalButton)finalButton.onclick=finalTest;
    const statButton=body.querySelector('[data-comp-stat]');if(statButton)statButton.onclick=api.sendToStat;
    body.querySelectorAll('[data-failure-action]').forEach(button=>button.onclick=()=>resolveFailure(button.dataset.failureAction));
    const resetButton=body.querySelector('[data-comp-reset]');if(resetButton)resetButton.onclick=()=>{if(confirm('Akhiri Breeding Cup ini?'))reset();};
  }
  function open(){
    const comp=state().competition;
    if(!comp){
      let strategyOptions=Object.entries(STRATEGIES).map(entry=>'<option value="'+entry[0]+'" '+(entry[0]==='balanced'?'selected':'')+'>'+esc(entry[1].name)+' — '+esc(entry[1].desc)+'</option>').join('');
      let tenderOptions=Object.entries(TENDERS).map(entry=>'<option value="'+entry[0]+'">'+entry[1].icon+' '+esc(entry[1].name)+'</option>').join('');
      let managementOptions=Object.entries(MANAGEMENTS).map(entry=>'<option value="'+entry[0]+'" '+(entry[0]==='standard'?'selected':'')+'>'+esc(entry[1].name)+'</option>').join('');
      api.openModal('BREEDING CUP','🏆 Seleksi varietas dengan anggaran terbatas','<form id="competitionForm" class="experiment-form competition-form"><label class="experiment-wide">Strategi 24 petak<select name="strategy">'+strategyOptions+'</select></label><label>Rancangan<select name="design"><option value="rak">RAK · kontrol gradien dengan kelompok</option><option value="ral">RAL · acak seluruh petak</option></select></label><label>Tender<select name="tender">'+tenderOptions+'</select></label><label>Manajemen<select name="management">'+managementOptions+'</select></label><div class="competition-budget experiment-wide"><span>Anggaran awal</span><b>'+money(12000000)+'</b><small>Biaya rancangan, input, dan diagnostik mengurangi anggaran. Potensi genetik galur disembunyikan.</small></div><button class="primary experiment-wide" type="submit">🎲 Mulai kompetisi 24 petak</button></form><p class="meta-note">Model menghasilkan data dari G + E + M + G×E + G×M + gradien kesuburan/kelembapan + galat. Tidak ada aturan yang memaksa p-value menjadi nyata.</p>');
      document.querySelector('#competitionForm').onsubmit=event=>{event.preventDefault();const fd=new FormData(event.currentTarget);start({strategy:String(fd.get('strategy')),design:String(fd.get('design')),tender:String(fd.get('tender')),management:String(fd.get('management'))});};
      return;
    }
    const plan=STRATEGIES[comp.strategy],tender=TENDERS[comp.tender],management=MANAGEMENTS[comp.management],env=ENVS.find(e=>e.id===comp.trialEnv);
    let body='<div class="competition-head"><span>🏆 '+esc(tender.name)+'</span><span>📐 '+esc((comp.design||'rak').toUpperCase())+' · '+esc(plan.name)+'</span><span>💰 '+money(comp.budget)+'</span>'+(comp.dailyKey?'<span>🧬 DAILY '+esc(comp.dailyKey)+'</span>':'')+'</div><div class="competition-brief"><b>'+esc(management.name)+'</b><span>'+esc(management.desc)+'</span><small>Uji awal: '+esc(env.name)+' · galur tetap anonim.</small></div>';
    if(comp.stage==='design')body+=diagnosticsHtml()+'<div class="competition-actions"><button data-comp-reset>× Akhiri</button><button class="primary" data-comp-simulate>▶ Jalankan uji lapang</button></div><p class="meta-note">Petak sudah diacak dalam RAK. Pemeriksaan tanah bersifat opsional dan mengurangi anggaran.</p>';
    if(comp.stage==='selection')body+=summaryHtml()+failureHtml()+diagnosticsHtml()+'<div class="competition-actions"><button data-comp-stat>📊 /stat · DATA SIMULASI</button><button class="primary" data-comp-final>🔒 Uji akhir rahasia</button></div><p class="meta-note">Pilih tepat 2 galur. Uji akhir memakai tiga lingkungan baru dengan aturan identik untuk semua finalis.</p>';
    if(comp.stage==='final')body+=finalHtml()+'<div class="competition-actions"><button data-comp-stat>📊 /stat · DATA SIMULASI</button><button class="primary" data-comp-reset>↺ Program baru</button></div>';
    api.openModal('BREEDING CUP',comp.stage==='final'?'Uji akhir selesai':'Seleksi buta aktif',body);bind();
  }
  return {active,open,start,plotClass,inspector,finalReview:()=>state().competition&&state().competition.final||null};
}
export {TENDERS,STRATEGIES,MANAGEMENTS,ENVS,PARAMETERS};
