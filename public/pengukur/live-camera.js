import {detectMarkers} from './geometry.js';
import {alignmentCheck} from './alignment.js';
import {imageQuality} from './image-tools.js';

export function cameraGuide(points,width,height,profile={activeWidth:180,activeHeight:267}){
  const ratio=profile.activeWidth/profile.activeHeight;
  const h=Math.min(height*.78,width*.78/ratio),w=h*ratio,x=(width-w)/2,y=(height-h)/2;
  const target=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  if(!points)return {target,ready:false,message:'Tampilkan keempat marker magenta. Orientasi atas kalibrator berada di sisi atas layar.'};
  const alignment=alignmentCheck(points,ratio),center=points.reduce((a,p)=>[a[0]+p[0]/4,a[1]+p[1]/4],[0,0]);
  const error=Math.max(...points.map((p,i)=>Math.hypot(p[0]-target[i][0],p[1]-target[i][1])))/h;
  const ready=!!alignment&&!alignment.retake&&error<.06;
  let message='Cocokkan empat marker dengan sasaran.';
  if(ready)message='Geometri selaras. Tahan kamera sampai Quality Gate hijau.';
  else if(alignment?.retake)message='Kurangi kemiringan perspektif; sejajarkan kamera terhadap bidang alas.';
  else if(Math.abs(center[0]-width/2)>w*.08||Math.abs(center[1]-height/2)>h*.08)message='Geser kamera agar pusat kertas berada di tanda +.';
  else{
    const size=(Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1])+Math.hypot(points[2][0]-points[3][0],points[2][1]-points[3][1]))/2;
    if(size<w*.9)message='Dekatkan kamera ke alas.';
    if(size>w*1.1)message='Jauhkan kamera dari alas.';
  }
  return {target,ready,message,alignment,error};
}

export function installLiveCamera({onCapture,getProfile,onQuality}){
  const $=id=>document.getElementById(id),open=$('openLive'),close=$('closeLive'),take=$('takeLive');
  const panel=$('livePanel'),video=$('liveVideo'),overlay=$('liveOverlay'),status=$('liveStatus'),qualityEl=$('liveQuality');
  const sample=document.createElement('canvas'),sc=sample.getContext('2d',{willReadFrequently:true}),oc=overlay.getContext('2d');
  let stream=null,timer=null,generation=0,stable=0,capturing=false;
  let orientation={beta:null,gamma:null,seen:false};
  const orientationState=()=>{
    if(!orientation.seen)return {available:false,ready:true,beta:null,gamma:null};
    const beta=Math.min(Math.abs(orientation.beta||0),Math.abs(Math.abs(orientation.beta||0)-180)),gamma=Math.abs(orientation.gamma||0);
    return {available:true,ready:beta<=7&&gamma<=7,beta,gamma};
  };
  const onOrientation=e=>{if(Number.isFinite(e.beta)&&Number.isFinite(e.gamma))orientation={beta:e.beta,gamma:e.gamma,seen:true};};
  if(typeof window!=='undefined')window.addEventListener('deviceorientation',onOrientation,{passive:true});
  const setStatus=message=>{if(status&&status.textContent!==message)status.textContent=message;};
  function stop(){
    generation++;clearTimeout(timer);timer=null;stable=0;capturing=false;
    stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
    if(take)take.disabled=true;if(open)open.disabled=false;if(panel)panel.hidden=true;
  }
  function renderGate(q,ready,sensor={available:false}) {
    if(!qualityEl)return;
    const level=ready?'good':q.score>=60?'warn':'bad';
    const sensorText=sensor.available?` · Pitch ${sensor.beta.toFixed(1)}° · Roll ${sensor.gamma.toFixed(1)}°`:'';
    qualityEl.innerHTML=`<b>${q.score}/100</b><span class="${level}">${ready?'Siap':q.score>=60?'Perbaiki':'Belum layak'}</span><small>Fokus ${q.sharpness} · Cahaya ${q.exposure} · Geometri ${q.alignmentScore}${sensorText}</small>`;
  }
  function captureNow(){
    if(capturing||!stream||!video.videoWidth)return;
    capturing=true;const id=generation,c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d').drawImage(video,0,0);
    if(take)take.disabled=true;clearTimeout(timer);
    c.toBlob(blob=>{
      if(id!==generation)return;
      if(!blob){capturing=false;setStatus('Foto gagal dibuat. Coba lagi.');frame();return;}
      stop();onCapture(new File([blob],'pengukur-'+Date.now()+'.jpg',{type:'image/jpeg'}));
    },'image/jpeg',.94);
  }
  function frame(){
    if(!stream)return;
    if(video.readyState>=2&&video.videoWidth&&video.videoHeight){
      const scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));
      sample.width=Math.max(2,Math.round(video.videoWidth*scale));sample.height=Math.max(2,Math.round(video.videoHeight*scale));
      overlay.width=sample.width;overlay.height=sample.height;sc.drawImage(video,0,0,sample.width,sample.height);oc.clearRect(0,0,overlay.width,overlay.height);
      let points=null;try{points=detectMarkers(sc.getImageData(0,0,sample.width,sample.height));}catch{}
      const profile=getProfile(),guide=cameraGuide(points,sample.width,sample.height,profile);
      const image=sc.getImageData(0,0,sample.width,sample.height),alignment=points?alignmentCheck(points,profile.activeWidth/profile.activeHeight):null,q=imageQuality(image,points,alignment);
      const sensor=orientationState(),gate=guide.ready&&q.score>=72&&q.sharpness>=38&&q.exposure>=55&&sensor.ready;
      stable=gate?stable+1:0;const ready=stable>=4;
      if(take)take.disabled=!ready;renderGate(q,ready,sensor);onQuality?.({...q,sensor});
      setStatus(sensor.available&&!sensor.ready?'Ratakan ponsel · usahakan pitch/roll ≤ 7°.':gate&&!ready?'Posisi baik. Tahan kamera sebentar…':ready?'Siap diambil.':guide.message);
      oc.strokeStyle=ready?'#00ef99':gate?'#65d8ad':'#ffcf40';oc.lineWidth=2;oc.setLineDash([5,4]);oc.beginPath();
      guide.target.forEach((p,i)=>i?oc.lineTo(...p):oc.moveTo(...p));oc.closePath();oc.stroke();oc.setLineDash([]);
      guide.target.forEach(p=>{oc.beginPath();oc.arc(...p,8,0,Math.PI*2);oc.stroke();});
      const cx=sample.width/2,cy=sample.height/2;oc.beginPath();oc.moveTo(cx-8,cy);oc.lineTo(cx+8,cy);oc.moveTo(cx,cy-8);oc.lineTo(cx,cy+8);oc.stroke();
      if(points){oc.fillStyle='#00e5ff';points.forEach((p,i)=>{oc.beginPath();oc.arc(...p,4,0,Math.PI*2);oc.fill();oc.fillText(String(i+1),p[0]+6,p[1]-6);});}
      if(ready&&$('autoCapture')?.checked&&!capturing){setStatus('Quality Gate lolos · mengambil foto otomatis…');captureNow();return;}
    }
    timer=setTimeout(frame,220);
  }
  if(open)open.onclick=async()=>{
    stop();const id=generation;if(panel)panel.hidden=false;open.disabled=true;setStatus('Meminta izin kamera belakang…');
    try{
      if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){
        try{if(await DeviceOrientationEvent.requestPermission()!=='granted')orientation.seen=false;}catch{}
      }
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Kamera langsung tidak tersedia.');
      const incoming=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
      if(id!==generation){incoming.getTracks().forEach(t=>t.stop());return;}
      stream=incoming;video.srcObject=stream;await video.play();if(id!==generation)return;
      stream.getTracks().forEach(t=>t.addEventListener('ended',()=>{if(id===generation){stop();panel.hidden=false;setStatus('Kamera berhenti. Buka kembali atau unggah foto.');}}));frame();
    }catch(error){
      if(id!==generation)return;stop();if(panel)panel.hidden=false;
      setStatus(error.name==='NotAllowedError'?'Izin kamera ditolak. Izinkan kamera di browser atau unggah foto.':'Kamera tidak dapat dibuka. Gunakan unggah foto atau kamera bawaan.');open.disabled=false;
    }
  };
  if(close)close.onclick=()=>{stop();open?.focus();};
  if(take)take.onclick=captureNow;
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',stop);
  return {stop,captureNow};
}
