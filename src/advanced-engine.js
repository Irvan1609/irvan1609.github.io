import jStat from 'jstat';
import {mean,sum,fTail} from './statistics-engine.js';

const unique=x=>[...new Set(x)];
const sq=x=>x*x;
const transpose=A=>A[0].map((_,j)=>A.map(r=>r[j]));
const dot=(a,b)=>sum(a.map((v,i)=>v*b[i]));
const identity=n=>Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j)));

function variance(x){if(x.length<2)return null;const m=mean(x);return sum(x.map(v=>sq(v-m)))/(x.length-1);}
function median(x){const s=[...x].sort((a,b)=>a-b),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;}
function quantile(x,p){const s=[...x].sort((a,b)=>a-b),h=(s.length-1)*p,i=Math.floor(h),f=h-i;return s[i]+(s[Math.min(i+1,s.length-1)]-s[i])*f;}

export function descriptiveStatistics(rows){
  if(!rows.length||!rows[0].length||rows.some(r=>r.length!==rows[0].length||r.some(v=>!Number.isFinite(v))))throw Error('Statistik deskriptif memerlukan data numerik lengkap.');
  return transpose(rows).map(values=>{
    const n=values.length,m=mean(values),v=variance(values),sd=v===null?null:Math.sqrt(v),se=sd===null?null:sd/Math.sqrt(n);
    let skew=null,kurtosis=null;
    if(n>=3&&sd>0){const z=values.map(v=>(v-m)/sd);skew=n/((n-1)*(n-2))*sum(z.map(v=>v**3));}
    if(n>=4&&sd>0){const z=values.map(v=>(v-m)/sd),a=n*(n+1)/((n-1)*(n-2)*(n-3)),b=3*(n-1)**2/((n-2)*(n-3));kurtosis=a*sum(z.map(v=>v**4))-b;}
    return {n,mean:m,median:median(values),min:Math.min(...values),q1:quantile(values,.25),q3:quantile(values,.75),max:Math.max(...values),sd,se,cv:m===0?null:Math.abs(sd/m*100),skew,kurtosis};
  });
}

function solveLinear(A,b){
  const n=A.length,M=A.map((r,i)=>[...r,b[i]]);
  for(let k=0;k<n;k++){
    let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(M[i][k])>Math.abs(M[pivot][k]))pivot=i;
    if(Math.abs(M[pivot][k])<1e-12)throw Error('Matriks singular atau hampir singular.');
    [M[k],M[pivot]]=[M[pivot],M[k]];
    const d=M[k][k];for(let j=k;j<=n;j++)M[k][j]/=d;
    for(let i=0;i<n;i++)if(i!==k){const f=M[i][k];for(let j=k;j<=n;j++)M[i][j]-=f*M[k][j];}
  }
  return M.map(r=>r[n]);
}
function inverse(A){return transpose(A).map((_,j)=>solveLinear(A,identity(A.length).map(r=>r[j])));}
function normalMatrix(X){const Xt=transpose(X);return Xt.map(a=>Xt.map(b=>dot(a,b)));}
function multiplyMatVec(A,b){return A.map(r=>dot(r,b));}
function fitPolynomial(x,y,degree){
  const n=x.length,k=degree+1;if(n<=k)throw Error('Jumlah pengamatan harus lebih besar daripada jumlah koefisien model.');
  const X=x.map(v=>Array.from({length:k},(_,j)=>v**j)),Xt=transpose(X),XtX=normalMatrix(X),beta=solveLinear(XtX,Xt.map(col=>dot(col,y)));
  const fitted=X.map(r=>dot(r,beta)),residuals=y.map((v,i)=>v-fitted[i]),sse=sum(residuals.map(sq)),grand=mean(y),sst=sum(y.map(v=>sq(v-grand))),ssr=Math.max(0,sst-sse),dfModel=degree,dfError=n-k,mse=sse/dfError;
  const inv=inverse(XtX),se=beta.map((_,i)=>Math.sqrt(Math.max(0,mse*inv[i][i]))),coef=beta.map((value,i)=>{const t=se[i]>0?value/se[i]:null;return {degree:i,value,se:se[i],t,p:t===null?null:jStat.ibeta(dfError/(dfError+t*t),dfError/2,.5)};});
  const f=dfModel>0&&mse>0?(ssr/dfModel)/mse:null,r2=sst>0?1-sse/sst:1,adjustedR2=1-(1-r2)*(n-1)/dfError,aic=n*Math.log(Math.max(sse/n,Number.MIN_VALUE))+2*k;
  const stationary=[];
  if(degree===2&&Math.abs(beta[2])>1e-14){const root=-beta[1]/(2*beta[2]);if(root>=Math.min(...x)&&root<=Math.max(...x))stationary.push({x:root,y:beta[0]+beta[1]*root+beta[2]*root*root,type:beta[2]<0?'maksimum':'minimum'});}
  if(degree===3&&Math.abs(beta[3])>1e-14){const a=3*beta[3],b=2*beta[2],c=beta[1],disc=b*b-4*a*c;if(disc>=0){for(const root of [(-b+Math.sqrt(disc))/(2*a),(-b-Math.sqrt(disc))/(2*a)])if(root>=Math.min(...x)&&root<=Math.max(...x)){const second=2*beta[2]+6*beta[3]*root;stationary.push({x:root,y:beta.reduce((s,v,i)=>s+v*root**i,0),type:second<0?'maksimum':second>0?'minimum':'stasioner'});}}}
  return {degree,n,coefficients:coef,fitted,residuals,sse,sst,ssr,mse,dfModel,dfError,f,p:f===null?null:fTail(f,dfModel,dfError),r2,adjustedR2,rmse:Math.sqrt(sse/n),aic,stationary};
}
export function polynomialRegression(rows,maxDegree=3){
  if(rows.length<4||rows.some(r=>r.length!==2||r.some(v=>!Number.isFinite(v))))throw Error('Regresi memerlukan minimal 4 pasangan X dan Y numerik.');
  const x=rows.map(r=>r[0]),y=rows.map(r=>r[1]);if(unique(x).length<2)throw Error('X harus memiliki minimal dua nilai berbeda.');
  const max=Math.min(Math.max(1,Math.floor(maxDegree)),3,unique(x).length-1,rows.length-2),models=[];
  for(let d=1;d<=max;d++)models.push(fitPolynomial(x,y,d));
  const best=models.reduce((a,b)=>b.aic<a.aic?b:a);
  return {n:rows.length,x,y,models,bestDegree:best.degree};
}

function jacobiEigen(A){
  const n=A.length,a=A.map(r=>[...r]),v=identity(n);let iter=0;
  for(;iter<100*n*n;iter++){
    let p=0,q=1,max=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(Math.abs(a[i][j])>max){max=Math.abs(a[i][j]);p=i;q=j;}
    if(max<1e-12)break;
    const phi=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(phi),s=Math.sin(phi),app=a[p][p],aqq=a[q][q],apq=a[p][q];
    a[p][p]=c*c*app-2*s*c*apq+s*s*aqq;a[q][q]=s*s*app+2*s*c*apq+c*c*aqq;a[p][q]=a[q][p]=0;
    for(let k=0;k<n;k++)if(k!==p&&k!==q){const akp=a[k][p],akq=a[k][q];a[k][p]=a[p][k]=c*akp-s*akq;a[k][q]=a[q][k]=s*akp+c*akq;}
    for(let k=0;k<n;k++){const vkp=v[k][p],vkq=v[k][q];v[k][p]=c*vkp-s*vkq;v[k][q]=s*vkp+c*vkq;}
  }
  const order=a.map((r,i)=>({value:r[i],i})).sort((x,y)=>y.value-x.value);
  return {values:order.map(o=>o.value),vectors:v.map(row=>order.map(o=>row[o.i])),iterations:iter};
}
export function pca(rows){
  if(rows.length<3||rows[0]?.length<2||rows.some(r=>r.length!==rows[0].length||r.some(v=>!Number.isFinite(v))))throw Error('PCA memerlukan minimal 3 baris dan 2 variabel numerik lengkap.');
  const cols=transpose(rows),means=cols.map(mean),sds=cols.map(c=>Math.sqrt(variance(c)));if(sds.some(v=>!(v>0)))throw Error('PCA tidak dapat memakai variabel konstan.');
  const z=rows.map(r=>r.map((v,j)=>(v-means[j])/sds[j])),corr=transpose(z).map(a=>transpose(z).map(b=>dot(a,b)/(rows.length-1))),eig=jacobiEigen(corr),total=sum(eig.values),explained=eig.values.map(v=>v/total),cumulative=[];explained.reduce((s,v,i)=>(cumulative[i]=s+v,s+v),0);
  const scores=z.map(r=>transpose(eig.vectors).map(vec=>dot(r,vec))),loadings=eig.vectors.map((row,i)=>row.map((v,j)=>v*Math.sqrt(Math.max(0,eig.values[j]))));
  return {n:rows.length,p:cols.length,means,sds,corr,eigenvalues:eig.values,explained,cumulative,loadings,scores};
}

function anovaTerm(label,ss,df,denMs,denDf,error){const ms=ss/df,f=denMs>0?ms/denMs:null;return {label,ss,df,ms,f,p:f===null?null:fTail(f,df,denDf),f05:f===null?null:jStat.centralF.inv(.95,df,denDf),f01:f===null?null:jStat.centralF.inv(.99,df,denDf),error};}
function errTerm(label,ss,df){return {label,ss,df,ms:ss/df,f:null,p:null,f05:null,f01:null,error:null};}

export function combinedAnova(rows){
  if(!rows.length||rows.some(r=>r.length!==4||!Number.isFinite(r[3])))throw Error('ANOVA gabungan memerlukan Lokasi, Perlakuan/Genotipe, Kelompok, dan Y.');
  const L=unique(rows.map(r=>String(r[0]))),G=unique(rows.map(r=>String(r[1]))),R=unique(rows.map(r=>String(r[2]))),l=L.length,g=G.length,r=R.length;
  if(l<2||g<2||r<2||rows.length!==l*g*r)throw Error('ANOVA gabungan saat ini memerlukan data seimbang: setiap Lokasi × Perlakuan memiliki semua kelompok yang sama.');
  const key=(a,b,c)=>JSON.stringify([a,b,c]),seen=new Set();for(const row of rows){const k=key(...row.slice(0,3).map(String));if(seen.has(k))throw Error('Ada kombinasi Lokasi × Perlakuan × Kelompok ganda.');seen.add(k);}
  const y=rows.map(r=>r[3]),grand=mean(y),mL=L.map(a=>mean(rows.filter(r=>String(r[0])===a).map(r=>r[3]))),mG=G.map(a=>mean(rows.filter(r=>String(r[1])===a).map(r=>r[3])));
  const mLR=new Map(L.flatMap(a=>R.map(b=>[[a,b].join('\u0000'),mean(rows.filter(r=>String(r[0])===a&&String(r[2])===b).map(r=>r[3]))]))),mLG=new Map(L.flatMap(a=>G.map(b=>[[a,b].join('\u0000'),mean(rows.filter(r=>String(r[0])===a&&String(r[1])===b).map(r=>r[3]))])));
  const ssTotal=sum(y.map(v=>sq(v-grand))),ssL=g*r*sum(mL.map(v=>sq(v-grand))),ssRL=g*sum(L.flatMap((a,i)=>R.map(b=>sq(mLR.get([a,b].join('\u0000'))-mL[i])))),ssG=l*r*sum(mG.map(v=>sq(v-grand))),ssLG=r*sum(L.flatMap((a,i)=>G.map((b,j)=>sq(mLG.get([a,b].join('\u0000'))-mL[i]-mG[j]+grand)))),ssE=Math.max(0,ssTotal-ssL-ssRL-ssG-ssLG);
  const dfL=l-1,dfRL=l*(r-1),dfG=g-1,dfLG=(l-1)*(g-1),dfE=l*(r-1)*(g-1),msRL=ssRL/dfRL,msLG=ssLG/dfLG,msE=ssE/dfE;
  return {n:rows.length,locations:L,treatments:G,blocks:R,grand,terms:[anovaTerm('Lokasi',ssL,dfL,msRL,dfRL,'Kelompok(Lokasi)'),errTerm('Kelompok(Lokasi)',ssRL,dfRL),anovaTerm('Perlakuan/Genotipe',ssG,dfG,msLG,dfLG,'Lokasi × Perlakuan'),anovaTerm('Lokasi × Perlakuan',ssLG,dfLG,msE,dfE,'Galat'),errTerm('Galat',ssE,dfE),errTerm('Total',ssTotal,rows.length-1)],cv:grand===0?null:Math.sqrt(msE)/Math.abs(grand)*100,means:G.map(g0=>({label:g0,mean:mean(rows.filter(r=>String(r[1])===g0).map(r=>r[3]))}))};
}

export function geneticParameters(rows,selectionIntensity=2.06){
  if(!rows.length||rows.some(r=>r.length!==3||!Number.isFinite(r[2])))throw Error('Analisis genetik memerlukan Genotipe, Kelompok/Ulangan, dan Y.');
  const G=unique(rows.map(r=>String(r[0]))),R=unique(rows.map(r=>String(r[1]))),g=G.length,r=R.length;if(g<2||r<2||rows.length!==g*r)throw Error('Analisis genetik saat ini memerlukan RAK seimbang dengan setiap genotipe pada semua kelompok.');
  const seen=new Set();for(const row of rows){const k=String(row[0])+'\u0000'+String(row[1]);if(seen.has(k))throw Error('Ada kombinasi Genotipe × Kelompok ganda.');seen.add(k);}
  const y=rows.map(r=>r[2]),grand=mean(y),gm=G.map(a=>mean(rows.filter(r=>String(r[0])===a).map(r=>r[2]))),rm=R.map(a=>mean(rows.filter(r=>String(r[1])===a).map(r=>r[2]))),ssT=sum(y.map(v=>sq(v-grand))),ssG=r*sum(gm.map(v=>sq(v-grand))),ssR=g*sum(rm.map(v=>sq(v-grand))),ssE=Math.max(0,ssT-ssG-ssR),dfG=g-1,dfR=r-1,dfE=(g-1)*(r-1),msG=ssG/dfG,msR=ssR/dfR,msE=ssE/dfE;
  const vg=Math.max(0,(msG-msE)/r),ve=msE,vp=vg+ve/r,h2=vp>0?vg/vp:0,gcv=grand===0?null:Math.sqrt(vg)/Math.abs(grand)*100,pcv=grand===0?null:Math.sqrt(vp)/Math.abs(grand)*100,ga=selectionIntensity*Math.sqrt(vp)*h2,gam=grand===0?null:ga/Math.abs(grand)*100;
  const classifyH=v=>v<.2?'Rendah':v<=.5?'Sedang':'Tinggi',classifyCV=v=>v===null?'—':v<10?'Sempit':v<=20?'Sedang':'Luas';
  return {n:rows.length,genotypes:G,blocks:R,grand,terms:[anovaTerm('Kelompok',ssR,dfR,msE,dfE,'Galat'),anovaTerm('Genotipe',ssG,dfG,msE,dfE,'Galat'),errTerm('Galat',ssE,dfE),errTerm('Total',ssT,rows.length-1)],components:{vg,ve,vp,h2,h2Percent:h2*100,gcv,pcv,ga,gam,hClass:classifyH(h2),gcvClass:classifyCV(gcv),pcvClass:classifyCV(pcv),selectionIntensity},means:G.map((label,i)=>({label,mean:gm[i]}))};
}
