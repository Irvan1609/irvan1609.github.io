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
  const side=Math.max(3,Math.min(10,aw*.06));
  const topBand=Math.max(8,Math.min(24,ah*.09));
  const bottomBand=Math.max(10,Math.min(27,ah*.10));
  const photo={x:side,y:topBand,width:Math.max(10,aw-side*2),height:Math.max(12,ah-topBand-bottomBand)};
  const labelH=Math.max(4,Math.min(11,photo.height*.08,photo.height*.25));
  const labelW=Math.max(12,Math.min(80,photo.width*.52,photo.width-4));
  const label={x:photo.x+(photo.width-labelW)/2,y:photo.y+photo.height-labelH-2,width:labelW,height:labelH};
  const inset=Math.min(5,Math.max(2,photo.width*.04)),analysis={x:photo.x+inset,y:photo.y+inset,width:Math.max(6,photo.width-inset*2),height:Math.max(6,label.y-photo.y-inset-3)};
  return {photo,label,analysis,topBand,bottomBand};
}
export function grayPatchRects(profile){
  const {activeWidth:w,activeHeight:h}=profile;
  const gap=Math.max(1,Math.min(2,w/80)),patchW=Math.max(3,Math.min(14,(w-gap*5-4)/6)),patchH=Math.max(4,Math.min(6,h/20)),total=patchW*6+gap*5;
  const startX=Math.max(2,(w-total)/2),y=Math.max(2,h-9);
  return Array.from({length:6},(_,i)=>({x:startX+i*(patchW+gap),y,width:patchW,height:patchH,target:[245,210,170,130,90,50][i]}));
}
export function colorPatchRects(profile){
  const {activeWidth:w}=profile;
  const gap=Math.max(1,Math.min(2,w/80)),patchW=Math.max(3,Math.min(14,(w-gap*5-4)/6)),patchH=6,total=patchW*6+gap*5;
  const startX=Math.max(2,(w-total)/2),y=3;
  const colors=['#d14a48','#4d8f55','#4a6fd1','#d3b247','#8a59a8','#4aa5a8'];
  return colors.map((fill,i)=>({x:startX+i*(patchW+gap),y,width:patchW,height:patchH,fill}));
}
function xml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));}
export function buildCalibratorSvg(profile,{id='AGROTIK-CAL-V4',label=''}={}){
  const p=profile,m=p.margin,w=p.width,h=p.height,aw=p.activeWidth,ah=p.activeHeight,layout=calibratorLayout(p);
  const gs=grayPatchRects(p),cs=colorPatchRects(p),photo=layout.photo,labelBox=layout.label;
  const marker=(x,y,n)=>`<g><rect x="${x-4}" y="${y-4}" width="8" height="8" rx=".6" fill="#d000d0"/><path d="M ${x-1} ${y} h 2 M ${x} ${y-1} v 2" stroke="#111" stroke-width=".25"/><text x="${x}" y="${y+7}" font-size="3" text-anchor="middle">${n}</text></g>`;
  const px=m+photo.x,py=m+photo.y,pw=photo.width,ph=photo.height;
  let ticks='',labels='';
  for(let mm=0;mm<=Math.floor(pw+1e-9);mm++){
    const x=px+mm,len=mm%10===0?4:mm%5===0?2.5:1.25;
    ticks+=`<path d="M ${x} ${py} v ${len} M ${x} ${py+ph} v -${len}" stroke="#111" stroke-width="${mm%10===0?.28:.16}"/>`;
    if(mm%10===0)labels+=`<text x="${x}" y="${py+6.2}" font-size="1.75" text-anchor="middle">${mm}</text>`;
  }
  for(let mm=0;mm<=Math.floor(ph+1e-9);mm++){
    const y=py+mm,len=mm%10===0?4:mm%5===0?2.5:1.25;
    ticks+=`<path d="M ${px} ${y} h ${len} M ${px+pw} ${y} h -${len}" stroke="#111" stroke-width="${mm%10===0?.28:.16}"/>`;
    if(mm%10===0)labels+=`<text x="${px+6}" y="${y+.65}" font-size="1.75" text-anchor="middle">${mm}</text>`;
  }
  const gray=gs.map(r=>`<rect x="${m+r.x}" y="${m+r.y}" width="${r.width}" height="${r.height}" fill="rgb(${r.target},${r.target},${r.target})" stroke="#444" stroke-width=".15"/>`).join('');
  const color=cs.map(r=>`<rect x="${m+r.x}" y="${m+r.y}" width="${r.width}" height="${r.height}" fill="${r.fill}" stroke="#444" stroke-width=".15"/>`).join('');
  const check=Math.max(12,Math.min(100,aw*.55,aw-6)),cx=w/2,checkY=m+Math.min(15,layout.topBand-3);
  const lx=m+labelBox.x,ly=m+labelBox.y;
  const labelText=xml(String(label||'').trim().slice(0,80));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#fff"/>
  <g font-family="Arial,sans-serif" fill="#111">
    <text x="${w/2}" y="${Math.max(5,m-7)}" text-anchor="middle" font-size="3.5">PENGUKUR · ${p.name} · ${p.orientation==='landscape'?'LANDSCAPE':'PORTRAIT'} · CETAK 100%</text>
    <text x="${w/2}" y="${Math.max(9,m-3)}" text-anchor="middle" font-size="2.4">${id} · kertas ${w} × ${h} mm · marker ${aw} × ${ah} mm</text>
    <rect x="${m}" y="${m}" width="${aw}" height="${ah}" fill="none" stroke="#8d9aa3" stroke-width=".18" stroke-dasharray="1.5 1.5"/>
    ${marker(m,m,1)}${marker(w-m,m,2)}${marker(w-m,h-m,3)}${marker(m,h-m,4)}
    ${color}
    <path d="M ${cx-check/2} ${checkY} H ${cx+check/2}" stroke="#111" stroke-width=".55"/>
    <path d="M ${cx-check/2} ${checkY-2} v 4 M ${cx+check/2} ${checkY-2} v 4" stroke="#111" stroke-width=".3"/>
    <text x="${cx}" y="${checkY-3}" text-anchor="middle" font-size="2.4">GARIS CEK ${check.toFixed(0)} mm</text>
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="#fff" stroke="#111" stroke-width=".35"/>
    ${ticks}${labels}
    <text x="${px+pw/2}" y="${py-2.2}" text-anchor="middle" font-size="2.3" fill="#555">AREA FOTO / OBJEK · hanya penggaris dan label masuk hasil foto</text>
    <text x="${px+pw-2}" y="${py+6.2}" font-size="1.8" text-anchor="end">X (mm)</text>
    <text x="${px+6}" y="${py+ph-2}" font-size="1.8">Y (mm)</text>
    <rect x="${lx}" y="${ly}" width="${labelBox.width}" height="${labelBox.height}" rx="1.2" fill="#fff" stroke="#555" stroke-width=".22"/>
    <text x="${lx+2}" y="${ly+2.8}" font-size="1.55" fill="#777">LABEL</text>
    ${labelText?`<text x="${lx+labelBox.width/2}" y="${ly+labelBox.height*.67}" text-anchor="middle" font-size="${Math.max(2.4,Math.min(4,labelBox.width/Math.max(12,labelText.length*.62)))}" font-weight="700">${labelText}</text>`:''}
    ${gray}
    <text x="${m+2}" y="${h-m-1.2}" font-size="2.2">↑ ATAS / orientasi</text>
    <text x="${w-m-2}" y="${h-m-1.2}" font-size="2.1" text-anchor="end">kalibrasi luar · tidak diekspor</text>
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
