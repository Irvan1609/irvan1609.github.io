const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function rgbToHsv(r,g,b){
  const rn=r/255,gn=g/255,bn=b/255,max=Math.max(rn,gn,bn),min=Math.min(rn,gn,bn),d=max-min;
  let h=0;
  if(d){
    if(max===rn)h=((gn-bn)/d)%6;
    else if(max===gn)h=(bn-rn)/d+2;
    else h=(rn-gn)/d+4;
    h*=60;if(h<0)h+=360;
  }
  return {h,s:max===0?0:d/max,v:max,chroma:d};
}
function pixelThresholds(sensitivity){
  if(sensitivity==='strict')return {sat:.38,chroma:.14,minArea:.00011,minFill:.11};
  if(sensitivity==='sensitive')return {sat:.20,chroma:.075,minArea:.000035,minFill:.055};
  return {sat:.28,chroma:.10,minArea:.000065,minFill:.075};
}
function isPepperPixel(r,g,b,target,threshold){
  const {h,s,v,chroma}=rgbToHsv(r,g,b);
  if(v<.11||s<threshold.sat||chroma<threshold.chroma)return false;
  const red=h<=48||h>=330,green=h>=52&&h<=182,yellow=h>48&&h<72;
  if(target==='red')return red||yellow;
  if(target==='green')return green;
  return red||green||yellow;
}
function smoothMask(mask,width,height){
  const out=new Uint8Array(mask.length);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;let n=0;
    for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++)if(xx!==x||yy!==y)n+=mask[yy*width+xx];
    if(mask[i])out[i]=n>=2?1:0;
    else out[i]=n>=6?1:0;
  }
  return out;
}
function components(mask,width,height){
  const work=mask.slice(),queue=new Int32Array(mask.length),result=[];
  const dirs=[-1,1,-width,width,-width-1,-width+1,width-1,width+1];
  for(let start=0;start<work.length;start++){
    if(!work[start])continue;
    let head=0,tail=0;queue[tail++]=start;work[start]=0;
    let area=0,minX=width,maxX=0,minY=height,maxY=0;
    while(head<tail){
      const p=queue[head++],x=p%width,y=(p/width)|0;area++;
      if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
      for(const delta of dirs){
        const q=p+delta;if(q<0||q>=work.length||!work[q])continue;
        const qx=q%width,qy=(q/width)|0;
        if(Math.abs(qx-x)>1||Math.abs(qy-y)>1)continue;
        work[q]=0;queue[tail++]=q;
      }
    }
    result.push({area,minX,maxX,minY,maxY});
  }
  return result;
}
function filterComponents(items,width,height,threshold){
  const imageArea=width*height,minArea=Math.max(10,imageArea*threshold.minArea),maxArea=imageArea*.16;
  return items.filter(item=>{
    const bw=item.maxX-item.minX+1,bh=item.maxY-item.minY+1,boxArea=bw*bh,fill=item.area/boxArea,aspect=Math.max(bw,bh)/Math.max(1,Math.min(bw,bh));
    return item.area>=minArea&&item.area<=maxArea&&bw>=3&&bh>=3&&fill>=threshold.minFill&&aspect<=18;
  });
}
function overlap1D(a1,a2,b1,b2){return Math.max(0,Math.min(a2,b2)-Math.max(a1,b1));}
function mergeFragments(items,width,height){
  const boxes=items.map(item=>({...item})),pad=Math.max(2,Math.round(Math.min(width,height)*.004));
  let changed=true;
  while(changed){
    changed=false;
    outer:for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j],ax1=a.minX-pad,ax2=a.maxX+pad,ay1=a.minY-pad,ay2=a.maxY+pad,bx1=b.minX-pad,bx2=b.maxX+pad,by1=b.minY-pad,by2=b.maxY+pad;
      const overlapX=overlap1D(ax1,ax2,bx1,bx2),overlapY=overlap1D(ay1,ay2,by1,by2);
      const near=overlapX>0&&overlapY>0;
      if(!near)continue;
      const minX=Math.min(a.minX,b.minX),maxX=Math.max(a.maxX,b.maxX),minY=Math.min(a.minY,b.minY),maxY=Math.max(a.maxY,b.maxY);
      const bw=maxX-minX+1,bh=maxY-minY+1,aspect=Math.max(bw,bh)/Math.max(1,Math.min(bw,bh));
      if(aspect>18)continue;
      boxes[i]={area:a.area+b.area,minX,maxX,minY,maxY};boxes.splice(j,1);changed=true;break outer;
    }
  }
  return boxes;
}
function normalizedBox(item,width,height){
  const padX=Math.max(2,Math.round((item.maxX-item.minX+1)*.09)),padY=Math.max(2,Math.round((item.maxY-item.minY+1)*.09));
  const x1=clamp(item.minX-padX,0,width-1),y1=clamp(item.minY-padY,0,height-1),x2=clamp(item.maxX+padX,0,width-1),y2=clamp(item.maxY+padY,0,height-1);
  return [x1/width,y1/height,(x2-x1+1)/width,(y2-y1+1)/height];
}

export function detectChiliBoxesFromImageData(imageData,{target='all',sensitivity='normal'}={}){
  const {data,width,height}=imageData||{};
  if(!data||!Number.isInteger(width)||!Number.isInteger(height)||width<3||height<3)throw Error('Data gambar tidak valid.');
  const threshold=pixelThresholds(sensitivity),mask=new Uint8Array(width*height);
  let candidatePixels=0;
  for(let i=0,p=0;i<data.length;i+=4,p++){
    if(data[i+3]===0)continue;
    if(isPepperPixel(data[i],data[i+1],data[i+2],target,threshold)){mask[p]=1;candidatePixels++;}
  }
  const cleaned=smoothMask(smoothMask(mask,width,height),width,height);
  const raw=components(cleaned,width,height),kept=filterComponents(raw,width,height,threshold),merged=mergeFragments(kept,width,height);
  const boxes=merged.map(item=>normalizedBox(item,width,height)).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
  return {boxes,stats:{candidatePixels,components:raw.length,accepted:boxes.length,width,height,target,sensitivity}};
}
