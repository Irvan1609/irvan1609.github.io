const video = document.querySelector('#camera');
const placeholder = document.querySelector('#placeholder');
const startBtn = document.querySelector('#startBtn');
const cameraBtn = document.querySelector('#cameraBtn');
const captureBtn = document.querySelector('#captureBtn');
const retakeBtn = document.querySelector('#retakeBtn');
const countdownEl = document.querySelector('#countdown');
const flashEl = document.querySelector('#flash');
const stageHint = document.querySelector('#stageHint');
const resultCanvas = document.querySelector('#resultCanvas');
const resultCtx = resultCanvas.getContext('2d');
const stripWrap = document.querySelector('#stripWrap');
const emptyState = document.querySelector('#emptyState');
const resultTitle = document.querySelector('#resultTitle');
const shotCount = document.querySelector('#shotCount');
const downloadBtn = document.querySelector('#downloadBtn');
const shareBtn = document.querySelector('#shareBtn');
const shotSelect = document.querySelector('#shotSelect');
const delaySelect = document.querySelector('#delaySelect');
const mirrorToggle = document.querySelector('#mirrorToggle');
const fullscreenBtn = document.querySelector('#fullscreenBtn');

let stream = null;
let shots = [];
let busy = false;

function selectedShots(){ return Number(shotSelect.value); }
function setHint(message){ stageHint.textContent = message; }
function stopCamera(){
  if(stream){ stream.getTracks().forEach(track => track.stop()); stream = null; }
  video.srcObject = null;
  captureBtn.disabled = true;
  cameraBtn.textContent = 'Mulai';
  setHint('Kamera belum aktif');
}
async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia){
    setHint('Browser ini tidak mendukung kamera');
    return;
  }
  try{
    stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:'user', width:{ideal:1280}, height:{ideal:960} },
      audio:false
    });
    video.srcObject = stream;
    video.classList.toggle('no-mirror', !mirrorToggle.checked);
    placeholder.classList.add('hidden');
    captureBtn.disabled = false;
    cameraBtn.textContent = 'Matikan';
    setHint('Kamera aktif · tekan tombol rana');
  }catch(error){
    setHint(error.name === 'NotAllowedError' ? 'Izin kamera ditolak' : 'Kamera tidak tersedia');
    placeholder.classList.remove('hidden');
  }
}
function wait(ms){ return new Promise(resolve => setTimeout(resolve,ms)); }
function countdown(seconds){
  return new Promise(async resolve => {
    countdownEl.classList.add('active');
    for(let n=seconds;n>0;n--){
      countdownEl.textContent = n;
      await wait(1000);
    }
    countdownEl.textContent = '';
    countdownEl.classList.remove('active');
    resolve();
  });
}
function takeFrame(){
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 960;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if(mirrorToggle.checked){ ctx.translate(width,0); ctx.scale(-1,1); }
  ctx.drawImage(video,0,0,width,height);
  return canvas.toDataURL('image/jpeg',.92);
}
async function captureSequence(){
  if(busy || !stream) return;
  busy = true; captureBtn.disabled = true; retakeBtn.disabled = true;
  shots = [];
  const total = selectedShots();
  for(let i=0;i<total;i++){
    setHint(`Bersiap untuk foto ${i+1} dari ${total}`);
    await countdown(Number(delaySelect.value));
    shots.push(takeFrame());
    flashEl.classList.remove('active'); void flashEl.offsetWidth; flashEl.classList.add('active');
    renderResult();
    await wait(500);
  }
  busy = false; retakeBtn.disabled = false; captureBtn.disabled = false;
  setHint('Selesai · tekan Ulangi untuk foto baru');
}
function renderResult(){
  if(!shots.length) return;
  const images = awaitImages(shots);
  images.then(items => {
    const cols = shots.length === 4 ? 2 : 1;
    const rows = Math.ceil(shots.length / cols);
    const gap = 16;
    const cellW = 720;
    const cellH = Math.round(cellW * .75);
    resultCanvas.width = cols * cellW + (cols+1)*gap;
    resultCanvas.height = rows * cellH + (rows+1)*gap + 64;
    resultCtx.fillStyle = '#f7efe7'; resultCtx.fillRect(0,0,resultCanvas.width,resultCanvas.height);
    resultCtx.fillStyle = '#332735'; resultCtx.font = '700 22px system-ui'; resultCtx.textAlign = 'center';
    resultCtx.fillText('PHOTOBOOTH', resultCanvas.width/2, 39);
    items.forEach((img,index)=>{
      const col = index % cols, row = Math.floor(index/cols);
      const x = gap + col*cellW, y = 64 + gap + row*cellH;
      resultCtx.drawImage(img,x,y,cellW,cellH);
    });
    stripWrap.classList.add('ready'); stripWrap.classList.remove('empty'); emptyState.hidden = true;
    resultTitle.textContent = 'Foto siap';
    shotCount.textContent = `${shots.length}/${shots.length}`;
    downloadBtn.disabled = false; shareBtn.disabled = false;
  });
}
function awaitImages(data){
  return Promise.all(data.map(src => new Promise(resolve => { const img = new Image(); img.onload=()=>resolve(img); img.src=src; })));
}
function resetResult(){
  shots = []; stripWrap.classList.remove('ready'); stripWrap.classList.add('empty'); emptyState.hidden = false;
  resultTitle.textContent = 'Belum ada foto'; shotCount.textContent = `0/${selectedShots()}`;
  downloadBtn.disabled = true; shareBtn.disabled = true; retakeBtn.disabled = true;
}
async function shareResult(){
  const blob = await new Promise(resolve => resultCanvas.toBlob(resolve,'image/jpeg',.92));
  const file = new File([blob],'photobooth.jpg',{type:'image/jpeg'});
  if(navigator.canShare?.({files:[file]})){ await navigator.share({title:'Foto Photobooth',files:[file]}); }
  else downloadResult();
}
function downloadResult(){
  const link = document.createElement('a'); link.download='photobooth.jpg'; link.href=resultCanvas.toDataURL('image/jpeg',.92); link.click();
}
startBtn.addEventListener('click',startCamera);
cameraBtn.addEventListener('click',()=> stream ? stopCamera() : startCamera());
captureBtn.addEventListener('click',captureSequence);
retakeBtn.addEventListener('click',()=>{ resetResult(); setHint(stream ? 'Kamera aktif · tekan tombol rana' : 'Kamera belum aktif'); });
downloadBtn.addEventListener('click',downloadResult);
shareBtn.addEventListener('click',shareResult);
shotSelect.addEventListener('change',()=>{ if(!shots.length) shotCount.textContent=`0/${selectedShots()}`; });
mirrorToggle.addEventListener('change',()=>{ video.classList.toggle('no-mirror', !mirrorToggle.checked); });
fullscreenBtn.addEventListener('click',async()=>{
  try{
    if(!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    else await document.exitFullscreen?.();
  }catch(_){}
});
window.addEventListener('pagehide',stopCamera);
