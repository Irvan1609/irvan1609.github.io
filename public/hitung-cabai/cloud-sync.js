import {CHILI_CLOUD_CONFIG,cloudContributionReady} from './cloud-config.js?v=20260925-2';

let turnstileLoader=null;
let widgetId=null;

const loadScript=()=>new Promise((resolve,reject)=>{
  if(window.turnstile)return resolve(window.turnstile);
  const existing=document.querySelector('script[data-chili-turnstile]');
  if(existing){
    existing.addEventListener('load',()=>resolve(window.turnstile),{once:true});
    existing.addEventListener('error',()=>reject(Error('Turnstile tidak dapat dimuat.')),{once:true});
    return;
  }
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async=true;script.defer=true;script.dataset.chiliTurnstile='1';
  script.onload=()=>resolve(window.turnstile);
  script.onerror=()=>reject(Error('Turnstile tidak dapat dimuat.'));
  document.head.append(script);
});

async function turnstileToken(){
  if(!cloudContributionReady())throw Error('Kontribusi cloud belum dikonfigurasi.');
  if(!turnstileLoader)turnstileLoader=loadScript();
  const turnstile=await turnstileLoader;
  const container=document.getElementById('turnstileBox');
  if(!container)throw Error('Komponen verifikasi tidak tersedia.');
  if(widgetId!==null){
    try{turnstile.remove(widgetId);}catch{}
    widgetId=null;
  }
  return await new Promise((resolve,reject)=>{
    let settled=false;
    widgetId=turnstile.render(container,{
      sitekey:CHILI_CLOUD_CONFIG.turnstileSiteKey,
      action:'chili_contribute',
      execution:'execute',
      appearance:'interaction-only',
      theme:'auto',
      callback:token=>{if(!settled){settled=true;resolve(token);}},
      'error-callback':()=>{if(!settled){settled=true;reject(Error('Verifikasi anti-bot gagal. Coba lagi.'));}},
      'expired-callback':()=>{if(!settled){settled=true;reject(Error('Verifikasi kedaluwarsa. Coba lagi.'));}}
    });
    turnstile.execute(widgetId);
  });
}

const canvasBlob=(canvas,type,quality)=>new Promise(resolve=>canvas.toBlob(resolve,type,quality));

export async function prepareTrainingImage(source,{maxSide=1280,maxBytes=CHILI_CLOUD_CONFIG.maxUploadBytes}={}){
  if(!source?.naturalWidth||!source?.naturalHeight)throw Error('Foto belum tersedia.');
  const scale=Math.min(1,maxSide/Math.max(source.naturalWidth,source.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(source.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(source.naturalHeight*scale));
  canvas.getContext('2d',{alpha:false}).drawImage(source,0,0,canvas.width,canvas.height);
  for(const quality of [.82,.72,.62,.52]){
    const blob=await canvasBlob(canvas,'image/webp',quality);
    if(blob&&blob.size<=maxBytes)return {blob,width:canvas.width,height:canvas.height,mimeType:'image/webp'};
  }
  const jpeg=await canvasBlob(canvas,'image/jpeg',.52);
  if(!jpeg||jpeg.size>maxBytes)throw Error('Foto masih terlalu besar untuk kontribusi. Coba foto dengan resolusi lebih rendah.');
  return {blob:jpeg,width:canvas.width,height:canvas.height,mimeType:'image/jpeg'};
}

function cleanBoxes(value){
  if(!Array.isArray(value)||value.length>1500)throw Error('Jumlah kotak tidak valid.');
  return value.map(box=>{
    if(!Array.isArray(box)||box.length!==4||box.some(v=>!Number.isFinite(v)))throw Error('Koordinat kotak tidak valid.');
    const [x,y,w,h]=box;
    if(x<0||y<0||w<=0||h<=0||x+w>1.000001||y+h>1.000001)throw Error('Koordinat kotak berada di luar foto.');
    return box.map(v=>Number(v.toFixed(7)));
  });
}

export async function submitTrainingContribution({
  image,
  sample,
  boxes,
  predictedBoxes=[],
  predictionMethod='manual',
  modelVersion=CHILI_CLOUD_CONFIG.modelVersion,
  consent=false
}={}){
  if(!cloudContributionReady())throw Error('Kontribusi cloud belum diaktifkan oleh pengelola.');
  if(!consent)throw Error('Persetujuan penggunaan data untuk pelatihan belum diberikan.');
  const finalBoxes=cleanBoxes(boxes),initialBoxes=cleanBoxes(predictedBoxes);
  const prepared=await prepareTrainingImage(image);
  const token=await turnstileToken();
  const form=new FormData();
  form.append('image',prepared.blob,prepared.mimeType==='image/webp'?'cabai.webp':'cabai.jpg');
  form.append('sample',String(sample||'').trim().slice(0,100));
  form.append('width',String(prepared.width));
  form.append('height',String(prepared.height));
  form.append('boxes',JSON.stringify(finalBoxes));
  form.append('predicted_boxes',JSON.stringify(initialBoxes));
  form.append('predicted_count',String(initialBoxes.length));
  form.append('final_count',String(finalBoxes.length));
  form.append('prediction_method',String(predictionMethod||'manual').slice(0,40));
  form.append('model_version',String(modelVersion||'unknown').slice(0,80));
  form.append('consent','true');

  const endpoint=CHILI_CLOUD_CONFIG.endpoint.replace(/\/+$/,'');
  const response=await fetch(endpoint+'/v1/contributions',{
    method:'POST',
    headers:{'CF-Turnstile-Token':token},
    body:form
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(payload.error||`Kontribusi gagal (HTTP ${response.status}).`);
  return payload;
}

export {cloudContributionReady};
