import {ACCOUNT_CONFIG} from '../account-config.js';

const endpoint=String(ACCOUNT_CONFIG.endpoint||'').replace(/\/$/,'');
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const CACHE_PREFIX='agrotik_fz_social_v3:',RANK_TTL=10*60*1000,FRIENDS_TTL=30*60*1000,INBOX_TTL=5*60*1000,PROFILE_TTL=12*60*60*1000;
let user=null,currentTab='rank',friendsCache={friends:[],incoming:[],outgoing:[]},busy=false,lastInboxCheck=0;

function cacheKey(name){return CACHE_PREFIX+(user?.id||'anon')+':'+name;}
function readCache(name,ttl){
  try{const item=JSON.parse(localStorage.getItem(cacheKey(name))||'null');return item&&Date.now()-item.at<ttl?item.data:null;}catch{return null;}
}
function writeCache(name,data){try{localStorage.setItem(cacheKey(name),JSON.stringify({at:Date.now(),data}));}catch{}return data;}
function clearCache(name){try{localStorage.removeItem(cacheKey(name));}catch{}}
async function api(path,options={}){
  const request=window.IrvanAccount?.request;
  if(!window.IrvanAccount?.authenticated||!request)throw Error('Masuk dulu.');
  const response=await request(path,{...options,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=Error(data.error||'Aksi gagal.');error.status=response.status;error.data=data;throw error;}
  return data;
}
function avatar(player){
  if(player?.picture)return `<img src="${esc(player.picture)}" alt="" referrerpolicy="no-referrer">`;
  const initials=String(player?.name||'?').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'?';
  return `<span>${esc(initials)}</span>`;
}
function playerRow(player,{rank='',actions=''}={}){
  return `<div class="social-player">${rank?`<strong class="social-rank">${rank}</strong>`:''}<span class="social-avatar">${avatar(player)}</span><div class="social-player-copy"><b>${esc(player.name||'Pemain')}</b><small>${Math.round(player.score||0)} · Lv ${Math.round(player.level||1)}</small></div><div class="social-player-actions">${actions}</div></div>`;
}
function setBadge(count){
  const badge=$('#socialBadge');if(!badge)return;badge.hidden=!count;badge.textContent=count>9?'9+':String(count||'');
}
function cachedBadge(){
  const cached=readCache('friends',FRIENDS_TTL);setBadge(cached?.incoming?.length||0);
}
function open(){
  $('#socialModal').hidden=false;renderGate();
  if(user){submitProfile(window.FieldZeroGame?.getProfile?.(),false);processInbox();}
}
function close(){$('#socialModal').hidden=true;}
function renderGate(){
  const authenticated=Boolean(user&&window.IrvanAccount?.authenticated);$('#socialGate').hidden=authenticated;$('#socialApp').hidden=!authenticated;
  if(authenticated)renderTab();
}
async function submitProfile(profile=window.FieldZeroGame?.getProfile?.(),force=false){
  if(!user||!profile)return;
  const hash=JSON.stringify(profile),meta=readCache('profile-sync',PROFILE_TTL);
  if(!force&&meta?.hash===hash)return;
  if(!force&&meta&&Date.now()-Number(meta.at||0)<PROFILE_TTL)return;
  try{await api('/v1/game/profile',{method:'PUT',body:JSON.stringify(profile)});writeCache('profile-sync',{hash,at:Date.now()});clearCache('rank');}
  catch(error){console.warn('Game profile sync failed',error);}
}
async function loadFriends(force=false){
  if(!force){const cached=readCache('friends',FRIENDS_TTL);if(cached){friendsCache=cached;return cached;}}
  const data=await api('/v1/game/friends');friendsCache=writeCache('friends',data);return data;
}
async function processInbox(force=false){
  if(!user)return;
  if(!force&&Date.now()-lastInboxCheck<INBOX_TTL)return;
  lastInboxCheck=Date.now();
  try{
    const data=await api('/v1/game/inbox'),raidIds=[],aidIds=[];let pending=0;
    for(const raid of data.raids||[]){
      if(window.FieldZeroGame?.applyBurnRaid?.(raid))raidIds.push(raid.id);else pending++;
    }
    for(const aid of data.aids||[]){
      if(window.FieldZeroGame?.applyWaterAid?.(aid))aidIds.push(aid.id);else pending++;
    }
    setBadge((Number(data.friendRequests)||0)+pending);
    if(raidIds.length||aidIds.length)await api('/v1/game/inbox/claim',{method:'POST',body:JSON.stringify({raidIds,aidIds})});
  }catch(error){console.warn('Social inbox failed',error);}
}
async function renderRank(){
  $('#socialContent').innerHTML='<div class="social-loading">…</div>';
  try{
    let data=readCache('rank',RANK_TTL);
    if(!data)data=writeCache('rank',await api('/v1/game/leaderboard?limit=25'));
    const rows=(data.items||[]).map((player,index)=>playerRow(player,{rank:index===0?'🥇':index===1?'🥈':index===2?'🥉':'#'+(index+1)})).join('');
    $('#socialContent').innerHTML=`<div class="social-me-rank">🏆 <b>${data.myRank?'#'+data.myRank:'—'}</b></div><div class="social-list">${rows||'<div class="social-empty">—</div>'}</div>`;
  }catch(error){$('#socialContent').innerHTML=`<div class="social-empty">${esc(error.message)}</div>`;}
}
async function renderFriends(){
  $('#socialContent').innerHTML='<div class="social-loading">…</div>';
  try{
    friendsCache=await loadFriends();
    const incoming=(friendsCache.incoming||[]).map(player=>playerRow(player,{actions:`<button data-friend-accept="${esc(player.id)}" title="Terima" aria-label="Terima">✓</button><button data-friend-remove="${esc(player.id)}" title="Tolak" aria-label="Tolak">×</button>`})).join('');
    const friends=(friendsCache.friends||[]).map(player=>playerRow(player,{actions:`<button class="aid-button" data-friend-aid="${esc(player.id)}" title="Bantu" aria-label="Bantu">💧</button><button class="burn-button" data-friend-burn="${esc(player.id)}" title="Raid" aria-label="Raid">🔥</button><button data-friend-remove="${esc(player.id)}" title="Hapus" aria-label="Hapus">×</button>`})).join('');
    const outgoing=(friendsCache.outgoing||[]).map(player=>playerRow(player,{actions:'<small>…</small>'})).join('');
    $('#socialContent').innerHTML=`${incoming?`<div class="social-section"><small>＋</small>${incoming}</div>`:''}<div class="social-section"><small>👥</small>${friends||'<div class="social-empty">—</div>'}</div>${outgoing?`<div class="social-section"><small>→</small>${outgoing}</div>`:''}`;
  }catch(error){$('#socialContent').innerHTML=`<div class="social-empty">${esc(error.message)}</div>`;}
}
function renderSearch(){
  $('#socialContent').innerHTML=`<form id="playerSearch" class="social-search"><input id="playerSearchInput" type="search" minlength="2" maxlength="80" placeholder="Nama" autocomplete="off"><button type="submit" title="Cari" aria-label="Cari">⌕</button></form><div id="playerSearchResults" class="social-list"></div>`;
  $('#playerSearch').onsubmit=async event=>{
    event.preventDefault();const q=$('#playerSearchInput').value.trim(),host=$('#playerSearchResults');if(q.length<2)return;
    host.innerHTML='<div class="social-loading">…</div>';
    try{
      const data=await api('/v1/game/players?q='+encodeURIComponent(q));
      const friendIds=new Set((friendsCache.friends||[]).map(item=>item.id)),incomingIds=new Set((friendsCache.incoming||[]).map(item=>item.id)),outIds=new Set((friendsCache.outgoing||[]).map(item=>item.id));
      host.innerHTML=(data.items||[]).map(player=>{
        let actions='';
        if(friendIds.has(player.id))actions='<small>✓</small>';
        else if(incomingIds.has(player.id))actions=`<button data-friend-accept="${esc(player.id)}" title="Terima">✓</button>`;
        else if(outIds.has(player.id))actions='<small>…</small>';
        else actions=`<button data-friend-add="${esc(player.id)}" title="Tambah">＋</button>`;
        return playerRow(player,{actions});
      }).join('')||'<div class="social-empty">—</div>';
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
    clearCache('friends');friendsCache=await loadFriends(true);setBadge(friendsCache.incoming?.length||0);await renderTab();
  }catch(error){alert(error.message);}
}
async function burnFriend(id,button){
  if(!confirm('🔥 ?'))return;button.disabled=true;
  try{await api('/v1/game/raids/'+encodeURIComponent(id),{method:'POST'});button.textContent='✓';setTimeout(()=>{button.textContent='🔥';button.disabled=false;},1200);}
  catch(error){if(error.status===429&&error.data?.retryAfterSec)alert('⏳ '+Math.max(1,Math.ceil(error.data.retryAfterSec/3600))+'h');else alert(error.message);button.disabled=false;}
}
async function aidFriend(id,button){
  button.disabled=true;
  try{await api('/v1/game/aids/'+encodeURIComponent(id),{method:'POST'});button.textContent='✓';setTimeout(()=>{button.textContent='💧';button.disabled=false;},1200);}
  catch(error){if(error.status===429&&error.data?.retryAfterSec)alert('⏳ '+Math.max(1,Math.ceil(error.data.retryAfterSec/3600))+'h');else alert(error.message);button.disabled=false;}
}
function onAccount(event){
  user=event.detail?.authenticated?event.detail.user:null;renderGate();
  if(user)cachedBadge();else setBadge(0);
}
function bind(){
  $('#quickSocial').onclick=open;$('#closeSocial').onclick=close;$('#socialModal').addEventListener('click',event=>{if(event.target.id==='socialModal')close();});
  $('#socialLogin').onclick=()=>window.IrvanAccount?.login?.();
  document.querySelectorAll('[data-social-tab]').forEach(button=>button.onclick=()=>{currentTab=button.dataset.socialTab;renderTab();});
  $('#socialContent').addEventListener('click',event=>{
    const add=event.target.closest('[data-friend-add]'),accept=event.target.closest('[data-friend-accept]'),remove=event.target.closest('[data-friend-remove]'),burn=event.target.closest('[data-friend-burn]'),aid=event.target.closest('[data-friend-aid]');
    if(add)friendAction('add',add.dataset.friendAdd);
    if(accept)friendAction('accept',accept.dataset.friendAccept);
    if(remove&&confirm('× ?'))friendAction('remove',remove.dataset.friendRemove);
    if(burn)burnFriend(burn.dataset.friendBurn,burn);
    if(aid)aidFriend(aid.dataset.friendAid,aid);
  });
  document.addEventListener('accountchange',onAccount);
  document.addEventListener('fieldzero-profile',event=>submitProfile(event.detail,Boolean(event.detail?._forceSync)));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
  if(window.IrvanAccount?.authenticated)onAccount({detail:{authenticated:true,user:window.IrvanAccount.user}});
}
bind();
