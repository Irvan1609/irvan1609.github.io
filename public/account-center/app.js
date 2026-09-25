import {ACCOUNT_CONFIG} from '/account-config.js';

const endpoint=String(ACCOUNT_CONFIG.endpoint||'').replace(/\/$/,'');
const $=s=>document.querySelector(s);

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function token(){return window.IrvanAccount?.getToken?.()||'';}
function bytes(value){const n=Number(value)||0;if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';if(n<1073741824)return (n/1048576).toFixed(1)+' MB';return (n/1073741824).toFixed(2)+' GB';}
function money(value){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value)||0);}
function dt(value){if(!value)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('id-ID'):'—';}
function dateOnly(value){if(!value)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString('id-ID'):'—';}
function initials(user){return String(user?.name||user?.email||'?').split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('');}
async function api(path,options={}){
  const headers=new Headers(options.headers||{});
  headers.set('Authorization','Bearer '+token());
  if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const response=await fetch(endpoint+path,{...options,headers,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(Error(data.message||data.error||('HTTP '+response.status)),{status:response.status});
  return data;
}
function gate(text,state='info'){const el=$('#accountGate');el.hidden=false;el.textContent=text;el.dataset.state=state;$('#accountApp').hidden=true;}
function renderProfile(summary){
  const user=summary.user||{},membership=user.membership||{};
  $('#profileAvatar').innerHTML=user.picture?'<img class="profile-avatar-img" src="'+esc(user.picture)+'" alt="" referrerpolicy="no-referrer">':'<span class="profile-avatar-fallback">'+esc(initials(user))+'</span>';
  $('#profileName').textContent=user.name||'Pengguna';
  $('#profileEmail').textContent=user.email||'';
  const role=$('#roleBadge');role.textContent=user.role==='admin'?'Admin':'User';role.className='badge '+(user.role==='admin'?'admin':'');
  const member=$('#membershipBadge');
  member.textContent=user.role==='admin'?'Membership permanen':membership.active?'Membership aktif':'Akun gratis';
  member.className='badge '+((user.role==='admin'||membership.active)?'member':'');
  $('#upgradeMembership').hidden=user.role==='admin';
  $('#metricDatasets').textContent=Number(summary.usage?.datasetCount||0).toLocaleString('id-ID');
  $('#metricStorage').textContent=bytes(summary.usage?.storageBytes||0);
  $('#metricDatasetLimit').textContent=summary.quota?.datasetLimit===null?'∞':Number(summary.quota?.datasetLimit||0).toLocaleString('id-ID');
  $('#metricStorageLimit').textContent=summary.quota?.storageLimitBytes===null?'∞':bytes(summary.quota?.storageLimitBytes||0);
  $('#metricSessions').textContent=Number(summary.activeSessions||0).toLocaleString('id-ID');
  $('#metricExpiry').textContent=user.role==='admin'?'Permanen':dateOnly(membership.expiresAt);
}
function renderSessions(items){
  $('#sessionList').innerHTML=items.length?items.map(item=>'<div class="session-row" data-session="'+esc(item.id)+'"><div><strong>'+(item.current?'Perangkat ini':'Sesi perangkat')+'</strong><span>Aktif terakhir '+esc(dt(item.lastSeenAt))+' · berakhir '+esc(dt(item.expiresAt))+'</span></div>'+(item.current?'<span class="current-session">Saat ini</span>':'<span></span>')+(item.current?'':'<button type="button" data-revoke-session>Cabut sesi</button>')+'</div>').join(''):'<div class="empty">Tidak ada sesi aktif.</div>';
  $('#sessionList').querySelectorAll('[data-revoke-session]').forEach(button=>button.onclick=async()=>{
    const row=button.closest('[data-session]');button.disabled=true;
    try{await api('/v1/account/sessions/'+encodeURIComponent(row.dataset.session),{method:'DELETE'});await loadSessions();}
    catch(error){alert(error.message);}finally{button.disabled=false;}
  });
}
function renderPayments(items){
  $('#paymentBody').innerHTML=items.length?items.map(item=>{
    const paid=item.status==='settlement';
    return '<tr><td>'+esc(item.plan_name||item.plan_id||'Membership')+'</td><td>'+esc(money(item.amount))+'</td><td class="'+(paid?'status-paid':'status-pending')+'">'+esc(item.status||'—')+'</td><td>'+esc(dt(item.created_at))+'</td><td>'+esc(dateOnly(item.membership_expires_at))+'</td></tr>';
  }).join(''):'<tr><td colspan="5">Belum ada pembayaran membership.</td></tr>';
}
async function loadSessions(){const data=await api('/v1/account/sessions');renderSessions(data.items||[]);}
async function loadPayments(){const data=await api('/v1/account/payments');renderPayments(data.items||[]);}
async function loadAll(){
  if(!window.IrvanAccount?.authenticated)return gate('Masuk dengan Google untuk membuka Account Center.');
  gate('Memuat akun…');
  try{
    const result=await Promise.all([api('/v1/account/summary'),api('/v1/account/sessions'),api('/v1/account/payments')]);
    renderProfile(result[0]);renderSessions(result[1].items||[]);renderPayments(result[2].items||[]);
    $('#accountGate').hidden=true;$('#accountApp').hidden=false;
  }catch(error){gate(error.message||'Data akun tidak dapat dimuat.','error');}
}
async function exportAccount(){
  const response=await fetch(endpoint+'/v1/account/export',{headers:{Authorization:'Bearer '+token()},cache:'no-store'});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.message||data.error||'Ekspor gagal.');}
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='irvan-account-export.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('#refreshAccount').onclick=loadAll;
$('#revokeOthers').onclick=async()=>{if(!confirm('Keluar dari semua perangkat lain?'))return;const button=$('#revokeOthers');button.disabled=true;try{const result=await api('/v1/account/sessions/revoke-others',{method:'POST',body:'{}'});alert((result.revoked||0)+' sesi dicabut.');await loadSessions();}catch(error){alert(error.message);}finally{button.disabled=false;}};
$('#exportAccount').onclick=async()=>{const b=$('#exportAccount');b.disabled=true;try{await exportAccount();}catch(error){alert(error.message);}finally{b.disabled=false;}};
$('#logoutAccount').onclick=()=>window.IrvanAccount?.logout?.();
document.addEventListener('accountchange',()=>setTimeout(loadAll,0));
if(window.IrvanAccount?.authenticated)setTimeout(loadAll,0);else setTimeout(loadAll,1200);
