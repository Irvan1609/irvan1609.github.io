function clamp(v,a=0,b=255){return Math.max(a,Math.min(b,v));}
function rgbDistance(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);}
export function imageQuality(image,points=null,alignment=null){
  const {data,width,height}=image,step=Math.max(1,Math.floor(Math.max(width,height)/700));
  let n=0,bright=0,dark=0,sum=0,sum2=0,lapN=0,lapSum=0,lap2=0;
  const gray=(x,y)=>{const i=4*(y*width+x);return .299*data[i]+.587*data[i+1]+.114*data[i+2];};
  for(let y=step;y<height-step;y+=step){
    for(let x=step;x<width-step;x+=step){
      const g=gray(x,y);n++;sum+=g;sum2+=g*g;if(g>248)bright++;if(g<8)dark++;
      const l=4*g-gray(x-step,y)-gray(x+step,y)-gray(x,y-step)-gray(x,y+step);lapN++;lapSum+=l;lap2+=l*l;
    }
  }
  const mean=n?sum/n:0,variance=n?sum2/n-mean*mean:0,lapMean=lapN?lapSum/lapN:0,lapVar=lapN?lap2/lapN-lapMean*lapMean:0;
  const sharpness=Math.min(100,Math.max(0,Math.sqrt(Math.max(0,lapVar))*5));
  const exposure=Math.max(0,100-(bright/n*100)*3.2-(dark/n*100)*2.4-Math.max(0,Math.abs(mean-135)-75)*.8);
  const resolution=Math.min(100,Math.min(width,height)/9);
  const markerScore=points?.length===4?100:0;
  const alignmentScore=alignment?alignment.score:0;
  const score=Math.round(sharpness*.25+exposure*.2+resolution*.15+markerScore*.2+alignmentScore*.2);
  const issues=[];
  if(sharpness<42)issues.push('Foto tampak kurang tajam.');
  if(bright/n>.08)issues.push('Area putih terlalu terang cukup banyak.');
  if(dark/n>.08)issues.push('Bayangan/area sangat gelap cukup banyak.');
  if(resolution<55)issues.push('Resolusi relatif rendah.');
  if(markerScore<100)issues.push('Empat marker belum terbaca.');
  if(alignment?.retake)issues.push('Perspektif/kemiringan marker belum baik.');
  return {score,sharpness:Math.round(sharpness),exposure:Math.round(exposure),resolution:Math.round(resolution),markerScore,alignmentScore:Math.round(alignmentScore||0),brightFraction:bright/Math.max(1,n),darkFraction:dark/Math.max(1,n),issues};
}
export function undistortImageData(image,{k1=0,k2=0}={}){
  k1=Number(k1)||0;k2=Number(k2)||0;
  if(Math.abs(k1)<1e-8&&Math.abs(k2)<1e-8)return new ImageData(new Uint8ClampedArray(image.data),image.width,image.height);
  const {width,height,data}=image,out=new ImageData(width,height),dst=out.data,cx=(width-1)/2,cy=(height-1)/2,scale=Math.max(cx,cy);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const nx=(x-cx)/scale,ny=(y-cy)/scale,r2=nx*nx+ny*ny,f=1+k1*r2+k2*r2*r2;
    const sx=cx+nx*f*scale,sy=cy+ny*f*scale,k=4*(y*width+x);
    if(sx<0||sy<0||sx>width-1||sy>height-1){dst[k+3]=255;continue;}
    const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),dx=sx-x0,dy=sy-y0;
    for(let c=0;c<3;c++)dst[k+c]=data[4*(y0*width+x0)+c]*(1-dx)*(1-dy)+data[4*(y0*width+x1)+c]*dx*(1-dy)+data[4*(y1*width+x0)+c]*(1-dx)*dy+data[4*(y1*width+x1)+c]*dx*dy;
    dst[k+3]=255;
  }
  return out;
}
export function segmentObject(image,seedX,seedY,threshold=46){
  const {width,height,data}=image,x0=Math.round(seedX),y0=Math.round(seedY);
  if(x0<0||y0<0||x0>=width||y0>=height)throw Error('Titik objek di luar gambar.');
  const seedIndex=4*(y0*width+x0),seed=[data[seedIndex],data[seedIndex+1],data[seedIndex+2]];
  const mask=new Uint8Array(width*height),seen=new Uint8Array(width*height),stack=[y0*width+x0],max=Math.floor(width*height*.72);
  let n=0,mean=[...seed];
  while(stack.length&&n<max){
    const k=stack.pop();if(seen[k])continue;seen[k]=1;
    const x=k%width,y=Math.floor(k/width),i=4*k,rgb=[data[i],data[i+1],data[i+2]];
    if(rgbDistance(rgb,mean)>threshold)continue;
    mask[k]=1;n++;
    if(n<15000){const a=Math.min(.025,1/n);mean=[mean[0]*(1-a)+rgb[0]*a,mean[1]*(1-a)+rgb[1]*a,mean[2]*(1-a)+rgb[2]*a];}
    if(x>0&&!seen[k-1])stack.push(k-1);if(x<width-1&&!seen[k+1])stack.push(k+1);
    if(y>0&&!seen[k-width])stack.push(k-width);if(y<height-1&&!seen[k+width])stack.push(k+width);
  }
  if(n<20)throw Error('Objek terlalu kecil atau threshold terlalu ketat.');
  if(n>=max)throw Error('Segmentasi meluas ke latar. Kurangi threshold atau pilih titik lain.');
  return mask;
}
function boundaryPoints(mask,width,height){
  const points=[];
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const k=y*width+x;if(!mask[k])continue;
    if(!mask[k-1]||!mask[k+1]||!mask[k-width]||!mask[k+width])points.push([x,y]);
  }
  return points;
}
function hull(points){
  if(points.length<=1)return points.slice();
  const pts=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lo=[];for(const p of pts){while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);}
  const up=[];for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(up.length>=2&&cross(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p);}
  lo.pop();up.pop();return lo.concat(up);
}
function polygonArea(points){let a=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p[0]*q[1]-q[0]*p[1];}return Math.abs(a)/2;}
export function morphology(mask,width,height,ppm=5){
  let n=0,minX=width,maxX=0,minY=height,maxY=0,sx=0,sy=0,perimEdges=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const k=y*width+x;if(!mask[k])continue;n++;sx+=x;sy+=y;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(x===0||!mask[k-1])perimEdges++;if(x===width-1||!mask[k+1])perimEdges++;if(y===0||!mask[k-width])perimEdges++;if(y===height-1||!mask[k+width])perimEdges++;}
  if(!n)throw Error('Mask kosong.');
  const cx=sx/n,cy=sy/n;let cxx=0,cyy=0,cxy=0;
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const k=y*width+x;if(!mask[k])continue;const dx=x-cx,dy=y-cy;cxx+=dx*dx;cyy+=dy*dy;cxy+=dx*dy;}
  cxx/=n;cyy/=n;cxy/=n;const tr=cxx+cyy,det=cxx*cyy-cxy*cxy,d=Math.sqrt(Math.max(0,tr*tr/4-det)),l1=tr/2+d,l2=tr/2-d;
  const boundary=boundaryPoints(mask,width,height),sample=boundary.length>5000?boundary.filter((_,i)=>i%Math.ceil(boundary.length/5000)===0):boundary,h=hull(sample);
  let feret=0,minFeret=Infinity;
  for(let i=0;i<h.length;i++)for(let j=i+1;j<h.length;j++)feret=Math.max(feret,Math.hypot(h[j][0]-h[i][0],h[j][1]-h[i][1]));
  for(let i=0;i<h.length;i++){
    const a=h[i],b=h[(i+1)%h.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;let lo=Infinity,hi=-Infinity;
    for(const p of h){const v=p[0]*nx+p[1]*ny;lo=Math.min(lo,v);hi=Math.max(hi,v);}minFeret=Math.min(minFeret,hi-lo);
  }
  const areaPx=n,perimeterPx=perimEdges,convexPx=h.length>=3?polygonArea(h):n,area=areaPx/(ppm*ppm),perimeter=perimeterPx/ppm;
  return {
    area,perimeter,width:(maxX-minX+1)/ppm,height:(maxY-minY+1)/ppm,
    major:4*Math.sqrt(Math.max(0,l1))/ppm,minor:4*Math.sqrt(Math.max(0,l2))/ppm,
    feret:feret/ppm,minFeret:(Number.isFinite(minFeret)?minFeret:0)/ppm,
    circularity:perimeter>0?4*Math.PI*area/(perimeter*perimeter):0,
    convexArea:convexPx/(ppm*ppm),solidity:convexPx>0?areaPx/convexPx:0,
    aspectRatio:(maxY-minY+1)>0?(maxX-minX+1)/(maxY-minY+1):0,
    centroid:[cx/ppm,cy/ppm],pixels:n
  };
}
export function overlayMask(image,mask,color=[0,180,120]){
  const out=new ImageData(new Uint8ClampedArray(image.data),image.width,image.height);
  for(let i=0;i<mask.length;i++)if(mask[i]){out.data[4*i]=out.data[4*i]*.6+color[0]*.4;out.data[4*i+1]=out.data[4*i+1]*.6+color[1]*.4;out.data[4*i+2]=out.data[4*i+2]*.6+color[2]*.4;}
  return out;
}
function sampleRect(image,r){
  const {width,height,data}=image;let sr=0,sg=0,sb=0,n=0;
  const x0=Math.max(0,Math.floor(r.x)),x1=Math.min(width,Math.ceil(r.x+r.width)),y0=Math.max(0,Math.floor(r.y)),y1=Math.min(height,Math.ceil(r.y+r.height));
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=4*(y*width+x);sr+=data[i];sg+=data[i+1];sb+=data[i+2];n++;}
  return n?[sr/n,sg/n,sb/n]:null;
}
function linearFit(xs,ys){
  const n=xs.length,mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;
  let num=0,den=0;for(let i=0;i<n;i++){num+=(xs[i]-mx)*(ys[i]-my);den+=(xs[i]-mx)**2;}
  const a=den?num/den:1,b=my-a*mx;return[a,b];
}
export function normalizeGrayPatches(image,rectsPx){
  const observed=rectsPx.map(r=>sampleRect(image,r));if(observed.some(v=>!v))throw Error('Petak abu-abu tidak dapat dibaca.');
  const targets=rectsPx.map(r=>Number(r.target)),fits=[0,1,2].map(c=>linearFit(observed.map(v=>v[c]),targets));
  const out=new ImageData(new Uint8ClampedArray(image.data),image.width,image.height);
  for(let i=0;i<out.data.length;i+=4){for(let c=0;c<3;c++)out.data[i+c]=clamp(fits[c][0]*out.data[i+c]+fits[c][1]);}
  return {image:out,fits,observed};
}
export function repeatability(records){
  const groups=new Map();
  for(const r of records){if(!Number.isFinite(Number(r.primaryValue)))continue;const key=(r.sampleId||'')+'|'+r.type;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(Number(r.primaryValue));}
  return [...groups.entries()].filter(([,v])=>v.length>=2).map(([key,v])=>{
    const mean=v.reduce((a,b)=>a+b,0)/v.length,sd=Math.sqrt(v.reduce((s,x)=>s+(x-mean)**2,0)/(v.length-1));
    return {key,n:v.length,mean,sd,cv:mean?sd/Math.abs(mean)*100:null};
  });
}
