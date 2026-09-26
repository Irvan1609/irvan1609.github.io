const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));

export function generationStage(seed={}){
  const g=Math.max(0,Math.round(Number(seed.generation)||0)),raw=String(seed.generationLabel||''),label=raw||(!seed.parents?.length&&g===0?'Varietas':'F'+Math.max(1,g));
  const hom=Number.isFinite(Number(seed.homozygosity))?clamp(Number(seed.homozygosity)*100):g<=1?0:clamp((1-Math.pow(.5,g-1))*100,0,99.2);
  if(!seed.parents?.length&&g===0)return {label:'Varietas',phase:'Varietas komersial',homozygosity:100,scope:'Produksi & pembanding'};
  if(/^BC\d+/.test(label))return {label,phase:'Backcross',homozygosity:hom,scope:'Pulihkan latar tetua sambil mempertahankan alel target'};
  if(label==='F1'||g<=1)return {label:'F1',phase:'Hibrida F1',homozygosity:hom,scope:'Amati vigor; belum untuk seleksi galur'};
  if(g<=3)return {label:raw||'F'+g,phase:'Segregasi tinggi',homozygosity:hom,scope:'Seleksi individu'};
  if(g<=5)return {label:raw||'F'+g,phase:'Seleksi galur',homozygosity:hom,scope:'Seleksi antarbaris/galur'};
  const tests=Number(seed.evidenceTests)||0,stress=Number(seed.stressTests)||0;
  if(g>=7&&tests>=4&&stress>=2)return {label:raw||'F'+g,phase:'Kandidat varietas',homozygosity:hom,scope:'Uji adaptasi & calon pelepasan'};
  if(tests>=3&&stress>=1)return {label:raw||'F'+g,phase:'Uji multilokasi',homozygosity:hom,scope:'Stabilitas G×E'};
  return {label:raw||'F'+g,phase:'Galur lanjut',homozygosity:hom,scope:'Uji daya hasil'};
}

export function phenotypeState(crop={}){
  const classes=[];
  if(Number(crop.water)<34)classes.push('phenotype-dry');
  if(Number(crop.n)<34)classes.push('phenotype-low-n');
  if(Number(crop.disease)>=24)classes.push('phenotype-disease');
  if(Number(crop.health)>=90&&Number(crop.seed?.vigor||1)>=1.02)classes.push('phenotype-vigorous');
  if(Number(crop.growth)>=48&&Number(crop.growth)<76)classes.push('phenotype-flowering');
  if(crop.selectionMarked)classes.push('selection-marked');
  const scale=clamp(.82+(Number(crop.growth)||0)/420+(Number(crop.seed?.vigor||1)-1)*.7,.82,1.12);
  return {classes:classes.join(' '),scale:Number(scale.toFixed(3))};
}

export function contractBrief(season=1,envId='transition'){
  let id='profit';
  if(envId==='drought'||envId==='poorN')id='water';
  else if(envId==='rust'||envId==='wet')id='disease';
  else id=['early','profit','water','disease'][Math.abs(Number(season)||1)%4];
  const all={
    water:{id:'water',icon:'💧',client:'Kelompok Petani',title:'Varietas hemat sumber daya',priority:'Efisiensi air/N dan panen sehat'},
    early:{id:'early',icon:'⚡',client:'Mitra Benih',title:'Varietas genjah',priority:'Panen cepat tanpa kehilangan hasil berlebihan'},
    disease:{id:'disease',icon:'◈',client:'Program Proteksi',title:'Ketahanan penyakit',priority:'Kesehatan tanaman dan stabilitas'},
    profit:{id:'profit',icon:'Rp',client:'Koperasi Produksi',title:'Profitabilitas',priority:'Margin bersih dan hasil'}
  };
  return all[id];
}

export function rivalProgramStatus(rival={},season=1){
  const pace=Math.max(.7,Number(rival.pace)||1),step=Math.max(1,Math.floor((Number(season)||1)*pace));
  if(step<=2)return 'F2 · seleksi individu';
  if(step<=4)return 'F4 · seleksi galur';
  if(step<=6)return 'F6 · uji daya hasil';
  if(step<=8)return 'Multilokasi';
  return 'Kandidat varietas';
}

export function dailyBreedingPlan(key,seedNumber){
  const tenders=['drought','early','disease','profit'],designs=['rak','ral'],management=['low','standard','precision'];
  const n=Math.abs(Number(seedNumber)||1);
  return {key,seed:n,tender:tenders[n%tenders.length],design:designs[Math.floor(n/7)%designs.length],management:management[Math.floor(n/13)%management.length],strategy:'balanced',budget:12000000};
}
