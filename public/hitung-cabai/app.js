import {detectChiliBoxesFromImageData} from './detector.js';
import {detectChiliWithModel} from './ml-detector.js';
import {submitTrainingContribution,cloudContributionReady} from './cloud-sync.js?v=20260926-3';
import {upsertChiliCountToStatistics} from './stat-sync.js';
import {boxIoU,matchBoxes,incrementSampleCode,reviewFlags,imageQuality,datasetMetrics,activeLearningPriority} from './review-metrics.js';

const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d'),viewport=$('viewport');
const DETECT_SETTINGS_KEY='chili-detect-settings-v2';
const FIELD_HANDOFF_KEY='agrotik_field_handoff_v1';
const LOW_CONFIDENCE=.5;

let image=null,photoBlob=null,photoUrl='',boxes=[],boxMeta=[],predictedDetections=[],history=[];
let selected=-1,interaction=null,activeId=null,dirty=false,db=null,qualityStats=null,draftTimer=null;
let cameraStream=null,cameraQualityTimer=null,facingMode='environment',torchOn=false,detecting=false,contributing=false;
let predictionMethod='manual',modelVersion='heuristic-color-v1',detectionRun=false,confidenceStats=null;
let batchQueue=[],batchTotal=0,batchIndex=0,batchAutoBusy=false;
let cloudContributionId='',cloudEditToken='',contributionOperationId='',duplicateId='';
let viewScale=1,viewX=0,viewY=0,pinchStart=null;
const pointers=new Map();

const fieldParams=new URLSearchParams(location.search);
const fieldContext=fieldParams.get('agrotik')==='field'?{
  dataset:fieldParams.get('dataset')||'',plot_uid:fieldParams.get('plot_uid')||'',plot_label:fieldParams.get('plot_label')||'',
  parameter:fieldParams.get('parameter')||'',session_id:fieldParams.get('session_id')||''
}:null;

const status=message=>{$('status').textContent=message;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cloneBoxes=()=>boxes.map(box=>[...box]);
const cloneMeta=()=>boxMeta.map(meta=>({...meta,reasons:[...(meta.reasons||[])]}));
const pad2=v=>String(v).padStart(2,'0');
const nowName=()=>{
  const d=new Date();
  return 'Cabai_'+d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate())+'_'+pad2(d.getHours())+pad2(d.getMinutes())+pad2(d.getSeconds());
};

function sendCountToField(){
  if(!fieldContext||dirty||!activeId)return false;
  const detail={type:'agrotik-field-handoff',kind:'chili-count',dataset:fieldContext.dataset,plot_uid:fieldContext.plot_uid,
    plot_label:fieldContext.plot_label,parameter:fieldContext.parameter,session_id:fieldContext.session_id,
    value:String(boxes.length),unit:'buah',at:new Date().toISOString()};
  try{localStorage.setItem(FIELD_HANDOFF_KEY,JSON.stringify(detail));}catch{}
  try{window.opener?.postMessage({type:'agrotik-field-handoff',detail},location.origin);window.opener?.focus?.();}catch{}
  status('Tersimpan: '+boxes.length+' buah · hasil dikirim ke plot '+(fieldContext.plot_label||'aktif')+'.');
  return true;
}

function openDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('chili-labels-v1',3);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains('samples'))request.result.createObjectStore('samples',{keyPath:'id'});
      if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts',{keyPath:'id'});
    };
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
function draftTransaction(mode,action){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('drafts',mode),request=action(tx.objectStore('drafts'));
    tx.oncomplete=()=>resolve(request?.result);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  });
}
async function saveDraft(){
  if(!db||!image||!photoBlob||!dirty)return;
  const draft={
    id:'current',updatedAt:Date.now(),sample:$('sample')?.value.trim()||'',imageBlob:photoBlob,
    boxes:cloneBoxes(),boxMeta:cloneMeta(),predictedDetections:predictedDetections.map(d=>({box:[...d.box],score:d.score})),
    predictionMethod,modelVersion,detectionRun,confidenceStats,qualityStats,condition:$('condition')?.value||'normal',
    cloudContributionId,cloudEditToken,contributionOperationId
  };
  try{await draftTransaction('readwrite',store=>store.put(draft));}catch{}
}
function scheduleDraft(){
  if(!db||!dirty||!image)return;
  clearTimeout(draftTimer);draftTimer=setTimeout(()=>void saveDraft(),900);
}
async function clearDraft(){
  clearTimeout(draftTimer);draftTimer=null;
  if(!db)return;try{await draftTransaction('readwrite',store=>store.delete('current'));}catch{}
}
async function restoreDraft(){
  if(!db||fieldContext)return false;
  let draft=null;try{draft=await draftTransaction('readonly',store=>store.get('current'));}catch{}
  if(!draft?.imageBlob||Date.now()-Number(draft.updatedAt||0)>24*60*60*1000)return false;
  try{
    await setPhoto(draft.imageBlob,draft.sample||nowName(),{fromBatch:true,skipAuto:true});
    boxes=Array.isArray(draft.boxes)?draft.boxes.map(box=>[...box]):[];
    boxMeta=Array.isArray(draft.boxMeta)?draft.boxMeta.map(meta=>({...meta,reasons:[...(meta.reasons||[])]})):[];
    predictedDetections=Array.isArray(draft.predictedDetections)?draft.predictedDetections.map(d=>({box:[...d.box],score:d.score})):[];
    predictionMethod=draft.predictionMethod||'manual';modelVersion=draft.modelVersion||'heuristic-color-v1';
    detectionRun=Boolean(draft.detectionRun);confidenceStats=draft.confidenceStats||null;qualityStats=draft.qualityStats||qualityStats;
    cloudContributionId=draft.cloudContributionId||'';cloudEditToken=draft.cloudEditToken||'';contributionOperationId=draft.contributionOperationId||'';
    if(draft.condition&&$('condition'))$('condition').value=draft.condition;
    dirty=true;paint();renderConfidence();updateWorkflowState();status('Draft terakhir dipulihkan otomatis · belum disimpan sebagai sampel.');
    return true;
  }catch{return false;}
}
function revokePhotoUrl(){if(photoUrl){URL.revokeObjectURL(photoUrl);photoUrl='';}}
async function decodeBlob(blob){
  const url=URL.createObjectURL(blob),img=new Image();
  img.src=url;
  try{await img.decode();return {image:img,url};}catch(error){URL.revokeObjectURL(url);throw error;}
}
function dataUrlToBlob(dataURL){
  const [head,body]=String(dataURL||'').split(',');
  const mime=(head.match(/data:([^;]+)/)||[])[1]||'image/jpeg';
  const binary=atob(body||''),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}
function blobToDataURL(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);
  });
}
function thumbnailDataURL(source,maxSide=180){
  if(!source?.naturalWidth||!source?.naturalHeight)return '';
  const scale=Math.min(1,maxSide/Math.max(source.naturalWidth,source.naturalHeight)),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(source.naturalWidth*scale));c.height=Math.max(1,Math.round(source.naturalHeight*scale));
  c.getContext('2d',{alpha:false}).drawImage(source,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',.68);
}
async function optimizeBlob(blob){
  if(!(blob instanceof Blob))throw Error('Foto tidak valid.');
  if(blob.size>35*1024*1024)throw Error('Foto maksimal 35 MB.');
  const decoded=await decodeBlob(blob),source=decoded.image,url=decoded.url;
  const maxSide=2800,scale=Math.min(1,maxSide/Math.max(source.naturalWidth,source.naturalHeight));
  if(scale===1&&blob.size<=8_000_000)return {blob,image:source,url};
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(source.naturalWidth*scale));c.height=Math.max(1,Math.round(source.naturalHeight*scale));
  c.getContext('2d',{alpha:false}).drawImage(source,0,0,c.width,c.height);
  const optimized=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.9));
  URL.revokeObjectURL(url);
  if(!optimized)throw Error('Foto tidak dapat dioptimalkan.');
  const next=await decodeBlob(optimized);return {blob:optimized,image:next.image,url:next.url};
}

function readDetectSettings(){
  try{
    const old=JSON.parse(localStorage.getItem('chili-detect-settings-v1')||'{}');
    const saved={...old,...JSON.parse(localStorage.getItem(DETECT_SETTINGS_KEY)||'{}')};
    return {
      target:['all','red','green'].includes(saved.target)?saved.target:'all',
      sensitivity:['strict','normal','sensitive'].includes(saved.sensitivity)?saved.sensitivity:'normal',
      onLoad:saved.onLoad!==false,autoNext:saved.autoNext!==false,autoIncrement:saved.autoIncrement!==false,batchAuto:saved.batchAuto!==false,
      condition:['normal','overlap','occluded','low-light','mixed-color'].includes(saved.condition)?saved.condition:'normal'
    };
  }catch{return {target:'all',sensitivity:'normal',onLoad:true,autoNext:true,autoIncrement:true,batchAuto:true,condition:'normal'};}
}
function applyDetectSettings(){
  const s=readDetectSettings();
  $('detectColor').value=s.target;$('detectSensitivity').value=s.sensitivity;$('detectOnLoad').checked=s.onLoad;
  $('autoNext').checked=s.autoNext;$('autoIncrement').checked=s.autoIncrement;$('batchAuto').checked=s.batchAuto;$('condition').value=s.condition;
}
function saveDetectSettings(){
  const value={target:$('detectColor').value,sensitivity:$('detectSensitivity').value,onLoad:$('detectOnLoad').checked,
    autoNext:$('autoNext').checked,autoIncrement:$('autoIncrement').checked,batchAuto:$('batchAuto').checked,condition:$('condition').value};
  try{localStorage.setItem(DETECT_SETTINGS_KEY,JSON.stringify(value));}catch{}
}
function detectionImageData(maxSide=1000){
  const scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight)),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(image.naturalWidth*scale));c.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const cctx=c.getContext('2d',{alpha:false,willReadFrequently:true});cctx.drawImage(image,0,0,c.width,c.height);
  return cctx.getImageData(0,0,c.width,c.height);
}
function updateQuality(){
  if(!image){qualityStats=null;$('qualityScore').textContent='—';$('qualityIssue').textContent='Foto belum dimasukkan.';$('qualityGate').dataset.level='warn';return;}
  qualityStats=imageQuality(detectionImageData(420));
  const level=qualityStats.score>=70?'good':qualityStats.score>=48?'warn':'bad';
  $('qualityGate').dataset.level=level;$('qualityScore').textContent=qualityStats.score+'/100';
  $('qualityIssue').textContent=qualityStats.issues.length?qualityStats.issues.join(' '):'Fokus, pencahayaan, dan resolusi memadai.';
}
function hydrateMeta(detections){
  const flags=reviewFlags(detections,{lowThreshold:LOW_CONFIDENCE});
  return detections.map((det,index)=>({
    score:Number.isFinite(det.score)?det.score:null,source:det.source||predictionMethod,reviewed:false,
    reasons:flags[index]?.reasons||[]
  }));
}
function reviewIndices(){return boxMeta.map((m,i)=>m&&!m.reviewed&&(m.reasons||[]).length?i:-1).filter(i=>i>=0);}
function renderConfidence(){
  const host=$('confidenceInspector');
  if(!image||!detectionRun){host.hidden=true;return;}
  host.hidden=false;$('confidenceModel').textContent=predictionMethod==='onnx'?modelVersion:'Deteksi warna';
  const c=confidenceStats?.confidence;
  $('confidenceMean').textContent=c?.n?(c.mean*100).toFixed(1)+'%':'—';
  $('confidenceRange').textContent=c?.n?(c.min*100).toFixed(0)+'–'+(c.max*100).toFixed(0)+'%':'—';
  const needs=reviewIndices().length;$('confidenceLow').textContent=needs?needs+' kotak':'0';
  $('reviewLow').disabled=!needs;
  $('reviewLow').textContent=needs?'Periksa yang meragukan ('+needs+')':'Tidak ada yang meragukan';
}
function correctionNow(){return matchBoxes(predictedDetections,boxes,.5);}
function currentPriority(){
  return activeLearningPriority({correction:correctionNow(),confidence:confidenceStats?.confidence,quality:qualityStats,reviewCount:reviewIndices().length});
}
function updateWorkflowState(){
  const hasImage=Boolean(image),hasName=Boolean($('sample')?.value.trim()),detected=hasImage&&detectionRun,canSave=detected&&hasName;
  if(dirty&&hasImage)scheduleDraft();
  $('autoDetect').disabled=!hasImage||detecting;$('undo').disabled=!detected||!history.length;$('mobileUndo').disabled=!detected||!history.length;
  $('deleteSelected').disabled=selected<0;$('zoomReset').disabled=!hasImage;$('mobileSave').disabled=!canSave;$('saveDesktop').disabled=!canSave;
  const ready=cloudContributionReady();$('contribute').disabled=!ready||!detected||contributing;
  const priority=currentPriority();
  $('contribute').textContent=priority>=60?'Kirim untuk melatih AI · prioritas tinggi':'Kirim untuk melatih AI';
  document.querySelectorAll('[data-stage]').forEach(node=>{node.dataset.complete='false';node.dataset.active='false';});
  const photoStage=document.querySelector('[data-stage="photo"]'),detectStage=document.querySelector('[data-stage="detect"]'),correctStage=document.querySelector('[data-stage="correct"]'),saveStage=document.querySelector('[data-stage="save"]');
  if(photoStage){photoStage.dataset.complete=String(hasImage);photoStage.dataset.active=String(!hasImage);}
  if(detectStage){detectStage.dataset.complete=String(detected);detectStage.dataset.active=String(hasImage&&!detected);}
  if(correctStage){correctStage.dataset.complete=String(detected&&reviewIndices().length===0);correctStage.dataset.active=String(detected&&reviewIndices().length>0);}
  if(saveStage){saveStage.dataset.complete=String(hasImage&&!dirty&&Boolean(activeId));saveStage.dataset.active=String(canSave);}
  renderConfidence();updateBatchState();
}
function updateBatchState(){
  const host=$('batchState'),active=batchTotal>1;host.hidden=!active;if(!active)return;
  $('batchProgress').textContent=Math.min(batchIndex,batchTotal)+' / '+batchTotal;
  $('batchName').textContent=batchQueue.length?batchQueue[0].name:'Batch selesai';
  $('batchNext').disabled=!batchQueue.length||dirty||detecting;
}
function resetView(){viewScale=1;viewX=0;viewY=0;applyView();}
function applyView(){canvas.style.transform='translate('+viewX+'px,'+viewY+'px) scale('+viewScale+')';}
function canvasScale(){
  if(!image)return 1;
  const screenHeight=window.visualViewport?.height||window.innerHeight||720,mobile=window.matchMedia('(max-width:680px)').matches;
  const maxWidth=Math.max(1,viewport.clientWidth-2),maxHeight=Math.max(mobile?220:260,Math.min(mobile?560:680,screenHeight*(mobile?.52:.6)));
  return Math.min(maxWidth/image.naturalWidth,maxHeight/image.naturalHeight,1);
}
function layoutCanvas(){
  if(!image)return;const scale=canvasScale();
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
}
function handlePoints(box){
  const [x,y,w,h]=box;return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
}
function drawBox(box,index,meta={},isSelected=false,{preview=false}={}){
  const [x,y,w,h]=box,px=x*canvas.width,py=y*canvas.height,pw=w*canvas.width,ph=h*canvas.height;
  const flagged=(meta.reasons||[]).length&&!meta.reviewed;
  ctx.save();ctx.lineWidth=isSelected?3:Math.max(2,Math.min(4,canvas.width/400));
  ctx.strokeStyle=preview?'#ffffff':flagged?'#ff9f1a':isSelected?'#2f80ed':'#ffe24a';
  if(preview||flagged)ctx.setLineDash(flagged?[6,3]:[7,5]);ctx.strokeRect(px,py,pw,ph);ctx.setLineDash([]);
  if(!preview){
    const score=Number.isFinite(meta.score)?' '+Math.round(meta.score*100)+'%':'';
    const flag=flagged?' ?':'',label=String(index+1)+score+flag,font=Math.max(11,Math.min(15,canvas.width/48));
    ctx.font='700 '+font+'px "Segoe UI",Arial,sans-serif';
    const labelW=Math.max(27,ctx.measureText(label).width+9),labelH=font+7;
    ctx.fillStyle=flagged?'rgba(126,78,12,.9)':'rgba(20,31,40,.82)';ctx.fillRect(px,py,labelW,labelH);
    ctx.fillStyle='#fff';ctx.fillText(label,px+4,py+font+1);
    if(isSelected){
      ctx.fillStyle='#2f80ed';
      for(const p of handlePoints(box)){ctx.beginPath();ctx.arc(p[0]*canvas.width,p[1]*canvas.height,6,0,Math.PI*2);ctx.fill();}
    }
  }
  ctx.restore();
}
function paint(){
  if(!image)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  boxes.forEach((box,index)=>drawBox(box,index,boxMeta[index]||{},selected===index));
  if(interaction?.type==='add'&&interaction.draft)drawBox(interaction.draft,boxes.length,{},false,{preview:true});
  $('count').textContent=String(boxes.length);$('deleteSelected').disabled=selected<0;
}
function redraw(resize=false){if(!image){ctx.clearRect(0,0,canvas.width,canvas.height);$('count').textContent='0';return;}if(resize)layoutCanvas();paint();}
function checkpoint(){
  history.push({boxes:cloneBoxes(),meta:cloneMeta(),selected});if(history.length>80)history.shift();dirty=true;
}
function undo(){
  const state=history.pop();if(!state)return;boxes=state.boxes;boxMeta=state.meta;selected=state.selected;dirty=true;paint();updateWorkflowState();
}
function point(event){
  const rect=canvas.getBoundingClientRect();
  return [clamp((event.clientX-rect.left)/rect.width,0,1),clamp((event.clientY-rect.top)/rect.height,0,1)];
}
function boxFromPoints(a,b){return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1])];}
function hitBox(p){
  const hits=[];boxes.forEach((b,i)=>{if(p[0]>=b[0]&&p[0]<=b[0]+b[2]&&p[1]>=b[1]&&p[1]<=b[1]+b[3])hits.push(i);});
  hits.sort((a,b)=>boxes[a][2]*boxes[a][3]-boxes[b][2]*boxes[b][3]);return hits[0]??-1;
}
function hitHandle(p,index){
  if(index<0||!boxes[index])return -1;
  const rect=canvas.getBoundingClientRect(),radius=Math.max(12,Math.min(24,rect.width/35)),rx=radius/rect.width,ry=radius/rect.height;
  return handlePoints(boxes[index]).findIndex(h=>Math.abs(p[0]-h[0])<=rx&&Math.abs(p[1]-h[1])<=ry);
}
function markReviewed(index){
  if(index<0||!boxMeta[index])return;boxMeta[index].reviewed=true;boxMeta[index].reasons=[];dirty=true;
}
function moveBox(base,dx,dy){return [clamp(base[0]+dx,0,1-base[2]),clamp(base[1]+dy,0,1-base[3]),base[2],base[3]];}
function resizeBox(base,corner,p){
  const x1=base[0],y1=base[1],x2=base[0]+base[2],y2=base[1]+base[3];
  let a=[x1,y1],b=[x2,y2];
  if(corner===0)a=p;if(corner===1){a=[x1,p[1]];b=[p[0],y2];}
  if(corner===2)b=p;if(corner===3){a=[p[0],y1];b=[x2,p[1]];}
  const out=boxFromPoints(a,b);out[0]=clamp(out[0],0,1);out[1]=clamp(out[1],0,1);out[2]=clamp(out[2],.002,1-out[0]);out[3]=clamp(out[3],.002,1-out[1]);return out;
}
function pointerDistance(a,b){return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);}
function pointerMid(a,b){return [(a.clientX+b.clientX)/2,(a.clientY+b.clientY)/2];}

canvas.addEventListener('pointerdown',event=>{
  if(!image||!detectionRun)return;
  canvas.setPointerCapture?.(event.pointerId);pointers.set(event.pointerId,{clientX:event.clientX,clientY:event.clientY});
  if(pointers.size===2){
    const [a,b]=[...pointers.values()];pinchStart={distance:pointerDistance(a,b),mid:pointerMid(a,b),scale:viewScale,x:viewX,y:viewY};interaction=null;return;
  }
  if(pointers.size>1)return;
  event.preventDefault();const p=point(event),handle=hitHandle(p,selected);
  if(handle>=0){checkpoint();interaction={type:'resize',index:selected,corner:handle,base:[...boxes[selected]]};return;}
  const index=hitBox(p);
  if(index>=0){selected=index;interaction={type:'move-pending',index,start:p,base:[...boxes[index]],saved:false};paint();updateWorkflowState();return;}
  selected=-1;interaction={type:'add',start:p,draft:[p[0],p[1],0,0]};paint();updateWorkflowState();
});
canvas.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,{clientX:event.clientX,clientY:event.clientY});
  if(pointers.size>=2&&pinchStart){
    const [a,b]=[...pointers.values()].slice(0,2),distance=pointerDistance(a,b),mid=pointerMid(a,b);
    viewScale=clamp(pinchStart.scale*(distance/Math.max(1,pinchStart.distance)),1,4);
    viewX=pinchStart.x+(mid[0]-pinchStart.mid[0]);viewY=pinchStart.y+(mid[1]-pinchStart.mid[1]);applyView();return;
  }
  if(!interaction)return;event.preventDefault();const p=point(event);
  if(interaction.type==='add'){interaction.draft=boxFromPoints(interaction.start,p);paint();return;}
  if(interaction.type==='resize'){boxes[interaction.index]=resizeBox(interaction.base,interaction.corner,p);markReviewed(interaction.index);paint();return;}
  if(interaction.type==='move-pending'||interaction.type==='move'){
    const dx=p[0]-interaction.start[0],dy=p[1]-interaction.start[1];
    if(interaction.type==='move-pending'&&Math.hypot(dx*canvas.width,dy*canvas.height)>5){
      if(!interaction.saved){checkpoint();interaction.saved=true;}interaction.type='move';
    }
    if(interaction.type==='move'){boxes[interaction.index]=moveBox(interaction.base,dx,dy);markReviewed(interaction.index);paint();}
  }
});
function finishPointer(event){
  pointers.delete(event.pointerId);
  if(pointers.size<2)pinchStart=null;
  if(!interaction||pointers.size)return;
  if(interaction.type==='add'&&interaction.draft){
    const b=interaction.draft;
    if(b[2]*image.naturalWidth>=5&&b[3]*image.naturalHeight>=5){
      checkpoint();boxes.push(b);boxMeta.push({score:null,source:'manual',reviewed:true,reasons:[]});selected=boxes.length-1;
    }
  }
  interaction=null;paint();renderConfidence();updateWorkflowState();
}
canvas.addEventListener('pointerup',finishPointer);canvas.addEventListener('pointercancel',finishPointer);canvas.addEventListener('contextmenu',e=>e.preventDefault());

function deleteSelected(){
  if(selected<0||!boxes[selected])return;checkpoint();boxes.splice(selected,1);boxMeta.splice(selected,1);selected=-1;paint();renderConfidence();updateWorkflowState();
}
function reviewNext(){
  if(selected>=0&&boxMeta[selected]&&(boxMeta[selected].reasons||[]).length)markReviewed(selected);
  const pending=reviewIndices();if(!pending.length){selected=-1;paint();renderConfidence();updateWorkflowState();status('Semua kotak meragukan sudah diperiksa.');return;}
  selected=pending[0];paint();renderConfidence();updateWorkflowState();
  status('Periksa kotak '+(selected+1)+'. Jika benar tekan “Periksa yang meragukan” lagi; jika salah, geser/resize atau hapus.');
}
function duplicateName(base,rows){
  const names=new Set(rows.map(r=>r.name));if(!names.has(base))return base;
  let i=2,name=base+'-'+i;while(names.has(name))name=base+'-'+(++i);return name;
}
async function checkDuplicate(){
  if(!db)return null;const name=$('sample').value.trim();duplicateId='';
  if(!name){$('duplicateBanner').hidden=true;return null;}
  const rows=await transaction('readonly',store=>store.getAll()),row=rows.find(r=>r.name===name&&r.id!==activeId);
  duplicateId=row?.id||'';$('duplicateBanner').hidden=!row;
  if(row)$('duplicateText').textContent='Kode “'+name+'” sudah tersimpan ('+(row.boxes?.length||0)+' buah).';
  return row||null;
}

async function autoDetectChilies({automatic=false}={}){
  if(!image||detecting)return false;
  if(automatic&&qualityStats?.score<45){status('Quality Gate belum lolos. Perbaiki fokus/pencahayaan atau tekan Deteksi otomatis untuk tetap melanjutkan.');return false;}
  detecting=true;$('autoDetect').textContent='Mendeteksi…';updateWorkflowState();status('Mendeteksi cabai pada foto…');
  try{
    const condition=$('condition').value;
    const inferenceOptions=condition==='overlap'?{iouThreshold:.65}:condition==='occluded'||condition==='low-light'?{confidence:.20,iouThreshold:.58}:{};
    const safeMode=Boolean(window.AgrotikSafeMode)||localStorage.getItem('agrotik_safe_mode_v1')==='1';
    let result=safeMode?null:await detectChiliWithModel(image,inferenceOptions).catch(()=>null),detections=[];
    if(result){
      predictionMethod=result.method||'onnx';modelVersion=result.version||'onnx';
      detections=(result.detections||result.boxes.map(box=>({box,score:null}))).map(d=>({box:[...d.box],score:Number.isFinite(d.score)?d.score:null,source:'onnx'}));
    }else{
      result=detectChiliBoxesFromImageData(detectionImageData(),{target:$('detectColor').value,sensitivity:$('detectSensitivity').value});
      predictionMethod=safeMode?'heuristic-safe':'heuristic-color';modelVersion=safeMode?'heuristic-safe-v1':'heuristic-color-v1';
      detections=result.boxes.map(box=>({box:[...box],score:null,source:predictionMethod}));
    }
    if(detectionRun)checkpoint();else history=[];
    boxes=detections.map(d=>[...d.box]);predictedDetections=detections.map(d=>({box:[...d.box],score:d.score}));
    boxMeta=hydrateMeta(detections);confidenceStats=result.stats||null;selected=-1;detectionRun=true;dirty=true;paint();renderConfidence();
    const needs=reviewIndices().length,engine=predictionMethod==='onnx'?'AI '+modelVersion:'Deteksi warna';
    status(engine+' menemukan '+boxes.length+' calon cabai'+(needs?' · '+needs+' kotak perlu diperiksa.':' · tidak ada kotak yang ditandai meragukan.'));
  }catch(error){status(error.message||'Deteksi otomatis gagal.');return false;}
  finally{detecting=false;$('autoDetect').textContent='Deteksi otomatis';updateWorkflowState();}
  if(automatic)void maybeAutoBatch();
  return true;
}

async function setPhoto(blob,name,{fromBatch=false,skipAuto=false}={}){
  const prepared=await optimizeBlob(blob);revokePhotoUrl();photoBlob=prepared.blob;photoUrl=prepared.url;image=prepared.image;
  boxes=[];boxMeta=[];predictedDetections=[];history=[];selected=-1;interaction=null;activeId=null;dirty=true;detectionRun=false;confidenceStats=null;
  predictionMethod='manual';modelVersion='heuristic-color-v1';cloudContributionId='';cloudEditToken='';contributionOperationId='';duplicateId='';
  $('duplicateBanner').hidden=true;$('sample').value=fieldContext?.plot_label||name||nowName();resetView();layoutCanvas();paint();updateQuality();updateWorkflowState();await checkDuplicate();
  if(!skipAuto&&$('detectOnLoad').checked)await autoDetectChilies({automatic:true});
  else if(!skipAuto)status('Foto siap. Quality Gate '+(qualityStats?.score||0)+'/100 · jalankan Deteksi otomatis.');
  if(!fromBatch)window.scrollTo({top:Math.max(0,viewport.getBoundingClientRect().top+scrollY-120),behavior:'smooth'});
}
async function loadPhotoFile(file,name,options){if(!file)return;await setPhoto(file,name||file.name.replace(/\.[^.]+$/,''),options);}
function canDiscard(){return !dirty||!image||confirm('Ada perubahan yang belum disimpan. Abaikan perubahan tersebut?');}
async function chooseFile(input){
  const files=[...(input.files||[])];if(!files.length)return;
  try{
    if(!canDiscard())return;
    if(input.id==='photo'&&files.length>1){batchTotal=files.length;batchIndex=1;batchQueue=files.slice(1);}
    else{batchTotal=0;batchIndex=0;batchQueue=[];}
    await loadPhotoFile(files[0],files[0].name.replace(/\.[^.]+$/,''),{fromBatch:files.length>1});updateBatchState();
  }catch(error){status(error.message||'Foto tidak dapat dibuka.');}
  finally{input.value='';}
}
async function loadNextBatch(){
  if(!batchQueue.length)return updateBatchState();
  if(dirty&&!activeId)return status('Simpan atau selesaikan foto aktif sebelum membuka batch berikutnya.');
  const file=batchQueue.shift();batchIndex=Math.min(batchTotal,batchIndex+1);
  try{await loadPhotoFile(file,file.name.replace(/\.[^.]+$/,''),{fromBatch:true});}catch(error){status(error.message||'Foto berikutnya tidak dapat dibuka.');}
  updateBatchState();
}
async function maybeAutoBatch(){
  if(batchAutoBusy||batchTotal<=1||!$('batchAuto').checked||!detectionRun)return;
  const safe=qualityStats?.score>=60&&reviewIndices().length===0&&boxes.length>0;
  if(!safe)return;
  batchAutoBusy=true;
  try{await saveCurrent({auto:true});}finally{batchAutoBusy=false;}
}

function cameraFrameQuality(){
  const video=$('cameraVideo');if(!cameraStream||!video.videoWidth)return;
  const c=document.createElement('canvas'),scale=Math.min(1,360/Math.max(video.videoWidth,video.videoHeight));
  c.width=Math.max(2,Math.round(video.videoWidth*scale));c.height=Math.max(2,Math.round(video.videoHeight*scale));
  const cctx=c.getContext('2d',{alpha:false,willReadFrequently:true});cctx.drawImage(video,0,0,c.width,c.height);
  const q=imageQuality(cctx.getImageData(0,0,c.width,c.height));
  $('cameraHint').textContent=q.score>=70?'Quality Gate '+q.score+'/100 · posisi baik, foto siap diambil.':'Quality Gate '+q.score+'/100 · '+(q.issues[0]||'Perbaiki posisi dan pencahayaan.');
}
function stopCamera(){
  clearInterval(cameraQualityTimer);cameraQualityTimer=null;
  if(cameraStream)for(const track of cameraStream.getTracks())track.stop();
  cameraStream=null;$('cameraVideo').srcObject=null;$('cameraPanel').hidden=true;$('torchCamera').hidden=true;torchOn=false;$('torchCamera').textContent='Flash';
}
async function startCamera({skipDiscard=false}={}){
  if(!navigator.mediaDevices?.getUserMedia){$('cameraFile').click();return;}
  if(!skipDiscard&&!canDiscard())return;
  stopCamera();$('cameraPanel').hidden=false;$('cameraHint').textContent='Membuka kamera…';
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facingMode},width:{ideal:1920},height:{ideal:1080}}});
    const video=$('cameraVideo');video.srcObject=cameraStream;await video.play();
    const track=cameraStream.getVideoTracks()[0],capabilities=track?.getCapabilities?.();$('torchCamera').hidden=!(capabilities&&capabilities.torch);
    cameraFrameQuality();cameraQualityTimer=setInterval(cameraFrameQuality,800);
  }catch(error){
    stopCamera();status(error?.name==='NotAllowedError'?'Izin kamera belum diberikan. Gunakan galeri atau izinkan kamera.':'Kamera langsung tidak dapat dibuka. Mencoba kamera perangkat…');
    try{$('cameraFile').click();}catch{}
  }
}
async function snapCamera(){
  const video=$('cameraVideo');if(!cameraStream||!video.videoWidth)return status('Kamera belum siap.');
  try{
    const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d',{alpha:false}).drawImage(video,0,0,c.width,c.height);
    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.93));if(!blob)throw Error('Foto tidak dapat diambil.');
    const suggested=$('autoIncrement').checked&&$('sample').value.trim()?$('sample').value.trim():nowName();
    stopCamera();await setPhoto(blob,suggested);
  }catch(error){status(error.message||'Foto tidak dapat diambil.');}
}

function recordFromCurrent(id,existing){
  const correction=correctionNow(),priority=activeLearningPriority({correction,confidence:confidenceStats?.confidence,quality:qualityStats,reviewCount:reviewIndices().length});
  return {
    id,name:$('sample').value.trim(),imageBlob:photoBlob,thumbnail:existing?.thumbnail||thumbnailDataURL(image),width:image.naturalWidth,height:image.naturalHeight,
    boxes:cloneBoxes(),boxMeta:cloneMeta(),predictedBoxes:predictedDetections.map(d=>[...d.box]),predictedDetections:predictedDetections.map(d=>({box:[...d.box],score:d.score})),
    predictionMethod,modelVersion,confidenceStats,qualityStats,condition:$('condition').value,correction,learningPriority:priority,
    cloudContributionId:cloudContributionId||existing?.cloudContributionId||'',cloudEditToken:cloudEditToken||existing?.cloudEditToken||'',
    reviewed:true,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()
  };
}
function sendCurrentToStatistics({quiet=false}={}){
  if(!image){if(!quiet)status('Ambil foto atau pilih foto terlebih dahulu.');return null;}
  try{
    const result=upsertChiliCountToStatistics(localStorage,{sample:$('sample').value.trim(),count:boxes.length});
    if(!quiet)status('Masuk ke Statistical Web → '+result.dataset+': '+$('sample').value.trim()+' = '+boxes.length+' buah.');
    return result;
  }catch(error){if(!quiet)status(error.message||'Data belum dapat dikirim ke Statistical Web.');return null;}
}
async function saveCurrent({auto=false,duplicateMode=''}={}){
  if(!image||!detectionRun)return false;
  const name=$('sample').value.trim();if(!name){status('Isi kode sampel.');return false;}
  const duplicate=await checkDuplicate();
  let targetId=activeId,existing=null;
  if(duplicate&&duplicateMode!=='copy'&&!targetId){
    if(duplicateMode!=='update'){status('Kode sampel sudah ada. Pilih Perbarui atau Simpan sebagai salinan.');return false;}
    targetId=duplicate.id;
  }
  if(duplicate&&duplicateMode==='copy'&&!targetId){
    const rows=await transaction('readonly',store=>store.getAll()),next=duplicateName(name,rows);$('sample').value=next;duplicateId='';$('duplicateBanner').hidden=true;
  }
  try{
    targetId=targetId||crypto.randomUUID();existing=await transaction('readonly',store=>store.get(targetId));
    await transaction('readwrite',store=>store.put(recordFromCurrent(targetId,existing)));
    activeId=targetId;dirty=false;duplicateId='';$('duplicateBanner').hidden=true;await clearDraft();await list();
    const synced=fieldContext?null:sendCurrentToStatistics({quiet:true});updateWorkflowState();updateBatchState();
    if(fieldContext)sendCountToField();
    const savedName=$('sample').value.trim();
    if(!auto)status('Tersimpan: '+boxes.length+' buah · '+savedName+(synced?' · Statistical Web diperbarui.':'') );
    if($('autoIncrement').checked&&batchTotal<=1)$('sample').value=incrementSampleCode(savedName);
    if($('autoNext').checked&&batchQueue.length){await loadNextBatch();return true;}
    await checkDuplicate();return true;
  }catch(error){status('Penyimpanan gagal. Periksa ruang penyimpanan browser; hasil di layar belum hilang.');return false;}
}

async function contributeCurrent(){
  if(contributing||!image||!detectionRun)return;
  if(!cloudContributionReady())return status('Kontribusi cloud belum diaktifkan.');
  contributing=true;$('contribute').disabled=true;$('contribute').textContent='Mengirim…';
  if(!contributionOperationId)contributionOperationId=crypto.randomUUID();
  try{
    const updating=Boolean(cloudContributionId&&cloudEditToken),result=await submitTrainingContribution({
      image,sample:$('sample').value.trim()||nowName(),boxes:cloneBoxes(),predictedBoxes:predictedDetections.map(d=>[...d.box]),
      predictionMethod,modelVersion,consent:true,contributionId:cloudContributionId,editToken:cloudEditToken,operationId:contributionOperationId
    });
    cloudContributionId=result.id||cloudContributionId;cloudEditToken=result.editToken||cloudEditToken;contributionOperationId='';
    if(activeId){
      const existing=await transaction('readonly',store=>store.get(activeId));
      if(existing)await transaction('readwrite',store=>store.put({...existing,cloudContributionId,cloudEditToken,updatedAt:new Date().toISOString()}));
    }
    status(updating?'Anotasi Cloudflare diperbarui tanpa mengunggah foto lagi.':'Kontribusi diterima. Foto diunggah sekali; koreksi berikutnya hanya mengirim anotasi.');
  }catch(error){status(error.message||'Kontribusi belum dapat dikirim.');}
  finally{contributing=false;updateWorkflowState();}
}

async function openRecord(row){
  if(!canDiscard())return;
  try{
    const blob=row.imageBlob instanceof Blob?row.imageBlob:dataUrlToBlob(row.image||'');
    const decoded=await decodeBlob(blob);revokePhotoUrl();photoBlob=blob;photoUrl=decoded.url;image=decoded.image;
    boxes=(row.boxes||[]).map(b=>[...b]);predictedDetections=(row.predictedDetections?.length?row.predictedDetections:(row.predictedBoxes||[]).map(box=>({box,score:null}))).map(d=>({box:[...d.box],score:d.score}));
    boxMeta=(row.boxMeta||hydrateMeta(boxes.map((box,i)=>({box,score:predictedDetections[i]?.score,source:row.predictionMethod})))).map(m=>({...m,reasons:[...(m.reasons||[])]}));
    history=[];selected=-1;activeId=row.id;dirty=false;detectionRun=true;predictionMethod=row.predictionMethod||'manual';modelVersion=row.modelVersion||'heuristic-color-v1';
    confidenceStats=row.confidenceStats||null;qualityStats=row.qualityStats||null;cloudContributionId=row.cloudContributionId||'';cloudEditToken=row.cloudEditToken||'';contributionOperationId='';
    batchQueue=[];batchTotal=0;batchIndex=0;$('sample').value=row.name;$('condition').value=row.condition||'normal';resetView();layoutCanvas();paint();if(!qualityStats)updateQuality();renderConfidence();updateWorkflowState();await checkDuplicate();
    window.scrollTo({top:0,behavior:'smooth'});status('Sampel dibuka: '+boxes.length+' buah.');
  }catch{status('Foto tersimpan tidak dapat dibuka.');}
}
async function deleteRecord(row){
  try{await transaction('readwrite',store=>store.delete(row.id));if(activeId===row.id)activeId=null;await list();status('Sampel dihapus.');}
  catch{status('Sampel tidak dapat dihapus.');}
}
function fmt(v,d=1){return Number.isFinite(v)?Number(v).toFixed(d):'—';}
function pct(v){return Number.isFinite(v)?(v*100).toFixed(1)+'%':'—';}
function renderValidation(rows){
  const m=datasetMetrics(rows);$('metricN').textContent=String(m.n);$('metricMae').textContent=fmt(m.mae,2);$('metricBias').textContent=fmt(m.bias,2);
  $('metricPrecision').textContent=pct(m.precision);$('metricRecall').textContent=pct(m.recall);$('metricF1').textContent=pct(m.f1);$('metricAp50').textContent=pct(m.ap50);
  const labels={normal:'Normal',overlap:'Bertumpuk',occluded:'Tertutup', 'low-light':'Cahaya rendah','mixed-color':'Warna campuran'};
  $('conditionMetrics').innerHTML=Object.entries(m.byCondition||{}).map(([key,v])=>'<span>'+ (labels[key]||key)+' · n='+v.n+' · MAE '+fmt(v.mae,1)+' · F1 '+pct(v.f1)+'</span>').join('');
}
async function list(){
  const rows=(await transaction('readonly',store=>store.getAll())||[]).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  renderValidation(rows);const host=$('records');host.replaceChildren();
  if(!rows.length){const li=document.createElement('li');li.textContent='Belum ada data tersimpan.';host.append(li);return rows;}
  for(const row of rows){
    const li=document.createElement('li'),main=document.createElement('div'),actions=document.createElement('div');main.className='record-main';
    main.innerHTML=(row.thumbnail?'<img class="record-thumb" alt="" loading="lazy">':'')+'<span><b></b><small></small></span>';
    if(row.thumbnail)main.querySelector('img').src=row.thumbnail;
    main.querySelector('b').textContent=row.name;
    const correction=row.correction||matchBoxes((row.predictedDetections||row.predictedBoxes||[]),row.boxes||[],.5),priority=row.learningPriority??0;
    main.querySelector('small').textContent=(row.boxes?.length||0)+' buah · error AI '+(correction.countError>0?'+':'')+correction.countError+' · '+(priority>=60?'prioritas training tinggi':'review '+priority+'/100');
    actions.className='record-actions';const open=document.createElement('button');open.type='button';open.textContent='Buka';open.onclick=()=>openRecord(row);
    const remove=document.createElement('button');remove.type='button';remove.textContent='Hapus';remove.onclick=()=>deleteRecord(row);actions.append(open,remove);li.append(main,actions);host.append(li);
  }
  return rows;
}
async function exportBackup(){
  try{
    const rows=await transaction('readonly',store=>store.getAll());if(!rows.length)return status('Belum ada data tersimpan.');
    const samples=[];for(const row of rows){
      const {cloudEditToken,cloudContributionId,imageBlob,...rest}=row;
      const blob=imageBlob instanceof Blob?imageBlob:dataUrlToBlob(row.image||'');samples.push({...rest,image:await blobToDataURL(blob)});
    }
    const payload={version:2,format:'chili-boxes',className:'cabai',boxFormat:'normalized top-left x,y,width,height',samples};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='data-cabai.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);status('Cadangan berhasil diekspor.');
  }catch{status('Ekspor gagal.');}
}
function validImported(r){
  return r&&typeof r.name==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(r.image||'')&&Array.isArray(r.boxes)&&r.boxes.every(b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite));
}
async function importBackup(file){
  const data=JSON.parse(await file.text());if(![1,2].includes(data.version)||data.format!=='chili-boxes'||!Array.isArray(data.samples)||!data.samples.every(validImported))throw Error('Format cadangan tidak valid.');
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('samples','readwrite'),store=tx.objectStore('samples');
    for(const record of data.samples){const {image,...rest}=record;store.put({...rest,id:crypto.randomUUID(),imageBlob:dataUrlToBlob(image),cloudContributionId:'',cloudEditToken:''});}
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  await list();status('Cadangan berhasil dipulihkan sebagai salinan.');
}

function warmOfflineModel(){
  if(!('serviceWorker'in navigator))return;
  navigator.serviceWorker.ready.then(reg=>{
    const worker=reg.active||reg.waiting||reg.installing;if(!worker)return;
    for(const url of ['/hitung-cabai/','/hitung-cabai/app.js','/hitung-cabai/style.css','/hitung-cabai/detector.js','/hitung-cabai/ml-detector.js','/hitung-cabai/review-metrics.js','/hitung-cabai/model-manifest.json','/hitung-cabai/models/cabai-latest.onnx'])worker.postMessage({type:'WARM_ROUTE',url});
  }).catch(()=>{});
}

$('photo').onchange=e=>chooseFile(e.target);$('cameraFile').onchange=e=>chooseFile(e.target);$('batchNext').onclick=()=>void loadNextBatch();
$('openCamera').onclick=()=>startCamera();$('closeCamera').onclick=stopCamera;$('snapPhoto').onclick=snapCamera;
$('flipCamera').onclick=async()=>{facingMode=facingMode==='environment'?'user':'environment';await startCamera({skipDiscard:true});};
$('torchCamera').onclick=async()=>{
  const track=cameraStream?.getVideoTracks?.()[0];if(!track)return;
  try{torchOn=!torchOn;await track.applyConstraints({advanced:[{torch:torchOn}]});$('torchCamera').textContent=torchOn?'Flash mati':'Flash';}
  catch{torchOn=false;$('torchCamera').textContent='Flash';status('Flash tidak didukung pada kamera ini.');}
};
$('autoDetect').onclick=()=>autoDetectChilies();$('reviewLow').onclick=reviewNext;$('deleteSelected').onclick=deleteSelected;$('undo').onclick=undo;$('mobileUndo').onclick=undo;$('zoomReset').onclick=resetView;
$('sample').oninput=()=>{dirty=true;updateWorkflowState();void checkDuplicate();};
for(const id of ['detectColor','detectSensitivity','detectOnLoad','autoNext','autoIncrement','batchAuto','condition'])$(id).onchange=saveDetectSettings;
$('mobileSave').onclick=()=>void saveCurrent();$('saveDesktop').onclick=()=>void saveCurrent();$('updateDuplicate').onclick=()=>void saveCurrent({duplicateMode:'update'});$('saveCopy').onclick=()=>void saveCurrent({duplicateMode:'copy'});
$('contribute').onclick=contributeCurrent;
$('export').onclick=exportBackup;$('import').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{await importBackup(f);}catch(error){status(error.message||'Pemulihan gagal.');}e.target.value='';};
window.addEventListener('resize',()=>redraw(true));window.visualViewport?.addEventListener('resize',()=>redraw(true));
window.addEventListener('beforeunload',event=>{stopCamera();revokePhotoUrl();if(dirty){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&cameraStream)stopCamera();});

try{
  applyDetectSettings();db=await openDB();await list();updateWorkflowState();warmOfflineModel();
  const recovered=await restoreDraft();
  $('cloudState').textContent=cloudContributionReady()?'Cloudflare siap menerima anotasi yang sudah Anda koreksi.':'Cloudflare belum dikonfigurasi; penyimpanan lokal tetap berfungsi.';
  if(recovered)window.AgrotikShell?.addRecent?.({type:'recovery',label:'Draft Hitung Cabai',path:'/hitung-cabai/',detail:'Dipulihkan'});
  if(fieldContext?.plot_label){$('sample').value=fieldContext.plot_label;status('Mode plot '+fieldContext.plot_label+' · hasil simpan akan dikirim kembali ke Denah Lahan.');}
  if(!navigator.mediaDevices?.getUserMedia)$('openCamera').textContent='📷 Ambil foto';
}catch(error){
  status('Penyimpanan browser tidak tersedia. Deteksi masih dapat digunakan, tetapi hasil tidak bisa disimpan permanen.');
  $('mobileSave').disabled=true;$('export').disabled=true;$('import').disabled=true;
}
