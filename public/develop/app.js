import {ACCOUNT_CONFIG} from '/account-config.js';

const endpoint=String(ACCOUNT_CONFIG.endpoint||'').replace(/\/$/,'');
const $=selector=>document.querySelector(selector);
let users=[],plans=[],datasets=[],loaded=new Set(),healthCache=null;

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function token(){return window.IrvanAccount?.getToken?.()||'';}
function money(value){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value)||0);}
function bytes(value){const n=Number(value)||0;if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';if(n<1073741824)return (n/1048576).toFixed(n>=104857600?0:1)+' MB';return (n/1073741824).toFixed(2)+' GB';}
function dt(value){if(!value)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('id-ID'):'—';}
function dateOnly(value){if(!value)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString('id-ID'):'—';}
function initials(user){return String(user.name||user.email||'?').split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('');}
function userAvatar(user){return user.picture?'<img src="'+esc(user.picture)+'" alt="" referrerpolicy="no-referrer">':'<span class="user-fallback">'+esc(initials(user))+'</span>';}
function accessBadge(user){if(user.role==='admin')return '<span class="badge admin">Admin</span>';if(user.membership?.active)return '<span class="badge member">Membership</span>';return '<span class="badge free">Gratis</span>';}
async function api(path,options={}){
  const headers=new Headers(options.headers||{});
  headers.set('Authorization','Bearer '+token());
  if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const response=await fetch(endpoint+path,{...options,headers,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(Error(data.message||data.error||('HTTP '+response.status)),{status:response.status,data});
  return data;
}
function gate(text,state='info'){
  const el=$('#developGate');el.hidden=false;el.textContent=text;el.dataset.state=state;$('#developApp').hidden=true;
}
function activateTab(name){
  document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===name));
  document.querySelectorAll('[data-view]').forEach(view=>view.classList.toggle('active',view.dataset.view===name));
  void loadTab(name);
}
async function loadHealth(){
  const response=await fetch(endpoint+'/v1/health',{cache:'no-store'}),data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error('Health Worker tidak dapat dibaca.');
  healthCache=data;
  $('#healthJson').textContent=JSON.stringify(data,null,2);
  $('#overviewHealth').innerHTML=[
    ['Service',data.service||'—'],['API',data.apiVersion||'—'],['Auth',data.authConfigured?'Aktif':'Nonaktif'],
    ['Dataset Sync',data.datasetSync?'Aktif':'Nonaktif'],['Membership',data.membershipAccess?'Aktif':'Nonaktif'],
    ['Develop',data.developConsole?'Aktif':'Nonaktif'],['QRIS membership',data.membershipPayments?'Terkonfigurasi':'Belum']
  ].map(item=>'<div class="kv"><span>'+esc(item[0])+'</span><b>'+esc(item[1])+'</b></div>').join('');
  return data;
}
async function loadOverview(){
  const result=await Promise.all([api('/v1/develop/overview'),api('/v1/develop/usage'),loadHealth()]);
  const stats=result[0].stats||{},usage=result[1].estimated||{};
  const cards=[
    ['Total pengguna',stats.users],['Admin + member',stats.entitledUsers],['Dataset cloud',stats.datasets],
    ['Storage dataset',bytes(stats.datasetBytes)],['Pendapatan membership',money(stats.membershipRevenueIdr)],
    ['Pembayaran settlement',stats.settledPayments],['Kontribusi AI',stats.contributions],
    ['Sesi aktif 24 jam',stats.activeSessions24h],['Pengguna baru 7 hari',stats.newUsers7d],
    ['Backup terakhir',stats.lastBackupAt?dateOnly(stats.lastBackupAt):'Belum ada']
  ];
  $('#statsGrid').innerHTML=cards.map(item=>'<article><span>'+esc(item[0])+'</span><b>'+Number(item[1]||0).toLocaleString('id-ID')+'</b></article>').join('');
  $('#overviewUsage').innerHTML=[
    ['Ukuran dataset',bytes(usage.datasetBytes)],['Revisi dataset',Number(usage.datasetRevisionWrites||0).toLocaleString('id-ID')],
    ['Sesi aktif',Number(usage.activeSessions||0).toLocaleString('id-ID')],['Foto kontribusi',bytes(usage.contributionImageBytes)]
  ].map(item=>'<div class="kv"><span>'+esc(item[0])+'</span><b>'+esc(item[1])+'</b></div>').join('');
}
async function ensurePlans(){
  if(plans.length)return plans;
  const data=await api('/v1/develop/plans');plans=data.items||[];return plans;
}
function planOptions(selected=''){
  return plans.map(plan=>'<option value="'+esc(plan.id)+'"'+(plan.id===selected?' selected':'')+'>'+esc(plan.name)+'</option>').join('');
}
function renderUsers(){
  const query=$('#userSearch').value.trim().toLowerCase();
  const rows=users.filter(user=>!query||((user.name||'')+' '+(user.email||'')).toLowerCase().includes(query));
  $('#usersBody').innerHTML=rows.length?rows.map(user=>{
    const admin=user.role==='admin',expires=user.membership?.expiresAt?String(user.membership.expiresAt).slice(0,10):'';
    const membership=admin?'<span class="badge admin">Permanen · tanpa bayar</span>':
      '<div class="membership-form"><select data-plan>'+planOptions(user.membership?.planId||'manual')+'</select><select data-member-status><option value="inactive"'+(user.membership?.active?'':' selected')+'>Nonaktif</option><option value="active"'+(user.membership?.active?' selected':'')+'>Aktif</option></select><input data-expiry type="date" value="'+esc(expires)+'" title="Kosong = tanpa tanggal berakhir"><button type="button" data-save-member>Simpan</button></div>';
    const account=admin?'<span class="badge admin">Dilindungi</span>':'<div class="account-actions"><span class="badge '+(user.accountStatus==='suspended'?'suspended':'free')+'">'+esc(user.accountStatus||'active')+'</span><button type="button" data-toggle-account>'+(user.accountStatus==='suspended'?'Aktifkan':'Suspend')+'</button><button type="button" data-revoke-all>Sesi ×</button></div>';
    return '<tr data-user-id="'+esc(user.id)+'"><td><button class="user-cell" type="button" data-support>'+userAvatar(user)+'<span><strong>'+esc(user.name||'Pengguna')+'</strong><small>'+esc(user.email)+'</small></span></button></td><td>'+accessBadge(user)+'</td><td>'+Number(user.datasetCount||0)+'</td><td>'+esc(dt(user.lastLoginAt))+'</td><td>'+membership+'</td><td>'+account+'</td><td><button type="button" data-support>Read-only</button></td></tr>';
  }).join(''):'<tr><td colspan="7">Tidak ada pengguna yang cocok.</td></tr>';
  $('#usersBody').querySelectorAll('[data-save-member]').forEach(button=>button.onclick=()=>saveMembership(button.closest('tr')));
  $('#usersBody').querySelectorAll('[data-toggle-account]').forEach(button=>button.onclick=()=>toggleAccount(button.closest('tr')));
  $('#usersBody').querySelectorAll('[data-revoke-all]').forEach(button=>button.onclick=()=>revokeUserSessions(button.closest('tr')));
  $('#usersBody').querySelectorAll('[data-support]').forEach(button=>button.onclick=()=>loadSupport(button.closest('tr').dataset.userId));
}
async function loadUsers(){
  await ensurePlans();
  const data=await api('/v1/develop/users?limit=500');users=data.items||[];renderUsers();
}
async function saveMembership(row){
  const id=row.dataset.userId,status=row.querySelector('[data-member-status]').value,planId=row.querySelector('[data-plan]').value,raw=row.querySelector('[data-expiry]').value;
  const expiresAt=status==='active'&&raw?new Date(raw+'T23:59:59').toISOString():null;
  const button=row.querySelector('[data-save-member]');button.disabled=true;
  try{await api('/v1/develop/users/'+encodeURIComponent(id)+'/access',{method:'POST',body:JSON.stringify({status,planId,expiresAt})});await loadUsers();}
  catch(error){alert(error.message);}finally{button.disabled=false;}
}
async function toggleAccount(row){
  const user=users.find(item=>item.id===row.dataset.userId);if(!user)return;
  const status=user.accountStatus==='suspended'?'active':'suspended';
  if(status==='suspended'&&!confirm('Suspend akun '+user.email+' dan cabut semua sesinya?'))return;
  await api('/v1/develop/users/'+encodeURIComponent(user.id)+'/account-status',{method:'POST',body:JSON.stringify({status})});await loadUsers();
}
async function revokeUserSessions(row){
  const user=users.find(item=>item.id===row.dataset.userId);if(!user||!confirm('Cabut semua sesi aktif '+user.email+'?'))return;
  const data=await api('/v1/develop/users/'+encodeURIComponent(user.id)+'/revoke-sessions',{method:'POST',body:'{}'});alert((data.revoked||0)+' sesi dicabut.');
}
async function loadSupport(id){
  const data=await api('/v1/develop/users/'+encodeURIComponent(id)+'/support-view');
  $('#supportTitle').textContent='Support view · '+(data.user?.email||id)+' · read-only';
  const q=data.quota||{},u=data.usage||{},user=data.user||{};
  $('#supportView').innerHTML='<div class="support-grid">'+[
    ['Akses',user.role==='admin'?'Admin':user.membership?.active?'Membership':'Gratis'],
    ['Dataset',u.datasetCount||0],['Penyimpanan',bytes(u.storageBytes)],['Sesi aktif',data.activeSessions||0],
    ['Batas dataset',q.datasetLimit===null?'∞':q.datasetLimit],['Batas storage',q.storageLimitBytes===null?'∞':bytes(q.storageLimitBytes)],
    ['Login terakhir',dt(user.lastLoginAt)],['Membership berakhir',dateOnly(user.membership?.expiresAt)]
  ].map(item=>'<article><span>'+esc(item[0])+'</span><b>'+esc(item[1])+'</b></article>').join('')+'</div><div class="support-datasets">'+(data.datasets||[]).map(d=>'<div class="support-dataset"><span>'+esc(d.name)+'</span><small>rev '+Number(d.revision||1)+' · '+esc(dt(d.updated_at))+'</small></div>').join('')+'</div>';
}
function renderPlans(){
  $('#planGrid').innerHTML=plans.map(plan=>'<article class="plan-card" data-plan-id="'+esc(plan.id)+'"><h3>'+esc(plan.name)+'</h3><div class="plan-publish-state '+(Number(plan.active)&&Number(plan.price_idr)>0?'positive':'muted')+'">'+(Number(plan.active)&&Number(plan.price_idr)>0?'Tampil di halaman Membership':'Belum tampil publik')+'</div><div class="plan-fields"><label>Nama<input data-name value="'+esc(plan.name)+'"></label><label>Durasi (hari)<input data-days type="number" min="1" value="'+Number(plan.duration_days)+'"></label><label class="plan-desc">Deskripsi<input data-description value="'+esc(plan.description||'')+'"></label><label>Harga (Rp)<input data-price type="number" min="0" value="'+Number(plan.price_idr||0)+'"></label><label>Dataset<input data-dataset-limit type="number" min="1" value="'+Number(plan.dataset_limit||1)+'"></label><label>Storage (MB)<input data-storage type="number" min="1" value="'+Math.round(Number(plan.storage_limit_bytes||0)/1048576)+'"></label></div><label class="plan-toggle"><input data-active type="checkbox"'+(Number(plan.active)?' checked':'')+'> Aktifkan untuk pembelian publik</label><div class="plan-actions"><button type="button" data-save-plan>Simpan paket</button></div></article>').join('');
  $('#planGrid').querySelectorAll('[data-save-plan]').forEach(button=>button.onclick=()=>savePlan(button.closest('[data-plan-id]')));
}
async function loadPlans(){plans=[];await ensurePlans();renderPlans();}
async function savePlan(card){
  const id=card.dataset.planId,button=card.querySelector('[data-save-plan]');button.disabled=true;
  const body={name:card.querySelector('[data-name]').value,description:card.querySelector('[data-description]').value,durationDays:Number(card.querySelector('[data-days]').value),priceIdr:Number(card.querySelector('[data-price]').value),datasetLimit:Number(card.querySelector('[data-dataset-limit]').value),storageLimitBytes:Number(card.querySelector('[data-storage]').value)*1048576,active:card.querySelector('[data-active]').checked};
  if(body.active&&body.priceIdr<=0){
    alert('Agar paket tampil di halaman Membership, isi harga lebih dari Rp0 lalu aktifkan paket.');
    button.disabled=false;return;
  }
  const original=button.textContent;button.textContent='Menyimpan…';
  try{
    await api('/v1/develop/plans/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(body)});
    plans=[];await loadPlans();loaded.delete('users');
    const fresh=[...document.querySelectorAll('[data-plan-id]')].find(el=>el.dataset.planId===id);
    const savedButton=fresh?.querySelector('[data-save-plan]');
    if(savedButton){savedButton.textContent=body.active?'Tersimpan · tampil publik':'Tersimpan';setTimeout(()=>{if(savedButton.isConnected)savedButton.textContent='Simpan paket';},1800);}
  }catch(error){alert(error.message);}finally{if(button.isConnected){button.disabled=false;button.textContent=original;}}
}
async function loadPayments(){
  const data=await api('/v1/develop/payments?limit=500'),items=data.items||[];
  $('#paymentsBody').innerHTML=items.length?items.map(item=>'<tr><td class="nowrap">'+esc(item.order_id)+'</td><td>'+esc(item.name||item.email||'—')+'<br><small>'+esc(item.email||'')+'</small></td><td>'+esc(item.plan_name||item.plan_id)+'</td><td>'+esc(money(item.amount))+'</td><td class="'+(item.status==='settlement'?'status-paid':'status-pending')+'">'+esc(item.status)+'</td><td>'+esc(dt(item.created_at))+'</td><td>'+esc(dateOnly(item.membership_expires_at))+'</td></tr>').join(''):'<tr><td colspan="7">Belum ada pembayaran membership.</td></tr>';
}
function renderDatasets(){
  const q=$('#datasetSearch').value.trim().toLowerCase(),rows=datasets.filter(item=>!q||((item.dataset_name||'')+' '+(item.user_name||'')+' '+(item.email||'')).toLowerCase().includes(q));
  $('#datasetsBody').innerHTML=rows.length?rows.map(item=>'<tr><td>'+esc(item.dataset_name||'—')+'</td><td>'+esc(item.user_name||'—')+'<br><small>'+esc(item.email||'')+'</small></td><td>'+esc(bytes(item.size_bytes))+'</td><td>'+Number(item.revision||1)+'</td><td>'+esc(dt(item.updated_at))+'</td><td>'+(item.deleted_at?'<span class="negative">Dihapus</span>':'Aktif')+'</td></tr>').join(''):'<tr><td colspan="6">Tidak ada dataset.</td></tr>';
}
async function loadDatasets(){const data=await api('/v1/develop/datasets?limit=1000');datasets=data.items||[];renderDatasets();}
async function loadAI(){
  const data=await api('/v1/develop/contributions?limit=500'),items=data.items||[];
  $('#aiBody').innerHTML=items.length?items.map(item=>'<tr><td>'+esc(item.sample)+'</td><td>'+Number(item.final_count||0)+'</td><td>'+Number(item.predicted_count||0)+'</td><td>'+Number(item.correction_count||0)+'</td><td>'+Number(item.quality_score||0).toFixed(3)+'</td><td>'+esc(item.model_version||item.prediction_method||'—')+'</td><td>'+esc(item.status||'—')+'</td><td>'+esc(dt(item.created_at))+'</td></tr>').join(''):'<tr><td colspan="8">Belum ada kontribusi AI.</td></tr>';
}
async function loadServer(){
  const result=await Promise.all([api('/v1/develop/usage'),loadHealth()]),u=result[0].estimated||{};
  const cards=[['Dataset D1',u.datasets],['Dataset bytes',bytes(u.datasetBytes)],['Revisi dataset',u.datasetRevisionWrites],['Sessions',u.sessions],['Sesi aktif',u.activeSessions],['Kontribusi',u.contributions],['Foto bytes',bytes(u.contributionImageBytes)],['Users',u.users]];
  $('#usageGrid').innerHTML=cards.map(item=>'<article><span>'+esc(item[0])+'</span><b>'+esc(item[1]??0)+'</b></article>').join('');
}
async function loadAudit(){
  const data=await api('/v1/develop/audit?limit=500'),items=data.items||[];
  $('#auditBody').innerHTML=items.length?items.map(item=>'<tr><td>'+esc(dt(item.created_at))+'</td><td>'+esc(item.actor_email||item.actor_user_id||'system')+'</td><td>'+esc(item.action)+'</td><td>'+esc((item.target_type||'')+' '+(item.target_id||''))+'</td><td><div class="small-json">'+esc(JSON.stringify(item.detail||{}))+'</div></td></tr>').join(''):'<tr><td colspan="5">Belum ada audit log.</td></tr>';
}
async function loadBackups(){
  const data=await api('/v1/develop/backups'),items=data.items||[];
  $('#backupState').textContent=data.r2Configured?'R2 BACKUPS aktif. Snapshot manual dan terjadwal dapat disimpan.':'R2 BACKUPS belum dikonfigurasi. Ekspor logis manual tetap tersedia.';
  $('#createSnapshot').disabled=!data.r2Configured;
  $('#backupsBody').innerHTML=items.length?items.map(item=>'<tr><td>'+esc(dt(item.created_at))+'</td><td>'+esc(item.status)+'</td><td>'+esc(bytes(item.size_bytes))+'</td><td>'+esc(item.object_key||'—')+'</td><td>'+(data.r2Configured?'<button class="backup-download" type="button" data-backup="'+esc(item.id)+'">Unduh</button>':'—')+'</td></tr>').join(''):'<tr><td colspan="5">Belum ada snapshot R2.</td></tr>';
  $('#backupsBody').querySelectorAll('[data-backup]').forEach(button=>button.onclick=()=>downloadBackup('/v1/develop/backups/'+encodeURIComponent(button.dataset.backup)+'/download','irvan-backup-'+button.dataset.backup+'.json'));
}
async function downloadBackup(path,fileName){
  const response=await fetch(endpoint+path,{headers:{Authorization:'Bearer '+token()},cache:'no-store'});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.message||data.error||'Backup gagal diunduh.');}
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function loadTab(name,force=false){
  if(loaded.has(name)&&!force)return;
  try{
    if(name==='overview')await loadOverview();
    if(name==='users')await loadUsers();
    if(name==='membership')await loadPlans();
    if(name==='payments')await loadPayments();
    if(name==='datasets')await loadDatasets();
    if(name==='ai')await loadAI();
    if(name==='server')await loadServer();
    if(name==='audit')await loadAudit();
    if(name==='backups')await loadBackups();
    loaded.add(name);
  }catch(error){console.error(error);alert(error.message||'Data develop tidak dapat dimuat.');}
}
async function init(){
  const user=window.IrvanAccount?.user;
  if(!window.IrvanAccount?.authenticated)return gate('Masuk dengan akun admin untuk membuka Develop.');
  if(user?.role!=='admin'||!user?.features?.develop)return gate('Akun ini tidak memiliki akses Develop.','error');
  $('#developGate').hidden=true;$('#developApp').hidden=false;loaded.clear();await loadTab('overview',true);
}
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>activateTab(button.dataset.tab));
$('#refreshDevelop').onclick=async()=>{loaded.clear();await loadTab(document.querySelector('[data-tab].active')?.dataset.tab||'overview',true);};
$('#refreshHealth').onclick=loadHealth;
$('#userSearch').oninput=renderUsers;
$('#datasetSearch').oninput=renderDatasets;
$('#createSnapshot').onclick=async()=>{const b=$('#createSnapshot');b.disabled=true;try{await api('/v1/develop/backups',{method:'POST',body:'{}'});await loadBackups();}catch(error){alert(error.message);}finally{b.disabled=false;}};
$('#exportBackup').onclick=async()=>{const b=$('#exportBackup');b.disabled=true;try{await downloadBackup('/v1/develop/backups/export','irvan-logical-backup.json');}catch(error){alert(error.message);}finally{b.disabled=false;}};
document.addEventListener('accountchange',()=>setTimeout(init,0));
if(window.IrvanAccount?.authenticated)setTimeout(init,0);else setTimeout(init,1200);
