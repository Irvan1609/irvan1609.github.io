import {PAPER_SIZES,paperProfile,calibratorLayout,buildCalibratorSvg,grayPatchRects} from './paper.js';
import {PPM,homography,project,detectMarkers,bilinearSample} from './geometry.js';
import {alignmentCheck,scaleCheck} from './alignment.js';
import {installLiveCamera} from './live-camera.js';
import {imageQuality,undistortImageData,segmentObject,morphology,overlayMask,normalizeGrayPatches,repeatability,colorStats,normalizeSamplePoints,segmentObjects,validationSummary} from './image-tools.js';
import {measurementsToStatistics} from './stat-sync.js';

const $=id=>document.getElementById(id);
const source=$('source'),result=$('result'),ctx=source.getContext('2d',{willReadFrequently:true}),rctx=result.getContext('2d');
const SETTINGS_KEY='agrotik_pengukur_settings_v3',RECORDS_KEY='ukur_rows_v3',FIELD_HANDOFF_KEY='agrotik_field_handoff_v1';
const RESEARCH_IDS=['experimentId','genotype','treatment','replication','harvest','operator'];
let rawOriginal=null,original=null,points=[],cleanResult=null,calibration=null,filename='foto',batchFiles=[],batchIndex=-1;
let mode='length',measurePoints=[],activeMeasurement=null,activeMask=null,quality=null,currentFile=null;
let activeObjects=[],colorPickMode=false,colorPatchPoints=[],batchBusy=false;
let records=loadRecords();

const fieldParams=new URLSearchParams(location.search);
const fieldContext=fieldParams.get('agrotik')==='field'?{
  dataset:fieldParams.get('dataset')||'',plot_uid:fieldParams.get('plot_uid')||'',plot_label:fieldParams.get('plot_label')||'',
  parameter:fieldParams.get('parameter')||'',session_id:fieldParams.get('session_id')||''
}:null;

function tell(message){$('status').textContent=message;}
function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function safeName(value){return String(value||'foto').replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]+/gu,'_')||'foto';}
function photoLabel(){return $('photoLabel')?.value.trim()||'';}
function fileStem(value){return String(value||'foto').normalize('NFC').trim().replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,100)||'foto';}
function activePhotoStem(){return fileStem(photoLabel()||$('sampleId')?.value.trim()||filename||'foto');}
function refreshPhotoLabel(){
  const label=photoLabel(),name=fileStem(label||filename||'foto');
  if($('photoFilename'))$('photoFilename').textContent=name+'.jpg';
  const link=$('printCalibrator');
  if(link){const u=new URL(link.href,location.href);if(label)u.searchParams.set('label',label);else u.searchParams.delete('label');link.href=u.pathname+u.search;}
  saveSettings({photoLabel:label});
}
function embedRectifiedLabel(image,profile,label){
  const text=String(label||'').trim().slice(0,80);if(!text)return image;
  const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const cctx=c.getContext('2d',{willReadFrequently:true});cctx.putImageData(image,0,0);
  const b=calibratorLayout(profile).label,x=b.x*PPM,y=b.y*PPM,w=b.width*PPM,h=b.height*PPM,pad=Math.max(6,h*.12);
  cctx.fillStyle='rgba(255,255,255,.97)';cctx.strokeStyle='#111';cctx.lineWidth=Math.max(1,h*.025);cctx.fillRect(x,y,w,h);cctx.strokeRect(x,y,w,h);
  let font=Math.max(12,Math.min(26,h*.48));cctx.font='700 '+font+'px Arial,sans-serif';while(font>10&&cctx.measureText(text).width>w-pad*2){font-=1;cctx.font='700 '+font+'px Arial,sans-serif';}
  cctx.fillStyle='#111';cctx.textAlign='center';cctx.textBaseline='middle';cctx.fillText(text,x+w/2,y+h*.56,w-pad*2);
  return cctx.getImageData(0,0,c.width,c.height);
}
function settings(){
  try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');}catch{return{};}
}
function saveSettings(patch){
  const next={...settings(),...patch};try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(next));}catch{}return next;
}
function researchMeta(){return Object.fromEntries(RESEARCH_IDS.map(id=>[id==='experimentId'?'experiment':id,$(id)?.value.trim()||'']));}
function saveResearch(){saveSettings({research:researchMeta()});}
function loadRecords(){
  try{const value=JSON.parse(localStorage.getItem(RECORDS_KEY)||'[]');return Array.isArray(value)?value.slice(-500):[];}catch{return[];}
}
function persistRecords(){try{localStorage.setItem(RECORDS_KEY,JSON.stringify(records.slice(-500)));}catch{}}
function getProfile(){
  const id=$('paperSize').value,orientation=$('orientation').value;
  const custom=id==='custom'?{width:Number($('customWidth').value),height:Number($('customHeight').value),margin:Number($('customMargin').value)}:null;
  return paperProfile(id,orientation,custom);
}
function currentLens(){return {name:$('lensName').value.trim()||'Default',k1:Number($('lensK1').value)||0,k2:Number($('lensK2').value)||0};}
function restoreSettings(){
  const s=settings();
  if(s.paper&&[...Object.keys(PAPER_SIZES),'custom'].includes(s.paper))$('paperSize').value=s.paper;
  if(s.orientation)$('orientation').value=s.orientation;
  if(s.custom){$('customWidth').value=s.custom.width||210;$('customHeight').value=s.custom.height||297;$('customMargin').value=s.custom.margin||15;}
  if(s.lens){$('lensName').value=s.lens.name||'Default';$('lensK1').value=s.lens.k1||0;$('lensK2').value=s.lens.k2||0;}
  const research=s.research||{};for(const id of RESEARCH_IDS){const key=id==='experimentId'?'experiment':id;if($(id))$(id).value=research[key]||'';}
  $('customPaper').hidden=$('paperSize').value!=='custom';
}
function refreshPaper(){
  const p=getProfile(),custom=p.id==='custom'?{width:p.orientation==='portrait'?p.width:p.height,height:p.orientation==='portrait'?p.height:p.width,margin:p.margin}:null;
  $('paperName').textContent=p.name+' · '+(p.orientation==='portrait'?'Portrait':'Landscape');
  $('paperInfo').textContent=p.width.toFixed(1).replace('.0','')+' × '+p.height.toFixed(1).replace('.0','')+' mm';
  $('activeInfo').textContent='Area marker '+p.activeWidth+' × '+p.activeHeight+' mm';
  $('customPaper').hidden=$('paperSize').value!=='custom';
  const q=new URLSearchParams({paper:$('paperSize').value,orientation:p.orientation});
  if(custom){q.set('width',custom.width);q.set('height',custom.height);q.set('margin',custom.margin);}
  $('printCalibrator').href='./kalibrator.html?'+q.toString();const lq=new URLSearchParams(q);lq.set('target','lens');$('printLensTarget').href='./kalibrator.html?'+lq.toString();
  saveSettings({paper:$('paperSize').value,orientation:p.orientation,custom});
  if(original&&points.length===4){drawSource();updateQuality();}
}
function downloadBlob(blob,name){
  if(!blob)return tell('File gagal dibuat.');
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1600);
}
function invalidateResult(){
  cleanResult=null;calibration=null;measurePoints=[];activeMeasurement=null;activeMask=null;activeObjects=[];colorPickMode=false;colorPatchPoints=[];result.width=0;result.height=0;
  $('download').disabled=$('metadata').disabled=$('normalizeColor').disabled=$('colorChecker').disabled=$('detectAllObjects').disabled=true;
  $('saveMeasurement').disabled=true;$('saveAllObjects').disabled=true;$('finishShape').disabled=true;$('cancelMeasure').disabled=true;$('morphologyCard').hidden=true;
  $('resultInfo').textContent='Hasil perlu dihitung ulang setelah marker, kertas, atau profil lensa berubah.';
  $('distance').textContent='Pilih mode pengukuran lalu titik pada gambar.';
}
function alignment(){const p=getProfile();return alignmentCheck(points,p.activeWidth/p.activeHeight);}
function scaleDiagnostics(){const p=getProfile();return points.length===4?scaleCheck(points,p.activeWidth,p.activeHeight):null;}
function updateQuality(){
  if(!original)return;
  const a=alignment(),s=scaleDiagnostics(),q=imageQuality(original,points.length===4?points:null,a);quality=q;
  if(s){q.rawScale=s;if(!s.consistent){q.score=Math.max(0,q.score-6);q.issues.push('Skala X/Y pra-rektifikasi berbeda cukup besar; periksa kemiringan kamera.');}}
  const root=$('qualityGate'),status=q.score>=80?'BAIK':q.score>=62?'CUKUP':'ULANGI';
  root.dataset.level=status.toLowerCase();root.querySelector('strong').textContent=q.score+'/100 · '+status;
  root.querySelector('div').innerHTML=`<span>Fokus <b>${q.sharpness}</b></span><span>Cahaya <b>${q.exposure}</b></span><span>Resolusi <b>${q.resolution}</b></span><span>Geometri <b>${q.alignmentScore}</b></span>${s?`<span>X/Y <b>${s.differencePct.toFixed(1)}%</b></span>`:''}`;
  root.querySelector('p').textContent=q.issues.length?q.issues.join(' '):'Marker, fokus, cahaya, resolusi, dan geometri tampak layak.';
}
function drawSource(){
  const a=alignment(),s=scaleDiagnostics();
  $('alignment').textContent=!a?'Pilih empat marker untuk memeriksa geometri.':a.retake?`Geometri perlu diperbaiki · skor ${a.score}/100. Periksa titik atau ambil ulang dari atas.`:`Geometri bidang baik · skor ${a.score}/100${s?` · skala pra-rektifikasi X ${s.pxPerMmX.toFixed(2)}, Y ${s.pxPerMmY.toFixed(2)} px/mm · selisih ${s.differencePct.toFixed(1)}%`:''}. Koreksi berlaku pada bidang kertas.`;
  if(!original)return;
  ctx.putImageData(original,0,0);
  if(points.length){
    ctx.strokeStyle='#00a977';ctx.lineWidth=Math.max(2,source.width/700);ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));if(points.length===4)ctx.closePath();ctx.stroke();
  }
  points.forEach((p,i)=>{ctx.fillStyle='#17324d';ctx.beginPath();ctx.arc(...p,Math.max(6,source.width/170),0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font=`bold ${Math.max(11,source.width/90)}px system-ui`;ctx.fillText(i+1,p[0]-4,p[1]+5);});
  $('rectify').disabled=points.length!==4;$('undo').disabled=!points.length;updateQuality();
}
function coordinateInputs(){
  const root=$('coordinates');root.replaceChildren();
  points.forEach((p,i)=>{const group=document.createElement('div');for(let axis=0;axis<2;axis++){const label=document.createElement('label');label.textContent=`T${i+1} ${axis?'Y':'X'} `;const input=document.createElement('input');input.type='number';input.min=0;input.max=(axis?source.height:source.width)-1;input.step='.1';input.value=p[axis].toFixed(1);input.onchange=()=>{const v=Number(input.value);if(!Number.isFinite(v)||v<0||v>Number(input.max)){input.value=p[axis].toFixed(1);return;}points[i][axis]=v;invalidateResult();drawSource();};label.append(input);group.append(label);}root.append(group);});
}
function pointAt(e,c){const r=c.getBoundingClientRect();return[(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height];}
source.addEventListener('click',e=>{
  if(!original||points.length===4)return;points.push(pointAt(e,source));invalidateResult();drawSource();coordinateInputs();
  tell(points.length===4?'Empat marker dipilih. Periksa geometri lalu luruskan.':`Marker ${points.length} dipilih.`);
});
function detect(){
  if(!original)return;
  try{points=detectMarkers(original);invalidateResult();drawSource();coordinateInputs();tell('Empat marker ditemukan otomatis. Periksa pusat marker dan Quality Gate.');}
  catch(error){points=[];drawSource();coordinateInputs();tell(error.message);}
}
function applyLensToRaw(){
  if(!rawOriginal)return;
  original=undistortImageData(rawOriginal,currentLens());source.width=original.width;source.height=original.height;ctx.putImageData(original,0,0);points=[];invalidateResult();detect();
}
async function fileToImageData(file){
  if(file.size>35*1024*1024)throw Error('Ukuran foto maksimal 35 MB.');
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();img.src=url;await img.decode();
    const scale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement('canvas');c.width=Math.max(2,Math.round(img.naturalWidth*scale));c.height=Math.max(2,Math.round(img.naturalHeight*scale));
    const cctx=c.getContext('2d',{willReadFrequently:true});cctx.drawImage(img,0,0,c.width,c.height);return cctx.getImageData(0,0,c.width,c.height);
  }finally{URL.revokeObjectURL(url);}
}
async function loadFile(file,{fromBatch=false}={}){
  if(!file)return;currentFile=file;tell('Memproses '+file.name+'…');
  try{
    rawOriginal=await fileToImageData(file);original=undistortImageData(rawOriginal,currentLens());
    source.width=original.width;source.height=original.height;ctx.putImageData(original,0,0);filename=safeName(file.name);points=[];invalidateResult();
    $('detect').disabled=$('manual').disabled=false;$('scanCode').disabled=false;
    if(!fieldContext&&!$('sampleId').value.trim())$('sampleId').value=filename;
    detect();updateBatchControls();if(!fromBatch)window.scrollTo({top:$('qualityGate').getBoundingClientRect().top+scrollY-90,behavior:'smooth'});
  }catch(error){tell('Foto tidak dapat diproses: '+error.message);}
}
async function setBatch(files){
  batchFiles=Array.from(files||[]);batchIndex=batchFiles.length?0:-1;updateBatchControls();if(batchIndex>=0)await loadFile(batchFiles[0],{fromBatch:true});
}
function updateBatchControls(){
  $('batchPosition').textContent=batchFiles.length?`${batchIndex+1} / ${batchFiles.length}`:'0 / 0';
  $('prevPhoto').disabled=batchIndex<=0;$('nextPhoto').disabled=batchIndex<0||batchIndex>=batchFiles.length-1;$('processBatch').disabled=batchBusy||!!fieldContext||!batchFiles.length;
}
async function moveBatch(delta){
  const next=batchIndex+delta;if(next<0||next>=batchFiles.length)return;batchIndex=next;$('sampleId').value='';await loadFile(batchFiles[batchIndex],{fromBatch:true});
}
async function scanSampleCode(){
  if(!original)return;
  if(!('BarcodeDetector' in window)){tell('Browser ini belum mendukung BarcodeDetector. Masukkan ID sampel secara manual.');return;}
  try{
    const formats=await BarcodeDetector.getSupportedFormats(),wanted=['qr_code','data_matrix','code_128'].filter(x=>formats.includes(x));
    const detector=new BarcodeDetector({formats:wanted.length?wanted:formats}),codes=await detector.detect(source);
    if(!codes.length)throw Error('QR/barcode tidak ditemukan pada foto.');
    $('sampleId').value=codes[0].rawValue.slice(0,64);tell('ID sampel terbaca: '+$('sampleId').value);
  }catch(error){tell(error.message||'Kode tidak dapat dibaca.');}
}

function rectify(){
  if(!original||points.length!==4)return;
  const p=getProfile();tell('Meluruskan citra…');
  try{
    const h=homography(points,p.activeWidth,p.activeHeight),w=Math.round(p.activeWidth*PPM),hgt=Math.round(p.activeHeight*PPM),out=new ImageData(w,hgt);
    for(let y=0;y<hgt;y++)for(let x=0;x<w;x++){
      const [u,v]=project(h,(x+.5)/PPM,(y+.5)/PPM),k=4*(y*w+x);
      if(!bilinearSample(original,u,v,out.data,k))throw Error('Bidang keluar foto. Periksa marker.');
    }
    result.width=w;result.height=hgt;cleanResult=out;activeMask=null;activeObjects=[];measurePoints=[];activeMeasurement=null;rctx.putImageData(cleanResult,0,0);
    const rawScale=scaleDiagnostics();
    calibration={
      version:4,tool:'Agrotik Pengukur',paper:p,pixelsPerMm:PPM,sourcePixels:[original.width,original.height],sourcePoints:points.map(x=>[...x]),
      outputPixels:[w,hgt],mappingOutputMmToSourcePixels:h,lensProfile:currentLens(),quality,rawScale,geometryScope:'paper-plane-only',
      colorCorrection:{applied:false,type:null},createdAt:new Date().toISOString()
    };
    $('download').disabled=$('metadata').disabled=$('normalizeColor').disabled=$('colorChecker').disabled=$('detectAllObjects').disabled=false;
    $('saveAllObjects').disabled=true;
    $('resultInfo').textContent=`${p.name} · area marker ${p.activeWidth} × ${p.activeHeight} mm · ${w} × ${hgt}px · ${PPM} px/mm${rawScale?` · X/Y awal Δ ${rawScale.differencePct.toFixed(1)}%`:''}`;
    $('distance').textContent='Pilih mode pengukuran lalu titik pada hasil.';tell('Kalibrasi selesai. Mulai pengukuran atau segmentasi objek.');
    return true;
  }catch(error){tell(error.message);return false;}
}
function drawResult(){
  if(!cleanResult)return;
  rctx.putImageData(activeMask?overlayMask(cleanResult,activeMask):cleanResult,0,0);
  if(activeObjects.length){
    rctx.font=`bold ${Math.max(12,result.width/85)}px system-ui`;rctx.textAlign='center';rctx.textBaseline='middle';
    activeObjects.forEach((o,i)=>{const x=o.metrics.centroid[0]*PPM,y=o.metrics.centroid[1]*PPM;rctx.fillStyle='#17324d';rctx.beginPath();rctx.arc(x,y,Math.max(9,result.width/160),0,Math.PI*2);rctx.fill();rctx.fillStyle='#fff';rctx.fillText(String(i+1),x,y);});
  }
  if(colorPickMode&&colorPatchPoints.length){
    rctx.font=`bold ${Math.max(12,result.width/90)}px system-ui`;rctx.textAlign='left';
    colorPatchPoints.forEach((p,i)=>{rctx.fillStyle='#ffb000';rctx.beginPath();rctx.arc(...p,Math.max(5,result.width/260),0,Math.PI*2);rctx.fill();rctx.fillStyle='#111';rctx.fillText(String(i+1),p[0]+8,p[1]-8);});
  }
  if(!measurePoints.length)return;
  rctx.lineWidth=Math.max(2,result.width/600);rctx.strokeStyle='#00a977';rctx.fillStyle='#00a977';
  measurePoints.forEach(p=>{rctx.beginPath();rctx.arc(...p,Math.max(4,result.width/300),0,Math.PI*2);rctx.fill();});
  if(measurePoints.length>1){rctx.beginPath();rctx.moveTo(...measurePoints[0]);for(let i=1;i<measurePoints.length;i++)rctx.lineTo(...measurePoints[i]);if(mode==='polygon'&&activeMeasurement)rctx.closePath();rctx.stroke();}
}
function distanceMm(a,b){return Math.hypot(b[0]-a[0],b[1]-a[1])/PPM;}
function polygonMetrics(points){
  let a=0,p=0;for(let i=0;i<points.length;i++){const q=points[(i+1)%points.length],r=points[i];a+=r[0]*q[1]-q[0]*r[1];p+=Math.hypot(q[0]-r[0],q[1]-r[1]);}
  return {area:Math.abs(a)/2/(PPM*PPM),perimeter:p/PPM};
}
function pathLength(points){let d=0;for(let i=1;i<points.length;i++)d+=distanceMm(points[i-1],points[i]);return d;}
function angleDeg(a,b,c){
  const u=[a[0]-b[0],a[1]-b[1]],v=[c[0]-b[0],c[1]-b[1]],den=Math.hypot(...u)*Math.hypot(...v);if(!den)return 0;
  return Math.acos(clamp((u[0]*v[0]+u[1]*v[1])/den,-1,1))*180/Math.PI;
}
function setActiveMeasurement(value){
  activeMeasurement=value;$('saveMeasurement').disabled=!value;$('cancelMeasure').disabled=!measurePoints.length&&!activeMask;
  if(!value)return;
  $('distance').textContent=value.display+(value.clipped?' · ⚠ objek menyentuh batas area':'');
  $('referenceValue').placeholder='acuan dalam '+(value.unit||'unit yang sama');
  if(value.metrics){
    $('morphologyCard').hidden=false;
    const m=value.metrics,c=value.color;
    let html=`<div><small>Area</small><b>${m.area.toFixed(2)} mm²</b></div><div><small>Perimeter</small><b>${m.perimeter.toFixed(2)} mm</b></div><div><small>Width × Height</small><b>${m.width.toFixed(2)} × ${m.height.toFixed(2)} mm</b></div><div><small>Major / Minor</small><b>${m.major.toFixed(2)} / ${m.minor.toFixed(2)} mm</b></div><div><small>Feret / MinFeret</small><b>${m.feret.toFixed(2)} / ${m.minFeret.toFixed(2)} mm</b></div><div><small>Circularity</small><b>${m.circularity.toFixed(3)}</b></div><div><small>Solidity</small><b>${m.solidity.toFixed(3)}</b></div><div><small>Aspect ratio</small><b>${m.aspectRatio.toFixed(3)}</b></div>`;
    if(c)html+=`<div><small>Mean RGB</small><b>${c.r.toFixed(0)} / ${c.g.toFixed(0)} / ${c.b.toFixed(0)}</b></div><div><small>HSV</small><b>${c.h.toFixed(1)}° / ${c.s.toFixed(1)} / ${c.v.toFixed(1)}</b></div><div><small>CIELAB</small><b>${c.lab.map(x=>x.toFixed(1)).join(' / ')}</b></div>`;
    $('morphologyCard').innerHTML=html;
  }else $('morphologyCard').hidden=true;
}
function resetMeasurement(){
  measurePoints=[];activeMeasurement=null;activeMask=null;activeObjects=[];colorPickMode=false;colorPatchPoints=[];$('finishShape').disabled=true;$('cancelMeasure').disabled=true;$('saveMeasurement').disabled=true;$('saveAllObjects').disabled=true;$('morphologyCard').hidden=true;
  if(cleanResult){rctx.putImageData(cleanResult,0,0);$('distance').textContent='Pilih titik pengukuran.';}
}
function setMode(next){
  mode=next;resetMeasurement();document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('objectPreset').disabled=mode!=='object';$('segmentThreshold').disabled=mode!=='object';
  tell(mode==='object'?'Klik bagian dalam objek atau gunakan Deteksi semua objek.':'Mode '+mode+' aktif.');
}
function resultClick(e){
  if(!cleanResult)return;const p=pointAt(e,result);
  if(colorPickMode){
    colorPatchPoints.push(p);drawResult();
    if(colorPatchPoints.length<6){tell(`ColorChecker: pilih patch netral ${colorPatchPoints.length+1}/6, urut dari paling terang ke paling gelap.`);return;}
    try{
      const normalized=normalizeSamplePoints(cleanResult,colorPatchPoints);cleanResult=normalized.image;calibration.colorCorrection={applied:true,type:'colorchecker-neutral-row',fits:normalized.fits,points:colorPatchPoints.map(x=>[...x])};
      colorPickMode=false;colorPatchPoints=[];resetMeasurement();rctx.putImageData(cleanResult,0,0);tell('Normalisasi ColorChecker 6 netral diterapkan. Ini menormalkan respons netral, bukan profil warna spektrofotometrik penuh.');
    }catch(error){colorPickMode=false;colorPatchPoints=[];tell('Kalibrasi ColorChecker gagal: '+error.message);drawResult();}
    return;
  }
  if(mode==='object'){
    try{
      const threshold=Number($('segmentThreshold').value),mask=segmentObject(cleanResult,p[0],p[1],threshold),m=morphology(mask,result.width,result.height,PPM),col=colorStats(cleanResult,mask);
      let clipped=false;for(let x=0;x<result.width;x++)if(mask[x]||mask[(result.height-1)*result.width+x]){clipped=true;break;}if(!clipped)for(let y=0;y<result.height;y++)if(mask[y*result.width]||mask[y*result.width+result.width-1]){clipped=true;break;}
      activeMask=mask;activeObjects=[];measurePoints=[p];setActiveMeasurement({type:'object',label:'Objek',primaryValue:m.area,unit:'mm²',display:`Objek: area ${m.area.toFixed(2)} mm² · Feret ${m.feret.toFixed(2)} mm`,metrics:m,color:col,clipped,preset:$('objectPreset').value});drawResult();
      if(clipped)tell('Objek menyentuh batas citra; ukuran dapat terpotong. Ambil ulang atau pilih objek lain.');
    }catch(error){tell(error.message);}
    return;
  }
  measurePoints.push(p);$('cancelMeasure').disabled=false;
  if(['length','width','diameter'].includes(mode)&&measurePoints.length===2){
    const d=distanceMm(measurePoints[0],measurePoints[1]),label={length:'Panjang',width:'Lebar',diameter:'Diameter'}[mode];
    setActiveMeasurement({type:mode,label,primaryValue:d,unit:'mm',display:`${label}: ${d.toFixed(2)} mm (${(d/10).toFixed(2)} cm)`});
  }else if(mode==='angle'&&measurePoints.length===3){
    const a=angleDeg(measurePoints[0],measurePoints[1],measurePoints[2]);setActiveMeasurement({type:'angle',label:'Sudut',primaryValue:a,unit:'°',display:`Sudut: ${a.toFixed(2)}°`});
  }else if(mode==='polyline'){$('finishShape').disabled=measurePoints.length<2;$('distance').textContent=`Garis: ${pathLength(measurePoints).toFixed(2)} mm sementara · tambah titik atau Selesaikan.`;}
  else if(mode==='polygon'){$('finishShape').disabled=measurePoints.length<3;$('distance').textContent=`Polygon: ${measurePoints.length} titik · tambah titik atau Selesaikan.`;}
  else $('distance').textContent='Pilih titik berikutnya.';
  drawResult();
}
function finishShape(){
  if(mode==='polyline'&&measurePoints.length>=2){
    const d=pathLength(measurePoints);setActiveMeasurement({type:'polyline',label:'Garis lengkung',primaryValue:d,unit:'mm',display:`Panjang garis: ${d.toFixed(2)} mm`});
  }else if(mode==='polygon'&&measurePoints.length>=3){
    const m=polygonMetrics(measurePoints);setActiveMeasurement({type:'polygon',label:'Area polygon',primaryValue:m.area,unit:'mm²',display:`Area: ${m.area.toFixed(2)} mm² · keliling ${m.perimeter.toFixed(2)} mm`,metrics:{area:m.area,perimeter:m.perimeter}});
  }
  $('finishShape').disabled=true;drawResult();
}
function makeRecord(measurement,sampleId){
  const ref=Number($('referenceValue').value);
  return {id:'m-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),sampleId,photo:filename,type:measurement.type,label:measurement.label,
    primaryValue:Number(measurement.primaryValue),unit:measurement.unit,metrics:measurement.metrics||null,color:measurement.color||null,clipped:!!measurement.clipped,preset:measurement.preset||null,
    referenceValue:Number.isFinite(ref)?ref:null,research:researchMeta(),paper:getProfile().name,quality:quality?.score??null,at:new Date().toISOString()};
}
function saveMeasurement(){
  if(!activeMeasurement)return;
  const sampleId=$('sampleId').value.trim()||filename,record=makeRecord(activeMeasurement,sampleId);
  records.push(record);records=records.slice(-500);persistRecords();renderRecords();tell('Pengukuran disimpan untuk '+sampleId+'.');$('referenceValue').value='';resetMeasurement();
}
function detailText(r){
  if(!r.metrics)return '';
  const m=r.metrics,items=[];for(const [k,v] of Object.entries(m))if(typeof v==='number'&&Number.isFinite(v)&&!['pixels'].includes(k))items.push(`${k}=${v.toFixed(2)}`);
  return items.slice(0,6).join(' · ');
}
function renderRecords(){
  $('recordCount').textContent=records.length+' pengukuran';$('clearRecords').disabled=!records.length;$('exportCsv').disabled=!records.length;$('exportXls').disabled=!records.length;$('sendStat').disabled=!records.length;$('sendField').hidden=!fieldContext||!records.length;
  const body=$('recordBody');
  body.innerHTML=records.length?records.slice().reverse().map(r=>`<tr><td>${esc(r.sampleId)}</td><td>${esc(r.photo)}</td><td>${esc(r.label)}</td><td><b>${Number(r.primaryValue).toFixed(2)}</b> ${esc(r.unit)}${r.clipped?' ⚠':''}</td><td class="detail-cell">${esc(detailText(r))}</td><td><button data-delete-record="${r.id}" aria-label="Hapus">×</button></td></tr>`).join(''):'<tr><td colspan="6">Belum ada pengukuran.</td></tr>';
  body.querySelectorAll('[data-delete-record]').forEach(btn=>btn.onclick=()=>{records=records.filter(r=>r.id!==btn.dataset.deleteRecord);persistRecords();renderRecords();});
  const reps=repeatability(records),root=$('repeatability');
  root.innerHTML=reps.length?'<b>Repeatability</b>'+reps.slice(-12).map(r=>`<span>${esc(r.key.split('|')[0])} · ${esc(r.key.split('|')[1])}: n=${r.n}, mean ${r.mean.toFixed(2)}, SD ${r.sd.toFixed(2)}, CV ${r.cv===null?'—':r.cv.toFixed(1)+'%'}</span>`).join(''):'';
  const vals=validationSummary(records),vr=$('validation');
  vr.innerHTML=vals.length?'<b>Validasi terhadap nilai acuan</b>'+vals.map(v=>`<span>${esc(v.key)} · n=${v.n} · MAE ${v.mae.toFixed(2)} · RMSE ${v.rmse.toFixed(2)} · bias ${v.bias.toFixed(2)} · R² ${v.r2===null?'—':v.r2.toFixed(3)} · CV(RMSE) ${v.cvRmse===null?'—':v.cvRmse.toFixed(1)+'%'}</span>`).join(''):'';
}
function exportValues(r){
  const m=r.metrics||{},co=r.color||{},re=r.research||{};
  return [r.sampleId,r.photo,r.type,r.primaryValue,r.unit,m.area,m.perimeter,m.width,m.height,m.major,m.minor,m.feret,m.minFeret,m.circularity,m.solidity,m.aspectRatio,
    co.r,co.g,co.b,co.h,co.s,co.v,co.lab?.[0],co.lab?.[1],co.lab?.[2],r.clipped?'1':'0',r.quality,r.referenceValue,re.experiment,re.genotype,re.treatment,re.replication,re.harvest,re.operator,r.paper,r.at];
}
const EXPORT_COLS=['sample_id','photo','type','value','unit','area_mm2','perimeter_mm','width_mm','height_mm','major_mm','minor_mm','feret_mm','minferet_mm','circularity','solidity','aspect_ratio','mean_r','mean_g','mean_b','hue_deg','saturation_pct','value_pct','lab_l','lab_a','lab_b','clipped','quality','reference','experiment','genotype','treatment','replication','harvest','operator','paper','timestamp'];
function csv(){
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  return [EXPORT_COLS.join(','),...records.map(r=>exportValues(r).map(quote).join(','))].join('\n');
}
function excelHtml(){
  const row=cells=>'<tr>'+cells.map(v=>'<td>'+esc(v??'')+'</td>').join('')+'</tr>';
  return '<!doctype html><html><head><meta charset="utf-8"></head><body><table>'+row(EXPORT_COLS)+records.map(r=>row(exportValues(r))).join('')+'</table></body></html>';
}

function normalizeColor(){
  if(!cleanResult)return;
  try{
    const p=getProfile(),rects=grayPatchRects(p).map(r=>({...r,x:r.x*PPM,y:r.y*PPM,width:r.width*PPM,height:r.height*PPM})),normalized=normalizeGrayPatches(cleanResult,rects);
    cleanResult=normalized.image;calibration.colorCorrection={applied:true,type:'relative-gray-strip',fits:normalized.fits};resetMeasurement();rctx.putImageData(cleanResult,0,0);tell('Normalisasi warna relatif diterapkan. Gunakan hanya untuk perbandingan dengan lembar cetak yang sama.');
  }catch(error){tell('Normalisasi warna gagal: '+error.message);}
}
function startColorChecker(){
  if(!cleanResult)return;colorPickMode=true;colorPatchPoints=[];measurePoints=[];activeMask=null;activeObjects=[];$('saveAllObjects').disabled=true;drawResult();
  tell('ColorChecker: klik enam patch netral dari paling terang ke paling gelap.');
}
function detectAllObjects(){
  if(!cleanResult)return 0;
  try{
    const p=getProfile(),preset=$('objectPreset').value,minArea={general:4,leaf:12,fruit:5,seed:.8,cob:35}[preset]||4;
    const roi={x:12*PPM,y:18*PPM,width:Math.max(20,(p.activeWidth-24)*PPM),height:Math.max(20,(p.activeHeight-70)*PPM)};
    const found=segmentObjects(cleanResult,{roi,threshold:Number($('segmentThreshold').value),minPixels:Math.max(15,Math.round(minArea*PPM*PPM)),maxObjects:120,ppm:PPM});
    activeObjects=found.objects;activeMask=found.mask;measurePoints=[];activeMeasurement=null;colorPickMode=false;colorPatchPoints=[];
    $('saveMeasurement').disabled=true;$('saveAllObjects').disabled=!activeObjects.length;$('cancelMeasure').disabled=!activeObjects.length;
    const clipped=activeObjects.filter(o=>o.clipped).length;
    $('distance').textContent=activeObjects.length?`${activeObjects.length} objek terdeteksi${clipped?` · ${clipped} menyentuh batas area (periksa)`:''}. Nomor mengikuti posisi atas→bawah, kiri→kanan.`:'Tidak ada objek yang lolos kriteria. Sesuaikan preset/threshold.';
    $('morphologyCard').hidden=!activeObjects.length;
    if(activeObjects.length){const areas=activeObjects.map(o=>o.metrics.area);$('morphologyCard').innerHTML=`<div><small>Jumlah objek</small><b>${activeObjects.length}</b></div><div><small>Area rata-rata</small><b>${(areas.reduce((a,b)=>a+b,0)/areas.length).toFixed(2)} mm²</b></div><div><small>Area min–maks</small><b>${Math.min(...areas).toFixed(2)}–${Math.max(...areas).toFixed(2)} mm²</b></div><div><small>Terpotong</small><b>${clipped}</b></div>`;}
    drawResult();tell(activeObjects.length?'Deteksi multiobjek selesai. Periksa overlay sebelum Simpan semua objek.':'Tidak ada objek terdeteksi. Coba ubah threshold atau preset.');return activeObjects.length;
  }catch(error){tell('Deteksi multiobjek gagal: '+error.message);return 0;}
}
function saveAllObjects({silent=false}={}){
  if(!activeObjects.length)return 0;const base=$('sampleId').value.trim()||filename,research=researchMeta(),now=Date.now();
  const next=activeObjects.map((o,i)=>({id:'m-'+now+'-'+i+'-'+Math.random().toString(36).slice(2,5),sampleId:`${base}-O${String(i+1).padStart(3,'0')}`,photo:filename,type:'object',label:'Objek',
    primaryValue:o.metrics.area,unit:'mm²',metrics:o.metrics,color:o.color,clipped:!!o.clipped,preset:$('objectPreset').value,referenceValue:null,research,paper:getProfile().name,quality:quality?.score??null,at:new Date().toISOString()}));
  records.push(...next);records=records.slice(-500);persistRecords();renderRecords();const n=next.length;resetMeasurement();if(!silent)tell(n+' objek disimpan sebagai sampel terpisah.');return n;
}
async function processBatchAutomatic(){
  if(batchBusy||!batchFiles.length||fieldContext)return;batchBusy=true;updateBatchControls();let ok=0,fail=0,objects=0;
  for(let i=0;i<batchFiles.length;i++){
    batchIndex=i;$('sampleId').value='';await loadFile(batchFiles[i],{fromBatch:true});
    if(points.length!==4){fail++;continue;}
    if(!rectify()){fail++;continue;}
    const n=detectAllObjects();if(n){objects+=saveAllObjects({silent:true});ok++;}else fail++;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  batchBusy=false;updateBatchControls();tell(`Batch selesai · ${ok} foto berhasil · ${objects} objek tersimpan · ${fail} foto perlu diperiksa manual.`);
}
function sendStat(){
  try{const out=measurementsToStatistics(localStorage,records);tell(`${out.rowCount} baris dikirim ke dataset ${out.dataset} di /stat.`);window.open('/stat/','_blank','noopener');}
  catch(error){tell('Gagal mengirim ke /stat: '+error.message);}
}
function calibratedBlob(callback){
  if(!cleanResult)return callback(null);const c=document.createElement('canvas');c.width=result.width;c.height=result.height;c.getContext('2d').putImageData(cleanResult,0,0);c.toBlob(callback,'image/png');
}
function resolveFieldValue(record,param){
  const p=String(param||'').toLowerCase(),m=record.metrics||{};
  if(/luas|area/.test(p)&&Number.isFinite(m.area))return[m.area,'mm²'];
  if(/keliling|perim/.test(p)&&Number.isFinite(m.perimeter))return[m.perimeter,'mm'];
  if(/feret/.test(p)&&!/(min|minor)/.test(p)&&Number.isFinite(m.feret))return[m.feret,'mm'];
  if(/minferet|min feret/.test(p)&&Number.isFinite(m.minFeret))return[m.minFeret,'mm'];
  if(/lebar|width/.test(p)&&Number.isFinite(m.width))return[m.width,'mm'];
  if(/tinggi|height/.test(p)&&Number.isFinite(m.height))return[m.height,'mm'];
  if(/circ/.test(p)&&Number.isFinite(m.circularity))return[m.circularity,''];
  return[record.primaryValue,record.unit];
}
function incrementSampleId(value){
  const m=String(value).match(/^(.*?)(\d+)$/);if(!m)return value;return m[1]+String(Number(m[2])+1).padStart(m[2].length,'0');
}
function sendField(){
  if(!fieldContext||!records.length)return;const r=records[records.length-1],[value,unit]=resolveFieldValue(r,fieldContext.parameter);
  const detail={type:'agrotik-field-handoff',kind:'measurement',dataset:fieldContext.dataset,plot_uid:fieldContext.plot_uid,plot_label:fieldContext.plot_label,
    parameter:fieldContext.parameter,session_id:fieldContext.session_id,sample_id:r.sampleId,value:String(Number(value).toFixed(4)).replace(/0+$/,'').replace(/\.$/,''),unit,measurement:r,at:new Date().toISOString()};
  try{localStorage.setItem(FIELD_HANDOFF_KEY,JSON.stringify(detail));}catch{}
  try{window.opener?.postMessage({type:'agrotik-field-handoff',detail},location.origin);window.opener?.focus?.();}catch{}
  tell('Hasil dikirim ke plot '+(fieldContext.plot_label||'aktif')+' · '+detail.value+' '+unit);
  $('sampleId').value=incrementSampleId($('sampleId').value);
}

restoreSettings();refreshPaper();renderRecords();
if(fieldContext?.plot_label){$('sampleId').value=(fieldContext.plot_label||'plot')+'-S01';tell('Mode plot '+fieldContext.plot_label+' · '+(fieldContext.parameter||'parameter pengukuran')+'.');}

$('paperSize').onchange=refreshPaper;$('orientation').onchange=refreshPaper;
['customWidth','customHeight','customMargin'].forEach(id=>$(id).onchange=refreshPaper);
$('downloadCalibrator').onclick=()=>{const p=getProfile();downloadBlob(new Blob([buildCalibratorSvg(p)],{type:'image/svg+xml'}),`kalibrator-${p.name.toLowerCase().replace(/\W+/g,'-')}-${p.orientation}.svg`);};
$('upload').onchange=e=>setBatch(e.target.files);
$('capture').onchange=e=>{const f=e.target.files?.[0];if(f){batchFiles=[f];batchIndex=0;loadFile(f);}e.target.value='';};
$('prevPhoto').onclick=()=>moveBatch(-1);$('nextPhoto').onclick=()=>moveBatch(1);
$('detect').onclick=detect;$('manual').onclick=()=>{points=[];invalidateResult();drawSource();coordinateInputs();tell('Pilih marker kiri atas terlebih dahulu.');};$('undo').onclick=()=>{points.pop();invalidateResult();drawSource();coordinateInputs();};
$('scanCode').onclick=scanSampleCode;$('rectify').onclick=rectify;
$('saveLens').onclick=()=>{const lens=currentLens();saveSettings({lens});tell('Profil lensa disimpan di perangkat ini.');if(rawOriginal)applyLensToRaw();};
$('resetLens').onclick=()=>{$('lensK1').value=0;$('lensK2').value=0;saveSettings({lens:currentLens()});if(rawOriginal)applyLensToRaw();};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$('segmentThreshold').oninput=()=>{$('thresholdValue').textContent=$('segmentThreshold').value;if(mode==='object'&&(measurePoints.length||activeObjects.length)){activeMask=null;activeMeasurement=null;activeObjects=[];measurePoints=[];$('saveAllObjects').disabled=true;drawResult();}};
$('objectPreset').onchange=()=>{const map={general:46,leaf:38,fruit:50,seed:42,cob:55};$('segmentThreshold').value=map[$('objectPreset').value]||46;$('thresholdValue').textContent=$('segmentThreshold').value;};
result.addEventListener('click',resultClick);$('finishShape').onclick=finishShape;$('cancelMeasure').onclick=resetMeasurement;$('saveMeasurement').onclick=saveMeasurement;
$('normalizeColor').onclick=normalizeColor;$('colorChecker').onclick=startColorChecker;$('detectAllObjects').onclick=detectAllObjects;$('saveAllObjects').onclick=()=>saveAllObjects();
$('download').onclick=()=>calibratedBlob(blob=>downloadBlob(blob,filename+'-calibrated.png'));
$('metadata').onclick=()=>{if(calibration)downloadBlob(new Blob([JSON.stringify({...calibration,records:records.filter(r=>r.photo===filename)},null,2)],{type:'application/json'}),filename+'-calibration.json');};
$('exportCsv').onclick=()=>downloadBlob(new Blob([csv()],{type:'text/csv;charset=utf-8'}),'pengukuran-'+new Date().toISOString().slice(0,10)+'.csv');
$('exportXls').onclick=()=>downloadBlob(new Blob([excelHtml()],{type:'application/vnd.ms-excel;charset=utf-8'}),'pengukuran-'+new Date().toISOString().slice(0,10)+'.xls');
$('sendStat').onclick=sendStat;$('processBatch').onclick=processBatchAutomatic;
$('clearRecords').onclick=()=>{if(confirm('Hapus seluruh riwayat pengukuran lokal?')){records=[];persistRecords();renderRecords();}};
$('sendField').onclick=sendField;
RESEARCH_IDS.forEach(id=>$(id)?.addEventListener('change',saveResearch));

installLiveCamera({onCapture:file=>{batchFiles=[file];batchIndex=0;loadFile(file);},getProfile,onQuality:q=>quality=q});
setMode('length');
