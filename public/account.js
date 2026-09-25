import {ACCOUNT_CONFIG} from './account-config.js';

const TOKEN_KEY='irvan_account_session_v1';
const USER_KEY='irvan_account_user_v1';
const LOGIN_STATE_KEY='irvan_account_login_state_v1';

const endpoint=String(ACCOUNT_CONFIG.endpoint||'').replace(/\/$/,'');
let currentUser=null;
let token='';
let mount=null;
let menu=null;
let authReady=false;
let authChecked=false;

function safeJson(value,fallback=null){try{return JSON.parse(value);}catch{return fallback;}}
function loadStored(){
  token=localStorage.getItem(TOKEN_KEY)||'';
  currentUser=safeJson(localStorage.getItem(USER_KEY),null);
}
function saveSession(nextToken,user){
  token=nextToken||'';
  currentUser=user||null;
  if(token)localStorage.setItem(TOKEN_KEY,token);else localStorage.removeItem(TOKEN_KEY);
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
  if(token)headers.set('Authorization',`Bearer ${token}`);
  if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  return fetch(endpoint+path,{...options,headers});
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
function avatarMarkup(user,large=false){
  if(user?.picture)return `<img class="account-avatar" src="${escapeHtml(user.picture)}" alt="" referrerpolicy="no-referrer">`;
  return `<span class="account-avatar account-avatar-fallback" aria-hidden="true">${escapeHtml(initials(user))}</span>`;
}
function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function accessLabel(user){
  if(user?.role==='admin')return 'Admin';
  if(user?.membership?.active)return 'Membership';
  return 'Akun gratis';
}
function accessClass(user){
  if(user?.role==='admin')return 'admin';
  if(user?.membership?.active)return 'member';
  return 'free';
}
function dispatch(){
  window.IrvanAccount={
    get user(){return currentUser;},
    get authenticated(){return Boolean(token&&currentUser);},
    getToken:()=>token,
    refresh:refreshSession,
    login:startLogin,
    logout
  };
  document.dispatchEvent(new CustomEvent('accountchange',{detail:{authenticated:Boolean(token&&currentUser),user:currentUser}}));
}
function closeMenu(){
  if(menu)menu.hidden=true;
  mount?.querySelector('.account-trigger')?.setAttribute('aria-expanded','false');
}
function render(){
  if(!mount)return;
  mount.replaceChildren();
  if(!token||!currentUser){
    const button=document.createElement('button');
    button.type='button';button.className='account-login';
    button.innerHTML='<span class="account-google-mark" aria-hidden="true">G</span><span>Masuk dengan Google</span>';
    button.disabled=!authReady;
    button.title=authChecked&&!authReady?'Login Google belum diaktifkan di server.':'';
    button.onclick=startLogin;
    mount.append(button);
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
  mount.append(trigger,menu);
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
      body:JSON.stringify({code,state:returnedState})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.token||!data.user)throw Error(data.error||'Login tidak dapat diselesaikan.');
    saveSession(data.token,data.user);
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
  if(!token){render();return null;}
  try{
    const response=await authFetch('/v1/auth/session');
    if(!response.ok)throw Error('Sesi berakhir');
    const data=await response.json();
    if(!data.authenticated||!data.user)throw Error('Sesi berakhir');
    currentUser=data.user;
    localStorage.setItem(USER_KEY,JSON.stringify(currentUser));
    render();
    return currentUser;
  }catch{
    saveSession('',null);render();return null;
  }
}
async function logout(){
  closeMenu();
  const oldToken=token;
  saveSession('',null);render();
  try{
    if(oldToken)await fetch(endpoint+'/v1/auth/logout',{method:'POST',headers:{Authorization:`Bearer ${oldToken}`}});
  }catch{}
  status('Anda sudah keluar.','success');
}
async function checkAuthReady(){
  try{
    const response=await fetch(endpoint+'/v1/health',{headers:{Accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    authReady=Boolean(response.ok&&data.authConfigured===true);
  }catch{authReady=false;}
  authChecked=true;render();
}
async function init(){
  if(!ACCOUNT_CONFIG.enabled||!endpoint)return;
  ensureMount();loadStored();render();
  const handled=await exchangeCallback();
  await checkAuthReady();
  if(!handled&&token)await refreshSession();
  document.addEventListener('click',event=>{if(!event.target.closest('.account-widget'))closeMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
}

init();
