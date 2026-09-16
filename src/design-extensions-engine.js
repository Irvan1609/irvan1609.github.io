import jStat from 'jstat';
import {fTail,compareMeans} from './statistics-engine.js';

const sum=x=>x.reduce((a,b)=>a+b,0),mean=x=>sum(x)/x.length,sq=x=>x*x,unique=x=>[...new Set(x.map(String))];
function term(label,ss,df,denMs=null,denDf=null,error=null){const ms=ss/df,f=denMs&&denMs>0?ms/denMs:null;return {label,ss,df,ms,f,p:f===null?null:fTail(f,df,denDf),f05:f===null?null:jStat.centralF.inv(.95,df,denDf),f01:f===null?null:jStat.centralF.inv(.99,df,denDf),error};}
function noComparison(items,mse,df){return {items:items.map(item=>({...item,letters:[]})),method:'none',critical:[],pairs:[],mse,df};}

export function nestedAnova(rows){
  if(!rows.length||rows.some(r=>r.length!==4||!Number.isFinite(r[3])))throw Error('Nested design memerlukan Faktor A, Faktor B(A), Ulangan, dan Y numerik.');
  const A=unique(rows.map(r=>r[0])),BByA=new Map(),rep=unique(rows.map(r=>r[2]));
  for(const a of A)BByA.set(a,unique(rows.filter(r=>String(r[0])===a).map(r=>r[1])));
  const bCounts=[...BByA.values()].map(x=>x.length);if(A.length<2||Math.min(...bCounts)<2||new Set(bCounts).size!==1||rep.length<2)throw Error('Nested design saat ini memerlukan jumlah B(A) dan ulangan yang seimbang pada setiap A.');
  const b=bCounts[0],r=rep.length,expected=A.length*b*r;if(rows.length!==expected)throw Error('Data nested tidak lengkap atau tidak seimbang.');
  const seen=new Set();for(const row of rows){const k=JSON.stringify(row.slice(0,3).map(String));if(seen.has(k))throw Error('Ada kombinasi A × B(A) × Ulangan ganda.');seen.add(k);}
  const y=rows.map(r=>r[3]),grand=mean(y),meanA=new Map(A.map(a=>[a,mean(rows.filter(x=>String(x[0])===a).map(x=>x[3]))])),meanAB=new Map();
  for(const a of A)for(const bb of BByA.get(a))meanAB.set(`${a}\0${bb}`,mean(rows.filter(x=>String(x[0])===a&&String(x[1])===bb).map(x=>x[3])));
  const ssA=b*r*sum(A.map(a=>sq(meanA.get(a)-grand))),ssB=r*sum(A.flatMap(a=>BByA.get(a).map(bb=>sq(meanAB.get(`${a}\0${bb}`)-meanA.get(a))))),ssE=sum(rows.map(row=>sq(row[3]-meanAB.get(`${row[0]}\0${row[1]}`)))),ssT=sum(y.map(v=>sq(v-grand)));
  const dfA=A.length-1,dfB=A.length*(b-1),dfE=A.length*b*(r-1),msB=ssB/dfB,msE=ssE/dfE;
  const means=A.map(a=>({a,mean:meanA.get(a),nested:BByA.get(a).map(bb=>({b:bb,mean:meanAB.get(`${a}\0${bb}`)}))}));
  return {n:rows.length,A,b,r,grand,means,terms:[term('Faktor A',ssA,dfA,msB,dfB,'B(A)'),term('B(A)',ssB,dfB,msE,dfE,'Galat'),term('Galat',ssE,dfE),term('Total',ssT,rows.length-1)]};
}

export function nestedPosthoc(result,method='none',alpha=.05){
  if(!result?.terms||!Array.isArray(result.means)||!['none','bnt','bnj','dmrt'].includes(method)||![.05,.01].includes(alpha))throw Error('Pengaturan uji lanjut nested tidak valid.');
  const effectA=result.terms.find(t=>t.label==='Faktor A'),effectB=result.terms.find(t=>t.label==='B(A)'),error=result.terms.find(t=>t.label==='Galat');
  if(!effectA||!effectB||!error||!(effectB.ms>0)||!(error.ms>0))throw Error('Galat pembanding nested tidak tersedia.');
  const aItems=result.means.map(item=>({label:item.a,a:item.a,mean:item.mean,n:result.b*result.r}));
  const aGate=Number.isFinite(effectA.p)&&effectA.p<alpha;
  const factorA=method==='none'||!aGate?noComparison(aItems,effectB.ms,effectB.df):{...compareMeans(aItems,method,alpha,effectB.ms,effectB.df),mse:effectB.ms,df:effectB.df};
  const bGate=Number.isFinite(effectB.p)&&effectB.p<alpha;
  const nested=result.means.map(group=>{
    const items=group.nested.map(item=>({label:item.b,a:group.a,b:item.b,mean:item.mean,n:result.r}));
    const comparison=method==='none'||!bGate?noComparison(items,error.ms,error.df):{...compareMeans(items,method,alpha,error.ms,error.df),mse:error.ms,df:error.df};
    return {a:group.a,...comparison};
  });
  return {method,alpha,factorA:{...factorA,significant:aGate,error:'B(A)'},nested:nested.map(x=>({...x,significant:bGate,error:'Galat'}))};
}

function covariance(vectors){
  const n=vectors.length,t=vectors[0].length,means=Array.from({length:t},(_,j)=>mean(vectors.map(r=>r[j])));
  return Array.from({length:t},(_,i)=>Array.from({length:t},(_,j)=>sum(vectors.map(r=>(r[i]-means[i])*(r[j]-means[j])))/(n-1)));
}
function matMul(A,B){return A.map(r=>B[0].map((_,j)=>sum(r.map((v,k)=>v*B[k][j]))));}
function trace(A){return sum(A.map((r,i)=>r[i]));}
function identity(n){return Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j)));}
function centerMatrix(n){return identity(n).map((r,i)=>r.map((v,j)=>v-1/n));}

export function repeatedMeasuresAnova(rows){
  if(!rows.length||rows.some(r=>r.length!==4||!Number.isFinite(r[3])))throw Error('Repeated measures memerlukan Perlakuan, Subjek/Ulangan, Waktu, dan Y numerik.');
  const A=unique(rows.map(r=>r[0])),T=unique(rows.map(r=>r[2]));if(A.length<2||T.length<2)throw Error('Diperlukan minimal 2 perlakuan dan 2 waktu.');
  const subjectsByA=new Map(A.map(a=>[a,unique(rows.filter(r=>String(r[0])===a).map(r=>r[1]))]));const nCounts=[...subjectsByA.values()].map(x=>x.length);if(new Set(nCounts).size!==1||nCounts[0]<2)throw Error('Repeated measures saat ini memerlukan jumlah subjek/ulangan seimbang pada setiap perlakuan.');
  const n=nCounts[0],N=A.length*n,expected=N*T.length;if(rows.length!==expected)throw Error('Setiap subjek harus mempunyai satu pengamatan pada setiap waktu.');
  const seen=new Set();for(const row of rows){const k=JSON.stringify(row.slice(0,3).map(String));if(seen.has(k))throw Error('Ada kombinasi Perlakuan × Subjek × Waktu ganda.');seen.add(k);}
  for(const a of A)for(const s of subjectsByA.get(a))for(const t of T)if(!rows.some(r=>String(r[0])===a&&String(r[1])===s&&String(r[2])===t))throw Error(`Data waktu tidak lengkap untuk ${a}, subjek ${s}.`);
  const y=rows.map(r=>r[3]),grand=mean(y),meanA=new Map(A.map(a=>[a,mean(rows.filter(r=>String(r[0])===a).map(r=>r[3]))])),meanT=new Map(T.map(t=>[t,mean(rows.filter(r=>String(r[2])===t).map(r=>r[3]))])),meanAT=new Map();
  for(const a of A)for(const t of T)meanAT.set(`${a}\0${t}`,mean(rows.filter(r=>String(r[0])===a&&String(r[2])===t).map(r=>r[3])));
  const meanSub=new Map();for(const a of A)for(const s of subjectsByA.get(a))meanSub.set(`${a}\0${s}`,mean(rows.filter(r=>String(r[0])===a&&String(r[1])===s).map(r=>r[3])));
  const tt=T.length,ssA=n*tt*sum(A.map(a=>sq(meanA.get(a)-grand))),ssSub=tt*sum(A.flatMap(a=>subjectsByA.get(a).map(s=>sq(meanSub.get(`${a}\0${s}`)-meanA.get(a))))),ssTime=N*sum(T.map(t=>sq(meanT.get(t)-grand))),ssInt=n*sum(A.flatMap(a=>T.map(t=>sq(meanAT.get(`${a}\0${t}`)-meanA.get(a)-meanT.get(t)+grand)))),ssTotal=sum(y.map(v=>sq(v-grand))),ssWithin=Math.max(0,ssTotal-ssA-ssSub-ssTime-ssInt);
  const dfA=A.length-1,dfSub=A.length*(n-1),dfTime=tt-1,dfInt=(A.length-1)*(tt-1),dfWithin=dfSub*(tt-1),msSub=ssSub/dfSub,msWithin=ssWithin/dfWithin;
  const subjects=[];for(const a of A)for(const s of subjectsByA.get(a))subjects.push(T.map(t=>rows.find(r=>String(r[0])===a&&String(r[1])===s&&String(r[2])===t)[3]-meanAT.get(`${a}\0${t}`)));
  let epsilon=1;if(tt>2&&subjects.length>2){const S=covariance(subjects),C=centerMatrix(tt),CSC=matMul(matMul(C,S),C),tr=trace(CSC),tr2=trace(matMul(CSC,CSC));if(tr2>0)epsilon=Math.max(1/(tt-1),Math.min(1,tr*tr/((tt-1)*tr2)));}
  const tTime=term('Waktu',ssTime,dfTime,msWithin,dfWithin,'Galat(Waktu)'),tInt=term('Perlakuan × Waktu',ssInt,dfInt,msWithin,dfWithin,'Galat(Waktu)');
  tTime.gg={epsilon,df1:dfTime*epsilon,df2:dfWithin*epsilon,p:tTime.f===null?null:fTail(tTime.f,dfTime*epsilon,dfWithin*epsilon)};tInt.gg={epsilon,df1:dfInt*epsilon,df2:dfWithin*epsilon,p:tInt.f===null?null:fTail(tInt.f,dfInt*epsilon,dfWithin*epsilon)};
  return {n:rows.length,treatments:A,times:T,subjectsPerTreatment:n,grand,epsilon,profile:A.map(a=>({a,values:T.map(t=>({time:t,mean:meanAT.get(`${a}\0${t}`)}))})),terms:[term('Perlakuan',ssA,dfA,msSub,dfSub,'Subjek(Perlakuan)'),term('Subjek(Perlakuan)',ssSub,dfSub),tTime,tInt,term('Galat(Waktu)',ssWithin,dfWithin),term('Total',ssTotal,rows.length-1)]};
}
