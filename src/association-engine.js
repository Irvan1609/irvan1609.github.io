import jStat from 'jstat';
import {mean,sum} from './statistics-engine.js';
const dot=(x,y)=>sum(x.map((v,i)=>v*y[i]));
export function correlationCritical(n,alpha){
  if(!Number.isInteger(n)||n<3||![.05,.01].includes(alpha))throw Error('N minimal 3; taraf 0.05 atau 0.01.');
  const t=jStat.studentt.inv(1-alpha/2,n-2);return Math.sqrt(t*t/(t*t+n-2));
}
export function correlationCI(r,n,alpha=.05){
  if(!Number.isFinite(r)||r < -1||r > 1||!Number.isInteger(n)||n<4||!(alpha>0&&alpha<1))throw Error('CI korelasi Pearson memerlukan -1 ≤ r ≤ 1, N ≥ 4, dan 0 < alpha < 1.');
  if(Math.abs(r)>=1-1e-15)return [Math.sign(r),Math.sign(r)];
  const z=.5*Math.log((1+r)/(1-r)),se=1/Math.sqrt(n-3),critical=jStat.normal.inv(1-alpha/2,0,1);
  return [Math.tanh(z-critical*se),Math.tanh(z+critical*se)];
}
function standardized(x){
  const m=mean(x),center=x.map(v=>v-m),norm=Math.sqrt(dot(center,center));
  if(!Number.isFinite(norm)||norm<=1e-13*Math.max(Math.abs(m),Number.MIN_VALUE))throw Error('Kolom konstan atau hampir konstan tidak dapat dianalisis.');
  return center.map(v=>v/norm);
}
function ranks(x){const order=x.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v),out=[];for(let i=0;i<order.length;){let j=i+1;while(j<order.length&&order[j].v===order[i].v)j++;for(let k=i;k<j;k++)out[order[k].i]=(i+j+1)/2;i=j;}return out;}
export function numericRows(dataset,columns,parse){
  if(new Set(columns).size!==columns.length||columns.some(i=>!Number.isInteger(i)||i<0||i>=dataset.headers.length))throw Error('Pilih kolom berbeda yang valid.');
  const rows=[];dataset.rows.forEach((row,i)=>{if(row.every(v=>String(v??'').trim()===''))return;const values=columns.map(c=>parse(row[c]));if(values.some(x=>!Number.isFinite(x)))throw Error(`Baris ${i+1}: lengkapi angka pada semua kolom terpilih. Baris tidak dibuang otomatis.`);rows.push(values);});return rows;
}
export function correlation(rows,method='pearson'){
  if(!['pearson','spearman'].includes(method)||rows.length<3||rows[0].length<2||rows.some(r=>r.length!==rows[0].length||r.some(v=>!Number.isFinite(v))))throw Error('Korelasi memerlukan ≥3 baris lengkap dan ≥2 kolom numerik.');
  const columns=rows[0].map((_,i)=>rows.map(r=>r[i])),z=columns.map(x=>standardized(method==='spearman'?ranks(x):x)),n=rows.length;
  const matrix=z.map((x,i)=>z.map((y,j)=>i===j?1:Math.max(-1,Math.min(1,dot(x,y))))),pairs=[];
  for(let i=0;i<z.length;i++)for(let j=i+1;j<z.length;j++){const r=matrix[i][j],p=Math.abs(r)>=1-1e-15?0:jStat.ibeta(1-r*r,(n-2)/2,.5);pairs.push({i,j,r,p});}
  // Holm adjustment across all pairs selected for this matrix.
  let previous=0;[...pairs].sort((a,b)=>a.p-b.p).forEach((pair,i)=>{previous=Math.max(previous,Math.min(1,pair.p*(pairs.length-i)));pair.holm=previous;});
  return {n,matrix,pairs,method};
}
export function pathAnalysis(rows){
  const p=(rows[0]?.length||0)-1,n=rows.length;
  if(p<1||n<=p+1)throw Error('Sidik lintas memerlukan satu Y, minimal satu X, dan N > jumlah X + 1.');
  const corr=correlation(rows),cols=rows[0].map((_,i)=>standardized(rows.map(r=>r[i]))),y=cols[0],x=cols.slice(1);
  // Reorthogonalized modified Gram–Schmidt, avoiding inversion of normal equations.
  const q=[],R=Array.from({length:p},()=>Array(p).fill(0));
  for(let j=0;j<p;j++){let v=[...x[j]];for(let pass=0;pass<2;pass++)for(let i=0;i<j;i++){const d=dot(q[i],v);R[i][j]+=d;v=v.map((z,k)=>z-d*q[i][k]);}R[j][j]=Math.sqrt(dot(v,v));if(R[j][j]<1e-7)throw Error('Prediktor kolinear atau terlalu mirip. Hapus salah satu X.');q.push(v.map(z=>z/R[j][j]));}
  const solve=b=>{const result=Array(p).fill(0);for(let i=p-1;i>=0;i--)result[i]=(b[i]-sum(R[i].slice(i+1).map((v,j)=>v*result[i+1+j])))/R[i][i];return result;};
  const beta=solve(q.map(v=>dot(v,y))),res=y.map((v,i)=>v-sum(x.map((c,j)=>c[i]*beta[j]))),sse=dot(res,res),r2=1-sse,df=n-p-1;
  if(r2< -1e-8||r2>1+1e-8)throw Error('Model tidak stabil secara numerik.');
  const inverseColumns=Array.from({length:p},(_,i)=>solve(Array.from({length:p},(_,j)=>+(i===j))));
  const effects=beta.map((direct,i)=>{const vif=sum(inverseColumns.map(c=>c[i]**2)),se=Math.sqrt(sse/df*vif),t=se>0?direct/se:null;return {direct,se,t,p:t===null?null:jStat.ibeta(df/(df+t*t),df/2,.5),vif,indirect:beta.map((b,j)=>j===i?0:corr.matrix[i+1][j+1]*b),total:corr.matrix[0][i+1]};});
  if(effects.some(e=>!Number.isFinite(e.vif)||e.vif>1e10))throw Error('Multikolinearitas terlalu tinggi untuk estimasi yang stabil.');
  return {n,p,df,r2:Math.max(0,r2),adjustedR2:1-sse*(n-1)/df,residual:Math.sqrt(Math.max(0,sse)),effects,corr};
}
