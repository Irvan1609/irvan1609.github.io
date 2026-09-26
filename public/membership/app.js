import {ACCOUNT_CONFIG} from '/account-config.js';

const endpoint=String(ACCOUNT_CONFIG.endpoint||'').replace(/\/$/,'');
const $=s=>document.querySelector(s);
let currentOrder='';
let pollTimer=null;
let pollAttempts=0;
let plans=[];
let qrisObjectUrl='';
let currentQrUrl='';
let successAudioContext=null;
let successHandledOrder='';

function armSuccessSound(){
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return;
    if(!successAudioContext)successAudioContext=new AudioCtx();
    if(successAudioContext.state==='suspended')successAudioContext.resume().catch(()=>{});
  }catch{}
}
function playSuccessSound(){
  try{
    armSuccessSound();
    const ctx=successAudioContext;
    if(!ctx)return;
    const start=ctx.currentTime+.02;
    [[659.25,0,.18],[783.99,.16,.18],[987.77,.32,.34]].forEach(([frequency,offset,duration])=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.value=frequency;
      gain.gain.setValueAtTime(.0001,start+offset);
      gain.gain.exponentialRampToValueAtTime(.14,start+offset+.025);
      gain.gain.exponentialRampToValueAtTime(.0001,start+offset+duration);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(start+offset);osc.stop(start+offset+duration+.03);
    });
    if(navigator.vibrate)navigator.vibrate([70,45,110]);
  }catch{}
}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(value){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value)||0);}
function bytes(value){const n=Number(value)||0;if(n<1048576)return (n/1024).toFixed(0)+' KB';if(n<1073741824)return (n/1048576).toFixed(n>=104857600?0:1)+' MB';return (n/1073741824).toFixed(1)+' GB';}
function dateText(value){if(!value)return 'tanpa batas';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString('id-ID'):'—';}
async function api(path,options={}){
  const request=window.IrvanAccount?.request;
  if(!request)throw Error('Sesi akun belum siap.');
  const response=await request(path,{...options,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(Error(data.message||data.error||('HTTP '+response.status)),{status:response.status,data});
  return data;
}
function renderStatus(summary){
  const user=summary?.user||window.IrvanAccount?.user;
  const el=$('#membershipStatus');
  if(!user){el.textContent='Belum login';el.className='membership-status';return;}
  if(user.role==='admin'){el.textContent='Admin · membership permanen';el.className='membership-status admin';return;}
  if(user.membership?.active){el.textContent='Membership aktif · berlaku sampai '+dateText(user.membership.expiresAt);el.className='membership-status active';return;}
  el.textContent='Akun gratis · cloud sync nonaktif';el.className='membership-status';
}
function renderPlans(paymentConfigured){
  const grid=$('#plansGrid'),user=window.IrvanAccount?.user,isAdmin=user?.role==='admin';
  if(!plans.length){
    grid.hidden=true;$('#membershipGate').hidden=false;
    $('#membershipGate').textContent=isAdmin
      ?'Belum ada paket publik yang aktif. Atur harga > Rp0 dan centang “Aktifkan untuk pembelian publik” di Develop → Membership.'
      :'Belum ada paket membership yang diaktifkan oleh admin.';
    return;
  }
  grid.innerHTML=plans.map(plan=>'<article class="plan-card"><h2>'+esc(plan.name)+'</h2><p>'+esc(plan.description||'')+'</p><div class="price">'+esc(money(plan.priceIdr))+'</div><div class="duration">'+Number(plan.durationDays)+' hari</div><div class="plan-features"><span>✓ Maks. '+Number(plan.datasetLimit).toLocaleString('id-ID')+' dataset cloud</span><span>✓ Penyimpanan '+esc(bytes(plan.storageLimitBytes))+'</span><span>✓ Analisis termasuk selama membership aktif</span></div><button type="button" data-buy="'+esc(plan.id)+'"'+((!paymentConfigured||isAdmin)?' disabled':'')+'>'+(isAdmin?'Admin · tidak perlu membeli':(paymentConfigured?'Bayar dengan QRIS':'QRIS belum dikonfigurasi'))+'</button></article>').join('');
  if(!isAdmin)grid.querySelectorAll('[data-buy]').forEach(button=>button.onclick=()=>buy(button.dataset.buy));
  grid.hidden=false;$('#membershipGate').hidden=!isAdmin;
  if(isAdmin){
    $('#membershipGate').dataset.state='info';
    $('#membershipGate').textContent='Mode preview admin: paket publik tetap ditampilkan, tetapi akun admin tidak perlu membeli membership.';
  }
}
async function showQrImage(orderId,fallbackUrl=''){
  const image=$('#qrisImage');
  image.hidden=true;
  if(qrisObjectUrl){URL.revokeObjectURL(qrisObjectUrl);qrisObjectUrl='';}
  try{
    const response=await fetch(endpoint+'/v1/membership/payments/'+encodeURIComponent(orderId)+'/qr',{
      headers:{Authorization:'Bearer '+token()},
      cache:'no-store'
    });
    if(!response.ok){
      const data=await response.json().catch(()=>({}));
      throw Error(data.message||data.error||('HTTP '+response.status));
    }
    const blob=await response.blob();
    qrisObjectUrl=URL.createObjectURL(blob);
    image.src=qrisObjectUrl;
    image.hidden=false;
    return;
  }catch(error){
    console.error('QRIS proxy failed',error);
  }
  if(fallbackUrl){
    image.src=fallbackUrl;
    image.hidden=false;
    image.onerror=()=>{
      image.hidden=true;
      $('#qrisMessage').textContent='Transaksi QRIS berhasil dibuat, tetapi gambar QR tidak dapat dimuat. Tekan “Periksa sekarang” atau coba muat ulang transaksi.';
    };
  }else{
    $('#qrisMessage').textContent='Transaksi dibuat, tetapi Midtrans belum memberikan gambar QRIS.';
  }
}
function openModal(){const m=$('#qrisModal');m.hidden=false;const modal=m.querySelector('.qris-modal');modal?.classList.remove('success','success-reveal');$('#qrisSuccessIcon').hidden=true;$('#qrisCheck').hidden=false;$('#qrisDone').textContent='Tutup';const eyebrow=$('#qrisEyebrow');if(eyebrow)eyebrow.textContent='QRIS';}
function closeModal(){clearTimeout(pollTimer);pollTimer=null;pollAttempts=0;if(qrisObjectUrl){URL.revokeObjectURL(qrisObjectUrl);qrisObjectUrl='';}currentQrUrl='';$('#qrisCopyUrl').hidden=true;$('#qrisImage').removeAttribute('src');$('#qrisImage').onerror=null;$('#qrisModal').hidden=true;currentOrder='';}
async function buy(planId){
  if(!window.IrvanAccount?.authenticated){alert('Masuk dengan Google terlebih dahulu.');return;}
  armSuccessSound();
  successHandledOrder='';
  pollAttempts=0;
  openModal();$('#qrisMessage').textContent='Membuat QRIS…';$('#qrisImage').hidden=true;$('#qrisOrder').textContent='';
  try{
    const data=await api('/v1/membership/payments',{method:'POST',body:JSON.stringify({planId})});
    currentOrder=data.orderId;
    currentQrUrl=String(data.qrUrl||'');
    $('#qrisCopyUrl').hidden=!currentQrUrl;
    $('#qrisTitle').textContent=data.planName||'Pembayaran membership';
    $('#qrisMessage').textContent='Pindai QRIS '+money(data.amount)+'. Status akan diperiksa otomatis.';
    $('#qrisOrder').textContent='ID transaksi: '+data.orderId;
    await showQrImage(data.orderId,data.qrUrl);
    poll();
  }catch(error){$('#qrisMessage').textContent=error.message||'QRIS tidak dapat dibuat.';}
}
async function checkPayment(){
  if(!currentOrder)return;
  try{
    const data=await api('/v1/membership/payments/'+encodeURIComponent(currentOrder));
    if(data.qrUrl&&!currentQrUrl){currentQrUrl=String(data.qrUrl);$('#qrisCopyUrl').hidden=false;}
    if(data.paid&&data.applied){
      clearTimeout(pollTimer);pollTimer=null;
      if(successHandledOrder!==currentOrder){
        successHandledOrder=currentOrder;
        playSuccessSound();
      }
      const modal=$('#qrisModal .qris-modal');
      $('#qrisImage').hidden=true;
      $('#qrisCopyUrl').hidden=true;
      $('#qrisCheck').hidden=true;
      $('#qrisOrder').textContent='';
      const eyebrow=$('#qrisEyebrow');if(eyebrow)eyebrow.textContent='Pembayaran berhasil';
      $('#qrisSuccessIcon').hidden=false;
      $('#qrisTitle').textContent='Selamat! Anda sudah menjadi member 🎉';
      $('#qrisMessage').textContent='Membership Anda aktif sampai '+dateText(data.expiresAt)+'. Cloud Sync dan seluruh manfaat membership sekarang sudah dapat digunakan.';
      $('#qrisDone').textContent='Mulai menggunakan membership';
      modal?.classList.add('success');
      requestAnimationFrame(()=>modal?.classList.add('success-reveal'));
      await window.IrvanAccount?.refresh?.();
      await loadAll();
      return true;
    }
    if(['expire','deny','cancel','error'].includes(data.status)){
      clearTimeout(pollTimer);pollTimer=null;$('#qrisMessage').textContent='Transaksi berstatus '+data.status+'.';return true;
    }
    $('#qrisMessage').textContent='Menunggu pembayaran…';
  }catch(error){$('#qrisMessage').textContent=(error.message||'Status tidak dapat diperiksa.')+' Mencoba lagi…';}
  return false;
}
async function poll(){
  if(!currentOrder)return;
  if(document.hidden){
    pollTimer=setTimeout(poll,15000);
    return;
  }
  const done=await checkPayment();
  if(done||!currentOrder)return;
  pollAttempts++;
  const delays=[3000,5000,8000,12000,15000];
  const delay=delays[Math.min(pollAttempts,delays.length-1)];
  pollTimer=setTimeout(poll,delay);
}
async function loadAll(){
  try{
    const planData=await api('/v1/membership/plans');
    plans=planData.items||[];
    let summary=null;
    if(window.IrvanAccount?.authenticated)summary=await api('/v1/account/summary');
    renderStatus(summary);renderPlans(Boolean(planData.paymentConfigured));
  }catch(error){$('#membershipGate').hidden=false;$('#membershipGate').dataset.state='error';$('#membershipGate').textContent=error.message||'Paket membership tidak dapat dimuat.';$('#plansGrid').hidden=true;}
}
async function copyQrUrl(){
  if(!currentQrUrl){$('#qrisMessage').textContent='URL QR belum tersedia. Tekan “Periksa sekarang” lalu coba lagi.';return;}
  try{
    await navigator.clipboard.writeText(currentQrUrl);
    const button=$('#qrisCopyUrl'),label=button.textContent;button.textContent='URL QR tersalin ✓';
    setTimeout(()=>{if(button.isConnected)button.textContent=label;},1800);
  }catch{
    const input=document.createElement('textarea');input.value=currentQrUrl;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';
    document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();
    $('#qrisCopyUrl').textContent='URL QR tersalin ✓';setTimeout(()=>{$('#qrisCopyUrl').textContent='Salin URL QR Sandbox';},1800);
  }
}
$('#qrisClose').onclick=closeModal;$('#qrisDone').onclick=closeModal;$('#qrisCheck').onclick=checkPayment;$('#qrisCopyUrl').onclick=copyQrUrl;
$('#qrisModal').addEventListener('click',event=>{if(event.target===$('#qrisModal'))closeModal();});
document.addEventListener('accountchange',()=>setTimeout(loadAll,0));
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&currentOrder){
    clearTimeout(pollTimer);
    pollTimer=setTimeout(poll,500);
  }
});
setTimeout(loadAll,300);
