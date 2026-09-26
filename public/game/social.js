import {ACCOUNT_CONFIG} from '../account-config.js';

const endpoint=String(ACCOUNT_CONFIG.endpoint||'').replace(/\/$/,'');
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let user=null,currentTab='rank',friendsCache={friends:[],incoming:[],outgoing:[]},lastLoad=0,busy=false;

function token(){return window.IrvanAccount?.getToken?.()||'';}
async function api(path,options={}){
  const session=token();if(!session)throw Error('Masuk dulu.');
  const headers=new Headers(options.headers||{});headers.set('Authorization','Bearer '+session);
  if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const response=await fetch(endpoint+path,{...options,headers});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=Error(data.error||'Aksi gagal.');error.status=response.status;error.data=data;throw error;
  }
  return data;
}
function avatar(player){
  if(player?.picture)return `<img src="${esc(player.picture)}" alt="" referrerpolicy="no-referrer">`;
  const name=String(player?.name||'?').trim(),initials=name.split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'?';
  return `<span>${esc(initials)}</span>`;
}
function playerRow(player,{rank='',actions=''}={}){
  return `<div class="social-player">${rank?`<strong class="social-rank">${rank}</strong>`:''}<span class="social-avatar">${avatar(player)}</span><div class="social-player-copy"><b>${esc(player.name||'Pemain')}</b><small>${Math.round(player.score||0)} pts · Lv ${Math.round(player.level||1)}</small></div><div class="social-player-actions">${actions}</div></div>`;
}
function setBadge(count){
  const badge=$('#socialBadge');if(!badge)return;
  badge.hidden=!count;badge.textContent=count>9?'9+':String(count||'');
}
function open(){
  $('#socialModal').hidden=false;renderGate();
  if(user)refreshSocial(true);
}
function close(){$('#socialModal').hidden=true;}
function renderGate(){
  const authenticated=Boolean(user&&token());
  $('#socialGate').hidden=authenticated;$('#socialApp').hidden=!authenticated;
  if(!authenticated)return;
  renderTab();
}
async function submitProfile(profile=window.FieldZeroGame?.getProfile?.()){
  if(!user||!profile||busy)return;
  try{await api('/v1/game/profile',{method:'PUT',body:JSON.stringify(profile)});}catch(error){console.warn('Game profile sync failed',error);}
}
async function loadFriends(){
  const data=await api('/v1/game/friends');friendsCache=data;return data;
}
async function processRaids(){
  if(!user)return 0;
  try{
    const data=await api('/v1/game/raids/inbox');let pending=0;
    for(const raid of data.items||[]){
      const applied=window.FieldZeroGame?.applyBurnRaid?.(raid);
      if(applied){
        await api('/v1/game/raids/'+encodeURIComponent(raid.id)+'/claim',{method:'POST'});
      }else pending++;
    }
    return pending;
  }catch(error){console.warn('Raid inbox failed',error);return 0;}
}
async function processAids(){
  if(!user)return 0;
  try{
    const data=await api('/v1/game/aids/inbox');let pending=0;
    for(const aid of data.items||[]){
      const applied=window.FieldZeroGame?.applyWaterAid?.(aid);
      if(applied)await api('/v1/game/aids/'+encodeURIComponent(aid.id)+'/claim',{method:'POST'});
      else pending++;
    }
    return pending;
  }catch(error){console.warn('Aid inbox failed',error);return 0;}
}
async function refreshSocial(force=false){
  if(!user||busy)return;
  if(!force&&Date.now()-lastLoad<20000)return;
  busy=true;
  try{
    const [friends,pendingRaids,pendingAids]=await Promise.all([loadFriends(),processRaids(),processAids()]);
    lastLoad=Date.now();setBadge((friends.incoming?.length||0)+pendingRaids+pendingAids);
    if(!$('#socialModal').hidden)await renderTab();
  }catch(error){
    if(!$('#socialModal').hidden)$('#socialContent').innerHTML=`<div class="social-empty">${esc(error.message)}</div>`;
  }finally{busy=false;}
}
async function renderRank(){
  $('#socialContent').innerHTML='<div class="social-loading">…</div>';
  try{
    const data=await api('/v1/game/leaderboard?limit=25');
    const rows=(data.items||[]).map((player,index)=>playerRow(player,{rank:index===0?'🥇':index===1?'🥈':index===2?'🥉':'#'+(index+1)})).join('');
    $('#socialContent').innerHTML=`<div class="social-me-rank">Rank saya <b>${data.myRank?'#'+data.myRank:'—'}</b></div><div class="social-list">${rows||'<div class="social-empty">Belum ada skor.</div>'}</div>`;
  }catch(error){$('#socialContent').innerHTML=`<div class="social-empty">${esc(error.message)}</div>`;}
}
async function renderFriends(){
  $('#socialContent').innerHTML='<div class="social-loading">…</div>';
  try{
    friendsCache=await loadFriends();
    const incoming=(friendsCache.incoming||[]).map(player=>playerRow(player,{actions:`<button data-friend-accept="${esc(player.id)}" title="Terima teman" aria-label="Terima teman">✓ <span>Terima</span></button><button data-friend-remove="${esc(player.id)}" title="Tolak" aria-label="Tolak">×</button>`})).join('');
    const friends=(friendsCache.friends||[]).map(player=>playerRow(player,{actions:`<button class="aid-button" data-friend-aid="${esc(player.id)}" title="Bantu menyiram satu petak" aria-label="Bantu menyiram">💧 <span>Bantu</span></button><button class="burn-button" data-friend-burn="${esc(player.id)}" title="Raid: bakar ringan satu petak" aria-label="Raid bakar ringan">🔥 <span>Raid</span></button><button data-friend-remove="${esc(player.id)}" title="Hapus teman" aria-label="Hapus teman">×</button>`})).join('');
    const outgoing=(friendsCache.outgoing||[]).map(player=>playerRow(player,{actions:'<small>Menunggu</small>'})).join('');
    $('#socialContent').innerHTML=`${incoming?`<div class="social-section"><small>PERMINTAAN</small>${incoming}</div>`:''}<div class="social-section"><small>TEMAN</small>${friends||'<div class="social-empty">Belum ada teman.</div>'}</div>${outgoing?`<div class="social-section"><small>TERKIRIM</small>${outgoing}</div>`:''}`;
  }catch(error){$('#socialContent').innerHTML=`<div class="social-empty">${esc(error.message)}</div>`;}
}
function renderSearch(){
  $('#socialContent').innerHTML=`<form id="playerSearch" class="social-search"><input id="playerSearchInput" type="search" minlength="2" maxlength="80" placeholder="Nama pemain" autocomplete="off"><button type="submit">Cari</button></form><div id="playerSearchResults" class="social-list"><div class="social-empty">Cari minimal 2 huruf.</div></div>`;
  $('#playerSearch').onsubmit=async event=>{
    event.preventDefault();const q=$('#playerSearchInput').value.trim(),host=$('#playerSearchResults');if(q.length<2)return;
    host.innerHTML='<div class="social-loading">…</div>';
    try{
      const data=await api('/v1/game/players?q='+encodeURIComponent(q));
      const friendIds=new Set((friendsCache.friends||[]).map(item=>item.id)),incomingIds=new Set((friendsCache.incoming||[]).map(item=>item.id)),outIds=new Set((friendsCache.outgoing||[]).map(item=>item.id));
      host.innerHTML=(data.items||[]).map(player=>{
        let actions='';
        if(friendIds.has(player.id))actions='<small>Teman</small>';
        else if(incomingIds.has(player.id))actions=`<button data-friend-accept="${esc(player.id)}" title="Terima teman">✓ <span>Terima</span></button>`;
        else if(outIds.has(player.id))actions='<small>Menunggu</small>';
        else actions=`<button data-friend-add="${esc(player.id)}" title="Tambah teman">＋ <span>Tambah</span></button>`;
        return playerRow(player,{actions});
      }).join('')||'<div class="social-empty">Tidak ditemukan.</div>';
    }catch(error){host.innerHTML=`<div class="social-empty">${esc(error.message)}</div>`;}
  };
}
async function renderTab(){
  document.querySelectorAll('[data-social-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.socialTab===currentTab)));
  if(currentTab==='rank')await renderRank();
  if(currentTab==='friends')await renderFriends();
  if(currentTab==='search')renderSearch();
}
async function friendAction(action,id){
  try{
    if(action==='add')await api('/v1/game/friends',{method:'POST',body:JSON.stringify({targetUserId:id})});
    if(action==='accept')await api('/v1/game/friends/'+encodeURIComponent(id)+'/accept',{method:'POST'});
    if(action==='remove')await api('/v1/game/friends/'+encodeURIComponent(id),{method:'DELETE'});
    friendsCache=await loadFriends();setBadge(friendsCache.incoming?.length||0);
    await renderTab();
  }catch(error){alert(error.message);}
}
async function burnFriend(id,button){
  if(!confirm('Raid pemain ini? Satu petak hanya terkena kerusakan ringan.'))return;
  button.disabled=true;
  try{
    await api('/v1/game/raids/'+encodeURIComponent(id),{method:'POST'});
    button.textContent='✓';setTimeout(()=>{button.textContent='🔥';button.disabled=false;},1400);
  }catch(error){
    if(error.status===429&&error.data?.retryAfterSec){
      const hours=Math.max(1,Math.ceil(error.data.retryAfterSec/3600));alert('Cooldown raid: '+hours+' jam.');
    }else alert(error.message);
    button.disabled=false;
  }
}
async function aidFriend(id,button){
  button.disabled=true;
  try{
    await api('/v1/game/aids/'+encodeURIComponent(id),{method:'POST'});
    button.textContent='✓';setTimeout(()=>{button.innerHTML='💧 <span>Bantu</span>';button.disabled=false;},1400);
  }catch(error){
    if(error.status===429&&error.data?.retryAfterSec){
      const hours=Math.max(1,Math.ceil(error.data.retryAfterSec/3600));alert('Bantuan tersedia lagi sekitar '+hours+' jam.');
    }else alert(error.message);
    button.disabled=false;
  }
}
function onAccount(event){
  user=event.detail?.authenticated?event.detail.user:null;renderGate();
  if(user){submitProfile();refreshSocial(true);}else setBadge(0);
}
function bind(){
  $('#quickSocial').onclick=open;$('#closeSocial').onclick=close;$('#socialModal').addEventListener('click',event=>{if(event.target.id==='socialModal')close();});
  $('#socialLogin').onclick=()=>window.IrvanAccount?.login?.();
  document.querySelectorAll('[data-social-tab]').forEach(button=>button.onclick=()=>{currentTab=button.dataset.socialTab;renderTab();});
  $('#socialContent').addEventListener('click',event=>{
    const add=event.target.closest('[data-friend-add]'),accept=event.target.closest('[data-friend-accept]'),remove=event.target.closest('[data-friend-remove]'),burn=event.target.closest('[data-friend-burn]'),aid=event.target.closest('[data-friend-aid]');
    if(add)friendAction('add',add.dataset.friendAdd);
    if(accept)friendAction('accept',accept.dataset.friendAccept);
    if(remove&&confirm('Hapus teman/permintaan?'))friendAction('remove',remove.dataset.friendRemove);
    if(burn)burnFriend(burn.dataset.friendBurn,burn);
    if(aid)aidFriend(aid.dataset.friendAid,aid);
  });
  document.addEventListener('accountchange',onAccount);
  document.addEventListener('fieldzero-profile',event=>submitProfile(event.detail));
  document.addEventListener('fieldzero-field-change',()=>Promise.all([processRaids(),processAids()]).then(([raids,aids])=>setBadge((friendsCache.incoming?.length||0)+raids+aids)));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
  if(window.IrvanAccount?.authenticated)onAccount({detail:{authenticated:true,user:window.IrvanAccount.user}});
}
bind();
