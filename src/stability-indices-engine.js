const sum=x=>x.reduce((a,b)=>a+b,0),mean=x=>sum(x)/x.length,sq=x=>x*x,unique=x=>[...new Set(x.map(String))];
function sd(x){if(x.length<2)return null;const m=mean(x);return Math.sqrt(sum(x.map(v=>sq(v-m)))/(x.length-1));}
function rankValues(values,ascending=true){
  const ordered=values.map((v,i)=>({v,i})).sort((a,b)=>ascending?a.v-b.v:b.v-a.v),out=Array(values.length);
  for(let i=0;i<ordered.length;){let j=i+1;while(j<ordered.length&&Math.abs(ordered[j].v-ordered[i].v)<1e-12)j++;const rank=(i+1+j)/2;for(let k=i;k<j;k++)out[ordered[k].i]=rank;i=j;}return out;
}
const transpose=A=>A[0].map((_,j)=>A.map(r=>r[j]));
const dot=(a,b)=>sum(a.map((v,i)=>v*b[i]));
const identity=n=>Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j)));
function jacobiEigen(A){
  const n=A.length,a=A.map(r=>[...r]),v=identity(n);
  for(let iter=0;iter<100*n*n;iter++){
    let p=0,q=Math.min(1,n-1),mx=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(Math.abs(a[i][j])>mx){mx=Math.abs(a[i][j]);p=i;q=j;}if(mx<1e-12)break;
    const phi=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(phi),s=Math.sin(phi),app=a[p][p],aqq=a[q][q],apq=a[p][q];a[p][p]=c*c*app-2*s*c*apq+s*s*aqq;a[q][q]=s*s*app+2*s*c*apq+c*c*aqq;a[p][q]=a[q][p]=0;
    for(let k=0;k<n;k++)if(k!==p&&k!==q){const x=a[k][p],y=a[k][q];a[k][p]=a[p][k]=c*x-s*y;a[k][q]=a[q][k]=s*x+c*y;}
    for(let k=0;k<n;k++){const x=v[k][p],y=v[k][q];v[k][p]=c*x-s*y;v[k][q]=s*x+c*y;}
  }
  const order=a.map((r,i)=>({value:Math.max(0,r[i]),i})).sort((x,y)=>y.value-x.value);return {values:order.map(o=>o.value),vectors:v.map(row=>order.map(o=>row[o.i]))};
}
function ammiGenotypeScores(interaction){
  const At=transpose(interaction),AtA=At.map(a=>At.map(b=>dot(a,b))),eig=jacobiEigen(AtA),singular=eig.values.map(Math.sqrt),V=eig.vectors;
  const scores=V.map(row=>singular.map((s,i)=>row[i]*s)),ss=singular.map(s=>s*s);return {scores,ss};
}
export function stabilityIndices(rows){
  if(!rows.length||rows.some(r=>r.length!==3||!Number.isFinite(r[2])))throw Error('Indeks stabilitas memerlukan Lingkungan, Genotipe, dan Y numerik.');
  const E=unique(rows.map(r=>r[0])),G=unique(rows.map(r=>r[1]));if(E.length<3||G.length<2)throw Error('Indeks stabilitas memerlukan minimal 3 lingkungan dan 2 genotipe.');
  const M=E.map(e=>G.map(g=>{const vals=rows.filter(r=>String(r[0])===e&&String(r[1])===g).map(r=>r[2]);if(!vals.length)throw Error(`Kombinasi ${e} × ${g} kosong.`);return mean(vals);}));
  const envMeans=M.map(mean),genMeans=transpose(M).map(mean),grand=mean(M.flat()),envIndex=envMeans.map(v=>v-grand),denom=sum(envIndex.map(sq));if(denom<=1e-14)throw Error('Rataan lingkungan tidak bervariasi; regresi stabilitas tidak dapat dihitung.');
  const interaction=M.map((row,i)=>row.map((v,j)=>v-envMeans[i]-genMeans[j]+grand)),ammi=ammiGenotypeScores(interaction),ratio=ammi.ss[1]>1e-14?ammi.ss[0]/ammi.ss[1]:null;
  const indices=G.map((g,j)=>{
    const values=M.map(row=>row[j]),gm=genMeans[j],wricke=sum(interaction.map(row=>sq(row[j]))),slope=sum(values.map((v,i)=>envIndex[i]*(v-gm)))/denom,residuals=values.map((v,i)=>v-gm-slope*envIndex[i]),devSS=sum(residuals.map(sq)),devMS=E.length>2?devSS/(E.length-2):null,sst=sum(values.map(v=>sq(v-gm))),r2=sst>0?Math.max(0,1-devSS/sst):1,cv=gm===0?null:sd(values)/Math.abs(gm)*100,pc1=ammi.scores[j]?.[0]??0,pc2=ammi.scores[j]?.[1]??0,asv=ratio===null?Math.abs(pc1):Math.sqrt(sq(ratio*pc1)+sq(pc2));
    return {genotype:g,mean:gm,wricke,finlaySlope:slope,deviationMS:devMS,regressionR2:r2,cv,ipca1:pc1,ipca2:pc2,asv};
  });
  const yieldRank=rankValues(indices.map(x=>x.mean),false),asvRank=rankValues(indices.map(x=>x.asv),true),wrickeRank=rankValues(indices.map(x=>x.wricke),true);
  indices.forEach((x,i)=>{x.yieldRank=yieldRank[i];x.asvRank=asvRank[i];x.wrickeRank=wrickeRank[i];x.ysi=yieldRank[i]+asvRank[i];});
  return {n:rows.length,environments:E,genotypes:G,matrix:M,environmentMeans:envMeans,environmentIndex:envIndex,grand,ammiSS:ammi.ss,indices,notes:['Wricke ecovalence yang lebih kecil menunjukkan kontribusi G×E lebih kecil.','Finlay–Wilkinson b ≈ 1 menunjukkan respons rata-rata terhadap perubahan lingkungan; b > 1 lebih responsif pada lingkungan baik dan b < 1 relatif kurang responsif.','ASV yang lebih kecil menunjukkan skor interaksi AMMI lebih dekat ke nol. YSI menggabungkan peringkat hasil tinggi dan ASV rendah.']};
}
