import {PAPER_SIZES,paperProfile,buildCalibratorSvg,grayPatchRects} from './paper.js';
import {PPM,homography,project,detectMarkers,bilinearSample} from './geometry.js';
import {alignmentCheck} from './alignment.js';
import {installLiveCamera} from './live-camera.js';
import {imageQuality,undistortImageData,segmentObject,morphology,overlayMask,normalizeGrayPatches,repeatability} from './image-tools.js';

const $=id=>document.getElementById(id);
const source=$('source'),result=$('result'),ctx=source.getContext('2d',{willReadFrequently:true}),rctx=result.getContext('2d');
const SETTINGS_KEY='agrotik_pengukur_settings_v3',RECORDS_KEY='ukur_rows_v3',FIELD_HANDOFF_KEY='agrotik_field_handoff_v1';
let rawOriginal=null,original=null,points=[],cleanResult=null,calibration=null,filename='foto',batchFiles=[],batchIndex=-1;
let mode='length',measurePoints=[],activeMeasurement=null,activeMask=null,quality=null,currentFile=null;
let records=loadRecords();

const fieldParams=new URLSearchParams(location.search);
const fieldContext=fieldParams.get('agrotik')==='field'?{
  dataset:fieldParams.get('dataset')||'',plot_uid:fieldParams.get('plot_uid')||'',plot_label:fieldParams.get('plot_label')||'',
  parameter:fieldParams.get('parameter')||'',session_id:fieldParams.get('session_id')||''
}:null;

function tell(message){$('status').textContent=message;}
function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function safeName(value){return String(value||'foto').replace(/.[^.]+$/,'').replace(/[^p{L}p{N}_-]/gu,'_')||'foto';}
function settings(){
  try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');}catch{return{};}
}
function saveSettings(patch){
  const next={...settings(),...patch};try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(next));}catch{}return next;
}
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
  $('printCalibrator').href='./kalibrator.html?'+q.toString();
  saveSettings({paper:$('paperSize').value,orientation:p.orientation,custom});
  if(original&&points.length===4){drawSource();updateQuality();}
}
function downloadBlob(blob,name){
  if(!blob)return tell('File gagal dibuat.');
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1600);
}
function invalidateResult(){
  cleanResult=null;calibration=null;measurePoints=[];activeMeasurement=null;activeMask=null;result.width=0;result.height=0;
  $('download').disabled=$('metadata').disabled=$('normalizeColor').disabled=true;
  $('saveMeasurement').disabled=true;$('finishShape').disabled=true;$('cancelMeasure').disabled=true;$('morphologyCard').hidden=true;
  $('resultInfo').textContent='Hasil perlu dihitung ulang setelah marker, kertas, atau profil lensa berubah.';
  $('distance').textContent='Pilih mode lalu titik pada gambar.';
}
function alignment(){
  const p=getProfile();return alignmentCheck(points,p.activeWidth/p.activeHeight);
}
function updateQuality(){
  if(!original)return;
  const a=alignment(),q=imageQuality(original,points.length===4?points:null,a);quality=q;
  const root=$('qualityGate'),status=q.score>=80?'BAIK':q.score>=62?'CUKUP':'ULANGI';
  root.dataset.level=status.toLowerCase();root.querySelector('strong').textContent=q.score+'/100 · '+status;
  root.querySelector('div').innerHTML=`<span>Fokus <b>${q.sharpness}</b></span><span>Cahaya <b>${q.exposure}</b></span><span>Resolusi <b>${q.resolution}</b></span><span>Geometri <b>${q.alignmentScore}</b></span>`;
  root.querySelector('p').textContent=q.issues.length?q.issues.join(' '):'Marker, fokus, cahaya, resolusi, dan geometri tampak layak.';
}
function drawSource(){
  const a=alignment();
  $('alignment').textContent=!a?'Pilih empat marker untuk memeriksa geometri.':a.retake?`Geometri perlu diperbaiki · skor ${a.score}/100. Periksa titik atau ambil ulang dari atas.`:`Geometri bidang baik · skor ${a.score}/100. Ini tidak menjamin objek 3D bebas paralaks.`;
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
  $('prevPhoto').disabled=batchIndex<=0;$('nextPhoto').disabled=batchIndex<0||batchIndex>=batchFiles.length-1;
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
    result.width=w;result.height=hgt;cleanResult=out;activeMask=null;measurePoints=[];activeMeasurement=null;rctx.putImageData(cleanResult,0,0);
    calibration={
      version:3,tool:'Agrotik Pengukur',paper:p,pixelsPerMm:PPM,sourcePixels:[original.width,original.height],sourcePoints:points.map(x=>[...x]),
      outputPixels:[w,hgt],mappingOutputMmToSourcePixels:h,lensProfile:currentLens(),quality,geometryScope:'paper-plane-only',
      colorCorrection:{applied:false,type:null},createdAt:new Date().toISOString()
    };
    $('download').disabled=$('metadata').disabled=$('normalizeColor').disabled=false;
    $('resultInfo').textContent=`${p.name} · area marker ${p.activeWidth} × ${p.activeHeight} mm · ${w} × ${hgt}px · ${PPM}px/mm`;
    $('distance').textContent='Pilih mode pengukuran lalu titik pada hasil.';tell('Kalibrasi selesai. Mulai pengukuran atau segmentasi objek.');
  }catch(error){tell(error.message);}
}
function drawResult(){
  if(!cleanResult)return;rctx.putImageData(activeMask?overlayMask(cleanResult,activeMask):cleanResult,0,0);
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
  $('distance').textContent=value.display;
  if(value.metrics){
    $('morphologyCard').hidden=false;
    const m=value.metrics;
    $('morphologyCard').innerHTML=`<div><small>Area</small><b>${m.area.toFixed(2)} mm²</b></div><div><small>Perimeter</small><b>${m.perimeter.toFixed(2)} mm</b></div><div><small>Width × Height</small><b>${m.width.toFixed(2)} × ${m.height.toFixed(2)} mm</b></div><div><small>Major / Minor</small><b>${m.major.toFixed(2)} / ${m.minor.toFixed(2)} mm</b></div><div><small>Feret / MinFeret</small><b>${m.feret.toFixed(2)} / ${m.minFeret.toFixed(2)} mm</b></div><div><small>Circularity</small><b>${m.circularity.toFixed(3)}</b></div><div><small>Solidity</small><b>${m.solidity.toFixed(3)}</b></div><div><small>Aspect ratio</small><b>${m.aspectRatio.toFixed(3)}</b></div>`;
  }else $('morphologyCard').hidden=true;
}
function resetMeasurement(){
  measurePoints=[];activeMeasurement=null;activeMask=null;$('finishShape').disabled=true;$('cancelMeasure').disabled=true;$('saveMeasurement').disabled=true;$('morphologyCard').hidden=true;
  if(cleanResult){rctx.putImageData(cleanResult,0,0);$('distance').textContent='Pilih titik pengukuran.';}
}
function setMode(next){
  mode=next;resetMeasurement();document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('objectPreset').disabled=mode!=='object';$('segmentThreshold').disabled=mode!=='object';
  tell(mode==='object'?'Klik bagian dalam objek. Gunakan threshold bila segmentasi terlalu sempit/lebar.':'Mode '+mode+' aktif.');
}
function resultClick(e){
  if(!cleanResult)return;const p=pointAt(e,result);
  if(mode==='object'){
    try{
      const threshold=Number($('segmentThreshold').value),mask=segmentObject(cleanResult,p[0],p[1],threshold),m=morphology(mask,result.width,result.height,PPM);
      activeMask=mask;measurePoints=[p];setActiveMeasurement({type:'object',label:'Objek',primaryValue:m.area,unit:'mm²',display:`Objek: area ${m.area.toFixed(2)} mm² · Feret ${m.feret.toFixed(2)} mm`,metrics:m,preset:$('objectPreset').value});drawResult();
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
function saveMeasurement(){
  if(!activeMeasurement)return;
  const sampleId=$('sampleId').value.trim()||filename,record={
    id:'m-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),sampleId,photo:filename,type:activeMeasurement.type,label:activeMeasurement.label,
    primaryValue:Number(activeMeasurement.primaryValue),unit:activeMeasurement.unit,metrics:activeMeasurement.metrics||null,preset:activeMeasurement.preset||null,
    paper:getProfile().name,quality:quality?.score??null,at:new Date().toISOString()
  };
  records.push(record);records=records.slice(-500);persistRecords();renderRecords();tell('Pengukuran disimpan untuk '+sampleId+'.');resetMeasurement();
}
function detailText(r){
  if(!r.metrics)return '';
  const m=r.metrics,items=[];for(const [k,v] of Object.entries(m))if(typeof v==='number'&&Number.isFinite(v)&&!['pixels'].includes(k))items.push(`${k}=${v.toFixed(2)}`);
  return items.slice(0,6).join(' · ');
}
function renderRecords(){
  $('recordCount').textContent=records.length+' pengukuran';$('clearRecords').disabled=!records.length;$('exportCsv').disabled=!records.length;$('sendField').hidden=!fieldContext||!records.length;
  const body=$('recordBody');
  body.innerHTML=records.length?records.slice().reverse().map(r=>`<tr><td>${esc(r.sampleId)}</td><td>${esc(r.photo)}</td><td>${esc(r.label)}</td><td><b>${Number(r.primaryValue).toFixed(2)}</b> ${esc(r.unit)}</td><td class="detail-cell">${esc(detailText(r))}</td><td><button data-delete-record="${r.id}" aria-label="Hapus">×</button></td></tr>`).join(''):'<tr><td colspan="6">Belum ada pengukuran.</td></tr>';
  body.querySelectorAll('[data-delete-record]').forEach(btn=>btn.onclick=()=>{records=records.filter(r=>r.id!==btn.dataset.deleteRecord);persistRecords();renderRecords();});
  const reps=repeatability(records),root=$('repeatability');
  root.innerHTML=reps.length?'<b>Repeatability</b>'+reps.slice(-12).map(r=>`<span>${esc(r.key.split('|')[0])} · ${esc(r.key.split('|')[1])}: n=${r.n}, mean ${r.mean.toFixed(2)}, CV ${r.cv===null?'—':r.cv.toFixed(1)+'%'}</span>`).join(''):'';
}
function csv(){
  const cols=['sample_id','photo','type','value','unit','area_mm2','perimeter_mm','width_mm','height_mm','major_mm','minor_mm','feret_mm','minferet_mm','circularity','solidity','aspect_ratio','quality','paper','timestamp'];
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  return [cols.join(','),...records.map(r=>[r.sampleId,r.photo,r.type,r.primaryValue,r.unit,r.metrics?.area,r.metrics?.perimeter,r.metrics?.width,r.metrics?.height,r.metrics?.major,r.metrics?.minor,r.metrics?.feret,r.metrics?.minFeret,r.metrics?.circularity,r.metrics?.solidity,r.metrics?.aspectRatio,r.quality,r.paper,r.at].map(quote).join(','))].join('\n');
}
function normalizeColor(){
  if(!cleanResult)return;
  try{
    const p=getProfile(),rects=grayPatchRects(p).map(r=>({...r,x:r.x*PPM,y:r.y*PPM,width:r.width*PPM,height:r.height*PPM})),normalized=normalizeGrayPatches(cleanResult,rects);
    cleanResult=normalized.image;calibration.colorCorrection={applied:true,type:'relative-gray-strip',fits:normalized.fits};resetMeasurement();rctx.putImageData(cleanResult,0,0);tell('Normalisasi warna relatif diterapkan. Gunakan hanya untuk perbandingan dengan lembar cetak yang sama.');
  }catch(error){tell('Normalisasi warna gagal: '+error.message);}
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
$('segmentThreshold').oninput=()=>{$('thresholdValue').textContent=$('segmentThreshold').value;if(mode==='object'&&measurePoints.length){activeMask=null;activeMeasurement=null;measurePoints=[];drawResult();}};
$('objectPreset').onchange=()=>{const map={general:46,leaf:38,fruit:50,seed:42,cob:55};$('segmentThreshold').value=map[$('objectPreset').value]||46;$('thresholdValue').textContent=$('segmentThreshold').value;};
result.addEventListener('click',resultClick);$('finishShape').onclick=finishShape;$('cancelMeasure').onclick=resetMeasurement;$('saveMeasurement').onclick=saveMeasurement;
$('normalizeColor').onclick=normalizeColor;
$('download').onclick=()=>calibratedBlob(blob=>downloadBlob(blob,filename+'-calibrated.png'));
$('metadata').onclick=()=>{if(calibration)downloadBlob(new Blob([JSON.stringify({...calibration,records:records.filter(r=>r.photo===filename)},null,2)],{type:'application/json'}),filename+'-calibration.json');};
$('exportCsv').onclick=()=>downloadBlob(new Blob([csv()],{type:'text/csv;charset=utf-8'}),'pengukuran-'+new Date().toISOString().slice(0,10)+'.csv');
$('clearRecords').onclick=()=>{if(confirm('Hapus seluruh riwayat pengukuran lokal?')){records=[];persistRecords();renderRecords();}};
$('sendField').onclick=sendField;

installLiveCamera({onCapture:file=>{batchFiles=[file];batchIndex=0;loadFile(file);},getProfile,onQuality:q=>quality=q});
setMode('length');
