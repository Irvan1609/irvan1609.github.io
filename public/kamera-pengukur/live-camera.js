import {detectMarkers} from './geometry.js';
import {alignmentCheck} from './alignment.js';

export function cameraGuide(points,width,height) {
  const h=Math.min(height*.76,width*.76*267/180),w=h*180/267;
  const x=(width-w)/2,y=(height-h)/2;
  const target=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  if(!points)return {target,ready:false,message:'Tampilkan keempat penanda magenta. Teks kertas di bagian atas.'};
  const alignment=alignmentCheck(points);
  const center=points.reduce((a,p)=>[a[0]+p[0]/4,a[1]+p[1]/4],[0,0]);
  const error=Math.max(...points.map((p,i)=>Math.hypot(p[0]-target[i][0],p[1]-target[i][1])))/h;
  const ready=!!alignment&&!alignment.retake&&error<.055;
  let message='Cocokkan empat titik dengan lingkaran sasaran; putar kamera agar kertas tegak.';
  if(ready)message='Penanda selaras — tahan kamera, lalu ambil foto. Periksa hasil sebelum mengukur.';
  else if(alignment?.retake)message='Sejajarkan bidang kamera dengan alas; jangan memotret dari samping.';
  else if(Math.abs(center[0]-width/2)>w*.08||Math.abs(center[1]-height/2)>h*.08)message='Geser posisi kamera agar pusat kertas bertemu tanda + di tengah.';
  else {
    const size=(Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1])+Math.hypot(points[2][0]-points[3][0],points[2][1]-points[3][1]))/2;
    if(size<w*.92)message='Dekatkan kamera ke alas agar penanda mengisi sasaran.';
    if(size>w*1.08)message='Jauhkan kamera dari alas agar penanda masuk sasaran.';
  }
  return {target,ready,message};
}

export function installLiveCamera(onCapture) {
  const $=id=>document.getElementById(id),open=$('openLive'),close=$('closeLive'),take=$('takeLive');
  const panel=$('livePanel'),video=$('liveVideo'),overlay=$('liveOverlay'),status=$('liveStatus');
  const sample=document.createElement('canvas'),sc=sample.getContext('2d',{willReadFrequently:true});
  const oc=overlay.getContext('2d');
  let stream=null,timer=null,generation=0,stable=0;
  const setStatus=message=>{if(status.textContent!==message)status.textContent=message;};
  function stop(){
    generation++;clearTimeout(timer);timer=null;stable=0;
    stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
    take.disabled=true;open.disabled=false;panel.hidden=true;
  }
  function frame(){
    if(!stream)return;
    if(video.readyState>=2&&video.videoWidth&&video.videoHeight){
      const scale=Math.min(1,480/Math.max(video.videoWidth,video.videoHeight));
      sample.width=Math.round(video.videoWidth*scale);sample.height=Math.round(video.videoHeight*scale);
      overlay.width=sample.width;overlay.height=sample.height;
      sc.drawImage(video,0,0,sample.width,sample.height);
      let points=null;
      try{points=detectMarkers(sc.getImageData(0,0,sample.width,sample.height));}catch{/* Continue with target overlay. */}
      const guide=cameraGuide(points,sample.width,sample.height);
      stable=guide.ready?stable+1:0;
      const ready=stable>=4;
      take.disabled=!ready;
      setStatus(guide.ready&&!ready?'Posisi cocok. Tahan kamera sebentar…':guide.message);
      oc.strokeStyle=ready?'#00ef99':'#ffcf40';oc.lineWidth=2;
      oc.setLineDash([5,4]);oc.beginPath();guide.target.forEach((p,i)=>i?oc.lineTo(...p):oc.moveTo(...p));oc.closePath();oc.stroke();oc.setLineDash([]);
      guide.target.forEach(p=>{oc.beginPath();oc.arc(...p,8,0,Math.PI*2);oc.stroke();});
      const cx=sample.width/2,cy=sample.height/2;
      oc.beginPath();oc.moveTo(cx-8,cy);oc.lineTo(cx+8,cy);oc.moveTo(cx,cy-8);oc.lineTo(cx,cy+8);oc.stroke();
      if(points){oc.fillStyle='#00e5ff';points.forEach((p,i)=>{oc.beginPath();oc.arc(...p,4,0,Math.PI*2);oc.fill();oc.fillText(String(i+1),p[0]+6,p[1]-6);});}
    }
    timer=setTimeout(frame,250);
  }
  open.onclick=async()=>{
    stop();const id=generation;panel.hidden=false;open.disabled=true;
    setStatus('Meminta izin kamera belakang…');
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Kamera langsung tidak tersedia. Gunakan unggah foto atau kamera bawaan.');
      const incoming=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
      if(id!==generation){incoming.getTracks().forEach(t=>t.stop());return;}
      stream=incoming;video.srcObject=stream;await video.play();
      if(id!==generation)return;
      stream.getTracks().forEach(t=>t.addEventListener('ended',()=>{if(id===generation){stop();panel.hidden=false;setStatus('Kamera berhenti. Buka kamera kembali atau unggah foto.');}}));
      frame();
    }catch(error){
      if(id!==generation)return;
      stop();panel.hidden=false;
      setStatus(error.name==='NotAllowedError'?'Izin kamera ditolak. Izinkan kamera melalui browser, atau gunakan unggah foto.':'Kamera tidak dapat dibuka. Tutup aplikasi kamera lain atau gunakan unggah foto.');
    }
  };
  close.onclick=()=>{stop();open.focus();};
  take.onclick=()=>{
    if(!stream||take.disabled||!video.videoWidth)return;
    const id=generation,c=document.createElement('canvas');
    c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d').drawImage(video,0,0);
    take.disabled=true;clearTimeout(timer);
    c.toBlob(blob=>{
      if(id!==generation)return;
      if(!blob){setStatus('Foto gagal dibuat. Coba lagi.');frame();return;}
      stop();onCapture(new File([blob],'kamera-'+Date.now()+'.png',{type:'image/png'}));
    },'image/png');
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('pagehide',stop);
  return {stop};
}
