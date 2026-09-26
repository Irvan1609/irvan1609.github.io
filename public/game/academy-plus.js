const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));

export function generationStage(seed={}){
  const g=Math.max(0,Math.round(Number(seed.generation)||0)),parents=Array.isArray(seed.parents)?seed.parents.length:0;
  if(!parents&&g===0)return {label:'Varietas',phase:'Varietas komersial',homozygosity:100,scope:'Produksi & pembanding'};
  if(g<=1)return {label:'F1',phase:'Hibrida F1',homozygosity:0,scope:'Amati vigor; belum untuk seleksi galur'};
  const homo=clamp((1-Math.pow(.5,g-1))*100,0,99.2);
  if(g<=3)return {label:'F'+g,phase:'Segregasi tinggi',homozygosity:homo,scope:'Seleksi individu'};
  if(g<=5)return {label:'F'+g,phase:'Seleksi galur',homozygosity:homo,scope:'Seleksi antarbaris/galur'};
  const tests=Number(seed.evidenceTests)||0,stress=Number(seed.stressTests)||0;
  if(g>=7&&tests>=4&&stress>=2)return {label:'F'+g,phase:'Kandidat varietas',homozygosity:homo,scope:'Uji adaptasi & calon pelepasan'};
  if(tests>=3&&stress>=1)return {label:'F'+g,phase:'Uji multilokasi',homozygosity:homo,scope:'Stabilitas G×E'};
  return {label:'F'+g,phase:'Galur lanjut',homozygosity:homo,scope:'Uji daya hasil'};
}

export function phenotypeState(crop={}){
  const classes=[];
  if(Number(crop.water)<34)classes.push('phenotype-dry');
  if(Number(crop.n)<34)classes.push('phenotype-low-n');
  if(Number(crop.disease)>=24)classes.push('phenotype-disease');
  if(Number(crop.health)>=90&&Number(crop.seed?.vigor||1)>=1.02)classes.push('phenotype-vigorous');
  if(Number(crop.growth)>=50&&Number(crop.growth)<78)classes.push('phenotype-flowering');
  if(crop.selectionMarked)classes.push('selection-marked');
  const scale=clamp(.82+(Number(crop.growth)||0)/420+(Number(crop.seed?.vigor||1)-1)*.7,.82,1.12);
  return {classes:classes.join(' '),scale:Number(scale.toFixed(3))};
}

function logGamma(z){
  const c=[676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,12.507343278686905,-.13857109526572012,9.984369578019571e-6,1.5056327351493116e-7];
  if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
  z-=1;let x=.9999999999998099;
  for(let i=0;i<c.length;i++)x+=c[i]/(z+i+1);
  const t=z+c.length-.5;
  return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);
}
function betaFraction(x,a,b){
  const max=120,eps=3e-9,fp=1e-30;let qab=a+b,qap=a+1,qam=a-1,c=1,d=1-qab*x/qap;
  if(Math.abs(d)<fp)d=fp;d=1/d;let h=d;
  for(let m=1;m<=max;m++){
    const m2=2*m;let aa=m*(b-m)*x/((qam+m2)*(a+m2));d=1+aa*d;if(Math.abs(d)<fp)d=fp;c=1+aa/c;if(Math.abs(c)<fp)c=fp;d=1/d;h*=d*c;
    aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));d=1+aa*d;if(Math.abs(d)<fp)d=fp;c=1+aa/c;if(Math.abs(c)<fp)c=fp;d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<eps)break;
  }
  return h;
}
function regularizedBeta(x,a,b){
  if(x<=0)return 0;if(x>=1)return 1;
  const bt=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log(1-x));
  return x<(a+1)/(a+b+2)?bt*betaFraction(x,a,b)/a:1-bt*betaFraction(1-x,b,a)/b;
}
function fSurvival(f,d1,d2){
  if(!(f>=0)||d1<=0||d2<=0)return null;
  const x=d2/(d2+d1*f);
  return clamp(regularizedBeta(x,d2/2,d1/2),0,1);
}
function quantile(sorted,p){
  if(!sorted.length)return 0;const pos=(sorted.length-1)*p,lo=Math.floor(pos),hi=Math.ceil(pos),w=pos-lo;
  return sorted[lo]*(1-w)+sorted[hi]*w;
}
export function analyzeGroups(groups=[],design='ral',spatialRange=0){
  const clean=groups.map(g=>({label:g.label,values:(g.values||[]).map(Number).filter(Number.isFinite)})).filter(g=>g.values.length);
  const values=clean.flatMap(g=>g.values),n=values.length,k=clean.length;
  if(k<2||n<=k)return {ready:false,n,k,message:'Isi sedikitnya 2 perlakuan dengan ulangan yang cukup untuk preview ANOVA.'};
  const mean=values.reduce((a,b)=>a+b,0)/n;
  let ssb=0,ssw=0;
  const summaries=clean.map(g=>{
    const m=g.values.reduce((a,b)=>a+b,0)/g.values.length,sorted=[...g.values].sort((a,b)=>a-b);
    ssb+=g.values.length*(m-mean)*(m-mean);ssw+=g.values.reduce((a,v)=>a+(v-m)*(v-m),0);
    return {label:g.label,n:g.values.length,mean:m,min:sorted[0],q1:quantile(sorted,.25),median:quantile(sorted,.5),q3:quantile(sorted,.75),max:sorted[sorted.length-1]};
  });
  const df1=k-1,df2=n-k,msb=ssb/df1,mse=ssw/df2,f=mse>0?msb/mse:Infinity,p=Number.isFinite(f)?fSurvival(f,df1,df2):0;
  const cv=Math.abs(mean)>1e-12?Math.sqrt(Math.max(0,mse))/Math.abs(mean)*100:0,nbar=n/k,se=Math.sqrt(Math.max(0,mse)/Math.max(1,nbar));
  const hints=[];
  if(design==='ral'&&spatialRange>.1)hints.push('RAL pada gradien lahan dapat memasukkan variasi posisi ke galat; pertimbangkan RAK.');
  if(nbar<3)hints.push('Ulangan rendah membuat rerata perlakuan kurang presisi.');
  if(cv>20)hints.push('CV tinggi: heterogenitas lahan/manajemen masih besar.');
  if(p!==null&&p<.05)hints.push('Sinyal perlakuan terdeteksi; lanjutkan uji lanjut hanya bila sesuai hipotesis dan rancangan.');
  else if(p!==null)hints.push('Belum ada bukti kuat perbedaan perlakuan; jangan memaksa kesimpulan signifikan.');
  return {ready:true,n,k,mean,f,p,cv,se,df1,df2,summaries,hints};
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
