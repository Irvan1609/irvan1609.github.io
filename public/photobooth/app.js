(() => {
  const $ = id => document.getElementById(id);
  const video = $('video'), placeholder = $('placeholder'), status = $('cameraStatus');
  const shotsEl = $('shots'), output = $('output'), ctx = output.getContext('2d');
  let stream = null, facing = 'user', photos = [], stripColor = '#fff8f1', busy = false;
  const shotCount = () => Number($('shotCount').value);
  const updateUI = () => {
    const total = shotCount(), count = photos.length;
    $('shotProgress').textContent = count + '/' + total;
    $('progressBar').style.width = (count / total * 100) + '%';
    $('capture').disabled = !stream || busy || count >= total;
    $('startSession').disabled = !stream || busy;
    $('retakeAll').disabled = !count || busy;
    $('download').disabled = !count || busy;
    shotsEl.innerHTML = '';
    for (let i=0;i<total;i++) {
      const card = document.createElement('div');
      card.className = 'shot' + (photos[i] ? '' : ' empty');
      if (photos[i]) {
        const img = document.createElement('img'); img.src = photos[i]; img.alt = 'Foto ' + (i+1); card.append(img);
        const retake = document.createElement('button'); retake.type='button'; retake.textContent='Ulangi'; retake.setAttribute('aria-label','Ulangi foto '+(i+1));
        retake.addEventListener('click',()=>retakeOne(i)); card.append(retake);
      } else card.textContent = 'Foto ' + (i+1);
      shotsEl.append(card);
    }
    $('resultHint').classList.toggle('hidden', count > 0);
    if (count) drawStrip();
  };
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      $('cameraHint').textContent = 'Browser ini tidak mendukung kamera. Buka melalui HTTPS di Safari versi terbaru.';
      return;
    }
    stopCamera();
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1440}}});
      video.srcObject = stream; video.classList.remove('hidden'); placeholder.classList.add('hidden');
      status.textContent = 'KAMERA AKTIF'; $('startCamera').textContent='Matikan Kamera';
      $('startCamera').onclick = stopCamera; $('switchCamera').disabled = false; updateUI();
    } catch (error) {
      $('cameraHint').textContent = error.name === 'NotAllowedError' ? 'Izin kamera ditolak. Aktifkan izin kamera untuk situs ini melalui pengaturan browser.' : 'Kamera tidak dapat dibuka: ' + error.message;
    }
  }
  function stopCamera() {
    if (stream) stream.getTracks().forEach(track=>track.stop());
    stream=null; video.srcObject=null; video.classList.add('hidden'); placeholder.classList.remove('hidden');
    status.textContent='KAMERA NONAKTIF'; $('startCamera').textContent='Aktifkan Kamera';
    $('startCamera').onclick=startCamera; $('switchCamera').disabled=true; updateUI();
  }
  function captureFrame() {
    const w=video.videoWidth,h=video.videoHeight;if(!w||!h) return null;
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const c=canvas.getContext('2d');c.translate(w,0);c.scale(-1,1);c.drawImage(video,0,0,w,h);
    return canvas.toDataURL('image/jpeg',.92);
  }
  const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
  async function countdown() {
    const seconds=Number($('timer').value);
    for(let n=seconds;n>0;n--){$('countdown').textContent=n;await wait(1000);}
    $('countdown').textContent='';
  }
  async function takeOne() {
    if(!stream||busy||photos.length>=shotCount())return;
    busy=true;updateUI();
    try { await countdown(); const image=captureFrame(); if(image)photos.push(image); }
    finally { $('countdown').textContent='';busy=false;updateUI(); }
  }
  async function startSession() {
    if(!stream||busy)return;
    photos=[];updateUI();
    const total=shotCount();
    for(let i=0;i<total;i++){
      await takeOne();
      if(i<total-1)await wait(650);
    }
  }
  async function retakeOne(index) {
    if(!stream||busy||!Number.isInteger(index)||index<0||index>=photos.length)return;
    busy=true;updateUI();
    try { await countdown(); const image=captureFrame(); if(image)photos[index]=image; }
    finally { $('countdown').textContent='';busy=false;updateUI(); }
  }
  function drawCover(image,x,y,w,h) {
    const scale=Math.max(w/image.width,h/image.height),sw=w/scale,sh=h/scale;
    const sx=(image.width-sw)/2,sy=(image.height-sh)/2;
    ctx.drawImage(image,sx,sy,sw,sh,x,y,w,h);
  }
  async function drawStrip() {
    const total=photos.length, width=1000, margin=64, gap=26, photoW=width-margin*2, photoH=750;
    output.width=width;output.height=margin*2+total*photoH+(total-1)*gap+70;
    ctx.fillStyle=stripColor;ctx.fillRect(0,0,output.width,output.height);
    for(let i=0;i<total;i++){
      const img=new Image();img.src=photos[i];await img.decode();
      drawCover(img,margin,margin+i*(photoH+gap),photoW,photoH);
    }
    ctx.fillStyle=stripColor==='#20202a'?'#f8f4fb':'#5a4b56';
    ctx.font='600 24px system-ui';ctx.textAlign='center';
    ctx.fillText('PHOTObooth  ·  IRVAN',width/2,output.height-28);
    output.classList.remove('hidden');
  }
  $('startCamera').addEventListener('click',()=>stream?stopCamera():startCamera());
  $('capture').addEventListener('click',takeOne);
  $('switchCamera').addEventListener('click',async()=>{facing=facing==='user'?'environment':'user';await startCamera();});
  $('startSession').addEventListener('click',startSession);
  $('retakeAll').addEventListener('click',()=>{photos=[];updateUI();});
  $('download').addEventListener('click',()=>{
    if(!photos.length)return;
    const link=document.createElement('a');link.download='photobooth-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';
    link.href=output.toDataURL('image/png');link.click();
  });
  $('shotCount').addEventListener('change',()=>{photos=photos.slice(0,shotCount());updateUI();});
  document.querySelectorAll('.swatch').forEach(button=>button.addEventListener('click',()=>{
    stripColor=button.dataset.color;document.querySelectorAll('.swatch').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));updateUI();
  }));
  window.addEventListener('pagehide',stopCamera);
  updateUI();
})();
