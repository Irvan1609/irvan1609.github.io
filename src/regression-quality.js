import {mean,sum,fTail} from './statistics-engine.js';
const sq=x=>x*x;

export function assessPolynomialRegression(result){
  if(!result?.models?.length||!Array.isArray(result.x)||!Array.isArray(result.y))throw Error('Hasil regresi tidak valid.');
  const n=result.n,groups=new Map();
  result.x.forEach((x,i)=>{const key=String(x);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(result.y[i]);});
  const uniqueX=groups.size,pureErrorSS=sum([...groups.values()].flatMap(values=>{const m=mean(values);return values.map(v=>sq(v-m));})),dfPure=n-uniqueX;
  const models=result.models.map(model=>{
    const k=model.degree+1;
    const aicc=n>k+1?model.aic+2*k*(k+1)/(n-k-1):Infinity;
    const dfLof=uniqueX-k,ssLof=Math.max(0,model.sse-pureErrorSS);
    let lackOfFit=null;
    if(dfPure>0&&dfLof>0){
      const msPure=pureErrorSS/dfPure,msLof=ssLof/dfLof;
      const f=msPure>0?msLof/msPure:(ssLof<=1e-12?0:Infinity);
      const p=Number.isFinite(f)?fTail(f,dfLof,dfPure):0;
      lackOfFit={ss:ssLof,df:dfLof,ms:msLof,pureErrorSS,dfPure,msPure,f,p};
    }
    return {...model,aicc,lackOfFit};
  });
  const finite=models.filter(m=>Number.isFinite(m.aicc)),best=(finite.length?finite:models).reduce((a,b)=>(finite.length?b.aicc<a.aicc:b.aic<a.aic)?b:a);
  const warnings=[];
  if(!finite.length)warnings.push('AICc tidak dapat dihitung karena ukuran sampel terlalu kecil terhadap jumlah parameter; pemilihan model kembali menggunakan AIC.');
  if(best.lackOfFit?.p<.05)warnings.push('Model terpilih menunjukkan lack-of-fit nyata (p < 0,05); persamaan perlu ditafsirkan dengan hati-hati dan bentuk model lain dapat dipertimbangkan.');
  if(dfPure===0)warnings.push('Uji lack-of-fit tidak tersedia karena tidak ada ulangan pada nilai X/dosis yang sama.');
  return {...result,models,bestDegree:best.degree,selectionCriterion:finite.length?'AICc':'AIC',uniqueX,pureErrorSS,dfPure,warnings};
}
