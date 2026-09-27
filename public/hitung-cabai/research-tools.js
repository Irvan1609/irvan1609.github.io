import {boxIoU,matchBoxes,datasetMetrics} from './review-metrics.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function stableHash(value){
  let h=2166136261;
  for(const ch of String(value||'')){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}

export function assignedSplit(value){
  const p=stableHash(value)%1000;
  return p<700?'train':p<850?'validation':'test';
}

export function effectiveSplit(record){
  return ['train','validation','test'].includes(record?.datasetSplit)?record.datasetSplit:assignedSplit(record?.name||record?.id||'');
}

export function optimizeThreshold(records=[],modelVersion,{min=.25,max=.9,step=.05}={}){
  const same=records.filter(r=>(r.modelVersion||'')===modelVersion&&Array.isArray(r.boxes)&&Array.isArray(r.predictedDetections)&&r.predictedDetections.some(d=>Number.isFinite(d?.score))&&(r.validationStatus==='validated'||(!r.validationStatus&&r.reviewed!==false)));
  let pool=same.filter(r=>effectiveSplit(r)==='validation');
  if(pool.length<5)pool=same.filter(r=>effectiveSplit(r)!=='test');
  if(pool.length<4)return {threshold:null,n:pool.length,f1:null,precision:null,recall:null};
  let best=null;
  for(let t=min;t<=max+1e-9;t+=step){
    let tp=0,fp=0,fn=0;
    for(const row of pool){
      const pred=row.predictedDetections.filter(d=>Number.isFinite(d?.score)&&d.score>=t);
      const m=matchBoxes(pred,row.boxes,.5);tp+=m.tp;fp+=m.fp;fn+=m.fn;
    }
    const precision=tp+fp?tp/(tp+fp):0,recall=tp+fn?tp/(tp+fn):0,f1=precision+recall?2*precision*recall/(precision+recall):0;
    const candidate={threshold:+t.toFixed(2),n:pool.length,f1,precision,recall};
    if(!best||candidate.f1>best.f1+1e-9||(Math.abs(candidate.f1-best.f1)<1e-9&&candidate.recall>best.recall))best=candidate;
  }
  return best||{threshold:null,n:pool.length,f1:null,precision:null,recall:null};
}

export function modelHistory(records=[]){
  const groups=new Map();
  for(const row of records){
    const key=row.modelVersion||row.predictionMethod||'unknown';
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([model,rows])=>({model,...datasetMetrics(rows)})).sort((a,b)=>b.n-a.n);
}

export function errorSummary(records=[]){
  const out={missed:0,falsePositive:0,overlap:0,lowLight:0,occluded:0,mixedColor:0,small:0,edge:0};
  for(const row of records){
    if(row.validationStatus==='ai-screened'||row.reviewed===false)continue;
    const m=row.correction||matchBoxes(row.predictedDetections||[],row.boxes||[],.5);
    out.missed+=m.fn||0;out.falsePositive+=m.fp||0;
    if(row.condition==='overlap')out.overlap++;
    if(row.condition==='low-light')out.lowLight++;
    if(row.condition==='occluded')out.occluded++;
    if(row.condition==='mixed-color')out.mixedColor++;
    for(const box of row.boxes||[]){
      const area=(box[2]||0)*(box[3]||0);
      if(area<.0015)out.small++;
      if(box[0]<.008||box[1]<.008||box[0]+box[2]>.992||box[1]+box[3]>.992)out.edge++;
    }
  }
  return out;
}

export function operationalUncertainty(detections=[],flags=[]){
  const n=detections.length,uncertain=flags.filter(x=>x?.needsReview).length;
  return {count:n,uncertain,reviewMin:Math.max(0,n-uncertain),reviewMax:n+uncertain};
}

export function agronomicQuality(detections=[],imageData=null){
  const boxes=detections.map(d=>Array.isArray(d)?d:d?.box).filter(b=>Array.isArray(b)&&b.length===4);
  let edge=0,overlapPairs=0,totalArea=0,small=0;
  const areas=boxes.map(b=>Math.max(0,b[2])*Math.max(0,b[3])).filter(v=>v>0).sort((a,b)=>a-b),median=areas.length?areas[Math.floor(areas.length/2)]:0;
  boxes.forEach((b,i)=>{
    const area=Math.max(0,b[2])*Math.max(0,b[3]);totalArea+=area;
    if(b[0]<.01||b[1]<.01||b[0]+b[2]>.99||b[1]+b[3]>.99)edge++;
    if(median&&area<median*.28)small++;
    for(let j=i+1;j<boxes.length;j++)if(boxIoU(b,boxes[j])>.16)overlapPairs++;
  });
  const density=clamp(totalArea,0,1),issues=[];
  if(edge)issues.push(edge+' objek menyentuh tepi gambar.');
  if(overlapPairs>Math.max(2,boxes.length*.08))issues.push('Banyak buah saling tumpang-tindih.');
  if(density>.72)issues.push('Objek terlalu padat; pemisahan buah dapat kurang stabil.');
  if(boxes.length&&small/boxes.length>.25)issues.push('Banyak buah sangat kecil pada resolusi foto.');
  let contrast=null;
  if(imageData?.data&&boxes.length){
    const {data,width,height}=imageData;let inSum=0,inN=0,outSum=0,outN=0;
    const sampleStep=Math.max(1,Math.floor(Math.sqrt(width*height/50000)));
    const inside=(x,y)=>boxes.some(b=>x/width>=b[0]&&x/width<=b[0]+b[2]&&y/height>=b[1]&&y/height<=b[1]+b[3]);
    for(let y=0;y<height;y+=sampleStep)for(let x=0;x<width;x+=sampleStep){
      const i=4*(y*width+x),r=data[i],g=data[i+1],b=data[i+2],chrom=Math.max(r,g,b)-Math.min(r,g,b);
      if(inside(x,y)){inSum+=chrom;inN++;}else{outSum+=chrom;outN++;}
    }
    if(inN&&outN){contrast=Math.abs(inSum/inN-outSum/outN);if(contrast<8)issues.push('Kontras warna buah dan latar rendah.');}
  }
  const penalty=Math.min(45,edge*3+overlapPairs*2+(density>.72?12:0)+(small>0?Math.min(10,small):0)+(contrast!==null&&contrast<8?10:0));
  return {score:100-penalty,edgeCount:edge,overlapPairs,density:+density.toFixed(3),smallCount:small,contrast:contrast===null?null:+contrast.toFixed(1),issues};
}

export function imageDHash(image){
  const c=document.createElement('canvas');c.width=9;c.height=8;
  const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(image,0,0,9,8);
  const d=cx.getImageData(0,0,9,8).data;let bits='',hex='';
  const gray=i=>.299*d[i]+.587*d[i+1]+.114*d[i+2];
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){const a=4*(y*9+x),b=4*(y*9+x+1);bits+=gray(a)>gray(b)?'1':'0';}
  for(let i=0;i<64;i+=4)hex+=parseInt(bits.slice(i,i+4),2).toString(16);
  return hex;
}

export function hammingHash(a,b){
  if(!a||!b||a.length!==b.length)return Infinity;let n=0;
  for(let i=0;i<a.length;i++){let v=parseInt(a[i],16)^parseInt(b[i],16);while(v){n+=v&1;v>>=1;}}
  return n;
}

export function nearestDuplicate(hash,records=[],maxDistance=5){
  let best=null;
  for(const row of records){if(!row.imageHash)continue;const distance=hammingHash(hash,row.imageHash);if(distance<=maxDistance&&(!best||distance<best.distance))best={row,distance};}
  return best;
}

export function phenotypeSummary(records=[]){
  const values=records.map(r=>r?.phenotype).filter(Boolean);
  if(!values.length)return null;
  const keys=['meanAreaMm2','meanWidthMm','meanHeightMm','meanFeretMm'];
  const out={n:values.reduce((s,v)=>s+(Number(v.n)||0),0)};
  for(const key of keys){const a=values.map(v=>Number(v[key])).filter(Number.isFinite);out[key]=a.length?a.reduce((x,y)=>x+y,0)/a.length:null;}
  return out;
}
