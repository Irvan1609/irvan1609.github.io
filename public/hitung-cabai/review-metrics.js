const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

export function boxIoU(a,b){
  if(!Array.isArray(a)||!Array.isArray(b))return 0;
  const ax2=a[0]+a[2],ay2=a[1]+a[3],bx2=b[0]+b[2],by2=b[1]+b[3];
  const x1=Math.max(a[0],b[0]),y1=Math.max(a[1],b[1]),x2=Math.min(ax2,bx2),y2=Math.min(ay2,by2);
  const intersection=Math.max(0,x2-x1)*Math.max(0,y2-y1);
  const union=Math.max(0,a[2])*Math.max(0,a[3])+Math.max(0,b[2])*Math.max(0,b[3])-intersection;
  return union>0?intersection/union:0;
}

function normalizeDetection(value,index=0){
  if(Array.isArray(value))return {box:value,score:null,index};
  return {box:value?.box,score:Number.isFinite(value?.score)?clamp(Number(value.score),0,1):null,index};
}

export function matchBoxes(predictedDetections=[],finalBoxes=[],iouThreshold=.5){
  const predictions=predictedDetections.map(normalizeDetection).filter(x=>Array.isArray(x.box)&&x.box.length===4);
  const ground=finalBoxes.filter(x=>Array.isArray(x)&&x.length===4);
  const order=[...predictions].sort((a,b)=>(b.score??.5)-(a.score??.5));
  const used=new Set(),matches=[];
  let tp=0;
  for(const prediction of order){
    let best=-1,bestIou=0;
    for(let i=0;i<ground.length;i++){
      if(used.has(i))continue;
      const overlap=boxIoU(prediction.box,ground[i]);
      if(overlap>bestIou){bestIou=overlap;best=i;}
    }
    if(best>=0&&bestIou>=iouThreshold){
      used.add(best);tp++;matches.push({predictionIndex:prediction.index,finalIndex:best,iou:bestIou,score:prediction.score});
    }
  }
  const fp=Math.max(0,predictions.length-tp),fn=Math.max(0,ground.length-tp);
  const precision=tp+fp?tp/(tp+fp):ground.length?0:1;
  const recall=tp+fn?tp/(tp+fn):predictions.length?0:1;
  const f1=precision+recall?2*precision*recall/(precision+recall):0;
  const countError=predictions.length-ground.length;
  return {tp,fp,fn,precision,recall,f1,predictedCount:predictions.length,finalCount:ground.length,countError,absCountError:Math.abs(countError),matches};
}

export function incrementSampleCode(value){
  const text=String(value||'').trim();
  if(!text)return 'Sampel-001';
  const match=text.match(/^(.*?)(\d+)$/);
  if(!match)return text+'-002';
  return match[1]+String(Number(match[2])+1).padStart(match[2].length,'0');
}

export function reviewFlags(detections=[],{lowThreshold=.5,bigFactor=2.6,overlapThreshold=.18}={}){
  const normalized=detections.map(normalizeDetection);
  const areas=normalized.map(x=>Math.max(0,x.box?.[2]||0)*Math.max(0,x.box?.[3]||0)).filter(v=>v>0).sort((a,b)=>a-b);
  const median=areas.length?areas[Math.floor(areas.length/2)]:0;
  return normalized.map((item,index)=>{
    const reasons=[];
    if(Number.isFinite(item.score)&&item.score<lowThreshold)reasons.push('confidence');
    const area=Math.max(0,item.box?.[2]||0)*Math.max(0,item.box?.[3]||0);
    if(median>0&&area>median*bigFactor)reasons.push('besar');
    let overlap=0;
    for(let j=0;j<normalized.length;j++)if(j!==index)overlap=Math.max(overlap,boxIoU(item.box,normalized[j].box));
    if(overlap>=overlapThreshold)reasons.push('tumpang-tindih');
    return {index,reasons,needsReview:reasons.length>0,overlap,area};
  });
}

export function imageQuality(imageData){
  const {data,width,height}=imageData||{};
  if(!data||!width||!height)return {score:0,sharpness:0,exposure:0,resolution:0,issues:['Gambar tidak tersedia.']};
  const step=Math.max(1,Math.floor(Math.sqrt((width*height)/120000)));
  let sum=0,n=0,dark=0,bright=0,gradient=0,gradN=0;
  const lum=(i)=>.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
  for(let y=0;y<height;y+=step){
    for(let x=0;x<width;x+=step){
      const i=4*(y*width+x),v=lum(i);sum+=v;n++;
      if(v<18)dark++;if(v>244)bright++;
      if(x+step<width){gradient+=Math.abs(v-lum(4*(y*width+x+step)));gradN++;}
      if(y+step<height){gradient+=Math.abs(v-lum(4*((y+step)*width+x)));gradN++;}
    }
  }
  const mean=n?sum/n:0,clip=n?(dark+bright)/n:1;
  const sharpness=clamp((gradN?gradient/gradN:0)*5,0,100);
  const exposure=clamp(100-Math.abs(mean-132)*.8-clip*170,0,100);
  const megapixels=width*height/1e6,resolution=clamp(megapixels/2*100,0,100);
  const score=Math.round(sharpness*.4+exposure*.4+resolution*.2);
  const issues=[];
  if(sharpness<38)issues.push('Foto kurang tajam.');
  if(exposure<55)issues.push(mean<90?'Foto terlalu gelap.':'Pencahayaan kurang merata/terlalu terang.');
  if(resolution<40)issues.push('Resolusi foto rendah.');
  if(clip>.12)issues.push('Area hitam/putih terpotong terlalu banyak.');
  return {score,sharpness:Math.round(sharpness),exposure:Math.round(exposure),resolution:Math.round(resolution),meanLuminance:+mean.toFixed(1),clipPct:+(clip*100).toFixed(1),issues};
}

function ap50(records){
  const predictions=[],truthByRecord=new Map();
  let scored=0;
  records.forEach((record,rIndex)=>{
    const truth=(record.boxes||[]).map(box=>[...box]);
    truthByRecord.set(rIndex,{truth,used:new Set()});
    const dets=(record.predictedDetections||[]).map(normalizeDetection);
    dets.forEach(det=>{
      if(Number.isFinite(det.score))scored++;
      predictions.push({record:rIndex,box:det.box,score:det.score??.5});
    });
  });
  const totalTruth=[...truthByRecord.values()].reduce((s,r)=>s+r.truth.length,0);
  if(!totalTruth||!predictions.length||!scored)return null;
  predictions.sort((a,b)=>b.score-a.score);
  let tp=0,fp=0;const points=[];
  for(const pred of predictions){
    const group=truthByRecord.get(pred.record);let best=-1,bestIou=0;
    for(let i=0;i<group.truth.length;i++){
      if(group.used.has(i))continue;
      const overlap=boxIoU(pred.box,group.truth[i]);
      if(overlap>bestIou){bestIou=overlap;best=i;}
    }
    if(best>=0&&bestIou>=.5){group.used.add(best);tp++;}else fp++;
    points.push({recall:tp/totalTruth,precision:tp/(tp+fp)});
  }
  let ap=0;
  for(let r=0;r<=100;r++){
    const target=r/100;let best=0;
    for(const p of points)if(p.recall>=target&&p.precision>best)best=p.precision;
    ap+=best/101;
  }
  return ap;
}

export function datasetMetrics(records=[]){
  const usable=records.filter(r=>Array.isArray(r.boxes)&&Array.isArray(r.predictedDetections||r.predictedBoxes)&&(r.validationStatus==='validated'||(!r.validationStatus&&r.reviewed!==false)));
  if(!usable.length)return {n:0,mae:null,rmse:null,bias:null,precision:null,recall:null,f1:null,ap50:null,tp:0,fp:0,fn:0,byCondition:{}};
  let abs=0,sq=0,bias=0,tp=0,fp=0,fn=0;
  const groups={};
  for(const record of usable){
    const pred=(record.predictedDetections?.length?record.predictedDetections:(record.predictedBoxes||[]).map(box=>({box,score:null})));
    const m=matchBoxes(pred,record.boxes,.5),condition=record.condition||'normal';
    abs+=m.absCountError;sq+=m.countError*m.countError;bias+=m.countError;tp+=m.tp;fp+=m.fp;fn+=m.fn;
    if(!groups[condition])groups[condition]={n:0,abs:0,bias:0,tp:0,fp:0,fn:0};
    const g=groups[condition];g.n++;g.abs+=m.absCountError;g.bias+=m.countError;g.tp+=m.tp;g.fp+=m.fp;g.fn+=m.fn;
  }
  const precision=tp+fp?tp/(tp+fp):null,recall=tp+fn?tp/(tp+fn):null,f1=precision!==null&&recall!==null&&precision+recall?2*precision*recall/(precision+recall):null;
  const byCondition=Object.fromEntries(Object.entries(groups).map(([key,g])=>{
    const p=g.tp+g.fp?g.tp/(g.tp+g.fp):null,r=g.tp+g.fn?g.tp/(g.tp+g.fn):null;
    return [key,{n:g.n,mae:g.abs/g.n,bias:g.bias/g.n,precision:p,recall:r,f1:p!==null&&r!==null&&p+r?2*p*r/(p+r):null}];
  }));
  return {n:usable.length,mae:abs/usable.length,rmse:Math.sqrt(sq/usable.length),bias:bias/usable.length,precision,recall,f1,ap50:ap50(usable),tp,fp,fn,byCondition};
}

export function activeLearningPriority({correction,confidence,quality,reviewCount=0}={}){
  let score=0;
  if(correction){score+=Math.min(45,(correction.fp+correction.fn)*9+correction.absCountError*4);}
  if(confidence?.low)score+=Math.min(25,confidence.low*5);
  if(Number.isFinite(confidence?.mean))score+=Math.max(0,(.7-confidence.mean)*35);
  if(Number.isFinite(quality?.score))score+=Math.max(0,(70-quality.score)*.35);
  score+=Math.min(20,reviewCount*3);
  return Math.round(clamp(score,0,100));
}
