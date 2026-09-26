import {ACCOUNT_CONFIG} from './account-config.js';

const TOKEN_KEY='irvan_account_session_v1'; // legacy localStorage key; migrated on load
const SESSION_FALLBACK_KEY='irvan_account_session_fallback_v2';
const CSRF_KEY='irvan_account_csrf_v2';
const FALLBACK_EXPIRES_KEY='irvan_account_fallback_expires_v2';
const USER_KEY='irvan_account_user_v1';
const LOGIN_STATE_KEY='irvan_account_login_state_v1';
const AUTH_READY_CACHE_KEY='irvan_account_auth_ready_v1';
const AUTH_READY_CACHE_MS=15*60*1000;

const endpoint=String(ACCOUNT_CONFIG.endpoint||'').replace(/\/$/,'');
let currentUser=null;
let token='';
let csrfToken='';
let mount=null;
let menu=null;
let authReady=false;
let authChecked=false;
let cloudState={worker:false,effectiveMode:'unknown',features:{},storage:{},updatedAt:null};
let cloudCheckedAt=0;
const CLOUD_STATUS_CACHE_MS=15*60*1000;

function safeJson(value,fallback=null){try{return JSON.parse(value);}catch{return fallback;}}
function loadStored(){
  const legacy=localStorage.getItem(TOKEN_KEY)||'';
  token=sessionStorage.getItem(SESSION_FALLBACK_KEY)||legacy;
  csrfToken=sessionStorage.getItem(CSRF_KEY)||'';
  const fallbackExpires=Date.parse(sessionStorage.getItem(FALLBACK_EXPIRES_KEY)||'');
  if(token&&Number.isFinite(fallbackExpires)&&fallbackExpires<=Date.now()){
    token='';csrfToken='';
    sessionStorage.removeItem(SESSION_FALLBACK_KEY);
    sessionStorage.removeItem(CSRF_KEY);
    sessionStorage.removeItem(FALLBACK_EXPIRES_KEY);
  }
  currentUser=safeJson(localStorage.getItem(USER_KEY),null);
  if(legacy){
    try{sessionStorage.setItem(SESSION_FALLBACK_KEY,legacy);}catch{}
    localStorage.removeItem(TOKEN_KEY);
  }
}
function saveSession(nextToken,user,nextCsrf='',fallbackExpiresAt=''){
  token=nextToken||'';
  csrfToken=nextCsrf||'';
  currentUser=user||null;
  localStorage.removeItem(TOKEN_KEY);
  try{
    if(token)sessionStorage.setItem(SESSION_FALLBACK_KEY,token);else sessionStorage.removeItem(SESSION_FALLBACK_KEY);
    if(csrfToken)sessionStorage.setItem(CSRF_KEY,csrfToken);else sessionStorage.removeItem(CSRF_KEY);
    if(token&&fallbackExpiresAt)sessionStorage.setItem(FALLBACK_EXPIRES_KEY,fallbackExpiresAt);else sessionStorage.removeItem(FALLBACK_EXPIRES_KEY);
  }catch{}
  if(currentUser)localStorage.setItem(USER_KEY,JSON.stringify(currentUser));else localStorage.removeItem(USER_KEY);
}
function randomState(){
  const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function cleanAuthParams(){
  const url=new URL(location.href);
  let changed=false;
  for(const key of ['auth_code','auth_state','auth_error']){
    if(url.searchParams.has(key)){url.searchParams.delete(key);changed=true;}
  }
  if(changed)history.replaceState(null,'',url.pathname+url.search+url.hash);
}
function returnUrl(){
  const url=new URL(location.href);
  for(const key of ['auth_code','auth_state','auth_error'])url.searchParams.delete(key);
  return url.toString();
}
function authFetch(path,options={}){
  const headers=new Headers(options.headers||{});
  const method=String(options.method||'GET').toUpperCase();
  if(token)headers.set('Authorization',`Bearer ${token}`);
  if(!['GET','HEAD','OPTIONS'].includes(method)&&csrfToken)headers.set('X-Agrotik-CSRF',csrfToken);
  if(options.body&&!headers.has('Content-Type')&&!(options.body instanceof FormData))headers.set('Content-Type','application/json');
  return fetch(endpoint+path,{...options,headers,credentials:'include'});
}
function status(message,type='info'){
  let box=document.querySelector('.account-status');
  if(!box){box=document.createElement('div');box.className='account-status';document.body.append(box);}
  box.textContent=message;box.dataset.type=type;
  clearTimeout(status.timer);status.timer=setTimeout(()=>box.remove(),4200);
}
function initials(user){
  const name=String(user?.name||user?.email||'?').trim();
  return name.split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('')||'?';
}
function avatarAuraClass(user){
  if(user?.role==='admin')return 'immortal';
  if(user?.membership?.active)return 'glory';
  return 'bronze';
}
function avatarMarkup(user,large=false){
  const avatar=user?.picture
    ?`<img class="account-avatar" src="${escapeHtml(user.picture)}" alt="" referrerpolicy="no-referrer">`
    :`<span class="account-avatar account-avatar-fallback" aria-hidden="true">${escapeHtml(initials(user))}</span>`;
  return `<span class="account-avatar-frame ${avatarAuraClass(user)}${large?' large':''}" aria-hidden="true">${avatar}</span>`;
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function accessLabel(user){
  if(user?.role==='admin')return 'Admin';
  if(user?.membership?.active)return 'Member';
  return 'Freezer';
}
function accessClass(user){
  if(user?.role==='admin')return 'admin';
  if(user?.membership?.active)return 'member';
  return 'freezer';
}
function dispatch(){
  window.IrvanAccount={
    get user(){return currentUser;},
    get authenticated(){return Boolean(currentUser);},
    getToken:()=>token,
    getCsrfToken:()=>csrfToken,
    request:authFetch,
    refresh:refreshSession,
    login:startLogin,
    logout
  };
  document.dispatchEvent(new CustomEvent('accountchange',{detail:{authenticated:Boolean(currentUser),user:currentUser}}));
}
function lastDatasetSync(){
  try{
    let latest='';
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||'';
      if(!key.startsWith('statistical_web_cloud_sync_v1:'))continue;
      const value=safeJson(localStorage.getItem(key),null),at=value?.lastSyncAt||'';
      if(at&&(!latest||at>latest))latest=at;
    }
    return latest;
  }catch{return '';}
}
function cloudIndicator(){
  const wrap=document.createElement('div');wrap.className='account-cloud';
  const button=document.createElement('button');button.type='button';button.className='account-cloud-button';button.textContent='☁';button.setAttribute('aria-label','Status cloud');
  const panel=document.createElement('div');panel.className='account-cloud-panel';panel.hidden=true;
  const refresh=()=>{
    const sync=lastDatasetSync(),features=cloudState.features||{},storage=cloudState.storage||{};
    panel.innerHTML='<b>Status Cloud</b><span>Lokal ✓</span><span>Worker '+(cloudState.worker?'✓':'—')+'</span><span>Mode '+escapeHtml(cloudState.effectiveMode||'—')+'</span><span>D1 '+(features.datasetSync?'✓':'jeda')+'</span><span>R2 '+(storage.imagesR2?'✓':'—')+'</span><span>Sync '+(sync?new Date(sync).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}):'—')+'</span>';
    button.dataset.state=!cloudState.worker?'offline':cloudState.effectiveMode==='emergency'?'emergency':cloudState.effectiveMode==='economy'?'economy':'online';
    button.title=!cloudState.worker?'Cloud tidak tersedia':('Cloud '+cloudState.effectiveMode);
  };
  refresh();
  button.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden&&Date.now()-cloudCheckedAt>CLOUD_STATUS_CACHE_MS)void refreshCloudStatus();};
  wrap.append(button,panel);return wrap;
}
function updateCloudIndicator(){
  const current=mount?.querySelector('.account-cloud');if(!current)return;
  const fresh=cloudIndicator();current.replaceWith(fresh);
}
async function refreshCloudStatus({force=false}={}){
  if(!endpoint||(!force&&Date.now()-cloudCheckedAt<CLOUD_STATUS_CACHE_MS))return cloudState;
  try{
    const response=await fetch(endpoint+'/v1/cloud/status',{headers:{Accept:'application/json'},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    cloudState={worker:response.ok,effectiveMode:data.effectiveMode||'unknown',features:data.features||{},storage:data.storage||{},updatedAt:data.updatedAt||null};
  }catch{cloudState={worker:false,effectiveMode:'offline',features:{},storage:{},updatedAt:null};}
  cloudCheckedAt=Date.now();updateCloudIndicator();return cloudState;
}
function closeMenu(){
  if(menu)menu.hidden=true;
  mount?.querySelector('.account-trigger')?.setAttribute('aria-expanded','false');
}
function render(){
  if(!mount)return;
  mount.replaceChildren();
  if(!currentUser){
    const button=document.createElement('button');
    button.type='button';button.className='account-login';
    button.innerHTML='<span class="account-google-mark" aria-hidden="true">G</span><span>Masuk dengan Google</span>';
    button.disabled=!authReady;
    button.title=authChecked&&!authReady?'Login Google belum diaktifkan di server.':'';
    button.onclick=startLogin;
    mount.append(cloudIndicator(),button);
    closeMenu();dispatch();return;
  }

  const trigger=document.createElement('button');
  trigger.type='button';trigger.className='account-trigger';trigger.setAttribute('aria-expanded','false');
  trigger.innerHTML=`${avatarMarkup(currentUser)}<span class="account-name">${escapeHtml(currentUser.name||currentUser.email)}</span><span class="account-chevron" aria-hidden="true">▾</span>`;

  menu=document.createElement('div');
  menu.className='account-menu';menu.hidden=true;
  const developButton=currentUser.features?.develop?'<button type="button" data-account-develop>Develop</button>':'';
  const membershipButton=currentUser.role==='admin'?'':'<button type="button" data-account-membership>Membership</button>';
  menu.innerHTML=`<div class="account-profile">${avatarMarkup(currentUser,true)}<div><strong>${escapeHtml(currentUser.name||'Pengguna')}</strong><small>${escapeHtml(currentUser.email||'')}</small><span class="account-access-badge ${accessClass(currentUser)}">${accessLabel(currentUser)}</span></div></div><div class="account-menu-separator"></div><button type="button" data-account-profile>Profil akun</button>${membershipButton}${developButton}<button type="button" class="account-logout" data-account-logout>Keluar</button>`;

  trigger.onclick=()=>{
    const opening=menu.hidden;menu.hidden=!opening;trigger.setAttribute('aria-expanded',String(opening));
  };
  menu.querySelector('[data-account-profile]').onclick=()=>{location.assign('/account/');};
  menu.querySelector('[data-account-membership]')?.addEventListener('click',()=>{location.assign('/membership/');});
  menu.querySelector('[data-account-develop]')?.addEventListener('click',()=>{location.assign('/develop/');});
  menu.querySelector('[data-account-logout]').onclick=logout;
  mount.append(cloudIndicator(),trigger,menu);
  dispatch();
}
function ensureMount(){
  if(mount?.isConnected)return mount;
  const existing=document.getElementById('accountMount');
  if(existing){mount=existing;mount.classList.add('account-widget');return mount;}

  mount=document.createElement('div');
  mount.id='accountMount';mount.className='account-widget';

  const subweb=document.querySelector('.subweb-header-inner');
  if(subweb){subweb.append(mount);return mount;}

  const homeNav=document.querySelector('header .wrap.nav');
  if(homeNav){homeNav.append(mount);return mount;}

  const cameraHeader=document.querySelector('body>header');
  if(cameraHeader){cameraHeader.append(mount);return mount;}

  document.body.prepend(mount);
  return mount;
}
async function startLogin(){
  if(!ACCOUNT_CONFIG.enabled||!endpoint||!authReady)return status('Login Google belum aktif di server.','error');
  const state=randomState();
  sessionStorage.setItem(LOGIN_STATE_KEY,state);
  const url=new URL(endpoint+'/v1/auth/google/start');
  url.searchParams.set('return_to',returnUrl());
  url.searchParams.set('client_state',state);
  location.assign(url.toString());
}
async function exchangeCallback(){
  const url=new URL(location.href);
  const error=url.searchParams.get('auth_error');
  const code=url.searchParams.get('auth_code');
  const returnedState=url.searchParams.get('auth_state');
  if(error){
    cleanAuthParams();
    const labels={
      google_not_configured:'Login Google belum dikonfigurasi di server.',
      invalid_state:'Permintaan login tidak valid.',
      expired_state:'Sesi login kedaluwarsa. Silakan coba lagi.',
      access_denied:'Login Google dibatalkan.',
      token_exchange_failed:'Google tidak dapat menyelesaikan login.',
      profile_failed:'Profil Google tidak dapat dibaca.'
    };
    status(labels[error]||'Login tidak berhasil.','error');
    return false;
  }
  if(!code)return false;

  const expected=sessionStorage.getItem(LOGIN_STATE_KEY)||'';
  cleanAuthParams();
  if(!expected||!returnedState||expected!==returnedState){
    sessionStorage.removeItem(LOGIN_STATE_KEY);
    status('Verifikasi login tidak cocok. Silakan masuk lagi.','error');
    return true;
  }

  try{
    const response=await fetch(endpoint+'/v1/auth/exchange',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code,state:returnedState}),
      credentials:'include'
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.token||!data.user)throw Error(data.error||'Login tidak dapat diselesaikan.');

    let cookieSession=null;
    try{
      const probe=await fetch(endpoint+'/v1/auth/session',{headers:{Accept:'application/json'},credentials:'include',cache:'no-store'});
      if(probe.ok)cookieSession=await probe.json();
    }catch{}
    if(cookieSession?.authenticated&&cookieSession.user){
      saveSession('',cookieSession.user,cookieSession.csrfToken||data.csrfToken||'');
    }else{
      // Compatibility fallback for browsers that block cross-site cookies.
      // Token is scoped to this tab/session and is never persisted in localStorage.
      saveSession(data.token,data.user,data.csrfToken||'',data.fallbackExpiresAt||'');
    }
    sessionStorage.removeItem(LOGIN_STATE_KEY);
    render();
    status(`Berhasil masuk sebagai ${data.user.name||data.user.email}.`,'success');
  }catch(error){
    sessionStorage.removeItem(LOGIN_STATE_KEY);
    status(error.message||'Login tidak dapat diselesaikan.','error');
  }
  return true;
}
async function refreshSession(){
  try{
    const response=await authFetch('/v1/auth/session',{cache:'no-store'});
    if(!response.ok)throw Error('Sesi berakhir');
    const data=await response.json();
    if(!data.authenticated||!data.user)throw Error('Sesi berakhir');
    const cookieActive=data.authSource==='cookie';
    const nextToken=cookieActive?'':(data.token||token);
    const fallbackExpiresAt=cookieActive?'':(data.fallbackExpiresAt||sessionStorage.getItem(FALLBACK_EXPIRES_KEY)||'');
    saveSession(nextToken,data.user,data.csrfToken||csrfToken,fallbackExpiresAt);
    render();
    return currentUser;
  }catch{
    saveSession('',null,'');render();return null;
  }
}
async function logout(){
  closeMenu();
  try{await authFetch('/v1/auth/logout',{method:'POST',body:'{}'});}catch{}
  saveSession('',null,'');render();
  status('Anda sudah keluar.','success');
}
async function checkAuthReady(){
  try{
    const cached=safeJson(sessionStorage.getItem(AUTH_READY_CACHE_KEY),null);
    if(cached&&Date.now()-Number(cached.at||0)<AUTH_READY_CACHE_MS){
      authReady=Boolean(cached.ready);authChecked=true;render();return;
    }
  }catch{}
  try{
    const response=await fetch(endpoint+'/v1/health',{headers:{Accept:'application/json'},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    authReady=Boolean(response.ok&&data.authConfigured===true);
    try{sessionStorage.setItem(AUTH_READY_CACHE_KEY,JSON.stringify({ready:authReady,at:Date.now()}));}catch{}
  }catch{authReady=false;}
  authChecked=true;render();
}
async function init(){
  if(!ACCOUNT_CONFIG.enabled||!endpoint)return;
  ensureMount();loadStored();render();
  const handled=await exchangeCallback();
  if(!handled)await refreshSession();
  if(currentUser){
    authReady=true;authChecked=true;
  }else{
    await checkAuthReady();
  }
  void refreshCloudStatus({force:true});
  window.addEventListener('online',()=>void refreshCloudStatus({force:true}));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCloudStatus();});
  document.addEventListener('click',event=>{if(!event.target.closest('.account-widget'))closeMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
}

init();
