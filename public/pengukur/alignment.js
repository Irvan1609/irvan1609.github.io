export function alignmentCheck(points,expectedRatio=180/267){
  if(!Array.isArray(points)||points.length!==4||points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return null;
  const lengths=points.map((p,i)=>Math.hypot(p[0]-points[(i+1)%4][0],p[1]-points[(i+1)%4][1]));
  if(Math.min(...lengths)<=0)return null;
  const oppositeDifference=Math.max(
    Math.abs(lengths[0]-lengths[2])/Math.max(lengths[0],lengths[2]),
    Math.abs(lengths[1]-lengths[3])/Math.max(lengths[1],lengths[3])
  );
  const observedRatio=((lengths[0]+lengths[2])/(lengths[1]+lengths[3]));
  const ratioDifference=Math.abs(observedRatio/expectedRatio-1);
  const skew=Math.max(...points.map((p,i)=>{
    const a=points[(i+3)%4],b=points[(i+1)%4];
    return Math.abs(((a[0]-p[0])*(b[0]-p[0])+(a[1]-p[1])*(b[1]-p[1]))/(lengths[(i+3)%4]*lengths[i]));
  }));
  const score=Math.max(0,100-Math.round((oppositeDifference+ratioDifference+skew)*220));
  return {retake:oppositeDifference>.08||ratioDifference>.08||skew>.08,oppositeDifference,ratioDifference,skew,score};
}


export function scaleCheck(points,physicalWidth,physicalHeight){
  if(!Array.isArray(points)||points.length!==4||!Number.isFinite(physicalWidth)||!Number.isFinite(physicalHeight)||physicalWidth<=0||physicalHeight<=0)return null;
  const d=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
  const top=d(points[0],points[1]),right=d(points[1],points[2]),bottom=d(points[2],points[3]),left=d(points[3],points[0]);
  const pxPerMmX=(top+bottom)/(2*physicalWidth),pxPerMmY=(left+right)/(2*physicalHeight),mean=(pxPerMmX+pxPerMmY)/2;
  const differencePct=mean?Math.abs(pxPerMmX-pxPerMmY)/mean*100:Infinity;
  const edgeDifferencePct=Math.max(Math.abs(top-bottom)/Math.max(top,bottom),Math.abs(left-right)/Math.max(left,right))*100;
  const rollDeg=Math.atan2(points[1][1]-points[0][1],points[1][0]-points[0][0])*180/Math.PI;
  return {pxPerMmX,pxPerMmY,differencePct,edgeDifferencePct,rollDeg,consistent:differencePct<=8&&edgeDifferencePct<=10};
}
