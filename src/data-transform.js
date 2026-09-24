const SPECS=Object.freeze({
  none:{label:'Tanpa transformasi'},
  sqrt:{label:'√x'},
  sqrt05:{label:'√(x + 0,5)'},
  log10:{label:'log10(x)'},
  ln:{label:'ln(x)'},
  asinprop:{label:'arcsin√x (proporsi 0–1)'},
  asinpercent:{label:'arcsin√(x/100) (persen 0–100)'},
  boxcox:{label:'Box–Cox (λ otomatis)'}
});

export function transformationOptions(){
  return Object.entries(SPECS).map(([value,spec])=>({value,label:spec.label}));
}
export function transformationLabel(type){
  return SPECS[type]?.label||SPECS.none.label;
}
function finiteSeries(values){
  if(!Array.isArray(values)||!values.length||values.some(v=>!Number.isFinite(v)))throw Error('Transformasi memerlukan seluruh nilai parameter berupa angka valid.');
}
function boxCoxValue(x,lambda){
  return Math.abs(lambda)<1e-10?Math.log(x):(x**lambda-1)/lambda;
}
export function estimateBoxCoxLambda(values){
  finiteSeries(values);
  if(values.some(v=>v<=0))throw Error('Transformasi Box–Cox memerlukan semua nilai > 0.');
  const logs=values.map(Math.log),sumLog=logs.reduce((a,b)=>a+b,0),n=values.length;
  let best={lambda:1,score:-Infinity};
  for(let step=-40;step<=40;step++){
    const lambda=step/20,transformed=values.map(v=>boxCoxValue(v,lambda));
    const mean=transformed.reduce((a,b)=>a+b,0)/n;
    const sse=transformed.reduce((s,v)=>s+(v-mean)**2,0);
    if(!(sse>0))continue;
    const score=-(n/2)*Math.log(sse/n)+(lambda-1)*sumLog;
    if(score>best.score)best={lambda,score};
  }
  return best.lambda;
}
export function transformValues(values,type='none'){
  finiteSeries(values);
  if(!SPECS[type])throw Error('Jenis transformasi tidak dikenali.');
  let lambda=null,fn=x=>x;
  if(type==='sqrt'){
    if(values.some(v=>v<0))throw Error('Transformasi √x memerlukan nilai ≥ 0.');
    fn=Math.sqrt;
  }else if(type==='sqrt05'){
    if(values.some(v=>v<-.5))throw Error('Transformasi √(x + 0,5) memerlukan nilai ≥ -0,5.');
    fn=x=>Math.sqrt(x+.5);
  }else if(type==='log10'){
    if(values.some(v=>v<=0))throw Error('Transformasi log10(x) memerlukan nilai > 0.');
    fn=Math.log10;
  }else if(type==='ln'){
    if(values.some(v=>v<=0))throw Error('Transformasi ln(x) memerlukan nilai > 0.');
    fn=Math.log;
  }else if(type==='asinprop'){
    if(values.some(v=>v<0||v>1))throw Error('Transformasi arcsin√x memerlukan proporsi 0–1.');
    fn=x=>Math.asin(Math.sqrt(x));
  }else if(type==='asinpercent'){
    if(values.some(v=>v<0||v>100))throw Error('Transformasi arcsin√(x/100) memerlukan persen 0–100.');
    fn=x=>Math.asin(Math.sqrt(x/100));
  }else if(type==='boxcox'){
    lambda=estimateBoxCoxLambda(values);
    fn=x=>boxCoxValue(x,lambda);
  }
  return {type,label:transformationLabel(type),lambda,values:values.map(fn)};
}
export function transformObservations(observations,index,type='none'){
  if(type==='none')return {observations:observations.map(o=>({...o,values:[...o.values]})),meta:{type,label:transformationLabel(type),lambda:null}};
  const raw=observations.map(o=>o.values[index]),result=transformValues(raw,type);
  return {
    observations:observations.map((o,i)=>({...o,values:o.values.map((value,j)=>j===index?result.values[i]:value)})),
    meta:{type:result.type,label:result.label,lambda:result.lambda}
  };
}
