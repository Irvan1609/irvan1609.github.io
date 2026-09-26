export const PAPER_SIZES={
  a5:{id:'a5',name:'A5',width:148,height:210,margin:12},
  a4:{id:'a4',name:'A4',width:210,height:297,margin:15},
  a3:{id:'a3',name:'A3',width:297,height:420,margin:15},
  letter:{id:'letter',name:'Letter',width:215.9,height:279.4,margin:15},
  legal:{id:'legal',name:'Legal',width:215.9,height:355.6,margin:15},
  f4:{id:'f4',name:'F4 / Folio',width:210,height:330,margin:15}
};
export function paperProfile(id='a4',orientation='portrait',custom=null){
  let base=PAPER_SIZES[id]||PAPER_SIZES.a4;
  if(id==='custom'&&custom){
    base={id:'custom',name:'Kustom',width:Number(custom.width)||210,height:Number(custom.height)||297,margin:Number(custom.margin)||15};
  }
  let width=base.width,height=base.height;
  if(orientation==='landscape') [width,height]=[height,width];
  const margin=Math.max(8,Math.min(Math.min(width,height)/4,Number(base.margin)||15));
  return {
    id:base.id,name:base.name,orientation,width,height,margin,
    activeWidth:+(width-margin*2).toFixed(2),
    activeHeight:+(height-margin*2).toFixed(2),
    markerCenters:[[margin,margin],[width-margin,margin],[width-margin,height-margin],[margin,height-margin]],
    version:4
  };
}
export function calibratorLayout(profile){
  const aw=profile.activeWidth,ah=profile.activeHeight;
  const side=Math.max(6,Math.min(10,aw*.06));
  const topBand=Math.max(18,Math.min(24,ah*.09));
  const bottomBand=Math.max(20,Math.min(27,ah*.10));
  const photo={x:side,y:topBand,width:Math.max(40,aw-side*2),height:Math.max(60,ah-topBand-bottomBand)};
  const labelH=Math.max(8,Math.min(11,photo.height*.08));
  const labelW=Math.max(36,Math.min(80,photo.width*.52));
  const label={x:photo.x+(photo.width-labelW)/2,y:photo.y+photo.height-labelH-2,width:labelW,height:labelH};
  const analysis={x:photo.x+5,y:photo.y+5,width:Math.max(20,photo.width-10),height:Math.max(20,label.y-photo.y-8)};
  return {photo,label,analysis,topBand,bottomBand};
}
export function grayPatchRects(profile){
  const {activeWidth:w,activeHeight:h}=profile;
  const patchW=Math.max(10,Math.min(18,w/10)),patchH=8,gap=3,total=patchW*6+gap*5;
  const startX=Math.max(2,(w-total)/2),y=Math.max(6,h-20);
  return Array.from({length:6},(_,i)=>({x:startX+i*(patchW+gap),y,width:patchW,height:patchH,target:[245,210,170,130,90,50][i]}));
}
export function colorPatchRects(profile){
  const {activeWidth:w,activeHeight:h}=profile;
  const patchW=Math.max(10,Math.min(18,w/10)),patchH=8,gap=3,total=patchW*6+gap*5;
  const startX=Math.max(2,(w-total)/2),y=Math.max(6,h-31);
  const colors=['#d14a48','#4d8f55','#4a6fd1','#d3b247','#8a59a8','#4aa5a8'];
  return colors.map((fill,i)=>({x:startX+i*(patchW+gap),y,width:patchW,height:patchH,fill}));
}
export function buildCalibratorSvg(profile,{id='AGROTIK-CAL-V3'}={}){
  const p=profile,m=p.margin,w=p.width,h=p.height,aw=p.activeWidth,ah=p.activeHeight;
  const gs=grayPatchRects(p),cs=colorPatchRects(p);
  const marker=(x,y,n)=>`<g><rect x="${x-4}" y="${y-4}" width="8" height="8" rx=".6" fill="#d000d0"/><path d="M ${x-1} ${y} h 2 M ${x} ${y-1} v 2" stroke="#111" stroke-width=".25"/><text x="${x}" y="${y+7}" font-size="3" text-anchor="middle">${n}</text></g>`;
  let grid='';
  for(let x=m;x<=w-m+.01;x+=10)grid+=`<line x1="${x}" y1="${m}" x2="${x}" y2="${h-m}" stroke="#d8d8d8" stroke-width=".15"/>`;
  for(let y=m;y<=h-m+.01;y+=10)grid+=`<line x1="${m}" y1="${y}" x2="${w-m}" y2="${y}" stroke="#d8d8d8" stroke-width=".15"/>`;
  let ticks='',labels='';
  const horizontalSteps=Math.floor(aw+1e-9),verticalSteps=Math.floor(ah+1e-9);
  for(let mm=0;mm<=horizontalSteps;mm++){
    const x=m+mm,len=mm%10===0?4:mm%5===0?2.5:1.25;
    ticks+=`<path d="M ${x} ${m} v ${len} M ${x} ${h-m} v -${len}" stroke="#111" stroke-width="${mm%10===0?.28:.16}"/>`;
    if(mm%10===0)labels+=`<text x="${x}" y="${m+6.2}" font-size="1.75" text-anchor="middle">${mm}</text><text x="${x}" y="${h-m-5}" font-size="1.75" text-anchor="middle">${mm}</text>`;
  }
  for(let mm=0;mm<=verticalSteps;mm++){
    const y=m+mm,len=mm%10===0?4:mm%5===0?2.5:1.25;
    ticks+=`<path d="M ${m} ${y} h ${len} M ${w-m} ${y} h -${len}" stroke="#111" stroke-width="${mm%10===0?.28:.16}"/>`;
    if(mm%10===0)labels+=`<text x="${m+6}" y="${y+.65}" font-size="1.75" text-anchor="middle">${mm}</text><text x="${w-m-6}" y="${y+.65}" font-size="1.75" text-anchor="middle">${mm}</text>`;
  }
  const endLabel=(axis,value)=>axis==='x'
    ?`<text x="${m+value}" y="${m+6.2}" font-size="1.75" font-weight="700" text-anchor="middle">${value.toFixed(value%1?1:0)}</text>`
    :`<text x="${m+6}" y="${m+value+.65}" font-size="1.75" font-weight="700" text-anchor="middle">${value.toFixed(value%1?1:0)}</text>`;
  if(Math.abs(aw-horizontalSteps)>.01||horizontalSteps%10!==0)labels+=endLabel('x',aw);
  if(Math.abs(ah-verticalSteps)>.01||verticalSteps%10!==0)labels+=endLabel('y',ah);
  const gray=gs.map(r=>`<rect x="${m+r.x}" y="${m+r.y}" width="${r.width}" height="${r.height}" fill="rgb(${r.target},${r.target},${r.target})" stroke="#444" stroke-width=".15"/>`).join('');
  const color=cs.map(r=>`<rect x="${m+r.x}" y="${m+r.y}" width="${r.width}" height="${r.height}" fill="${r.fill}" stroke="#444" stroke-width=".15"/>`).join('');
  const check=Math.min(100,aw*.55),cx=w/2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#fff"/>
  <g font-family="Arial,sans-serif" fill="#111">
    <text x="${w/2}" y="${Math.max(6,m-6)}" text-anchor="middle" font-size="3.5">PENGUKUR · ${p.name} · ${p.orientation==='landscape'?'LANDSCAPE':'PORTRAIT'} · CETAK 100%</text>
    <text x="${w/2}" y="${Math.max(10,m-2)}" text-anchor="middle" font-size="2.6">${id} · kertas ${w} × ${h} mm · area marker ${aw} × ${ah} mm</text>
    ${grid}${ticks}${labels}
    <rect x="${m}" y="${m}" width="${aw}" height="${ah}" fill="none" stroke="#111" stroke-width=".35"/>
    <rect x="${m+8}" y="${m+8}" width="${Math.max(1,aw-16)}" height="${Math.max(1,ah-52)}" fill="none" stroke="#777" stroke-width=".2" stroke-dasharray="2 2"/>
    <text x="${w/2}" y="${m+14}" text-anchor="middle" font-size="2.8" fill="#666">AREA OBJEK · jangan tutupi marker/petak referensi</text>
    ${marker(m,m,1)}${marker(w-m,m,2)}${marker(w-m,h-m,3)}${marker(m,h-m,4)}
    <path d="M ${cx-7} ${h/2} h 14 M ${cx} ${h/2-7} v 14" stroke="#555" stroke-width=".25"/>
    ${color}${gray}
    <path d="M ${cx-check/2} ${h-m-4} H ${cx+check/2}" stroke="#111" stroke-width=".55"/>
    <path d="M ${cx-check/2} ${h-m-6} v 4 M ${cx+check/2} ${h-m-6} v 4" stroke="#111" stroke-width=".3"/>
    <text x="${cx}" y="${h-m-7}" text-anchor="middle" font-size="2.6">GARIS CEK ${check.toFixed(0)} mm</text>
    <text x="${m+2}" y="${h-m-1.2}" font-size="2.3">↑ ATAS / orientasi</text>
    <text x="${w/2}" y="${m+9}" font-size="2" text-anchor="middle">X (mm) · 0 → ${aw}</text>
    <text x="${m+9}" y="${h/2}" font-size="2" text-anchor="middle" transform="rotate(-90 ${m+9} ${h/2})">Y (mm) · 0 → ${ah}</text>
    <text x="${w-m-2}" y="${h-m-1.2}" font-size="2.1" text-anchor="end">${w} × ${h} mm</text>
  </g></svg>`;
}


export function buildLensCheckerboardSvg(profile){
  const p=profile,w=p.width,h=p.height,s=12;
  const cols=Math.max(6,Math.min(11,Math.floor((w-24)/s))),rows=Math.max(8,Math.min(15,Math.floor((h-38)/s)));
  const boardW=cols*s,boardH=rows*s,x0=(w-boardW)/2,y0=(h-boardH)/2+4;
  let cells='';
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if((x+y)%2===0)cells+=`<rect x="${x0+x*s}" y="${y0+y*s}" width="${s}" height="${s}" fill="#000"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#fff"/>
  <g font-family="Arial,sans-serif" fill="#111">
    <text x="${w/2}" y="8" text-anchor="middle" font-size="3.5">TARGET KALIBRASI LENSA · ${p.name} · CETAK 100%</text>
    <text x="${w/2}" y="13" text-anchor="middle" font-size="2.5">${cols} × ${rows} petak · setiap petak ${s} × ${s} mm · kertas ${w} × ${h} mm</text>
    <rect x="${x0-.4}" y="${y0-.4}" width="${boardW+.8}" height="${boardH+.8}" fill="none" stroke="#111" stroke-width=".3"/>
    ${cells}
    <path d="M ${x0} ${y0+boardH+7} H ${x0+60}" stroke="#111" stroke-width=".5"/><path d="M ${x0} ${y0+boardH+5} v 4 M ${x0+60} ${y0+boardH+5} v 4" stroke="#111" stroke-width=".3"/>
    <text x="${x0+30}" y="${y0+boardH+12}" text-anchor="middle" font-size="2.5">GARIS CEK 60 mm</text>
    <text x="${w/2}" y="${h-7}" text-anchor="middle" font-size="2.3">Ambil beberapa foto dari sudut dan posisi berbeda; profil k1/k2 tetap bersifat eksperimental.</text>
  </g></svg>`;
}
