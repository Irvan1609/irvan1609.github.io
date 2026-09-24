import jStat from 'jstat';
const sum=x=>x.reduce((s,v)=>s+v,0);
const mean=x=>sum(x)/x.length;
const unique=x=>[...new Set(x)];
const fTail=(f,d1,d2)=>f===Infinity?0:jStat.ibeta(d2/(d2+d1*f),d2/2,d1/2);

export function shapiroWilk(values){
  const x=[...values].filter(Number.isFinite).sort((a,b)=>a-b),n=x.length;
  if(n<3)return {name:'Normalitas Shapiro\u2013Wilk',n,stat:null,p:null,note:'Memerlukan minimal 3 residual.'};
  if(n>5000)return {name:'Normalitas Shapiro\u2013Wilk',n,stat:null,p:null,note:'Untuk n > 5000, gunakan Q\u2013Q plot dan uji normalitas lain; aproksimasi p Shapiro\u2013Wilk tidak digunakan.'};
  const avg=mean(x),sst=sum(x.map(v=>(v-avg)**2));
  if(!(sst>0))return {name:'Normalitas Shapiro\u2013Wilk',n,stat:null,p:null,note:'Variasi residual nol.'};
  const m=x.map((_,i)=>jStat.normal.inv((i+1-.375)/(n+.25),0,1)),norm=Math.sqrt(sum(m.map(v=>v*v))),c=m.map(v=>v/norm),a=Array(n).fill(0);
  if(n===3){
    a[0]=-Math.SQRT1_2;a[2]=Math.SQRT1_2;
  }else{
    const u=1/Math.sqrt(n);
    const a1=c[n-1]+(-2.706056*u**5+4.434685*u**4-2.071190*u**3-.147981*u**2+.221157*u);
    a[0]=-a1;a[n-1]=a1;
    if(n>5){
      const a2=c[n-2]+(-3.582633*u**5+5.682633*u**4-1.752461*u**3-.293762*u**2+.042981*u);
      a[1]=-a2;a[n-2]=a2;
      const numerator=1-2*c[n-1]**2-2*c[n-2]**2,denominator=1-2*a1**2-2*a2**2,scale=Math.sqrt(Math.max(1e-15,numerator/denominator));
      for(let i=2;i<=n-3;i++)a[i]=c[i]/scale;
    }else{
      const numerator=1-2*c[n-1]**2,denominator=1-2*a1**2,scale=Math.sqrt(Math.max(1e-15,numerator/denominator));
      for(let i=1;i<=n-2;i++)a[i]=c[i]/scale;
    }
  }
  const b=sum(a.map((coef,i)=>coef*x[i])),W=Math.max(0,Math.min(1,b*b/sst));
  let p;
  if(n===3){
    p=(6/Math.PI)*(Math.asin(Math.sqrt(W))-Math.asin(Math.sqrt(.75)));
  }else if(n<=11){
    const gamma=-2.273+.459*n,y=Math.log(Math.max(1e-15,1-W));
    if(y>=gamma)p=1e-16;
    else{
      const yy=-Math.log(gamma-y),mu=.5440-.39978*n+.025054*n*n-.0006714*n**3,sigma=Math.exp(1.3822-.77857*n+.062767*n*n-.0020322*n**3),z=(yy-mu)/sigma;
      p=1-jStat.normal.cdf(z,0,1);
    }
  }else{
    const lnn=Math.log(n),y=Math.log(Math.max(1e-15,1-W)),mu=-1.5861-.31082*lnn-.083751*lnn**2+.0038915*lnn**3,sigma=Math.exp(-.4803-.082676*lnn+.0030302*lnn**2),z=(y-mu)/sigma;
    p=1-jStat.normal.cdf(z,0,1);
  }
  p=Math.max(0,Math.min(1,p));
  return {name:'Normalitas Shapiro\u2013Wilk',n,stat:W,p,note:'W dan p dihitung dengan aproksimasi Royston; p kecil menunjukkan bukti penyimpangan dari normalitas.'};
}
function leveneCore(groups,center,name){
  const k=groups.length,N=sum(groups.map(g=>g.length));
  if(k<2||groups.some(g=>g.length<2))return {name,stat:null,p:null,note:'Setiap kelompok memerlukan minimal 2 pengamatan.'};
  const z=groups.map(g=>{const c=center(g);return g.map(v=>Math.abs(v-c));}),grand=mean(z.flat());
  const between=sum(z.map(g=>g.length*(mean(g)-grand)**2)),within=sum(z.map(g=>sum(g.map(v=>(v-mean(g))**2))));
  const stat=within>0?(between/(k-1))/(within/(N-k)):null;
  return {name,stat,p:stat===null?null:fTail(stat,k-1,N-k),df1:k-1,df2:N-k,note:stat===null?'Simpangan absolut tidak memiliki variasi yang cukup.':'p kecil menunjukkan bukti ketidakhomogenan ragam.'};
}
export function leveneMean(groups){
  return leveneCore(groups,mean,'Homogenitas Levene (rata-rata)');
}
export function bartlett(groups){
  const k=groups.length,N=sum(groups.map(g=>g.length));
  if(k<2||groups.some(g=>g.length<2))return {name:'Homogenitas Bartlett',stat:null,p:null,note:'Setiap kelompok memerlukan minimal 2 pengamatan.'};
  const variances=groups.map(g=>sum(g.map(v=>(v-mean(g))**2))/(g.length-1));
  if(variances.every(v=>v<=0))return {name:'Homogenitas Bartlett',stat:null,p:null,note:'Seluruh ragam kelompok nol.'};
  if(variances.some(v=>v<=0))return {name:'Homogenitas Bartlett',stat:Infinity,p:0,note:'Sedikitnya satu kelompok memiliki ragam nol; Bartlett menunjukkan ketidakhomogenan ekstrem.'};
  const pooled=sum(groups.map((g,i)=>(g.length-1)*variances[i]))/(N-k);
  const numerator=(N-k)*Math.log(pooled)-sum(groups.map((g,i)=>(g.length-1)*Math.log(variances[i])));
  const correction=1+(sum(groups.map(g=>1/(g.length-1)))-1/(N-k))/(3*(k-1)),stat=numerator/correction,p=1-jStat.chisquare.cdf(stat,k-1);
  return {name:'Homogenitas Bartlett',stat,p,df1:k-1,note:'Bartlett sensitif terhadap penyimpangan normalitas; baca bersama Shapiro-Wilk/Q-Q plot dan Brown-Forsythe.'};
}
function invertMatrix(matrix){
  const n=matrix.length,a=matrix.map((row,i)=>[...row,...Array.from({length:n},(_,j)=>i===j?1:0)]);
  for(let col=0;col<n;col++){
    let pivot=col;for(let row=col+1;row<n;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
    if(Math.abs(a[pivot][col])<1e-12)return null;
    [a[col],a[pivot]]=[a[pivot],a[col]];
    const div=a[col][col];for(let j=0;j<2*n;j++)a[col][j]/=div;
    for(let row=0;row<n;row++)if(row!==col){const factor=a[row][col];if(Math.abs(factor)>1e-15)for(let j=0;j<2*n;j++)a[row][j]-=factor*a[col][j];}
  }
  return a.map(row=>row.slice(n));
}
function diagnosticDesignRows(observations,design){
  const multi=['fral','frak','split'].includes(design),blocked=['rak','frak','split'].includes(design),split=design==='split';
  const A=unique(observations.map(o=>o.a)),B=multi?unique(observations.map(o=>o.b)):[''],R=unique(observations.map(o=>o.rep));
  return observations.map(o=>{
    const row=[1];
    if(blocked)for(const rep of R.slice(1))row.push(o.rep===rep?1:0);
    for(const a of A.slice(1))row.push(o.a===a?1:0);
    if(split)for(const rep of R.slice(1))for(const a of A.slice(1))row.push(o.rep===rep&&o.a===a?1:0);
    if(multi)for(const b of B.slice(1))row.push(o.b===b?1:0);
    if(multi)for(const a of A.slice(1))for(const b of B.slice(1))row.push(o.a===a&&o.b===b?1:0);
    return row;
  });
}
export function residualDiagnostics(observations,residuals,mse,design){
  if(!observations.length||observations.length!==residuals.length||!(mse>0))return null;
  const X=diagnosticDesignRows(observations,design),p=X[0].length,xtx=Array.from({length:p},()=>Array(p).fill(0));
  for(const row of X)for(let i=0;i<p;i++)for(let j=0;j<p;j++)xtx[i][j]+=row[i]*row[j];
  const inv=invertMatrix(xtx);if(!inv)return {items:[],parameterCount:p,cookThreshold:4/observations.length,note:'Leverage tidak dapat dihitung karena matriks desain singular.'};
  const items=observations.map((o,index)=>{
    const row=X[index],tmp=inv.map(r=>sum(r.map((v,j)=>v*row[j]))),leverage=Math.max(0,Math.min(.999999,sum(row.map((v,j)=>v*tmp[j])))),studentized=residuals[index]/Math.sqrt(mse*Math.max(1e-12,1-leverage)),cook=(residuals[index]**2/(p*mse))*leverage/Math.max(1e-12,(1-leverage)**2);
    const unit=[o.a,o.b&&o.b!==''?o.b:null,o.rep!==''?`K${o.rep}`:null].filter(Boolean).join(' \u00d7 ');
    return {index:index+1,unit,residual:residuals[index],leverage,studentized,cook,flag:Math.abs(studentized)>2||cook>4/observations.length};
  });
  return {items,parameterCount:p,cookThreshold:4/observations.length,note:design==='split'?'Leverage/Cook dihitung pada model residual anak petak dengan blok \u00d7 Faktor A; gunakan sebagai diagnostik, bukan aturan otomatis menghapus data.':"Studentized residual dan Cook's distance bersifat diagnostik; jangan menghapus data hanya karena melewati ambang."};
}
