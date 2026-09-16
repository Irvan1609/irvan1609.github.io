import jStat from 'jstat';

const sum=x=>x.reduce((a,b)=>a+b,0);
const mean=x=>sum(x)/x.length;
const unique=x=>[...new Set(x.map(String))];

function rank(values){
  const order=values.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value),ranks=Array(values.length),ties=[];
  for(let i=0;i<order.length;){
    let j=i+1;while(j<order.length&&order[j].value===order[i].value)j++;
    const avg=(i+1+j)/2;for(let k=i;k<j;k++)ranks[order[k].index]=avg;
    if(j-i>1)ties.push(j-i);i=j;
  }
  return {ranks,ties};
}
function median(values){const s=[...values].sort((a,b)=>a-b),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;}
function holm(pairs){
  const sorted=pairs.map((x,i)=>({...x,_i:i})).sort((a,b)=>a.p-b.p),m=sorted.length;let prev=0;
  for(let i=0;i<m;i++){const adj=Math.min(1,(m-i)*sorted[i].p);prev=Math.max(prev,adj);sorted[i].pHolm=prev;}
  return sorted.sort((a,b)=>a._i-b._i).map(({_i,...x})=>x);
}
function chiTail(stat,df){return Math.max(0,Math.min(1,1-jStat.chisquare.cdf(stat,df)));}
function normalTwoTail(z){return Math.max(0,Math.min(1,2*(1-jStat.normal.cdf(Math.abs(z),0,1))));}

export function kruskalWallis(rows){
  if(!rows.length||rows.some(r=>r.length!==2||!Number.isFinite(r[1])||String(r[0]).trim()===''))throw Error('Kruskal–Wallis memerlukan Perlakuan dan satu respons numerik pada setiap baris.');
  const groups=unique(rows.map(r=>r[0]));if(groups.length<2)throw Error('Diperlukan minimal dua perlakuan.');
  const values=rows.map(r=>r[1]),N=values.length,{ranks,ties}=rank(values),rankSums=new Map(groups.map(g=>[g,0])),counts=new Map(groups.map(g=>[g,0]));
  rows.forEach((r,i)=>{const g=String(r[0]);rankSums.set(g,rankSums.get(g)+ranks[i]);counts.set(g,counts.get(g)+1);});
  const raw=12/(N*(N+1))*sum(groups.map(g=>rankSums.get(g)**2/counts.get(g)))-3*(N+1),tieSum=sum(ties.map(t=>t**3-t)),correction=1-tieSum/(N**3-N),H=correction>0?raw/correction:raw,df=groups.length-1,p=chiTail(H,df);
  const varianceBase=N*(N+1)/12-(N>1?tieSum/(12*(N-1)):0),pairs=[];
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
    const a=groups[i],b=groups[j],meanRankA=rankSums.get(a)/counts.get(a),meanRankB=rankSums.get(b)/counts.get(b),se=Math.sqrt(varianceBase*(1/counts.get(a)+1/counts.get(b))),z=se>0?(meanRankA-meanRankB)/se:0;
    pairs.push({a,b,difference:meanRankA-meanRankB,z,p:normalTwoTail(z)});
  }
  const summaries=groups.map(g=>{const vals=rows.filter(r=>String(r[0])===g).map(r=>r[1]);return {group:g,n:vals.length,median:median(vals),mean:mean(vals),meanRank:rankSums.get(g)/vals.length};});
  const eta2=Math.max(0,Math.min(1,(H-groups.length+1)/Math.max(1,N-groups.length)));
  return {test:'Kruskal–Wallis',N,groups,H,df,p,tieCorrection:correction,effect:{name:'Eta²(H)',value:eta2},summaries,pairs:holm(pairs),posthoc:'Dunn dengan koreksi Holm'};
}

export function friedman(rows){
  if(!rows.length||rows.some(r=>r.length!==3||!Number.isFinite(r[2])||String(r[0]).trim()===''||String(r[1]).trim()===''))throw Error('Friedman memerlukan Perlakuan, Blok/Subjek, dan respons numerik.');
  const groups=unique(rows.map(r=>r[0])),blocks=unique(rows.map(r=>r[1]));if(groups.length<2||blocks.length<2)throw Error('Friedman memerlukan minimal dua perlakuan dan dua blok/subjek.');
  const seen=new Set();for(const row of rows){const key=`${row[0]}\0${row[1]}`;if(seen.has(key))throw Error('Ada kombinasi Perlakuan × Blok/Subjek ganda.');seen.add(key);}
  for(const b of blocks)for(const g of groups)if(!rows.some(r=>String(r[0])===g&&String(r[1])===b))throw Error(`Data Friedman tidak lengkap: ${g} tidak ditemukan pada blok/subjek ${b}.`);
  const rankSums=new Map(groups.map(g=>[g,0])),tieTerms=[];
  for(const b of blocks){
    const vals=groups.map(g=>rows.find(r=>String(r[0])===g&&String(r[1])===b)[2]),ranked=rank(vals);ranked.ties.forEach(t=>tieTerms.push(t**3-t));groups.forEach((g,i)=>rankSums.set(g,rankSums.get(g)+ranked.ranks[i]));
  }
  const n=blocks.length,k=groups.length,raw=12/(n*k*(k+1))*sum(groups.map(g=>rankSums.get(g)**2)-0)-3*n*(k+1),tieSum=sum(tieTerms),correction=1-tieSum/(n*(k**3-k)),Q=correction>0?raw/correction:raw,df=k-1,p=chiTail(Q,df),se=Math.sqrt(k*(k+1)/(6*n)*Math.max(correction,Number.EPSILON)),pairs=[];
  for(let i=0;i<k;i++)for(let j=i+1;j<k;j++){
    const a=groups[i],b=groups[j],meanRankA=rankSums.get(a)/n,meanRankB=rankSums.get(b)/n,z=se>0?(meanRankA-meanRankB)/se:0;pairs.push({a,b,difference:meanRankA-meanRankB,z,p:normalTwoTail(z)});
  }
  const summaries=groups.map(g=>{const vals=rows.filter(r=>String(r[0])===g).map(r=>r[2]);return {group:g,n:vals.length,median:median(vals),mean:mean(vals),meanRank:rankSums.get(g)/n};});
  const W=Math.max(0,Math.min(1,Q/(n*(k-1))));
  return {test:'Friedman',N:rows.length,nBlocks:n,groups,Q,df,p,tieCorrection:correction,effect:{name:"Kendall's W",value:W},summaries,pairs:holm(pairs),posthoc:'Perbandingan mean-rank berpasangan dengan koreksi Holm'};
}
