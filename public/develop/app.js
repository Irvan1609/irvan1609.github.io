import {ACCOUNT_CONFIG} from '/account-config.js';

const endpoint=String(ACCOUNT_CONFIG.endpoint||'').replace(/\/$/,'');
const $=selector=>document.querySelector(selector);
let users=[];

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function dateText(value){if(!value)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('id-ID'):'—';}
function initials(user){return String(user.name||user.email||'?').split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('');}
function userAvatar(user){return user.picture?'<img src="'+esc(user.picture)+'" alt="" referrerpolicy="no-referrer">':'<span class="user-fallback">'+esc(initials(user))+'</span>';}
function accessBadge(user){if(user.role==='admin')return '<span class="badge admin">Admin</span>';if(user.membership?.active)return '<span class="badge member">Membership</span>';return '<span class="badge free">Gratis</span>';}
function token(){return window.IrvanAccount?.getToken?.()||'';}
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
function renderStats(stats){
  const items=[
    ['Total pengguna',stats.users],
    ['Admin + membership',stats.entitledUsers],
    ['Dataset cloud',stats.datasets],
    ['Kontribusi AI',stats.contributions],
    ['Sesi aktif 24 jam',stats.activeSessions24h],
    ['Pengguna baru 7 hari',stats.newUsers7d]
  ];
  $('#statsGrid').innerHTML=items.map(item=>'<article class="stat-card"><span>'+esc(item[0])+'</span><b>'+Number(item[1]||0).toLocaleString('id-ID')+'</b></article>').join('');
}
function renderUsers(){
  const query=$('#userSearch').value.trim().toLowerCase();
  const rows=users.filter(user=>!query||((user.name||'')+' '+(user.email||'')).toLowerCase().includes(query));
  $('#usersBody').innerHTML=rows.length?rows.map(user=>{
    const admin=user.role==='admin';
    const expires=user.membership?.expiresAt?String(user.membership.expiresAt).slice(0,10):'';
    const controls=admin
      ?'<span class="badge admin">Permanen · tanpa bayar</span>'
      :'<div class="membership-form"><select data-membership-status><option value="inactive"'+(user.membership?.active?'':' selected')+'>Nonaktif</option><option value="active"'+(user.membership?.active?' selected':'')+'>Aktif</option></select><input data-membership-expiry type="date" value="'+esc(expires)+'" title="Kosong = tanpa tanggal berakhir"><button type="button" data-save-membership>Simpan</button></div>';
    return '<tr data-user-id="'+esc(user.id)+'">'+
      '<td><button type="button" class="user-cell" data-show-datasets="'+esc(user.id)+'">'+userAvatar(user)+'<span><strong>'+esc(user.name||'Pengguna')+'</strong><small>'+esc(user.email)+'</small></span></button></td>'+
      '<td>'+accessBadge(user)+'</td>'+
      '<td>'+Number(user.datasetCount||0)+'</td>'+
      '<td>'+esc(dateText(user.lastLoginAt))+'</td>'+
      '<td>'+controls+'</td>'+
      '</tr>';
  }).join(''):'<tr><td colspan="5">Tidak ada pengguna yang cocok.</td></tr>';

  $('#usersBody').querySelectorAll('[data-show-datasets]').forEach(button=>button.onclick=()=>loadUserDatasets(button.dataset.showDatasets));
  $('#usersBody').querySelectorAll('[data-save-membership]').forEach(button=>button.onclick=()=>saveMembership(button.closest('tr')));
}
async function saveMembership(row){
  const id=row.dataset.userId,status=row.querySelector('[data-membership-status]').value,raw=row.querySelector('[data-membership-expiry]').value;
  const expiresAt=status==='active'&&raw?new Date(raw+'T23:59:59').toISOString():null;
  const button=row.querySelector('[data-save-membership]');button.disabled=true;button.textContent='Menyimpan…';
  try{
    await api('/v1/develop/users/'+encodeURIComponent(id)+'/access',{method:'POST',body:JSON.stringify({status,expiresAt})});
    await loadAll();
  }catch(error){alert(error.message||'Membership tidak dapat diperbarui.');}
  finally{button.disabled=false;button.textContent='Simpan';}
}
async function loadUserDatasets(id){
  const user=users.find(item=>item.id===id);
  $('#datasetOwner').textContent=user?'Dataset cloud milik '+(user.name||user.email):'Dataset pengguna';
  $('#userDatasets').innerHTML='<span class="muted">Memuat…</span>';
  try{
    const data=await api('/v1/develop/users/'+encodeURIComponent(id)+'/datasets');
    const items=data.items||[];
    $('#userDatasets').innerHTML=items.length?items.map(item=>'<div class="dataset-row"><strong>'+esc(item.name)+'</strong><span>rev. '+Number(item.revision||1)+'</span><span>'+(item.deletedAt?'Dihapus '+esc(dateText(item.deletedAt)):'Diperbarui '+esc(dateText(item.updatedAt)))+'</span></div>').join(''):'<span class="muted">Belum ada dataset cloud.</span>';
  }catch(error){$('#userDatasets').innerHTML='<span class="muted">'+esc(error.message)+'</span>';}
}
async function loadHealth(){
  try{
    const response=await fetch(endpoint+'/v1/health',{cache:'no-store'}),data=await response.json();
    $('#serverState').textContent=(data.service||'Worker')+' · API '+(data.apiVersion||'—')+' · auth '+(data.authConfigured?'aktif':'nonaktif')+' · sync '+(data.datasetSync?'aktif':'nonaktif');
  }catch{$('#serverState').textContent='Worker tidak dapat diperiksa.';}
}
async function loadAll(){
  const user=window.IrvanAccount?.user;
  if(!window.IrvanAccount?.authenticated)return gate('Masuk dengan akun admin untuk membuka Develop Console.');
  if(user?.role!=='admin'||!user?.features?.develop)return gate('Akun ini tidak memiliki akses Develop Console.','error');
  gate('Memuat data admin…');
  try{
    const result=await Promise.all([api('/v1/develop/overview'),api('/v1/develop/users?limit=300')]);
    users=result[1].items||[];
    renderStats(result[0].stats||{});
    renderUsers();
    $('#developGate').hidden=true;$('#developApp').hidden=false;
    await loadHealth();
  }catch(error){
    gate(error.status===403?'Akses Develop Console ditolak oleh server.':(error.message||'Develop Console tidak dapat dimuat.'),'error');
  }
}
function accountChanged(){setTimeout(loadAll,0);}
$('#refreshDevelop').onclick=loadAll;
$('#userSearch').oninput=renderUsers;
document.addEventListener('accountchange',accountChanged);
if(window.IrvanAccount?.authenticated)setTimeout(loadAll,0);
else setTimeout(()=>{if(window.IrvanAccount?.authenticated)loadAll();},1200);
