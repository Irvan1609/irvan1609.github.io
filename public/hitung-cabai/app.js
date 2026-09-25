import {detectChiliBoxesFromImageData} from './detector.js';
import {detectChiliWithModel} from './ml-detector.js';
import {submitTrainingContribution,cloudContributionReady} from './cloud-sync.js?v=20260925-2';
import {upsertChiliCountToStatistics} from './stat-sync.js';
const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d'),viewport=$('viewport');
let image=null,photo='',boxes=[],predictedBoxes=[],history=[],start=null,draft=null,activeId=null,dirty=false,db;
let cameraStream=null,facingMode='environment',torchOn=false,detecting=false,contributing=false;
let predictionMethod='manual',modelVersion='heuristic-color-v1',detectionRun=false;
const DETECT_SETTINGS_KEY='chili-detect-settings-v1';

const status=message=>$('status').textContent=message;
const cloneBoxes=()=>boxes.map(box=>[...box]);
const nowName=()=>{
  const date=new Date(),pad=value=>String(value).padStart(2,'0');
  return `Cabai_${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

function openDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('chili-labels-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('samples',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
function transaction(mode,action){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('samples',mode),request=action(tx.objectStore('samples'));
    tx.oncomplete=()=>resolve(request?.result);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  });
}
function decodeImage(url){
  return new Promise((resolve,reject)=>{
    const next=new Image();
    next.onload=()=>resolve(next);
    next.onerror=()=>reject(Error('Foto tidak dapat dibaca.'));
    next.src=url;
  });
}
function readFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function blobToDataURL(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
async function optimizePhoto(dataURL){
  const source=await decodeImage(dataURL);
  const maxSide=3000,scale=Math.min(1,maxSide/Math.max(source.naturalWidth,source.naturalHeight));
  if(scale===1&&dataURL.length<9_000_000)return {url:dataURL,image:source};
  const temp=document.createElement('canvas');
  temp.width=Math.max(1,Math.round(source.naturalWidth*scale));
  temp.height=Math.max(1,Math.round(source.naturalHeight*scale));
  temp.getContext('2d',{alpha:false}).drawImage(source,0,0,temp.width,temp.height);
  const url=temp.toDataURL('image/jpeg',.92);
  return {url,image:await decodeImage(url)};
}

function readDetectSettings(){
  try{
    const saved=JSON.parse(localStorage.getItem(DETECT_SETTINGS_KEY)||'{}');
    return {
      target:['all','red','green'].includes(saved.target)?saved.target:'all',
      sensitivity:['strict','normal','sensitive'].includes(saved.sensitivity)?saved.sensitivity:'normal',
      onLoad:saved.onLoad!==false
    };
  }catch{return {target:'all',sensitivity:'normal',onLoad:true};}
}
function applyDetectSettings(){
  const saved=readDetectSettings();
  $('detectColor').value=saved.target;$('detectSensitivity').value=saved.sensitivity;$('detectOnLoad').checked=saved.onLoad;
}
function saveDetectSettings(){
  try{localStorage.setItem(DETECT_SETTINGS_KEY,JSON.stringify({target:$('detectColor').value,sensitivity:$('detectSensitivity').value,onLoad:$('detectOnLoad').checked}));}catch{}
}
function updateWorkflowState(){
  const hasImage=Boolean(image),hasName=Boolean($('sample')?.value.trim()),detected=hasImage&&detectionRun,canSave=detected&&hasName;
  const auto=$('autoDetect'),mode=$('mode'),zoom=$('zoom'),save=$('save'),mobileSave=$('mobileSave'),send=$('sendToStat');
  if(auto){auto.disabled=!hasImage||detecting;auto.title=hasImage?'Deteksi ulang akan mengganti kotak hasil deteksi sebelumnya.':'Masukkan foto terlebih dahulu.';}
  if(mode){mode.disabled=!detected;mode.title=detected?'':'Jalankan deteksi terlebih dahulu.';}
  if(zoom){zoom.disabled=!hasImage;zoom.title=hasImage?'':'Masukkan foto terlebih dahulu.';}
  if(save){save.disabled=!canSave;save.title=!hasImage?'Masukkan foto terlebih dahulu.':!detectionRun?'Jalankan deteksi terlebih dahulu.':!hasName?'Isi kode sampel terlebih dahulu.':'';}
  if(mobileSave)mobileSave.disabled=!canSave;
  if(send)send.disabled=!canSave;
  const undoDisabled=!detected||!history.length;
  if($('undo'))$('undo').disabled=undoDisabled;
  if($('mobileUndo'))$('mobileUndo').disabled=undoDisabled;
  document.querySelectorAll('[data-stage]').forEach(node=>{node.dataset.complete='false';node.dataset.active='false';});
  const stagePhoto=document.querySelector('[data-stage="photo"]'),stageDetect=document.querySelector('[data-stage="detect"]'),stageCorrect=document.querySelector('[data-stage="correct"]'),stageSave=document.querySelector('[data-stage="save"]');
  if(stagePhoto){stagePhoto.dataset.complete=String(hasImage);stagePhoto.dataset.active=String(!hasImage);}
  if(stageDetect){stageDetect.dataset.complete=String(detected);stageDetect.dataset.active=String(hasImage&&!detected);}
  if(stageCorrect){stageCorrect.dataset.complete='false';stageCorrect.dataset.active=String(detected);}
  if(stageSave){stageSave.dataset.complete=String(hasImage&&!dirty&&Boolean(activeId));stageSave.dataset.active=String(canSave);}
  document.querySelectorAll('[data-editor-stage]').forEach(node=>{node.dataset.ready='false';node.dataset.complete='false';});
  const detectPanel=document.querySelector('[data-editor-stage="detect"]'),correctPanel=document.querySelector('[data-editor-stage="correct"]'),savePanel=document.querySelector('[data-editor-stage="save"]');
  if(detectPanel){detectPanel.dataset.ready=String(hasImage);detectPanel.dataset.complete=String(detected);}
  if(correctPanel)correctPanel.dataset.ready=String(detected);
  if(savePanel){savePanel.dataset.ready=String(canSave);savePanel.dataset.complete=String(hasImage&&!dirty&&Boolean(activeId));}
  const ready=cloudContributionReady();
  if($('contribute'))$('contribute').disabled=!ready||!detected||contributing;
}
function detectionImageData(){
  const maxSide=1000,scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
  const temp=document.createElement('canvas');
  temp.width=Math.max(1,Math.round(image.naturalWidth*scale));temp.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const tctx=temp.getContext('2d',{alpha:false,willReadFrequently:true});
  tctx.drawImage(image,0,0,temp.width,temp.height);
  return tctx.getImageData(0,0,temp.width,temp.height);
}
async function autoDetectChilies({automatic=false}={}){
  if(!image||detecting)return;
  if(boxes.length&&!automatic&&!confirm('Deteksi ulang akan mengganti kotak yang ada. Lanjutkan?'))return;
  detecting=true;$('autoDetect').textContent='Mendeteksi…';updateWorkflowState();
  status('Mendeteksi cabai pada foto…');
  try{
    await new Promise(resolve=>setTimeout(resolve,20));
    let result=await detectChiliWithModel(image).catch(()=>null);
    if(result){
      predictionMethod=result.method||'onnx';modelVersion=result.version||'onnx';
    }else{
      result=detectChiliBoxesFromImageData(detectionImageData(),{target:$('detectColor').value,sensitivity:$('detectSensitivity').value});
      predictionMethod='heuristic-color';modelVersion='heuristic-color-v1';
    }
    checkpoint();boxes=result.boxes;predictedBoxes=cloneBoxes();paint();
    if(boxes.length){
      const engine=predictionMethod==='onnx'?`AI ${modelVersion}`:'Deteksi warna';
      status(`${engine} menemukan ${boxes.length} calon cabai. Periksa kotaknya; tambahkan atau hapus jika ada yang kurang tepat.`);
    }else{
      status('Belum ada cabai yang terdeteksi. Coba pilih warna yang sesuai atau ubah kepekaan menjadi “Lebih peka”.');
    }
  }catch(error){
    status(error.message||'Deteksi otomatis gagal.');
  }finally{
    detectionRun=Boolean(image);detecting=false;$('autoDetect').textContent='Deteksi otomatis';updateWorkflowState();
  }
}
async function loadPhotoData(dataURL,name){
  const prepared=await optimizePhoto(dataURL);
  image=prepared.image;photo=prepared.url;boxes=[];predictedBoxes=[];history=[];start=null;draft=null;activeId=null;dirty=true;detectionRun=false;
  predictionMethod='manual';modelVersion='heuristic-color-v1';
  $('sample').value=name||nowName();
  $('zoom').value='1';$('mode').value='add';updateInteractionMode();redraw(true);updateWorkflowState();
  if($('detectOnLoad').checked)await autoDetectChilies({automatic:true});
  else status('Foto siap. Jalankan “Deteksi otomatis” untuk membuka tahap koreksi dan penyimpanan.');
}
async function loadPhotoFile(file,name){
  if(!file)return;
  if(file.size>30*1024*1024)throw Error('Foto maksimal 30 MB.');
  if(file.type&&!/^image\//.test(file.type))throw Error('File harus berupa foto.');
  await loadPhotoData(await readFile(file),name||file.name.replace(/\.[^.]+$/,''));
}
function canDiscard(){
  return !dirty||confirm('Ada perubahan yang belum disimpan. Abaikan perubahan tersebut?');
}

function canvasScale(){
  if(!image)return 1;
  const screenHeight=window.visualViewport?.height||window.innerHeight||720;
  const mobile=window.matchMedia('(max-width:680px)').matches;
  const maxWidth=Math.max(1,viewport.clientWidth-2);
  const maxHeight=Math.max(mobile?220:260,Math.min(mobile?520:640,screenHeight*(mobile?.46:.55)));
  return Math.min(maxWidth/image.naturalWidth,maxHeight/image.naturalHeight,1);
}
function layoutCanvas(){
  if(!image)return;
  const scale=canvasScale();
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
}
function drawBox(box,index,{preview=false}={}){
  const [x,y,w,h]=box;
  const px=x*canvas.width,py=y*canvas.height,pw=w*canvas.width,ph=h*canvas.height;
  ctx.save();
  ctx.lineWidth=preview?2:Math.max(2,Math.min(4,canvas.width/400));
  ctx.strokeStyle=preview?'#ffffff':'#ffe24a';
  if(preview)ctx.setLineDash([7,5]);
  ctx.strokeRect(px,py,pw,ph);
  if(!preview){
    const label=String(index+1),font=Math.max(12,Math.min(16,canvas.width/45));
    ctx.font=`700 ${font}px "Segoe UI",Arial,sans-serif`;
    const labelW=Math.max(26,ctx.measureText(label).width+10),labelH=font+8;
    ctx.fillStyle='rgba(20,31,40,.82)';ctx.fillRect(px,py,labelW,labelH);
    ctx.fillStyle='#fff';ctx.fillText(label,px+5,py+font+2);
  }
  ctx.restore();
}
function paint(){
  if(!image)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  boxes.forEach((box,index)=>drawBox(box,index));
  if(draft)drawBox(draft,boxes.length,{preview:true});
  $('count').textContent=String(boxes.length);
  const disabled=!detectionRun||!history.length;
  $('undo').disabled=disabled;$('mobileUndo').disabled=disabled;
}
function redraw(resize=false){
  if(!image){
    ctx.clearRect(0,0,canvas.width,canvas.height);$('count').textContent='0';return;
  }
  if(resize)layoutCanvas();
  paint();
}
function point(event){
  const rect=canvas.getBoundingClientRect();
  return [
    Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),
    Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))
  ];
}
function boxFromPoints(a,b){
  return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1])];
}
function checkpoint(){
  history.push(cloneBoxes());
  if(history.length>100)history.shift();
  dirty=true;
}
function updateInteractionMode(){
  const pan=$('mode').value==='pan';
  canvas.style.touchAction=pan?'pan-x pan-y':'none';
  canvas.style.cursor=pan?'grab':$('mode').value==='delete'?'crosshair':'crosshair';
  start=null;draft=null;paint();
}

canvas.addEventListener('pointerdown',event=>{
  if(!image||$('mode').value==='pan')return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  start=point(event);draft=null;
});
canvas.addEventListener('pointermove',event=>{
  if(!start||$('mode').value!=='add')return;
  draft=boxFromPoints(start,point(event));paint();
});
canvas.addEventListener('pointerup',event=>{
  if(!start)return;
  const end=point(event),origin=start;start=null;draft=null;
  if($('mode').value==='delete'){
    const index=boxes.findLastIndex(([x,y,w,h])=>end[0]>=x&&end[0]<=x+w&&end[1]>=y&&end[1]<=y+h);
    if(index>=0){checkpoint();boxes.splice(index,1);}
  }else if($('mode').value==='add'){
    const box=boxFromPoints(origin,end);
    if(box[2]*image.naturalWidth>=5&&box[3]*image.naturalHeight>=5){checkpoint();boxes.push(box);}
  }
  paint();
});
canvas.addEventListener('pointercancel',()=>{start=null;draft=null;paint();});
canvas.addEventListener('contextmenu',event=>event.preventDefault());

function undo(){
  if(!history.length)return;
  boxes=history.pop();dirty=true;paint();
}
$('undo').onclick=undo;$('mobileUndo').onclick=undo;
$('autoDetect').onclick=()=>autoDetectChilies();
$('detectColor').onchange=saveDetectSettings;
$('detectSensitivity').onchange=saveDetectSettings;
$('detectOnLoad').onchange=saveDetectSettings;
$('zoom').onchange=()=>redraw(true);
$('mode').onchange=updateInteractionMode;
$('sample').oninput=()=>{dirty=true;updateWorkflowState();};
window.addEventListener('resize',()=>redraw(true));
window.visualViewport?.addEventListener('resize',()=>redraw(true));

async function chooseFile(input){
  const file=input.files?.[0];if(!file)return;
  try{
    if(!canDiscard())return;
    await loadPhotoFile(file);
  }catch(error){status(error.message||'Foto tidak dapat dibuka.');}
  finally{input.value='';}
}
$('photo').onchange=event=>chooseFile(event.target);
$('cameraFile').onchange=event=>chooseFile(event.target);

function stopCamera(){
  if(cameraStream){for(const track of cameraStream.getTracks())track.stop();}
  cameraStream=null;$('cameraVideo').srcObject=null;$('cameraPanel').hidden=true;$('torchCamera').hidden=true;torchOn=false;$('torchCamera').textContent='Flash';
}
async function startCamera({skipDiscard=false}={}){
  if(!navigator.mediaDevices?.getUserMedia){
    $('cameraFile').click();
    return;
  }
  if(!skipDiscard&&!canDiscard())return;
  stopCamera();
  $('cameraPanel').hidden=false;
  $('cameraHint').textContent='Membuka kamera…';
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{facingMode:{ideal:facingMode},width:{ideal:1920},height:{ideal:1080}}
    });
    const video=$('cameraVideo');video.srcObject=cameraStream;await video.play();
    $('cameraHint').textContent='Arahkan kamera ke cabai. Pastikan seluruh buah terlihat dan cahaya cukup.';
    const track=cameraStream.getVideoTracks()[0],capabilities=track?.getCapabilities?.();
    $('torchCamera').hidden=!(capabilities&&capabilities.torch);
  }catch(error){
    stopCamera();
    status(error?.name==='NotAllowedError'?'Izin kamera belum diberikan. Izinkan kamera di browser, atau gunakan galeri.':'Kamera langsung tidak dapat dibuka. Mencoba kamera perangkat…');
    try{$('cameraFile').click();}catch{}
  }
}
$('openCamera').onclick=startCamera;
$('closeCamera').onclick=stopCamera;
$('flipCamera').onclick=async()=>{
  facingMode=facingMode==='environment'?'user':'environment';
  await startCamera({skipDiscard:true});
};
$('torchCamera').onclick=async()=>{
  const track=cameraStream?.getVideoTracks?.()[0];if(!track)return;
  try{
    torchOn=!torchOn;
    await track.applyConstraints({advanced:[{torch:torchOn}]});
    $('torchCamera').textContent=torchOn?'Flash mati':'Flash';
  }catch{torchOn=false;$('torchCamera').textContent='Flash';status('Flash tidak didukung pada kamera ini.');}
};
$('snapPhoto').onclick=async()=>{
  const video=$('cameraVideo');
  if(!cameraStream||!video.videoWidth)return status('Kamera belum siap.');
  try{
    const temp=document.createElement('canvas');
    temp.width=video.videoWidth;temp.height=video.videoHeight;
    temp.getContext('2d',{alpha:false}).drawImage(video,0,0,temp.width,temp.height);
    const blob=await new Promise(resolve=>temp.toBlob(resolve,'image/jpeg',.94));
    if(!blob)throw Error('Foto tidak dapat diambil.');
    const dataURL=await blobToDataURL(blob);
    stopCamera();
    await loadPhotoData(dataURL,nowName());
  }catch(error){status(error.message||'Foto tidak dapat diambil.');}
};

function sendCurrentToStatistics({quiet=false}={}){
  if(!image){if(!quiet)status('Ambil foto atau pilih foto terlebih dahulu.');return null;}
  const sample=$('sample').value.trim();
  try{
    const result=upsertChiliCountToStatistics(localStorage,{sample,count:boxes.length});
    if(!quiet)status(`Masuk ke Statistical Web → ${result.dataset}: ${sample} = ${boxes.length} buah.`);
    return result;
  }catch(error){if(!quiet)status(error.message||'Data belum dapat dikirim ke Statistical Web.');return null;}
}
async function saveCurrent(){
  if(!image)return status('Ambil foto atau pilih foto terlebih dahulu.');
  const name=$('sample').value.trim();
  if(!name)return status('Isi kode sampel.');
  try{
    const id=activeId||crypto.randomUUID(),existing=activeId?await transaction('readonly',store=>store.get(activeId)):null;
    await transaction('readwrite',store=>store.put({
      id,name,image:photo,width:image.naturalWidth,height:image.naturalHeight,
      boxes:cloneBoxes(),predictedBoxes:predictedBoxes.map(box=>[...box]),predictionMethod,modelVersion,
      reviewed:true,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()
    }));
    activeId=id;dirty=false;await list();
    const synced=sendCurrentToStatistics({quiet:true});updateWorkflowState();
    if(synced){
      const action=synced.updated?'diperbarui':'ditambahkan';
      status(`Tersimpan di perangkat ini: ${boxes.length} buah. Statistical Web: sampel “${name}” ${action} di dataset ${synced.dataset}.`);
    }else{
      status(`Tersimpan di perangkat ini: ${boxes.length} buah. Data belum dapat dimasukkan ke Statistical Web.`);
    }
  }catch{status('Penyimpanan gagal. Periksa ruang penyimpanan browser; hasil di layar belum hilang.');}
}
$('save').onclick=saveCurrent;$('mobileSave').onclick=saveCurrent;
$('sendToStat').onclick=()=>sendCurrentToStatistics();

async function contributeCurrent(){
  if(contributing)return;
  if(!image)return status('Ambil foto atau pilih foto terlebih dahulu.');
  if(!cloudContributionReady())return status('Kontribusi cloud belum diaktifkan. Selesaikan konfigurasi Cloudflare terlebih dahulu.');
  const sample=$('sample').value.trim()||nowName();
  contributing=true;$('contribute').disabled=true;$('contribute').textContent='Mengirim…';
  try{
    const result=await submitTrainingContribution({
      image,sample,boxes:cloneBoxes(),predictedBoxes:predictedBoxes.map(box=>[...box]),
      predictionMethod,modelVersion,consent:true
    });
    status(`Kontribusi diterima: ${result.finalCount} buah. Data masuk kandidat pelatihan dengan quality score ${result.qualityScore}.`);
  }catch(error){
    status(error.message||'Kontribusi belum dapat dikirim.');
  }finally{
    contributing=false;$('contribute').disabled=!cloudContributionReady();$('contribute').textContent='Kirim untuk melatih AI';
  }
}
$('contribute').onclick=contributeCurrent;
function updateCloudState(){
  const ready=cloudContributionReady();
  $('cloudState').textContent=ready?'Cloudflare siap menerima kontribusi.':'Cloudflare belum dikonfigurasi; penyimpanan lokal tetap berfungsi.';
  updateWorkflowState();
}


async function openRecord(row){
  if(!canDiscard())return;
  try{
    image=await decodeImage(row.image);photo=row.image;boxes=row.boxes.map(box=>[...box]);predictedBoxes=(row.predictedBoxes||[]).map(box=>[...box]);history=[];activeId=row.id;dirty=false;start=null;draft=null;detectionRun=true;
    predictionMethod=row.predictionMethod||'manual';modelVersion=row.modelVersion||'heuristic-color-v1';
    $('sample').value=row.name;$('zoom').value='1';$('mode').value='add';updateInteractionMode();redraw(true);updateWorkflowState();
    window.scrollTo({top:0,behavior:'smooth'});status(`Sampel dibuka: ${row.boxes.length} buah.`);
  }catch{status('Foto tersimpan tidak dapat dibuka.');}
}
async function deleteRecord(row){
  if(!confirm(`Hapus sampel "${row.name}"?`))return;
  try{
    await transaction('readwrite',store=>store.delete(row.id));
    if(activeId===row.id){activeId=null;}
    await list();status('Sampel dihapus.');
  }catch{status('Sampel tidak dapat dihapus.');}
}
async function list(){
  const rows=(await transaction('readonly',store=>store.getAll())||[]).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  const host=$('records');host.replaceChildren();
  if(!rows.length){
    const li=document.createElement('li');li.textContent='Belum ada data tersimpan.';host.append(li);return;
  }
  for(const row of rows){
    const li=document.createElement('li'),main=document.createElement('div'),actions=document.createElement('div');
    main.className='record-main';main.innerHTML=`<b></b><small></small>`;
    main.querySelector('b').textContent=row.name;main.querySelector('small').textContent=`${row.boxes.length} buah`;
    actions.className='record-actions';
    const open=document.createElement('button');open.type='button';open.textContent='Buka';open.onclick=()=>openRecord(row);
    const remove=document.createElement('button');remove.type='button';remove.textContent='Hapus';remove.onclick=()=>deleteRecord(row);
    actions.append(open,remove);li.append(main,actions);host.append(li);
  }
}
function valid(record){
  return record&&typeof record.id==='string'&&typeof record.name==='string'&&
    /^data:image\/(jpeg|png|webp);base64,/.test(record.image)&&
    Number.isInteger(record.width)&&record.width>0&&Number.isInteger(record.height)&&record.height>0&&record.reviewed===true&&
    Array.isArray(record.boxes)&&record.boxes.every(box=>Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&box[0]>=0&&box[1]>=0&&box[2]>0&&box[3]>0&&box[0]+box[2]<=1.000001&&box[1]+box[3]<=1.000001);
}
$('export').onclick=async()=>{
  try{
    const samples=await transaction('readonly',store=>store.getAll());
    if(!samples?.length)return status('Belum ada data tersimpan.');
    const data={version:1,format:'chili-boxes',className:'cabai',boxFormat:'normalized top-left x,y,width,height',samples};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='data-cabai.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);status('Cadangan berhasil diekspor.');
  }catch{status('Ekspor gagal. Coba kembali.');}
};
$('import').onchange=async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
    if(file.size>150*1024*1024)throw Error('Cadangan maksimal 150 MB.');
    const data=JSON.parse(await file.text());
    if(data.version!==1||data.format!=='chili-boxes'||!Array.isArray(data.samples)||!data.samples.every(valid))throw Error('Format cadangan tidak valid.');
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('samples','readwrite');
      for(const record of data.samples)tx.objectStore('samples').put({...record,id:crypto.randomUUID()});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    await list();status('Cadangan berhasil dipulihkan sebagai salinan.');
  }catch(error){status(error.message||'Pemulihan gagal.');}
  event.target.value='';
};

window.addEventListener('beforeunload',event=>{stopCamera();if(dirty){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&cameraStream)stopCamera();});

try{
  applyDetectSettings();updateCloudState();
  db=await openDB();await list();updateInteractionMode();updateWorkflowState();
  if(!navigator.mediaDevices?.getUserMedia)$('openCamera').textContent='📷 Ambil foto';
}catch{
  status('Penyimpanan browser tidak tersedia. Hasil masih dapat dihitung, tetapi tidak bisa disimpan.');
  $('save').disabled=true;$('mobileSave').disabled=true;$('export').disabled=true;$('import').disabled=true;
}