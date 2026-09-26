const PROFILES={
  maize:{
    id:'maize',sampleCount:3,
    parameters:['TT','DB','JD','UA','US','ASI','PT','DT','JB','BB','KA','Hasil'],
    labels:{TT:'Tinggi tanaman',DB:'Diameter batang',JD:'Jumlah daun',UA:'Umur anthesis',US:'Umur silking',ASI:'Anthesis-silking interval',PT:'Panjang tongkol',DT:'Diameter tongkol',JB:'Jumlah biji',BB:'Bobot biji',KA:'Kadar air',Hasil:'Hasil'}
  },
  chili:{
    id:'chili',sampleCount:3,
    parameters:['TT','DB','JD','UB','JBu','PB','DBu','BB','Hasil'],
    labels:{TT:'Tinggi tanaman',DB:'Diameter batang',JD:'Jumlah daun',UB:'Umur berbunga',JBu:'Jumlah buah',PB:'Panjang buah',DBu:'Diameter buah',BB:'Bobot buah',Hasil:'Hasil'}
  },
  rice:{
    id:'rice',sampleCount:3,
    parameters:['TT','JA','JAP','PM','GI','GH','BB','Hasil'],
    labels:{TT:'Tinggi tanaman',JA:'Jumlah anakan',JAP:'Anakan produktif',PM:'Panjang malai',GI:'Gabah isi',GH:'Gabah hampa',BB:'Bobot biji',Hasil:'Hasil'}
  },
  soybean:{
    id:'soybean',sampleCount:3,
    parameters:['TT','DB','JD','JC','PI','PH','BB','Hasil'],
    labels:{TT:'Tinggi tanaman',DB:'Diameter batang',JD:'Jumlah daun',JC:'Jumlah cabang',PI:'Polong isi',PH:'Polong hampa',BB:'Bobot biji',Hasil:'Hasil'}
  }
};
function hash(text){
  let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;
}
function unit(seed){let x=(Number(seed)||1)>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;}
function fx(seed,span=.12){return 1-span/2+unit(seed)*span;}
export function speciesProfile(species){return PROFILES[species]||PROFILES.maize;}
export function recommendedParameters(species){return [...speciesProfile(species).parameters];}
export function makeSubsamples({plotUid,plantUid,species='maize',simulationSeed=1,count=0}={}){
  const profile=speciesProfile(species),n=Math.max(1,Math.min(8,Number(count)||profile.sampleCount));
  return Array.from({length:n},(_,i)=>{
    const base=hash([simulationSeed,plotUid,plantUid,i+1].join(':'));
    return {
      id:`${plantUid||plotUid||'plant'}-S${i+1}`,
      number:i+1,
      alive:true,
      vigorFx:fx(base+11,.16),
      heightFx:fx(base+23,.12),
      diameterFx:fx(base+37,.14),
      leafFx:fx(base+53,.1),
      reproductiveFx:fx(base+71,.18),
      fruitFx:fx(base+89,.16)
    };
  });
}
export function sampleMeasurements({species='maize',crop,sample,bioDay=1,yieldValue=''}={}){
  const growth=Math.max(0,Math.min(110,Number(crop?.growth)||0)),health=Math.max(0,Math.min(100,Number(crop?.health)||0))/100;
  const vigor=Number(crop?.seed?.vigor)||1,water=Math.max(0,Math.min(100,Number(crop?.water)||0)),disease=Math.max(0,Math.min(100,Number(crop?.disease)||0));
  const base={
    TT:Number(((8+growth*1.65)*vigor*(sample?.heightFx||1)).toFixed(1)),
    DB:Number(((3+growth*.14)*(.8+.2*health)*(sample?.diameterFx||1)).toFixed(1)),
    JD:Math.max(2,Math.round((2+growth*.12)*(sample?.leafFx||1)))
  };
  if(species==='chili'){
    const flowering=growth>=45?Math.max(20,Math.round(bioDay-(growth-45)*.12)):'',
      fruitSet=Math.max(0,Math.round((growth-48)*.24*health*(sample?.reproductiveFx||1)*(1-disease/180))),
      length=fruitSet?Number((25+growth*.22*(sample?.fruitFx||1)).toFixed(1)):'',
      diameter=fruitSet?Number((5+growth*.055*(sample?.fruitFx||1)).toFixed(1)):'',
      fruitWeight=fruitSet?Number((fruitSet*(1.4+growth*.012)*health*(sample?.fruitFx||1)).toFixed(1)):'';
    return {...base,UB:flowering,JBu:fruitSet,PB:length,DBu:diameter,BB:fruitWeight,Hasil:yieldValue};
  }
  if(species==='rice'){
    const tillers=Math.max(1,Math.round((1+growth*.15)*health*(sample?.reproductiveFx||1))),
      productive=growth>=55?Math.max(0,Math.round(tillers*(.55+.35*health))):'',
      panicle=growth>=65?Number((12+growth*.13*(sample?.fruitFx||1)).toFixed(1)):'',
      filled=growth>=78?Math.max(0,Math.round((35+growth*1.05)*health*(sample?.reproductiveFx||1)*(1-disease/190))):'',
      empty=growth>=78?Math.max(0,Math.round(Number(filled||0)*(.07+disease/220))):'',
      seedWeight=growth>=78?Number((Number(filled||0)*.024*(.9+.1*water/100)).toFixed(2)):'';
    return {TT:base.TT,JA:tillers,JAP:productive,PM:panicle,GI:filled,GH:empty,BB:seedWeight,Hasil:yieldValue};
  }
  if(species==='soybean'){
    const branches=Math.max(1,Math.round((1+growth*.045)*health*(sample?.leafFx||1))),
      podReady=growth>=62,
      filled=podReady?Math.max(0,Math.round((4+growth*.32)*health*(sample?.reproductiveFx||1)*(1-disease/180))):'',
      empty=podReady?Math.max(0,Math.round(Number(filled||0)*(.05+disease/180))):'',
      seedWeight=podReady?Number((Number(filled||0)*.48*(.9+.1*water/100)).toFixed(1)):'';
    return {...base,JC:branches,PI:filled,PH:empty,BB:seedWeight,Hasil:yieldValue};
  }
  const anthesis=crop?.anthesisBioDay||'',silking=crop?.silkingBioDay||'',asi=anthesis&&silking?silking-anthesis:'',
    earReady=growth>=78,earLength=earReady?Number((7+growth*.11*(sample?.reproductiveFx||1)).toFixed(1)):'',
    earDiameter=earReady?Number((2.2+growth*.018*(sample?.reproductiveFx||1)).toFixed(1)):'',
    kernels=earReady?Math.max(0,Math.round((120+growth*3.7)*health*(sample?.reproductiveFx||1)*(1-disease/170))):'',
    seedWeight=earReady?Number((Number(kernels||0)*.27*(.9+.1*water/100)).toFixed(1)):'',
    moisture=earReady?Number(Math.max(12,34-(growth-78)*.58).toFixed(1)):'';
  return {...base,UA:anthesis,US:silking,ASI:asi,PT:earLength,DT:earDiameter,JB:kernels,BB:seedWeight,KA:moisture,Hasil:yieldValue};
}
export function aggregateSamples(samples,parameter){
  const values=(samples||[]).map(row=>Number(row?.values?.[parameter])).filter(Number.isFinite);
  if(!values.length)return '';
  return Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(2));
}
export function plotCarryover(meta={}){
  const history=Array.isArray(meta.history)?meta.history.slice(-3):[];
  let fertility=Number(meta.fertility)||1,diseasePressure=0,organic=0,drainage=Number(meta.drainage)||1,compaction=Number(meta.compaction)||.2,pH=Number(meta.pH)||6;
  for(const row of history){
    const treatment=String(row.treatment||'').toLowerCase(),use=String(row.use||'');
    if(/kompos|pupuk kandang|organik/.test(treatment)){fertility+=.015;organic+=1;compaction=Math.max(.08,compaction-.015);}
    if(/kapur|pengapuran/.test(treatment))pH=Math.min(7,pH+.08);
    if(/drainase/.test(treatment))drainage=Math.min(1.18,drainage+.03);
    if(/olah tanah intensif|pemadatan/.test(treatment))compaction=Math.min(.55,compaction+.025);
    if(/n 200|n 250|nitrogen/.test(treatment))fertility-=.008;
    if(Number(row.health)<65)diseasePressure+=.025;
    if(use==='commercial')fertility-=.004;
  }
  return {fertility:Math.max(.82,Math.min(1.18,fertility)),diseasePressure:Math.min(.12,diseasePressure),organic,drainage:Math.max(.72,Math.min(1.2,drainage)),compaction:Math.max(.06,Math.min(.6,compaction)),pH:Math.max(4.5,Math.min(7.5,pH))};
}
export function evidenceLabel({tests=0,generation=0,stressTests=0}={}){
  if(tests>=3&&generation>=4&&stressTests>=1)return 'Relatif stabil';
  if(tests>=2)return 'Didukung pengujian';
  if(tests>=1)return 'Indikasi';
  return 'Belum diketahui';
}

const LOCI=['YLD','MAT','WUE','DIS'];
const LINKAGE_GROUPS=[
  {id:'chr1',loci:['YLD','MAT'],recombination:.18},
  {id:'chr2',loci:['WUE','DIS'],recombination:.24}
];
function allele(seed,key,index){return [-1,0,1][Math.floor(unit(hash([seed,key,index].join(':')))*3)];}
export function founderGenome(seedId,simulationSeed=1){
  return Object.fromEntries(LOCI.map(key=>[key,[allele(simulationSeed+':'+seedId,key,0),allele(simulationSeed+':'+seedId,key,1)]]));
}
export function normalizeGenome(genome,seedId='seed',simulationSeed=1){
  if(genome&&LOCI.every(key=>Array.isArray(genome[key])&&genome[key].length===2))return genome;
  return founderGenome(seedId,simulationSeed);
}
function linkedGamete(genome,key='gamete'){
  const g=normalizeGenome(genome,key),gamete={};
  for(const group of LINKAGE_GROUPS){
    let homolog=unit(hash(key+':'+group.id+':phase'))<.5?0:1;
    group.loci.forEach((locus,index)=>{
      if(index>0&&unit(hash(key+':'+group.id+':recomb:'+index))<group.recombination)homolog=1-homolog;
      gamete[locus]=g[locus][homolog];
    });
  }
  return gamete;
}
export function crossGenome(parentA,parentB,key='cross'){
  const a=linkedGamete(parentA,key+':A'),b=linkedGamete(parentB,key+':B');
  return Object.fromEntries(LOCI.map(locus=>[locus,[a[locus],b[locus]]]));
}
export function selfGenome(parent,key='self'){
  const a=linkedGamete(parent,key+':self:1'),b=linkedGamete(parent,key+':self:2');
  return Object.fromEntries(LOCI.map(locus=>[locus,[a[locus],b[locus]]]));
}
export function geneticEffects(genome){
  const g=normalizeGenome(genome,'effects'),value=locus=>(Number(g[locus]?.[0])||0)+(Number(g[locus]?.[1])||0),hetero=locus=>g[locus]?.[0]!==g[locus]?.[1];
  const heterozygosity=LOCI.filter(hetero).length/LOCI.length,inbreeding=1-heterozygosity,heterosis=heterozygosity*.035;
  return {
    yield:Math.max(.84,Math.min(1.18,1+value('YLD')*.035+(hetero('YLD')?.018:0)+heterosis-inbreeding*.012)),
    growth:Math.max(.9,Math.min(1.1,1+value('MAT')*.025)),
    waterLoss:Math.max(.88,Math.min(1.12,1-value('WUE')*.035)),
    diseaseRisk:Math.max(.86,Math.min(1.14,1-value('DIS')*.04)),
    heterozygosity,inbreeding,heterosis,
    linkageGroups:LINKAGE_GROUPS.map(group=>({id:group.id,loci:[...group.loci],recombination:group.recombination}))
  };
}


// PROFESSOR ACADEMY: experimental design, statistics, and breeding pedagogy.
const academyMean=values=>values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);
const academySum=values=>values.reduce((sum,value)=>sum+value,0);
function academyGammaLn(z){
  const c=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,.001208650973866179,-.000005395239384953];
  let x=z,y=z,tmp=x+5.5;tmp-=(x+.5)*Math.log(tmp);let ser=1.000000000190015;
  for(let j=0;j<c.length;j++)ser+=c[j]/++y;
  return -tmp+Math.log(2.5066282746310005*ser/x);
}
function academyBetaCf(a,b,x){
  const max=120,eps=3e-8,fpmin=1e-30,qab=a+b,qap=a+1,qam=a-1;
  let c=1,d=1-qab*x/qap;if(Math.abs(d)<fpmin)d=fpmin;d=1/d;let h=d;
  for(let m=1;m<=max;m++){
    const m2=2*m;
    let aa=m*(b-m)*x/((qam+m2)*(a+m2));d=1+aa*d;if(Math.abs(d)<fpmin)d=fpmin;c=1+aa/c;if(Math.abs(c)<fpmin)c=fpmin;d=1/d;h*=d*c;
    aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));d=1+aa*d;if(Math.abs(d)<fpmin)d=fpmin;c=1+aa/c;if(Math.abs(c)<fpmin)c=fpmin;d=1/d;const del=d*c;h*=del;
    if(Math.abs(del-1)<eps)break;
  }
  return h;
}
function academyBetaI(a,b,x){
  if(x<=0)return 0;if(x>=1)return 1;
  const bt=Math.exp(academyGammaLn(a+b)-academyGammaLn(a)-academyGammaLn(b)+a*Math.log(x)+b*Math.log(1-x));
  return x<(a+1)/(a+b+2)?bt*academyBetaCf(a,b,x)/a:1-bt*academyBetaCf(b,a,1-x)/b;
}
function academyFPValue(f,df1,df2){
  if(!(f>=0)||df1<=0||df2<=0)return null;
  const x=(df1*f)/(df1*f+df2);
  return Math.max(0,Math.min(1,1-academyBetaI(df1/2,df2/2,x)));
}
function academyTCritical05(df){
  const table=[[1,12.706],[2,4.303],[3,3.182],[4,2.776],[5,2.571],[6,2.447],[7,2.365],[8,2.306],[9,2.262],[10,2.228],[12,2.179],[15,2.131],[20,2.086],[30,2.042],[60,2],[120,1.98],[1e9,1.96]];
  for(let i=0;i<table.length;i++){
    if(df<=table[i][0]){
      if(i===0)return table[i][1];
      const [d0,t0]=table[i-1],[d1,t1]=table[i],w=(df-d0)/(d1-d0);
      return t0+(t1-t0)*w;
    }
  }
  return 1.96;
}
function academyNumeric(value){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  const n=Number(String(value??'').trim().replace(',','.'));return Number.isFinite(n)?n:null;
}
export function analyzeExperiment(exp,parameter){
  if(!exp||!parameter)return {ok:false,error:'Pilih parameter.'};
  const rows=(exp.units||[]).map(u=>({u,y:academyNumeric(u.observations?.[parameter])})).filter(row=>row.y!==null);
  const treatmentIds=[...new Set(rows.map(row=>row.u.treatmentId))],blocks=[...new Set(rows.map(row=>row.u.block||row.u.rep))];
  if(rows.length<4||treatmentIds.length<2)return {ok:false,error:'Data numerik belum cukup untuk ANOVA.'};
  const grand=academyMean(rows.map(row=>row.y)),ssTotal=academySum(rows.map(row=>(row.y-grand)**2));
  const groups=treatmentIds.map(id=>{const values=rows.filter(row=>row.u.treatmentId===id).map(row=>row.y);return {id,values,n:values.length,mean:academyMean(values)};});
  const ssTreatment=academySum(groups.map(group=>group.n*(group.mean-grand)**2));
  let ssBlock=0,dfBlock=0;
  if(exp.design==='rak'){
    const blockGroups=blocks.map(id=>{const values=rows.filter(row=>(row.u.block||row.u.rep)===id).map(row=>row.y);return {id,n:values.length,mean:academyMean(values)};});
    ssBlock=academySum(blockGroups.map(group=>group.n*(group.mean-grand)**2));dfBlock=Math.max(0,blockGroups.length-1);
  }
  const ssError=Math.max(0,ssTotal-ssTreatment-ssBlock),dfTreatment=treatmentIds.length-1,dfError=Math.max(0,rows.length-1-dfTreatment-dfBlock);
  if(dfError<1)return {ok:false,error:'Derajat bebas galat tidak cukup. Tambah ulangan.'};
  const msTreatment=ssTreatment/dfTreatment,msError=ssError/dfError,f=msError>0?msTreatment/msError:Infinity,p=f===Infinity?0:academyFPValue(f,dfTreatment,dfError);
  const cv=grand!==0?Math.sqrt(msError)/Math.abs(grand)*100:null,reps=groups.map(group=>group.n),avgRep=academyMean(reps),balanced=reps.every(n=>n===reps[0]);
  const lsd=academyTCritical05(dfError)*Math.sqrt(2*msError/Math.max(1,avgRep));
  const heritability=exp.kind==='genotype'&&balanced&&msTreatment>0?Math.max(0,Math.min(1,(msTreatment-msError)/msTreatment)):null;
  const treatmentLookup=new Map((exp.treatments||[]).map(t=>[t.id,t]));
  const means=groups.map(group=>({id:group.id,name:treatmentLookup.get(group.id)?.name||group.id,code:treatmentLookup.get(group.id)?.code||group.id,n:group.n,mean:group.mean})).sort((a,b)=>b.mean-a.mean);
  return {
    ok:true,parameter,n:rows.length,design:exp.design,grandMean:grand,cv,lsd,means,p,significant:p<.05,heritability,
    anova:[
      {source:'Perlakuan',df:dfTreatment,ss:ssTreatment,ms:msTreatment,f,p},
      ...(exp.design==='rak'?[{source:'Kelompok',df:dfBlock,ss:ssBlock,ms:dfBlock?ssBlock/dfBlock:null,f:null,p:null}]:[]),
      {source:'Galat',df:dfError,ss:ssError,ms:msError,f:null,p:null},
      {source:'Total',df:rows.length-1,ss:ssTotal,ms:null,f:null,p:null}
    ]
  };
}
export function auditDesign(exp,plotRegistry=[]){
  if(!exp)return [];
  const findings=[],units=exp.units||[],treatments=exp.treatments||[],counts=treatments.map(t=>units.filter(u=>u.treatmentId===t.id).length);
  if(counts.length&&Math.min(...counts)<2)findings.push({level:'error',code:'replication',text:'Ada perlakuan dengan ulangan <2; ragam galat dan inferensi perlakuan menjadi lemah.'});
  if(counts.length&&Math.max(...counts)!==Math.min(...counts))findings.push({level:'warn',code:'imbalance',text:'Jumlah ulangan antarperlakuan tidak seimbang.'});
  if(exp.design==='rak'){
    for(const treatment of treatments){
      const treatmentBlocks=units.filter(u=>u.treatmentId===treatment.id).map(u=>u.block);
      if(new Set(treatmentBlocks).size!==treatmentBlocks.length||new Set(treatmentBlocks).size<Math.min(3,exp.reps||3)){
        findings.push({level:'error',code:'confounding',text:treatment.code+' tidak muncul tepat sekali pada setiap kelompok; efek perlakuan dapat terbaur dengan kelompok.'});break;
      }
    }
  }
  const selected=units.map(u=>plotRegistry[u.plot]).filter(Boolean),fertility=selected.map(p=>Number(p.fertility)).filter(Number.isFinite);
  if(exp.design==='ral'&&fertility.length>2&&Math.max(...fertility)-Math.min(...fertility)>.08){
    findings.push({level:'warn',code:'heterogeneous-field',text:'RAL digunakan pada lahan bergradien. RAK biasanya lebih efisien karena variasi antarkelompok dapat dipisahkan dari galat.'});
  }
  const missing=units.filter(u=>Object.values(u.observations||{}).every(v=>String(v??'').trim()==='')).length;
  if(missing)findings.push({level:'warn',code:'missing',text:missing+' unit belum memiliki data; kehilangan unit menurunkan presisi dan dapat mengganggu keseimbangan.'});
  if(units.some(u=>Array.isArray(u.timeline)&&u.timeline.length>1))findings.push({level:'info',code:'repeated-measure',text:'Pengamatan HST berulang pada petak yang sama adalah repeated measurement, bukan ulangan independen. Tanaman sampel juga subsampel, bukan ulangan.'});
  if(!findings.length)findings.push({level:'ok',code:'sound',text:'Randomisasi, replikasi, dan struktur rancangan konsisten untuk data yang tersedia.'});
  return findings;
}
export function conceptForDesign(design){
  return design==='rak'
    ?{title:'RAK · local control',text:'Setiap perlakuan diacak di dalam tiap kelompok. Variasi antarkelompok dipisahkan dari galat; cocok untuk lahan heterogen.'}
    :{title:'RAL · randomisasi penuh',text:'Seluruh unit diacak tanpa blok. Efisien bila unit relatif homogen, tetapi gradien lapang akan masuk ke galat.'};
}
export function genomeStats(genome){
  const g=normalizeGenome(genome,'stats'),heterozygous=LOCI.filter(locus=>g[locus]?.[0]!==g[locus]?.[1]).length;
  return {loci:LOCI.length,heterozygous,homozygous:LOCI.length-heterozygous,heterozygosity:heterozygous/LOCI.length,homozygosity:(LOCI.length-heterozygous)/LOCI.length};
}
function nextSelfGenerationLabel(seed){
  const label=String(seed?.generationLabel||'');
  if(/^F\d+$/.test(label))return 'F'+(Number(label.slice(1))+1);
  if(/^S\d+$/.test(label))return 'S'+(Number(label.slice(1))+1);
  return seed?.parents?.length?'S1':'S1';
}
export function makeProgeny(parentA,parentB,mode='f1',key='cross'){
  if(!parentA)return null;
  const ga=normalizeGenome(parentA.genome,parentA.id||'A'),gb=normalizeGenome((parentB||parentA).genome,(parentB||parentA).id||'B');
  const genome=mode==='self'?selfGenome(ga,key):crossGenome(ga,gb,key),stats=genomeStats(genome);
  const mid=mode==='self'?Number(parentA.baseYield||0):(Number(parentA.baseYield||0)+Number(parentB?.baseYield||0))/2;
  const heterosis=mode==='f1'?stats.heterozygosity*.1:stats.heterozygosity*.025,segregation=.96+unit(hash('segregation:'+key))*.08;
  const generationLabel=mode==='f1'?'F1':mode==='self'?nextSelfGenerationLabel(parentA):mode==='backcross'?'BC'+((Number(parentA?.backcrossGeneration)||0)+1):'TC';
  return {
    genome,generationLabel,backcrossGeneration:mode==='backcross'?(Number(parentA?.backcrossGeneration)||0)+1:0,
    homozygosity:stats.homozygosity,heterozygosity:stats.heterozygosity,
    baseYield:Math.max(1,mid*(1+heterosis)*segregation),
    vigor:Math.max(.65,academyMean([Number(parentA.vigor||1),Number(parentB?.vigor||parentA.vigor||1)])*(1+(mode==='f1'?stats.heterozygosity*.05:0))),
    geneticEffects:geneticEffects(genome)
  };
}
export function geneticsPreview(parentA,parentB,mode='f1'){
  if(!parentA)return {title:'Pilih tetua',text:'Pilih material untuk melihat konsekuensi genetik.'};
  const a=genomeStats(parentA.genome);
  if(mode==='self')return {title:'Selfing '+(parentA.generationLabel||('G'+(parentA.generation||0))),text:'Selfing meningkatkan peluang homozigositas dan menghasilkan segregasi pada keturunan. Homozigositas tetua saat ini '+Math.round(a.homozygosity*100)+'%.'};
  if(!parentB)return {title:'Pilih tetua kedua',text:'Persilangan memerlukan dua tetua.'};
  const b=genomeStats(parentB.genome);
  return mode==='backcross'
    ?{title:'Backcross',text:'Keturunan disilangkan kembali ke tetua berulang untuk memulihkan latar genetik sambil mempertahankan alel target.'}
    :{title:'F1',text:'Perbedaan alel tetua dapat meningkatkan heterozigositas F1 dan heterosis, tetapi kombinasi itu akan bersegregasi setelah selfing. Homozigositas tetua '+Math.round(a.homozygosity*100)+'% vs '+Math.round(b.homozygosity*100)+'%.'};
}
export function lociInfo(){
  return {
    YLD:{name:'Potensi hasil',effect:'Komponen hasil'},
    MAT:{name:'Maturitas',effect:'Kecepatan perkembangan'},
    WUE:{name:'Efisiensi air',effect:'Kehilangan air'},
    DIS:{name:'Ketahanan penyakit',effect:'Risiko penyakit'}
  };
}
