import jStat from 'jstat';
import {mean,sum,fTail} from './statistics-engine.js';
import {combinedAnova} from './advanced-engine.js';

const unique=x=>[...new Set(x)];
const sq=x=>x*x;
const dot=(a,b)=>sum(a.map((v,i)=>v*b[i]));
const transpose=A=>A[0].map((_,j)=>A.map(r=>r[j]));
const identity=n=>Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j)));

function qrSse(X,y){
  const q=[];let scale=0;
  for(let j=0;j<X[0].length;j++){
    let v=X.map(r=>r[j]);scale=Math.max(scale,Math.sqrt(dot(v,v)));
    for(let pass=0;pass<2;pass++)for(const qi of q){const a=dot(qi,v);v=v.map((z,k)=>z-a*qi[k]);}
    const n=Math.sqrt(dot(v,v));if(n>1e-10*Math.max(1,scale))q.push(v.map(z=>z/n));
  }
  const y2=dot(y,y),explained=sum(q.map(qi=>sq(dot(qi,y))));
  return {rank:q.length,sse:Math.max(0,y2-explained)};
}
function effectColumns(rows,getter,levels){
  if(levels.length<=1)return [];
  const last=levels.at(-1);
  return levels.slice(0,-1).map(level=>rows.map(row=>getter(row)===level?1:getter(row)===last?-1:0));
}
function nestedBlockColumns(rows,locations){
  const cols=[];
  for(const loc of locations){
    const local=rows.filter(r=>String(r[0])===loc),blocks=unique(local.map(r=>String(r[2])));if(blocks.length<=1)continue;
    const last=blocks.at(-1);
    for(const block of blocks.slice(0,-1))cols.push(rows.map(r=>String(r[0])!==loc?0:String(r[2])===block?1:String(r[2])===last?-1:0));
  }
  return cols;
}
function interactionColumns(a,b){const cols=[];for(const x of a)for(const y of b)cols.push(x.map((v,i)=>v*y[i]));return cols;}
function designFromTerms(n,terms,exclude=null){
  const columns=[Array(n).fill(1)];for(const [name,cols] of Object.entries(terms))if(name!==exclude)columns.push(...cols);
  return transpose(columns);
}
function glmTerm(label,ss,df,mse,dfError){
  const ms=df>0?ss/df:null,f=df>0&&mse>0?ms/mse:null;
  return {label,ss,df,ms,f,p:f===null?null:fTail(f,df,dfError),f05:f===null?null:jStat.centralF.inv(.95,df,dfError),f01:f===null?null:jStat.centralF.inv(.99,df,dfError),error:'Galat'};
}
function errorTerm(label,ss,df){return {label,ss,df,ms:df>0?ss/df:null,f:null,p:null,f05:null,f01:null,error:null};}

export function combinedAnovaGlm(rows){
  if(!rows.length||rows.some(r=>r.length!==4||!Number.isFinite(r[3])))throw Error('GLM gabungan memerlukan Lokasi, Perlakuan/Genotipe, Kelompok, dan Y.');
  const L=unique(rows.map(r=>String(r[0]))),G=unique(rows.map(r=>String(r[1])));if(L.length<2||G.length<2)throw Error('Diperlukan minimal dua lokasi dan dua perlakuan/genotipe.');
  for(const l of L)for(const g of G)if(!rows.some(r=>String(r[0])===l&&String(r[1])===g))throw Error(`Sel Lokasi × Genotipe kosong (${l} × ${g}). GLM interaksi penuh tidak dapat diestimasi; lengkapi minimal satu pengamatan pada setiap kombinasi.`);
  const y=rows.map(r=>r[3]),locCols=effectColumns(rows,r=>String(r[0]),L),genCols=effectColumns(rows,r=>String(r[1]),G),blockCols=nestedBlockColumns(rows,L),intCols=interactionColumns(locCols,genCols);
  const terms={Lokasi:locCols,'Kelompok(Lokasi)':blockCols,'Perlakuan/Genotipe':genCols,'Lokasi × Perlakuan':intCols},full=qrSse(designFromTerms(rows.length,terms),y),dfError=rows.length-full.rank;
  if(dfError<1)throw Error('Derajat bebas galat tidak cukup untuk GLM. Tambahkan pengamatan atau kurangi kompleksitas data.');
  const mse=full.sse/dfError,tests=[];
  for(const name of Object.keys(terms)){
    if(!terms[name].length)continue;const reduced=qrSse(designFromTerms(rows.length,terms,name),y),df=full.rank-reduced.rank,ss=Math.max(0,reduced.sse-full.sse);tests.push(glmTerm(name,ss,df,mse,dfError));
  }
  const grand=mean(y),sst=sum(y.map(v=>sq(v-grand))),blocksByLocation=Object.fromEntries(L.map(l=>[l,unique(rows.filter(r=>String(r[0])===l).map(r=>String(r[2])))]));
  const means=G.map(g=>{
    const locationMeans=L.map(l=>mean(rows.filter(r=>String(r[0])===l&&String(r[1])===g).map(r=>r[3]))),pooled=rows.filter(r=>String(r[1])===g).map(r=>r[3]);
    return {label:g,mean:mean(locationMeans),rawMean:mean(pooled),n:pooled.length,locationMeans};
  });
  return {method:'glm-type3',balanced:false,n:rows.length,locations:L,treatments:G,blocksByLocation,grand,rank:full.rank,terms:[...tests,errorTerm('Galat',full.sse,dfError),errorTerm('Total',sst,rows.length-1)],cv:grand===0?null:Math.sqrt(mse)/Math.abs(grand)*100,means,meanMethod:'equal-location-cell-means',warnings:['Pada data tidak seimbang, rataan genotipe dilaporkan sebagai rata-rata rataan sel dengan bobot lokasi sama agar lokasi dengan ulangan lebih banyak tidak mendominasi. Nilai ini bukan LS-mean yang disesuaikan terhadap efek kelompok. Gunakan Mixed Model REML untuk inferensi berbasis efek acak kelompok.']};
}
export function combinedAnovaFlexible(rows){
  try{return {...combinedAnova(rows),method:'classical-balanced',balanced:true,warnings:[]};}
  catch(error){
    if(!/seimbang/i.test(error.message))throw error;
    return combinedAnovaGlm(rows);
  }
}

function jacobiEigen(A){
  const n=A.length,a=A.map(r=>[...r]),v=identity(n);
  for(let iter=0;iter<100*n*n;iter++){
    let p=0,q=Math.min(1,n-1),mx=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(Math.abs(a[i][j])>mx){mx=Math.abs(a[i][j]);p=i;q=j;}
    if(mx<1e-12)break;
    const phi=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(phi),s=Math.sin(phi),app=a[p][p],aqq=a[q][q],apq=a[p][q];
    a[p][p]=c*c*app-2*s*c*apq+s*s*aqq;a[q][q]=s*s*app+2*s*c*apq+c*c*aqq;a[p][q]=a[q][p]=0;
    for(let k=0;k<n;k++)if(k!==p&&k!==q){const x=a[k][p],y=a[k][q];a[k][p]=a[p][k]=c*x-s*y;a[k][q]=a[q][k]=s*x+c*y;}
    for(let k=0;k<n;k++){const x=v[k][p],y=v[k][q];v[k][p]=c*x-s*y;v[k][q]=s*x+c*y;}
  }
  const order=a.map((r,i)=>({value:Math.max(0,r[i]),i})).sort((x,y)=>y.value-x.value);
  return {values:order.map(o=>o.value),vectors:v.map(row=>order.map(o=>row[o.i]))};
}
function svdScores(A){
  const At=transpose(A),AtA=At.map(x=>At.map(y=>dot(x,y))),eig=jacobiEigen(AtA),singular=eig.values.map(Math.sqrt),keep=singular.map((s,i)=>({s,i})).filter(x=>x.s>1e-10).map(x=>x.i),V=eig.vectors;
  const genotype=V.map(row=>keep.map(i=>row[i]*Math.sqrt(singular[i]))),environment=A.map(row=>keep.map(i=>dot(row,V.map(r=>r[i]))/singular[i]*Math.sqrt(singular[i])));
  return {singular:keep.map(i=>singular[i]),genotype,environment};
}
function interactionMatrix(M){
  const rowMeans=M.map(mean),colMeans=transpose(M).map(mean),grand=mean(M.flat());
  return {grand,rowMeans,colMeans,matrix:M.map((row,i)=>row.map((v,j)=>v-rowMeans[i]-colMeans[j]+grand))};
}
function scoreRows(labels,scores,prefix){return labels.map((label,i)=>({label,pc1:scores[i]?.[0]??0,pc2:scores[i]?.[1]??0,type:prefix}));}

export function stabilityAnalysis(rows){
  if(!rows.length||rows.some(r=>r.length!==3||!Number.isFinite(r[2])))throw Error('AMMI/GGE memerlukan Lingkungan/Lokasi, Genotipe, dan Y.');
  const E=unique(rows.map(r=>String(r[0]))),G=unique(rows.map(r=>String(r[1])));if(E.length<2||G.length<2)throw Error('AMMI/GGE memerlukan minimal dua lingkungan dan dua genotipe.');
  const M=E.map(e=>G.map(g=>{const v=rows.filter(r=>String(r[0])===e&&String(r[1])===g).map(r=>r[2]);if(!v.length)throw Error(`Kombinasi ${e} × ${g} tidak memiliki pengamatan. AMMI/GGE membutuhkan setiap sel lingkungan × genotipe terisi.`);return mean(v);}));
  const counts=E.map(e=>G.map(g=>rows.filter(r=>String(r[0])===e&&String(r[1])===g).length)),flatCounts=counts.flat(),minRep=Math.min(...flatCounts),maxRep=Math.max(...flatCounts),balancedReplication=minRep===maxRep;
  const inter=interactionMatrix(M),ammiSvd=svdScores(inter.matrix),ammiSS=sum(inter.matrix.flat().map(sq)),ammiComp=ammiSvd.singular.map((s,i)=>({component:`IPCA${i+1}`,singular:s,ss:s*s,percent:ammiSS>0?s*s/ammiSS*100:0}));
  const envMeans=M.map(mean),ggeMatrix=M.map((row,i)=>row.map(v=>v-envMeans[i])),ggeSvd=svdScores(ggeMatrix),ggeSS=sum(ggeMatrix.flat().map(sq)),ggeComp=ggeSvd.singular.map((s,i)=>({component:`PC${i+1}`,singular:s,ss:s*s,percent:ggeSS>0?s*s/ggeSS*100:0}));
  const warnings=[];
  if(!balancedReplication)warnings.push(`Jumlah ulangan per sel tidak sama (${minRep}–${maxRep}). AMMI/GGE dihitung dari rataan tiap sel dengan bobot sel sama; perbedaan presisi antar sel tidak dibobot dalam dekomposisi.`);
  return {n:rows.length,environments:E,genotypes:G,means:M,counts,grand:inter.grand,environmentMeans:inter.rowMeans,genotypeMeans:inter.colMeans,replication:{balanced:balancedReplication,min:minRep,max:maxRep},warnings,ammi:{interactionSS:ammiSS,components:ammiComp,genotypes:scoreRows(G,ammiSvd.genotype,'Genotipe'),environments:scoreRows(E,ammiSvd.environment,'Lingkungan'),scaling:'symmetric alpha=0.5'},gge:{totalSS:ggeSS,components:ggeComp,genotypes:scoreRows(G,ggeSvd.genotype,'Genotipe'),environments:scoreRows(E,ggeSvd.environment,'Lingkungan'),centering:'environment-centered',scaling:'symmetric alpha=0.5'}};
}
