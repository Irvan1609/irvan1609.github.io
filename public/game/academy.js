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
  let fertility=Number(meta.fertility)||1,diseasePressure=0,organic=0;
  for(const row of history){
    const treatment=String(row.treatment||'').toLowerCase(),use=String(row.use||'');
    if(/kompos|pupuk kandang|organik/.test(treatment)){fertility+=.015;organic+=1;}
    if(/n 200|n 250|nitrogen/.test(treatment))fertility-=.008;
    if(Number(row.health)<65)diseasePressure+=.025;
    if(use==='commercial')fertility-=.004;
  }
  return {fertility:Math.max(.82,Math.min(1.18,fertility)),diseasePressure:Math.min(.12,diseasePressure),organic};
}
export function evidenceLabel({tests=0,generation=0,stressTests=0}={}){
  if(tests>=3&&generation>=4&&stressTests>=1)return 'Relatif stabil';
  if(tests>=2)return 'Didukung pengujian';
  if(tests>=1)return 'Indikasi';
  return 'Belum diketahui';
}
