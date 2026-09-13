import jStat from 'jstat';
export const sum=x=>x.reduce((s,v)=>s+v,0);
export const mean=x=>sum(x)/x.length;
const unique=x=>[...new Set(x)];
const key=(...x)=>JSON.stringify(x);
export const fTail=(f,d1,d2)=>f===Infinity?0:jStat.ibeta(d2/(d2+d1*f),d2/2,d1/2);
const median=x=>{const s=[...x].sort((a,b)=>a-b),n=s.length;return (s[Math.floor((n-1)/2)]+s[Math.floor(n/2)])/2;};
function summary(label,values,mse,df){return {label,n:values.length,mean:mean(values),sd:values.length>1?Math.sqrt(sum(values.map(v=>(v-mean(values))**2))/(values.length-1)):null,se:Math.sqrt(mse/values.length),mse,df};}
function term(label,ss,df,mse,denDf,error='Galat'){
  const ms=df>0?ss/df:null,f=ms!==null&&mse>0?ms/mse:null;
  return {label,ss,df,ms,f,p:f===null?null:fTail(f,df,denDf),f05:f===null?null:jStat.centralF.inv(.95,df,denDf),f01:f===null?null:jStat.centralF.inv(.99,df,denDf),error};
}
function errorTerm(label,ss,df){return {label,ss,df,ms:ss/df,f:null,p:null,f05:null,f01:null};}

export function compactLetters(means,sig){
  let columns=[means.map((_,i)=>i)];const pairs=[];
  for(let i=0;i<means.length;i++)for(let j=i+1;j<means.length;j++)if(sig[i][j])pairs.push([i,j,Math.abs(means[i]-means[j])]);
  pairs.sort((a,b)=>b[2]-a[2]);
  for(const [i,j] of pairs){columns=columns.flatMap(c=>c.includes(i)&&c.includes(j)?[c.filter(x=>x!==i),c.filter(x=>x!==j)]:[c]);
    columns=columns.filter((c,i)=>c.length&&!columns.some((other,j)=>j!==i&&c.every(x=>other.includes(x))&&(other.length>c.length||j<i)));
  }
  columns.sort((a,b)=>Math.max(...b.map(i=>means[i]))-Math.max(...a.map(i=>means[i])));
  const label=n=>{let x='';do{x=String.fromCharCode(97+n%26)+x;n=Math.floor(n/26)-1;}while(n>=0);return x;};
  return means.map((_,i)=>columns.flatMap((c,k)=>c.includes(i)?[label(k)]:[]));
}
export function compareMeans(items,method,alpha,mse,df){
  const n=items.length;if(n<2)return {items,method,critical:[],pairs:[]};
  if(!(mse>0)||df<1)throw Error('Galat tidak cukup untuk uji lanjut.');
  if(['bnj','dmrt'].includes(method)&&df<2)throw Error('BNJ/DMRT memerlukan db galat minimal 2 pada implementasi ini.');
  const critical=[],pairs=[],sig=Array.from({length:n},()=>Array(n).fill(false));
  const order=items.map((_,i)=>i).sort((a,b)=>items[b].mean-items[a].mean),rank=order.map(()=>0);order.forEach((i,r)=>rank[i]=r);
  const harmonic=n/sum(items.map(x=>1/x.n));
  const q=method==='bnt'?jStat.studentt.inv(1-alpha/2,df):method==='bnj'?jStat.tukey.inv(1-alpha,n,df):null;
  if(q!==null)critical.push({range:method==='bnj'?n:2,value:q});
  if(method==='dmrt')for(let range=2;range<=n;range++)critical.push({range,value:jStat.tukey.inv((1-alpha)**(range-1),range,df)});
  if(critical.some(x=>!Number.isFinite(x.value)))throw Error('Nilai kritis tidak dapat dihitung.');
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    const range=Math.abs(rank[i]-rank[j])+1;
    const threshold=method==='dmrt'?critical[range-2].value*Math.sqrt(mse/harmonic):q*Math.sqrt(mse*(1/items[i].n+1/items[j].n)/(method==='bnj'?2:1));
    const difference=Math.abs(items[i].mean-items[j].mean);sig[i][j]=sig[j][i]=difference>threshold;
    pairs.push({i,j,difference,threshold,significant:sig[i][j]});
  }
  const letters=compactLetters(items.map(x=>x.mean),sig);
  return {items:items.map((item,i)=>({...item,letters:letters[i]})),method,critical,pairs,unequal:!items.every(x=>x.n===items[0].n)};
}

// D'Agostino-Pearson omnibus K² (asymptotic); use n >= 20 to avoid the small-n kurtosis approximation.
export function normality(values){
  const n=values.length;if(n<20)return {name:'Normalitas D’Agostino–Pearson',n,stat:null,p:null,note:'Memerlukan minimal 20 residual; gunakan grafik Q–Q untuk pemeriksaan visual.'};
  const m=mean(values),m2=mean(values.map(x=>(x-m)**2));if(m2<=0)return {name:'Normalitas D’Agostino–Pearson',n,stat:null,p:null,note:'Variasi residual nol.'};
  const skew=mean(values.map(x=>(x-m)**3))/m2**1.5,kurt=mean(values.map(x=>(x-m)**4))/m2**2;
  const y=skew*Math.sqrt((n+1)*(n+3)/(6*(n-2))),beta=3*(n*n+27*n-70)*(n+1)*(n+3)/((n-2)*(n+5)*(n+7)*(n+9));
  const w=-1+Math.sqrt(2*(beta-1)),delta=1/Math.sqrt(.5*Math.log(w)),a=Math.sqrt(2/(w-1)),z1=delta*Math.asinh(y/a);
  const expected=3*(n-1)/(n+1),variance=24*n*(n-2)*(n-3)/((n+1)**2*(n+3)*(n+5)),x=(kurt-expected)/Math.sqrt(variance);
  const b1=6*(n*n-5*n+2)/((n+7)*(n+9))*Math.sqrt(6*(n+3)*(n+5)/(n*(n-2)*(n-3)));
  const A=6+8/b1*(2/b1+Math.sqrt(1+4/b1**2)),denom=1+x*Math.sqrt(2/(A-4));
  const z2=(1-2/(9*A)-Math.cbrt((1-2/A)/denom))/Math.sqrt(2/(9*A)),stat=z1*z1+z2*z2;
  return {name:'Normalitas D’Agostino–Pearson',n,stat,p:Number.isFinite(stat)?Math.exp(-stat/2):null,note:'Uji pendekatan pada residual model; tidak menilai independensi unit percobaan.'};
}
export function brownForsythe(groups){
  const k=groups.length,N=sum(groups.map(g=>g.length));
  if(k<2||groups.some(g=>g.length<2))return {name:'Homogenitas Brown–Forsythe',stat:null,p:null,note:'Setiap kelompok memerlukan minimal 2 pengamatan.'};
  const z=groups.map(g=>{const med=median(g);return g.map(v=>Math.abs(v-med));}),grand=mean(z.flat());
  const between=sum(z.map(g=>g.length*(mean(g)-grand)**2)),within=sum(z.map(g=>sum(g.map(v=>(v-mean(g))**2))));
  const stat=within>0?(between/(k-1))/(within/(N-k)):null;
  return {name:'Homogenitas Brown–Forsythe',stat,p:stat===null?null:fTail(stat,k-1,N-k),df1:k-1,df2:N-k,note:stat===null?'Simpangan absolut tidak memiliki variasi yang cukup.':'Levene berbasis median; p kecil menunjukkan bukti ketidakhomogenan.'};
}

export function plannedContrasts(items,matrix,mse,df){
  const n=items.length;if(!matrix.length||matrix.length>n-1)throw Error(`Jumlah kontras harus 1 sampai ${n-1}.`);
  for(const row of matrix){if(row.coefficients.length!==n||row.coefficients.some(x=>!Number.isFinite(x)))throw Error('Jumlah koefisien harus sama dengan jumlah taraf.');const scale=Math.max(1,...row.coefficients.map(Math.abs));if(Math.abs(sum(row.coefficients))>1e-9*scale||row.coefficients.every(x=>x===0))throw Error('Jumlah koefisien setiap kontras harus nol dan tidak semuanya nol.');}
  for(let i=0;i<matrix.length;i++)for(let j=i+1;j<matrix.length;j++){
    const dot=sum(items.map((item,k)=>matrix[i].coefficients[k]*matrix[j].coefficients[k]/item.n));
    const norm=Math.sqrt(sum(items.map((item,k)=>matrix[i].coefficients[k]**2/item.n))*sum(items.map((item,k)=>matrix[j].coefficients[k]**2/item.n)));
    if(Math.abs(dot)>1e-8*norm)throw Error(`Kontras ${i+1} dan ${j+1} tidak ortogonal untuk jumlah ulangan ini.`);
  }
  return matrix.map(row=>{const estimate=sum(items.map((item,i)=>row.coefficients[i]*item.mean)),variance=mse*sum(items.map((item,i)=>row.coefficients[i]**2/item.n)),ss=estimate**2/(variance/mse),f=estimate**2/variance;return {...row,estimate,se:Math.sqrt(variance),ss,f,df:1,denDf:df,p:fTail(f,1,df)};});
}
export function polynomialContrasts(items,levels,mse,df){
  if(levels.length!==items.length||levels.some(x=>!Number.isFinite(x))||unique(levels).length!==levels.length)throw Error('Taraf kuantitatif harus berupa angka unik, satu untuk setiap perlakuan.');
  const center=mean(levels),scale=Math.max(...levels.map(x=>Math.abs(x-center))),x=levels.map(v=>(v-center)/scale);
  const weights=items.map(g=>g.n),inner=(a,b)=>sum(a.map((v,i)=>v*b[i]*weights[i]));
  const basis=[x.map(()=>1)],matrix=[];
  for(let degree=1;degree<items.length;degree++){
    let v=x.map(z=>z**degree);
    for(const b of basis){const projection=inner(v,b)/inner(b,b);v=v.map((z,i)=>z-projection*b[i]);}
    const norm=Math.sqrt(inner(v,v));if(norm<1e-10)throw Error('Taraf terlalu berdekatan untuk dekomposisi polinomial yang stabil.');
    v=v.map(z=>z/norm);basis.push(v);matrix.push({name:['','Linear','Kuadratik','Kubik'][degree]||`Derajat ${degree}`,coefficients:v.map((z,i)=>z*weights[i])});
  }
  return plannedContrasts(items,matrix,mse,df);
}

export function validateData(dataset,options,parse){
  const {design,a,b,rep,parameters}=options,issues=[],warnings=[];
  if(!['ral','rak','fral','frak','split'].includes(design))issues.push({message:'Rancangan tidak dikenali.'});
  if(dataset.headers.some(h=>!String(h).trim())||unique(dataset.headers.map(h=>String(h).trim())).length!==dataset.headers.length)issues.push({message:'Judul kolom harus terisi dan unik.'});
  const multi=['fral','frak','split'].includes(design),blocked=['rak','frak','split'].includes(design);
  const indices=[a,...(multi?[b]:[]),...(rep!==null?[rep]:[]),...parameters];
  if(!parameters.length)issues.push({message:'Pilih minimal satu parameter.'});
  if(indices.some(i=>i===null||!Number.isInteger(i)||i<0||i>=dataset.headers.length)||new Set(indices).size!==indices.length)issues.push({message:'Pilih kolom yang berbeda dan valid untuk setiap peran.'});
  if(blocked&&rep===null)issues.push({message:'Rancangan ini memerlukan kolom ulangan/kelompok.'});
  if(issues.length)return {issues,warnings,observations:[]};
  const observations=[],seen=new Set();
  dataset.rows.forEach((row,i)=>{
    if(row.every(v=>String(v??'').trim()==='')){warnings.push({row:i+1,message:'Baris kosong diabaikan.'});return;}
    const A=String(row[a]??'').trim(),B=multi?String(row[b]??'').trim():'',R=rep!==null?String(row[rep]??'').trim():'';
    if(!A||multi&&!B||rep!==null&&!R)issues.push({row:i+1,message:'Perlakuan/faktor atau ulangan kosong.'});
    const values=parameters.map(p=>parse(row[p]));
    parameters.forEach((p,j)=>{if(!Number.isFinite(values[j]))issues.push({row:i+1,column:p,message:`${dataset.headers[p]}: angka kosong atau format tidak valid.`});});
    if(rep!==null){const k=key(A,B,R);if(seen.has(k))issues.push({row:i+1,message:'Kombinasi perlakuan × ulangan ganda.'});seen.add(k);}
    observations.push({a:A,b:B,rep:R,values,row:i+1});
  });
  const A=unique(observations.map(o=>o.a)),B=multi?unique(observations.map(o=>o.b)):[''],R=unique(observations.map(o=>o.rep));
  if(A.length<2||multi&&B.length<2)issues.push({message:'Setiap faktor memerlukan minimal dua taraf.'});
  const counts=A.flatMap(a=>B.map(b=>observations.filter(o=>o.a===a&&o.b===b).length));
  if(counts.some(n=>n===0))issues.push({message:'Ada kombinasi faktor tanpa pengamatan.'});
  if(multi||blocked){if(!counts.every(n=>n===counts[0]))issues.push({message:'Faktorial/RAK/RPT memerlukan data lengkap dan seimbang.'});if(blocked&&(R.length<2||observations.length!==A.length*B.length*R.length))issues.push({message:'Setiap kombinasi faktor harus muncul tepat sekali dalam setiap kelompok (minimal 2 kelompok).'});}
  else if(!counts.every(n=>n===counts[0]))warnings.push({message:'Ulangan RAL tidak sama: BNJ memakai Tukey–Kramer; DMRT memakai rataan harmonik.'});
  if(observations.length<=A.length*B.length)issues.push({message:'Ulangan belum cukup untuk menghitung galat percobaan.'});
  return {issues,warnings,observations};
}

export function analyzeParameter(observations,options,index,name){
  const obs=observations.map(o=>({...o,y:o.values[index]})),{design,alpha,posthoc}=options;
  const multi=['fral','frak','split'].includes(design),blocked=['rak','frak','split'].includes(design),split=design==='split';
  const A=unique(obs.map(o=>o.a)),B=multi?unique(obs.map(o=>o.b)):[''],R=unique(obs.map(o=>o.rep)),N=obs.length,k=A.length,l=B.length,r=N/(k*l),grand=mean(obs.map(o=>o.y));
  const group=(a,b)=>obs.filter(o=>(a===null||o.a===a)&&(b===null||o.b===b)).map(o=>o.y);
  const aMean=A.map(a=>mean(group(a,null))),bMean=B.map(b=>mean(group(null,b))),cellMean=new Map(A.flatMap(a=>B.map(b=>[key(a,b),mean(group(a,b))]))),rMean=new Map(R.map(rep=>[rep,mean(obs.filter(o=>o.rep===rep).map(o=>o.y))]));
  const ssTotal=sum(obs.map(o=>(o.y-grand)**2)),ssA=sum(A.map((a,i)=>group(a,null).length*(aMean[i]-grand)**2)),ssB=multi?sum(B.map((b,i)=>group(null,b).length*(bMean[i]-grand)**2)):0;
  const ssAB=multi?r*sum(A.flatMap((a,i)=>B.map((b,j)=>(cellMean.get(key(a,b))-aMean[i]-bMean[j]+grand)**2))):0;
  const ssR=blocked?k*l*sum(R.map(rep=>(rMean.get(rep)-grand)**2)):0;
  const wholeMean=new Map(R.flatMap(rep=>A.map(a=>[key(rep,a),mean(obs.filter(o=>o.rep===rep&&o.a===a).map(o=>o.y))])));
  const ssWhole=split?l*sum(R.flatMap(rep=>A.map(a=>(wholeMean.get(key(rep,a))-grand)**2))):0;
  const ssEa=split?Math.max(0,ssWhole-ssR-ssA):null,dfEa=split?(r-1)*(k-1):null;
  const fitted=obs.map(o=>split?wholeMean.get(key(o.rep,o.a))+cellMean.get(key(o.a,o.b))-aMean[A.indexOf(o.a)]:cellMean.get(key(o.a,o.b))+(blocked?rMean.get(o.rep)-grand:0));
  const residuals=obs.map((o,i)=>o.y-fitted[i]),ssE=sum(residuals.map(x=>x*x)),dfE=split?k*(r-1)*(l-1):N-k*l-(blocked?R.length-1:0),mse=ssE/dfE,msea=split?ssEa/dfEa:mse;
  if(dfE<1||!Number.isFinite(mse)||mse<=1e-20||split&&(!(msea>1e-20)||dfEa<1))throw Error(`${name}: db galat atau variasi galat tidak cukup.`);
  const terms=[];if(blocked)terms.push(term('Ulangan',ssR,R.length-1,split?msea:mse,split?dfEa:dfE,split?'Galat (a)':'Galat'));
  terms.push(term(multi?'Faktor A':'Perlakuan',ssA,k-1,split?msea:mse,split?dfEa:dfE,split?'Galat (a)':'Galat'));
  if(split)terms.push(errorTerm('Galat (a)',ssEa,dfEa));
  if(multi){terms.push(term('Faktor B',ssB,l-1,mse,dfE,split?'Galat (b)':'Galat'));terms.push(term('A × B',ssAB,(k-1)*(l-1),mse,dfE,split?'Galat (b)':'Galat'));}
  terms.push(errorTerm(split?'Galat (b)':'Galat',ssE,dfE));terms.push({label:'Total',ss:ssTotal,df:N-1,ms:null,f:null,p:null,f05:null,f01:null});
  const cells=A.flatMap(a=>B.map(b=>({...summary(multi?`${a} × ${b}`:a,group(a,b),mse,dfE),a,b})));
  // A split-plot cell mean includes both whole-plot and subplot variance.
  if(split)cells.forEach(item=>item.se=Math.sqrt((msea+(l-1)*mse)/(r*l)));
  const comparisons=[],notes=[];
  const addComparison=(title,items,ms,df,gate)=>{
    const shouldTest=posthoc!=='none'&&gate;
    comparisons.push({title,mse:ms,df,method:shouldTest?posthoc:'none',...(shouldTest?compareMeans(items,posthoc,alpha,ms,df):{items:items.map(x=>({...x,letters:[]})),pairs:[],critical:[]})});
  };
  const effectA=terms.find(t=>t.label===(multi?'Faktor A':'Perlakuan')),effectB=terms.find(t=>t.label==='Faktor B'),interaction=terms.find(t=>t.label==='A × B');
  if(!multi)addComparison('Perlakuan',cells,mse,dfE,effectA.p<alpha);
  else if(interaction.p<alpha){
    notes.push('Interaksi A × B nyata: uji lanjut ditampilkan sebagai pengaruh sederhana B di dalam setiap taraf A. Huruf hanya dibandingkan di dalam tabel yang sama.');
    A.forEach(a=>{const items=B.map(b=>summary(b,group(a,b),mse,dfE)),ss=r*sum(items.map(x=>(x.mean-mean(items.map(x=>x.mean)))**2)),p=fTail(ss/(l-1)/mse,l-1,dfE);addComparison(`Faktor B pada A = ${a}`,items,mse,dfE,p<alpha);});
  }else{
    addComparison('Faktor A',A.map(a=>summary(a,group(a,null),split?msea:mse,split?dfEa:dfE)),split?msea:mse,split?dfEa:dfE,effectA.p<alpha);
    addComparison('Faktor B',B.map(b=>summary(b,group(null,b),mse,dfE)),mse,dfE,effectB.p<alpha);
  }
  if(posthoc==='none')notes.push('Uji lanjut tidak digunakan sesuai pilihan. Rataan dan SE bersifat deskriptif.');
  if(posthoc==='dmrt')notes.push('DMRT memakai rentang peringkat rataan dan α rentang = 1 − (1 − α)^(p − 1); pada ulangan tidak sama digunakan rataan harmonik.');
  if(posthoc==='bnt')notes.push('BNT menggunakan uji t dua sisi tanpa penyesuaian multipel dan dijalankan setelah uji F yang relevan nyata.');
  const residualGroups=A.flatMap(a=>B.map(b=>obs.flatMap((o,i)=>o.a===a&&o.b===b?[residuals[i]]:[])));
  const assumptions=options.assumptions?[normality(residuals),brownForsythe(residualGroups)]:[];
  let wholeResiduals=[];
  if(split){wholeResiduals=R.flatMap(rep=>A.map((a,i)=>wholeMean.get(key(rep,a))-rMean.get(rep)-aMean[i]+grand));if(options.assumptions){const normal=normality(wholeResiduals);normal.name+=' — petak utama';assumptions.push(normal);const groups=A.map((a,i)=>R.map(rep=>wholeMean.get(key(rep,a))-rMean.get(rep)-aMean[i]+grand));const bf=brownForsythe(groups);bf.name+=' — petak utama';assumptions.push(bf);}notes.push('RPT berbasis RAK: A diuji dengan Galat (a); B dan A × B dengan Galat (b). SE rataan kombinasi memperhitungkan kedua galat.');}
  if(options.assumptions)notes.push('Pemeriksaan asumsi pada residual bersifat diagnostik. p ≥ α tidak membuktikan asumsi terpenuhi; independensi harus dijamin melalui rancangan dan randomisasi.');
  let contrasts=[];
  if(options.contrastMode!=='none'){
    if(multi)throw Error('Kontras/polinomial saat ini diterapkan pada satu faktor RAL atau RAK.');
    contrasts=options.contrastMode==='polynomial'?polynomialContrasts(cells,options.levels,mse,dfE):plannedContrasts(cells,options.contrasts,mse,dfE);
    notes.push('Kontras terencana diuji dengan galat model tanpa mensyaratkan F keseluruhan nyata; p yang ditampilkan belum disesuaikan untuk pengujian multipel.');
  }
  return {name,design,alpha,posthoc,N,grand,cv:Math.sqrt(mse)/Math.abs(grand)*100,cvWhole:split?Math.sqrt(msea)/Math.abs(grand)*100:null,terms,cells,comparisons,contrasts,assumptions,residuals,fitted,wholeResiduals,observations:obs.map(o=>({a:o.a,b:o.b,rep:o.rep,y:o.y})),notes,factorA:A,factorB:B,replicates:R};
}
