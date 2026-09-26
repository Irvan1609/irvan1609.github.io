import jStat from 'jstat';
import {fTail} from './statistics-engine.js';

const sum=values=>values.reduce((total,value)=>total+value,0);
const mean=values=>values.length?sum(values)/values.length:NaN;
const unique=values=>[...new Set(values.map(value=>String(value)))];
const clamp0=value=>Math.abs(value)<1e-10?0:value;

function transpose(matrix){return matrix[0].map((_,column)=>matrix.map(row=>row[column]));}
function matVec(matrix,vector){return matrix.map(row=>sum(row.map((value,index)=>value*vector[index])));}
function dot(a,b){return sum(a.map((value,index)=>value*b[index]));}
function averageVectors(vectors){
  if(!vectors.length)return [];
  return vectors[0].map((_,column)=>mean(vectors.map(row=>row[column])));
}
function subtract(a,b){return a.map((value,index)=>value-b[index]);}
function quad(vector,matrix){return dot(vector,matVec(matrix,vector));}
function invert(matrix){
  const n=matrix.length;
  const augmented=matrix.map((row,i)=>[...row,...Array.from({length:n},(_,j)=>i===j?1:0)]);
  for(let column=0;column<n;column++){
    let pivot=column;
    for(let row=column+1;row<n;row++)if(Math.abs(augmented[row][column])>Math.abs(augmented[pivot][column]))pivot=row;
    if(Math.abs(augmented[pivot][column])<1e-10)throw Error('Rancangan augmented tidak terhubung atau matriks model singular. Pastikan check menghubungkan seluruh blok.');
    [augmented[column],augmented[pivot]]=[augmented[pivot],augmented[column]];
    const divisor=augmented[column][column];
    for(let j=0;j<2*n;j++)augmented[column][j]/=divisor;
    for(let row=0;row<n;row++){
      if(row===column)continue;
      const factor=augmented[row][column];
      if(Math.abs(factor)<1e-14)continue;
      for(let j=0;j<2*n;j++)augmented[row][j]-=factor*augmented[column][j];
    }
  }
  return augmented.map(row=>row.slice(n));
}
function crossprod(X){
  const p=X[0].length,out=Array.from({length:p},()=>Array(p).fill(0));
  for(const row of X)for(let i=0;i<p;i++)for(let j=0;j<p;j++)out[i][j]+=row[i]*row[j];
  return out;
}
function xty(X,y){
  const p=X[0].length,out=Array(p).fill(0);
  for(let r=0;r<X.length;r++)for(let c=0;c<p;c++)out[c]+=X[r][c]*y[r];
  return out;
}
function modelRow(block,treatment,blockLevels,treatmentLevels,{useBlock=true,useTreatment=true}={}){
  const row=[1];
  if(useBlock)for(const level of blockLevels.slice(1))row.push(String(block)===level?1:0);
  if(useTreatment)for(const level of treatmentLevels.slice(1))row.push(String(treatment)===level?1:0);
  return row;
}
function fitModel(observations,{useBlock=true,useTreatment=true}={}){
  const blockLevels=unique(observations.map(item=>item.block));
  const treatmentLevels=unique(observations.map(item=>item.treatment));
  const X=observations.map(item=>modelRow(item.block,item.treatment,blockLevels,treatmentLevels,{useBlock,useTreatment}));
  const y=observations.map(item=>item.y),xtx=crossprod(X),inv=invert(xtx),beta=matVec(inv,xty(X,y));
  const fitted=X.map(row=>dot(row,beta)),residuals=y.map((value,index)=>value-fitted[index]);
  const sse=sum(residuals.map(value=>value*value)),df=y.length-beta.length;
  return {X,y,beta,inv,fitted,residuals,sse,df,blockLevels,treatmentLevels,useBlock,useTreatment,
    row:(block,treatment)=>modelRow(block,treatment,blockLevels,treatmentLevels,{useBlock,useTreatment})};
}
function interceptSse(observations){
  const avg=mean(observations.map(item=>item.y));
  return sum(observations.map(item=>(item.y-avg)**2));
}
function anovaTerm(label,ss,df,mse,dfError,component=false){
  const clean=Math.max(0,clamp0(ss));
  const ms=df>0?clean/df:null;
  const f=df>0&&mse>0?ms/mse:null;
  return {
    label,ss:clean,df,ms,f,
    p:f===null?null:fTail(f,df,dfError),
    f05:f===null?null:jStat.centralF.inv(.95,df,dfError),
    f01:f===null?null:jStat.centralF.inv(.99,df,dfError),
    component
  };
}
function covarianceOfRows(a,b,inv,mse){return mse*dot(a,matVec(inv,b));}
function seDifference(a,b,inv,mse){
  const contrast=subtract(a,b);
  return Math.sqrt(Math.max(0,mse*quad(contrast,inv)));
}
function pTwoSided(diff,se,df){
  if(!(se>0)||!(df>0))return null;
  const t=Math.abs(diff/se);
  return Math.max(0,Math.min(1,2*(1-jStat.studentt.cdf(t,df))));
}
function rangeSummary(values,critical){
  const clean=values.filter(Number.isFinite);
  if(!clean.length)return null;
  return {
    n:clean.length,
    seMean:mean(clean),seMin:Math.min(...clean),seMax:Math.max(...clean),
    cdMean:critical*mean(clean),cdMin:critical*Math.min(...clean),cdMax:critical*Math.max(...clean)
  };
}

export function augmentedRcbAnova(rows,{checks=null,alpha=.05}={}){
  if(!Array.isArray(rows)||!rows.length)throw Error('Augmented design memerlukan data.');
  const observations=rows.map((row,index)=>{
    if(!Array.isArray(row)||row.length!==3)throw Error('Format augmented design harus Blok, Genotipe/Perlakuan, dan Y.');
    const block=String(row[0]??'').trim(),treatment=String(row[1]??'').trim(),y=Number(row[2]);
    if(!block)throw Error(`Baris ${index+1}: Blok/Kelompok kosong.`);
    if(!treatment)throw Error(`Baris ${index+1}: Genotipe/Perlakuan kosong.`);
    if(!Number.isFinite(y))throw Error(`Baris ${index+1}: respons tidak numerik.`);
    return {block,treatment,y,row:index+1};
  });
  const blocks=unique(observations.map(item=>item.block)),treatments=unique(observations.map(item=>item.treatment));
  if(blocks.length<2)throw Error('Augmented RCBD memerlukan minimal 2 blok.');
  if(treatments.length<3)throw Error('Diperlukan minimal 3 genotipe/perlakuan.');
  const seen=new Set();
  for(const item of observations){
    const key=JSON.stringify([item.block,item.treatment]);
    if(seen.has(key))throw Error(`Kombinasi ${item.block} × ${item.treatment} muncul lebih dari sekali. Satu genotipe hanya boleh satu plot per blok.`);
    seen.add(key);
  }
  const counts=new Map(treatments.map(treatment=>[treatment,observations.filter(item=>item.treatment===treatment).length]));
  let checkLevels;
  if(Array.isArray(checks)&&checks.length){
    checkLevels=unique(checks.map(value=>String(value).trim()).filter(Boolean));
    for(const check of checkLevels){
      if(!counts.has(check))throw Error(`Check “${check}” tidak ditemukan pada kolom genotipe/perlakuan.`);
      if(counts.get(check)<2)throw Error(`Check “${check}” hanya muncul sekali; check harus berulang.`);
    }
    const repeatedNonChecks=treatments.filter(treatment=>!checkLevels.includes(treatment)&&counts.get(treatment)>1);
    if(repeatedNonChecks.length)throw Error(`Genotipe non-check berulang: ${repeatedNonChecks.join(', ')}. Masukkan sebagai check atau periksa duplikasi.`);
  }else checkLevels=treatments.filter(treatment=>counts.get(treatment)>1);
  if(checkLevels.length<2)throw Error('Augmented RCBD klasik memerlukan minimal 2 check berulang agar galat percobaan dapat diestimasi.');
  const testLevels=treatments.filter(treatment=>!checkLevels.includes(treatment));
  if(!testLevels.length)throw Error('Tidak ditemukan entry/galur uji tanpa ulangan.');
  const repeatedTests=testLevels.filter(treatment=>counts.get(treatment)!==1);
  if(repeatedTests.length)throw Error(`Entry uji harus tidak berulang: ${repeatedTests.join(', ')}.`);

  const warnings=[];
  for(const check of checkLevels){
    const present=new Set(observations.filter(item=>item.treatment===check).map(item=>item.block));
    const missing=blocks.filter(block=>!present.has(block));
    if(missing.length)warnings.push(`Check ${check} tidak terdapat pada blok: ${missing.join(', ')}.`);
  }

  const full=fitModel(observations,{useBlock:true,useTreatment:true});
  if(full.df<=0)throw Error('Derajat bebas galat ≤ 0. Tambahkan check/ulangan check atau blok agar galat dapat diestimasi.');
  const mse=full.sse/full.df;
  if(!(mse>0))warnings.push('KT Galat = 0; SE dan uji F perlu ditafsirkan dengan sangat hati-hati.');

  const blockOnly=fitModel(observations,{useBlock:true,useTreatment:false});
  const treatmentOnly=fitModel(observations,{useBlock:false,useTreatment:true});
  const totalSse=interceptSse(observations);
  const ssBlockIgnoring=Math.max(0,totalSse-blockOnly.sse);
  const ssTreatmentAdjusted=Math.max(0,blockOnly.sse-full.sse);
  const ssTreatmentIgnoring=Math.max(0,totalSse-treatmentOnly.sse);
  const ssBlockAdjusted=Math.max(0,treatmentOnly.sse-full.sse);

  const checkRows=observations.filter(item=>checkLevels.includes(item.treatment));
  const checkFull=fitModel(checkRows,{useBlock:true,useTreatment:true});
  const checkBlockOnly=fitModel(checkRows,{useBlock:true,useTreatment:false});
  const ssCheckAdjusted=Math.max(0,checkBlockOnly.sse-checkFull.sse);
  const dfCheck=checkLevels.length-1;
  const ssTestPlus=Math.max(0,ssTreatmentAdjusted-ssCheckAdjusted);
  const dfTestPlus=testLevels.length;

  const treatmentAdjusted=[
    anovaTerm('Blok (tanpa koreksi Perlakuan)',ssBlockIgnoring,blocks.length-1,mse,full.df),
    anovaTerm('Perlakuan (dikoreksi Blok)',ssTreatmentAdjusted,treatments.length-1,mse,full.df),
    anovaTerm('  ├─ Check',ssCheckAdjusted,dfCheck,mse,full.df,true),
    anovaTerm('  └─ Test + Test vs Check',ssTestPlus,dfTestPlus,mse,full.df,true),
    {label:'Galat',ss:full.sse,df:full.df,ms:mse,f:null,p:null,f05:null,f01:null},
    {label:'Total',ss:totalSse,df:observations.length-1,ms:null,f:null,p:null,f05:null,f01:null}
  ];
  const blockAdjusted=[
    anovaTerm('Perlakuan (tanpa koreksi Blok)',ssTreatmentIgnoring,treatments.length-1,mse,full.df),
    anovaTerm('Blok (dikoreksi Perlakuan)',ssBlockAdjusted,blocks.length-1,mse,full.df),
    {label:'Galat',ss:full.sse,df:full.df,ms:mse,f:null,p:null,f05:null,f01:null},
    {label:'Total',ss:totalSse,df:observations.length-1,ms:null,f:null,p:null,f05:null,f01:null}
  ];

  const marginalRow=treatment=>averageVectors(blocks.map(block=>full.row(block,treatment)));
  const xByTreatment=new Map(treatments.map(treatment=>[treatment,marginalRow(treatment)]));
  const checkAverageX=averageVectors(checkLevels.map(check=>xByTreatment.get(check)));
  const checkAdjustedMean=dot(checkAverageX,full.beta);
  const means=treatments.map(treatment=>{
    const group=observations.filter(item=>item.treatment===treatment),x=xByTreatment.get(treatment);
    const adjusted=dot(x,full.beta),variance=Math.max(0,covarianceOfRows(x,x,full.inv,mse));
    const isCheck=checkLevels.includes(treatment);
    let deltaCheck=null,seDeltaCheck=null,pCheck=null;
    if(!isCheck){
      const contrast=subtract(x,checkAverageX);
      deltaCheck=dot(contrast,full.beta);
      seDeltaCheck=Math.sqrt(Math.max(0,mse*quad(contrast,full.inv)));
      pCheck=pTwoSided(deltaCheck,seDeltaCheck,full.df);
    }
    return {
      treatment,type:isCheck?'Check':'Test',block:isCheck?'—':group[0].block,n:group.length,
      rawMean:mean(group.map(item=>item.y)),min:Math.min(...group.map(item=>item.y)),max:Math.max(...group.map(item=>item.y)),
      adjusted,se:Math.sqrt(variance),deltaCheck,seDeltaCheck,pCheck,
      significant:pCheck!==null&&pCheck<alpha,x
    };
  }).sort((a,b)=>b.adjusted-a.adjusted).map((item,index)=>({...item,rank:index+1}));

  const treatmentRows=treatments.map(treatment=>xByTreatment.get(treatment));
  const overallX=averageVectors(treatmentRows),adjustedGrand=dot(overallX,full.beta);
  const rawGrand=mean(observations.map(item=>item.y));
  const blockEffects=blocks.map(block=>{
    const x=averageVectors(treatments.map(treatment=>full.row(block,treatment)));
    return {block,adjustedMean:dot(x,full.beta),effect:dot(subtract(x,overallX),full.beta)};
  });

  const byName=new Map(means.map(item=>[item.treatment,item]));
  const pairSes={checkCheck:[],testSameBlock:[],testDifferentBlock:[],testCheck:[]};
  const pair=(a,b)=>seDifference(xByTreatment.get(a),xByTreatment.get(b),full.inv,mse);
  for(let i=0;i<checkLevels.length;i++)for(let j=i+1;j<checkLevels.length;j++)pairSes.checkCheck.push(pair(checkLevels[i],checkLevels[j]));
  for(let i=0;i<testLevels.length;i++)for(let j=i+1;j<testLevels.length;j++){
    const left=byName.get(testLevels[i]),right=byName.get(testLevels[j]),target=left.block===right.block?'testSameBlock':'testDifferentBlock';
    pairSes[target].push(pair(testLevels[i],testLevels[j]));
  }
  for(const test of testLevels)for(const check of checkLevels)pairSes.testCheck.push(pair(test,check));
  const tCritical=jStat.studentt.inv(1-alpha/2,full.df);
  const sed={
    checkCheck:rangeSummary(pairSes.checkCheck,tCritical),
    testSameBlock:rangeSummary(pairSes.testSameBlock,tCritical),
    testDifferentBlock:rangeSummary(pairSes.testDifferentBlock,tCritical),
    testCheck:rangeSummary(pairSes.testCheck,tCritical)
  };

  const cv=adjustedGrand!==0?Math.abs(Math.sqrt(Math.max(0,mse))/adjustedGrand*100):null;
  return {
    n:observations.length,blocks,treatments,checks:checkLevels,tests:testLevels,
    rawGrand,adjustedGrand,checkAdjustedMean,mse,dfError:full.df,cv,alpha,warnings,
    treatmentAdjusted,blockAdjusted,means,blockEffects,sed,
    model:'Y = μ + Blok + Genotipe/Perlakuan + ε'
  };
}
