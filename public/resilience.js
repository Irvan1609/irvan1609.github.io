const RECENT_KEY='agrotik_recent_activity_v1';
const ERROR_KEY='agrotik_client_errors_v1';
const SAFE_KEY='agrotik_safe_mode_v1';
const STORAGE_WARN_KEY='agrotik_storage_warned_v1';
const QUEUE_KEY='agrotik_sync_queue_v1';
const endpoint='https://hitung-cabai-api.andyirvan1609.workers.dev';

const safeJson=(value,fallback)=>{try{return JSON.parse(value);}catch{return fallback;}};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeMode=()=>localStorage.getItem(SAFE_KEY)==='1';
const now=()=>new Date().toISOString();

function injectStyles(){
  if(document.getElementById('agrotikResilienceStyle'))return;
  const style=document.createElement('style');style.id='agrotikResilienceStyle';
  style.textContent=`
  .agx-backdrop{position:fixed;inset:0;z-index:700;background:#0b1724aa;display:grid;place-items:start center;padding:8vh 12px}.agx-panel{width:min(620px,100%);max-height:80vh;overflow:auto;background:#fff;color:#17324d;border-radius:14px;border:1px solid #d4dee6;box-shadow:0 18px 48px #0003}.agx-search{position:sticky;top:0;background:#fff;padding:10px;border-bottom:1px solid #e3e9ee}.agx-search input{width:100%;min-height:42px;border:1px solid #c8d4dd;border-radius:9px;padding:9px 11px;font:inherit}.agx-list{padding:6px}.agx-item{width:100%;min-height:44px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;text-align:left;border:0;background:transparent;border-radius:9px;padding:8px 10px;color:inherit}.agx-item:hover,.agx-item:focus-visible{background:#eef4f1;outline:none}.agx-item span{font-size:12px;color:#6a7985}.agx-toast{position:fixed;left:50%;bottom:max(12px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:720;width:min(520px,calc(100% - 20px));background:#172a3b;color:#fff;border-radius:10px;padding:9px 11px;display:flex;align-items:center;gap:8px;box-shadow:0 8px 24px #0003;font:12px/1.35 system-ui}.agx-toast button{margin-left:auto;border:0;background:#ffffff18;color:#fff;border-radius:7px;padding:7px 9px;min-height:34px}.agx-recent{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.agx-recent a{display:inline-flex;align-items:center;min-height:34px;padding:6px 9px;border:1px solid #d7e2dc;border-radius:999px;background:#fff;font-size:12px;font-weight:700}.agx-safe *{animation:none!important;transition:none!important;scroll-behavior:auto!important}.agx-safe .agrotik-install{display:none!important}@media(max-width:680px){.agx-backdrop{padding:7px;place-items:end center}.agx-panel{max-height:78dvh;border-radius:14px 14px 8px 8px}.agx-item{min-height:48px;padding:10px 11px}.agx-search input{min-height:46px}.agx-toast{bottom:max(8px,env(safe-area-inset-bottom))}}`;
  document.head.append(style);
}
function writeErrors(items){try{localStorage.setItem(ERROR_KEY,JSON.stringify(items.slice(0,20)));}catch{}}
function recordError(error,source='runtime'){
  const items=safeJson(localStorage.getItem(ERROR_KEY)||'[]',[]);
  const message=String(error?.message||error||'Unknown error').replace(/[\r\n]+/g,' ').slice(0,300);
  const entry={at:now(),source,path:location.pathname,message,ua:navigator.userAgent.slice(0,180)};
  if(items[0]?.message===entry.message&&items[0]?.path===entry.path)return;
  writeErrors([entry,...items]);
  showToast('Ada masalah · data lokal tetap aman','Salin laporan',copyErrorReport);
}
async function storageInfo(){
  try{
    const result=await navigator.storage?.estimate?.(),persisted=await navigator.storage?.persisted?.();
    const usage=Number(result?.usage||0),quota=Number(result?.quota||0);
    return {supported:Boolean(navigator.storage?.estimate),usage,quota,ratio:quota?usage/quota:0,persisted:Boolean(persisted)};
  }catch{return {supported:false,usage:0,quota:0,ratio:0,persisted:false};}
}
async function checkStorageGuard({notify=true}={}){
  const info=await storageInfo();if(!notify||info.ratio<.85)return info;
  const day=new Date().toISOString().slice(0,10),last=localStorage.getItem(STORAGE_WARN_KEY)||'';
  if(last===day)return info;localStorage.setItem(STORAGE_WARN_KEY,day);
  const pct=Math.round(info.ratio*100);
  showToast(pct>=95?`Penyimpanan perangkat hampir penuh (${pct}%). Data tidak akan dihapus otomatis.`:`Penyimpanan perangkat sudah ${pct}% terpakai.`,'Periksa',()=>location.assign('/diagnostic/'));
  return info;
}
function showToast(message,actionLabel='',action=null){
  injectStyles();document.querySelector('.agx-toast')?.remove();
  const box=document.createElement('div');box.className='agx-toast';box.setAttribute('role','status');
  box.innerHTML='<span>'+esc(message)+'</span>';
  if(actionLabel&&action){const b=document.createElement('button');b.type='button';b.textContent=actionLabel;b.onclick=()=>{box.remove();action();};box.append(b);}
  document.body.append(box);setTimeout(()=>box.remove(),actionLabel?10000:4500);
}
function readRecent(){return safeJson(localStorage.getItem(RECENT_KEY)||'[]',[]);}
function rememberRecent(item){
  if(!item?.href)return;
  const next=[{...item,at:Date.now()},...readRecent().filter(x=>x.href!==item.href||x.label!==item.label)].slice(0,12);
  try{localStorage.setItem(RECENT_KEY,JSON.stringify(next));}catch{}
}
function routeLabel(path){
  const routes={'/stat/':'Statistical Web','/hitung-cabai/':'Hitung Cabai','/pengukur/':'Pengukur','/game/':'Field Zero','/mendeley/':'Mendeley','/print-skripsi/':'Print Skripsi','/diagnostic/':'Diagnostic'};
  return routes[path]||'';
}
function trackActivity(){
  const label=routeLabel(location.pathname);if(label)rememberRecent({label,href:location.pathname,type:'tool'});
  document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(!a)return;try{const url=new URL(a.href,location.href),name=routeLabel(url.pathname);if(url.origin===location.origin&&name)rememberRecent({label:name,href:url.pathname,type:'tool'});}catch{};});
  document.addEventListener('stat-dataset-changed',event=>{const name=String(event.detail?.name||'').replace(/\.csv$/i,'');if(name)rememberRecent({label:name,href:'/stat/',type:'dataset'});});
  document.addEventListener('fieldzero-save-change',()=>rememberRecent({label:'Field Zero · progres terakhir',href:'/game/',type:'game'}));
}
function paletteItems(){
  const base=[
    ['Statistical Web','/stat/'],['Hitung Cabai','/hitung-cabai/'],['Pengukur','/pengukur/'],['Field Zero','/game/'],['Mendeley','/mendeley/'],['Print Skripsi','/print-skripsi/'],['Diagnostic','/diagnostic/']
  ].map(([label,href])=>({label,href,type:'alat'}));
  const recent=readRecent().slice(0,6).map(x=>({...x,type:x.type==='dataset'?'dataset terakhir':'terakhir'}));
  return [...recent,...base,{label:safeMode()?'Keluar dari Safe Mode':'Aktifkan Safe Mode',action:toggleSafeMode,type:'sistem'}];
}
function openPalette(){
  injectStyles();document.querySelector('.agx-backdrop')?.remove();
  const wrap=document.createElement('div');wrap.className='agx-backdrop';
  const panel=document.createElement('div');panel.className='agx-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Cari alat dan perintah');
  panel.innerHTML='<div class="agx-search"><input type="search" autocomplete="off" placeholder="Cari alat, dataset, atau perintah…"></div><div class="agx-list"></div>';
  const input=panel.querySelector('input'),list=panel.querySelector('.agx-list');
  const render=()=>{
    const q=input.value.trim().toLowerCase(),items=paletteItems().filter(x=>!q||x.label.toLowerCase().includes(q)||String(x.type||'').includes(q)).slice(0,14);
    list.innerHTML=items.map((x,i)=>`<button class="agx-item" type="button" data-i="${i}"><b>${esc(x.label)}</b><span>${esc(x.type||'')}</span></button>`).join('')||'<div class="agx-item"><span>Tidak ada hasil.</span></div>';
    list.querySelectorAll('[data-i]').forEach((b,i)=>b.onclick=()=>{const item=items[i];wrap.remove();if(item.action)item.action();else location.assign(item.href);});
  };
  input.oninput=render;wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};wrap.addEventListener('keydown',e=>{if(e.key==='Escape')wrap.remove();});
  panel.append();wrap.append(panel);document.body.append(wrap);render();setTimeout(()=>input.focus(),0);
}
function toggleSafeMode(){
  const enable=!safeMode();localStorage.setItem(SAFE_KEY,enable?'1':'0');location.reload();
}
async function rollbackStatus(){
  try{
    const names=await caches.keys(),previous=names.filter(name=>name.startsWith('agrotik-core-')).sort();
    const cache=await caches.open('agrotik-control'),response=await cache.match('/__agrotik_rollback__'),data=response?await response.json():null;
    return {available:previous.length>1,enabled:Boolean(data?.enabled),versions:previous};
  }catch{return {available:false,enabled:false,versions:[]};}
}
async function setRollback(enabled){
  if(!navigator.serviceWorker?.controller){showToast('Service Worker belum aktif untuk rollback.');return false;}
  navigator.serviceWorker.controller.postMessage({type:'ROLLBACK_PREVIOUS',enabled:Boolean(enabled)});
  await new Promise(resolve=>setTimeout(resolve,120));
  location.reload();return true;
}
async function copyErrorReport(){
  const info=await storageInfo(),errors=safeJson(localStorage.getItem(ERROR_KEY)||'[]',[]);
  const report={generatedAt:now(),path:location.pathname,browser:navigator.userAgent,online:navigator.onLine,safeMode:safeMode(),storage:{usage:info.usage,quota:info.quota,ratio:Number(info.ratio.toFixed(4)),persisted:info.persisted},queue:safeJson(localStorage.getItem(QUEUE_KEY)||'null',null),errors:errors.slice(0,8)};
  try{await navigator.clipboard.writeText(JSON.stringify(report,null,2));showToast('Laporan diagnostik disalin.');return report;}catch{return report;}
}
async function runDiagnostics({includeNetwork=true}={}){
  const checks=[];
  const storage=await storageInfo();checks.push({id:'storage',label:'Penyimpanan perangkat',ok:storage.supported,detail:storage.quota?`${Math.round(storage.ratio*100)}% terpakai · ${storage.persisted?'persisten':'best effort'}`:'Tidak dapat dibaca'});
  let localOk=true;try{localStorage.setItem('__agrotik_test','1');localStorage.removeItem('__agrotik_test');}catch{localOk=false;}checks.push({id:'localStorage',label:'Local storage',ok:localOk,detail:localOk?'Siap':'Tidak dapat ditulis'});
  let idbOk=typeof indexedDB!=='undefined';if(idbOk)try{await new Promise((resolve,reject)=>{const req=indexedDB.open('agrotik-diagnostic-probe',1);req.onupgradeneeded=()=>{};req.onsuccess=()=>{req.result.close();indexedDB.deleteDatabase('agrotik-diagnostic-probe');resolve();};req.onerror=()=>reject(req.error);});}catch{idbOk=false;}checks.push({id:'indexedDB',label:'IndexedDB',ok:idbOk,detail:idbOk?'Siap':'Tidak tersedia'});
  const sw={supported:'serviceWorker'in navigator,controlled:Boolean(navigator.serviceWorker?.controller)};checks.push({id:'serviceWorker',label:'Service Worker',ok:sw.supported,detail:sw.controlled?'Aktif':sw.supported?'Didukung · belum mengontrol halaman':'Tidak didukung'});
  checks.push({id:'camera',label:'Kamera',ok:Boolean(navigator.mediaDevices?.getUserMedia),detail:navigator.mediaDevices?.getUserMedia?'API tersedia':'Tidak tersedia'});
  checks.push({id:'network',label:'Jaringan',ok:navigator.onLine,detail:navigator.onLine?'Online':'Offline'});
  let health=null,cloud=null;
  if(includeNetwork&&navigator.onLine){
    try{const r=await fetch(endpoint+'/v1/health',{cache:'no-store'});health=await r.json();checks.push({id:'worker',label:'Worker API',ok:r.ok&&health?.ok===true,detail:health?.apiVersion||String(r.status)});}catch{checks.push({id:'worker',label:'Worker API',ok:false,detail:'Tidak dapat dihubungi'});}
    try{const r=await fetch(endpoint+'/v1/cloud/status',{cache:'no-store'});cloud=await r.json();checks.push({id:'cloud',label:'Cloud mode',ok:r.ok,detail:cloud?.effectiveMode||String(r.status)});}catch{checks.push({id:'cloud',label:'Cloud mode',ok:false,detail:'Tidak dapat dibaca'});}
  }
  return {generatedAt:now(),checks,storage,health,cloud,queue:safeJson(localStorage.getItem(QUEUE_KEY)||'null',null),recent:readRecent().slice(0,8),errors:safeJson(localStorage.getItem(ERROR_KEY)||'[]',[]).slice(0,8),safeMode:safeMode(),rollback:await rollbackStatus()};
}
function injectRecentHome(){
  if(location.pathname!=='/'||document.getElementById('agrotikRecent'))return;
  const recent=readRecent().filter(x=>x.href!=='/').slice(0,3);if(!recent.length)return;
  const target=document.querySelector('.hero-note');if(!target)return;
  const box=document.createElement('div');box.id='agrotikRecent';box.className='agx-recent';box.setAttribute('aria-label','Lanjutkan pekerjaan terakhir');
  box.innerHTML=recent.map(x=>`<a href="${esc(x.href)}">${esc(x.label)}</a>`).join('');target.after(box);
}
function setup(){
  injectStyles();
  if(safeMode())document.documentElement.classList.add('agx-safe');
  trackActivity();injectRecentHome();
  window.addEventListener('error',e=>recordError(e.error||e.message,'error'));
  window.addEventListener('unhandledrejection',e=>recordError(e.reason,'promise'));
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();}});
  if('requestIdleCallback'in window)requestIdleCallback(()=>checkStorageGuard(),{timeout:2500});else setTimeout(()=>checkStorageGuard(),1200);
}
window.AgrotikResilience={openPalette,runDiagnostics,storageInfo,copyErrorReport,toggleSafeMode,rollbackStatus,setRollback,get safeMode(){return safeMode();},readRecent};
setup();
