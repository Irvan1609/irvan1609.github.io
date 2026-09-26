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
