import {ACCOUNT_CONFIG} from '/account-config.js';

const endpoint=String(ACCOUNT_CONFIG.endpoint||'').replace(/\/$/,'');
const $=s=>document.querySelector(s);
let currentOrder='';
let pollTimer=null;
let plans=[];

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function token(){return window.IrvanAccount?.getToken?.()||'';}
function money(value){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value)||0);}
function bytes(value){const n=Number(value)||0;if(n<1048576)return (n/1024).toFixed(0)+' KB';if(n<1073741824)return (n/1048576).toFixed(n>=104857600?0:1)+' MB';return (n/1073741824).toFixed(1)+' GB';}
function dateText(value){if(!value)return 'tanpa batas';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString('id-ID'):'—';}
async function api(path,options={}){
  const headers=new Headers(options.headers||{});
  if(token())headers.set('Authorization','Bearer '+token());
  if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const response=await fetch(endpoint+path,{...options,headers,cache:'no-store'});
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
  const grid=$('#plansGrid'),user=window.IrvanAccount?.user;
  if(user?.role==='admin'){grid.hidden=true;$('#membershipGate').hidden=false;$('#membershipGate').textContent='Akun admin sudah memiliki seluruh manfaat membership secara permanen.';return;}
  if(!plans.length){grid.hidden=true;$('#membershipGate').hidden=false;$('#membershipGate').textContent='Belum ada paket membership yang diaktifkan oleh admin.';return;}
  grid.innerHTML=plans.map(plan=>'<article class="plan-card"><h2>'+esc(plan.name)+'</h2><p>'+esc(plan.description||'')+'</p><div class="price">'+esc(money(plan.priceIdr))+'</div><div class="duration">'+Number(plan.durationDays)+' hari</div><div class="plan-features"><span>✓ Maks. '+Number(plan.datasetLimit).toLocaleString('id-ID')+' dataset cloud</span><span>✓ Penyimpanan '+esc(bytes(plan.storageLimitBytes))+'</span><span>✓ Analisis termasuk selama membership aktif</span></div><button type="button" data-buy="'+esc(plan.id)+'"'+(!paymentConfigured?' disabled':'')+'>'+(paymentConfigured?'Bayar dengan QRIS':'QRIS belum dikonfigurasi')+'</button></article>').join('');
  grid.querySelectorAll('[data-buy]').forEach(button=>button.onclick=()=>buy(button.dataset.buy));
  grid.hidden=false;$('#membershipGate').hidden=true;
}
function openModal(){const m=$('#qrisModal');m.hidden=false;}
function closeModal(){clearTimeout(pollTimer);pollTimer=null;$('#qrisModal').hidden=true;currentOrder='';}
async function buy(planId){
  if(!window.IrvanAccount?.authenticated){alert('Masuk dengan Google terlebih dahulu.');return;}
  openModal();$('#qrisMessage').textContent='Membuat QRIS…';$('#qrisImage').hidden=true;$('#qrisOrder').textContent='';
  try{
    const data=await api('/v1/membership/payments',{method:'POST',body:JSON.stringify({planId})});
    currentOrder=data.orderId;
    $('#qrisTitle').textContent=data.planName||'Pembayaran membership';
    $('#qrisMessage').textContent='Pindai QRIS '+money(data.amount)+'. Status akan diperiksa otomatis.';
    $('#qrisImage').src=data.qrUrl;$('#qrisImage').hidden=false;$('#qrisOrder').textContent='ID transaksi: '+data.orderId;
    poll();
  }catch(error){$('#qrisMessage').textContent=error.message||'QRIS tidak dapat dibuat.';}
}
async function checkPayment(){
  if(!currentOrder)return;
  try{
    const data=await api('/v1/membership/payments/'+encodeURIComponent(currentOrder));
    if(data.paid&&data.applied){
      clearTimeout(pollTimer);pollTimer=null;
      $('#qrisMessage').textContent='Pembayaran berhasil. Membership sudah diaktifkan sampai '+dateText(data.expiresAt)+'.';
      $('#qrisImage').hidden=true;
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
async function poll(){const done=await checkPayment();if(!done&&currentOrder)pollTimer=setTimeout(poll,3000);}
async function loadAll(){
  try{
    const planData=await api('/v1/membership/plans');
    plans=planData.items||[];
    let summary=null;
    if(window.IrvanAccount?.authenticated)summary=await api('/v1/account/summary');
    renderStatus(summary);renderPlans(Boolean(planData.paymentConfigured));
  }catch(error){$('#membershipGate').hidden=false;$('#membershipGate').dataset.state='error';$('#membershipGate').textContent=error.message||'Paket membership tidak dapat dimuat.';$('#plansGrid').hidden=true;}
}
$('#qrisClose').onclick=closeModal;$('#qrisDone').onclick=closeModal;$('#qrisCheck').onclick=checkPayment;
$('#qrisModal').addEventListener('click',event=>{if(event.target===$('#qrisModal'))closeModal();});
document.addEventListener('accountchange',()=>setTimeout(loadAll,0));
setTimeout(loadAll,300);
