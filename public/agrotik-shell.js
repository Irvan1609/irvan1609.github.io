const VERSION=2;
const SCHEMA_KEY='agrotik_local_schema_version_v1';
const SAFE_KEY='agrotik_safe_mode_v1';
const RECENT_KEY='agrotik_recent_activity_v1';
const ERRORS_KEY='agrotik_session_errors_v1';
const QUEUE_KEY='agrotik_pending_queue_v1';
const STORAGE_WARN_KEY='agrotik_storage_warning_v1';
const SESSION_KEY='agrotik_session_recovery_v1';
const MAX_RECENT=10;
const MAX_ERRORS=10;
const TOOL_ROUTES=[
  {path:'/',label:'Dashboard',keywords:'beranda home alat'},
  {path:'/stat/',label:'Statistical Web',keywords:'statistik anova rancangan dataset analisis denah'},
  {path:'/hitung-cabai/',label:'Hitung Cabai',keywords:'cabai foto ai deteksi'},
  {path:'/pengukur/',label:'Pengukur',keywords:'kamera ukur kalibrator'},
  {path:'/game/',label:'Field Zero',keywords:'game pemuliaan rancob genetika'},
  {path:'/mendeley/',label:'Referensi Mendeley',keywords:'doi referensi sitasi'},
  {path:'/print-skripsi/',label:'Print Skripsi',keywords:'pdf cetak skripsi'},
  {path:'/account/',label:'Akun',keywords:'profil akun sesi'},
  {path:'/develop/',label:'Develop',keywords:'admin diagnostic server queue'}
];

const safeJson=(value,fallback=null)=>{try{return JSON.parse(value);}catch{return fallback;}};
const now=()=>Date.now();
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function pathLabel(path=location.pathname){
  const route=TOOL_ROUTES.find(item=>path===item.path||path.startsWith(item.path)&&item.path!=='/');
  return route?.label||'Agrotik';
}
function ensureStyle(){
  if(document.querySelector('link[data-agrotik-shell]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/agrotik-shell.css?v=20260927-1';link.dataset.agrotikShell='1';document.head.append(link);
}
function migrateLocalSchema(){
  let version=Number(localStorage.getItem(SCHEMA_KEY)||0);
  try{
    if(version<1){
      const recent=safeJson(localStorage.getItem(RECENT_KEY),[]);
      if(!Array.isArray(recent))localStorage.setItem(RECENT_KEY,'[]');
      version=1;localStorage.setItem(SCHEMA_KEY,'1');
    }
    if(version<2){
      const queue=safeJson(localStorage.getItem(QUEUE_KEY),{});
      if(!queue||typeof queue!=='object'||Array.isArray(queue))localStorage.setItem(QUEUE_KEY,'{}');
      version=2;localStorage.setItem(SCHEMA_KEY,'2');
    }
  }catch{}
  return version;
}
function safeMode(){
  return localStorage.getItem(SAFE_KEY)==='1'||new URL(location.href).searchParams.get('safe')==='1';
}
function applySafeMode(){
  const active=safeMode();
  document.documentElement.classList.toggle('agrotik-safe-mode',active);
  window.AgrotikSafeMode=active;
  if(active)document.documentElement.dataset.agrotikSafe='1';else delete document.documentElement.dataset.agrotikSafe;
  return active;
}
function setSafeMode(enabled,{reload=true}={}){
  try{enabled?localStorage.setItem(SAFE_KEY,'1'):localStorage.removeItem(SAFE_KEY);}catch{}
  applySafeMode();
  if(reload)location.reload();
}
function readRecent(){
  const value=safeJson(localStorage.getItem(RECENT_KEY),[]);
  return Array.isArray(value)?value.slice(0,MAX_RECENT):[];
}
function addRecent({type='page',label='',path=location.pathname,detail=''}={}){
  try{
    const item={id:type+'|'+path+'|'+String(label||''),type,label:String(label||pathLabel(path)).slice(0,80),path:String(path||'/'),detail:String(detail||'').slice(0,100),at:now()};
    const rest=readRecent().filter(entry=>entry?.id!==item.id);
    localStorage.setItem(RECENT_KEY,JSON.stringify([item,...rest].slice(0,MAX_RECENT)));
  }catch{}
}
function activeStatDataset(){
  try{
    const active=localStorage.getItem('statistical_web_active_csv_v1')||'';
    return active?active.replace(/\.(csv|txt)$/i,''):'';
  }catch{return '';}
}
function queueState(){
  const q=safeJson(localStorage.getItem(QUEUE_KEY),{});
  return q&&typeof q==='object'&&!Array.isArray(q)?q:{};
}
function setQueueState(channel,data={}){
  try{
    const q=queueState();
    if(data===null)delete q[channel];
    else q[channel]={...(q[channel]||{}),...data,updatedAt:now()};
    localStorage.setItem(QUEUE_KEY,JSON.stringify(q));
    document.dispatchEvent(new CustomEvent('agrotik-queue-change',{detail:q}));
  }catch{}
}
function queueSummary(){
  const q=queueState();
  return Object.entries(q).map(([key,value])=>({key,...value})).filter(item=>Number(item.count||0)>0||item.state==='error'||item.state==='pending');
}
function readErrors(){
  try{const value=safeJson(sessionStorage.getItem(ERRORS_KEY),[]);return Array.isArray(value)?value:[];}catch{return [];}
}
function sanitizeError(value){
  return String(value||'Error').replace(/https?:\/\/[^\s)]+/g,'[url]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email]').slice(0,500);
}
function recordError(error,source='runtime'){
  try{
    const entry={at:new Date().toISOString(),source,path:location.pathname,message:sanitizeError(error?.message||error),stack:sanitizeError(String(error?.stack||'').split('\n').slice(0,3).join(' | '))};
    sessionStorage.setItem(ERRORS_KEY,JSON.stringify([entry,...readErrors()].slice(0,MAX_ERRORS)));
  }catch{}
}
async function copyErrorReport(){
  const report={
    generatedAt:new Date().toISOString(),
    app:'Agrotik',
    path:location.pathname,
    online:navigator.onLine,
    safeMode:safeMode(),
    localSchema:Number(localStorage.getItem(SCHEMA_KEY)||0),
    userAgent:navigator.userAgent,
    screen:screen?{width:screen.width,height:screen.height,dpr:devicePixelRatio||1}:null,
    errors:readErrors().map(({at,source,path,message,stack})=>({at,source,path,message,stack}))
  };
  const text=JSON.stringify(report,null,2);
  await navigator.clipboard?.writeText?.(text);
  return text;
}
function passiveNotice(message){
  const existing=document.querySelector('.agrotik-shell-notice');if(existing)existing.remove();
  const el=document.createElement('div');el.className='agrotik-shell-notice';el.textContent=message;document.body.append(el);
  setTimeout(()=>el.remove(),6500);
}
async function storageInfo(){
  try{
    if(!navigator.storage?.estimate)return {supported:false};
    const estimate=await navigator.storage.estimate();
    const usage=Number(estimate.usage||0),quota=Number(estimate.quota||0),ratio=quota?usage/quota:0;
    let persisted=null;try{persisted=await navigator.storage.persisted?.();}catch{}
    if(ratio>=.95){
      const last=Number(localStorage.getItem(STORAGE_WARN_KEY)||0);
      if(now()-last>86400000){
        localStorage.setItem(STORAGE_WARN_KEY,String(now()));
        passiveNotice('Penyimpanan perangkat hampir penuh. Data tidak dihapus otomatis; ekspor data penting bila perlu.');
      }
    }
    return {supported:true,usage,quota,ratio,persisted};
  }catch(error){return {supported:true,error:sanitizeError(error?.message||error)};}
}
async function indexedDbCheck(){
  if(!('indexedDB' in window))return {ok:false,note:'Tidak didukung'};
  return await new Promise(resolve=>{
    const name='agrotik-diagnostic-'+now(),req=indexedDB.open(name,1);
    const done=(ok,note='')=>{try{indexedDB.deleteDatabase(name);}catch{}resolve({ok,note});};
    req.onupgradeneeded=()=>req.result.createObjectStore('probe');
    req.onsuccess=()=>{try{req.result.close();done(true);}catch{done(true);}};
    req.onerror=()=>done(false,req.error?.message||'Gagal membuka IndexedDB');
    setTimeout(()=>done(false,'Timeout'),1800);
  });
}
function localStorageCheck(){
  try{const key='agrotik_probe_'+now();localStorage.setItem(key,'1');localStorage.removeItem(key);return {ok:true};}
  catch(error){return {ok:false,note:sanitizeError(error?.message||error)};}
}
async function serviceWorkerCheck(){
  if(!('serviceWorker' in navigator))return {ok:false,note:'Tidak didukung'};
  try{
    const regs=await navigator.serviceWorker.getRegistrations();
    return {ok:regs.length>0,registered:regs.length,controlled:Boolean(navigator.serviceWorker.controller)};
  }catch(error){return {ok:false,note:sanitizeError(error?.message||error)};}
}
async function workerCheck(){
  try{
    const endpoint=window.IrvanAccount?.endpoint||'https://hitung-cabai-api.andyirvan1609.workers.dev';
    const response=await fetch(endpoint+'/v1/cloud/status',{headers:{Accept:'application/json'},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    return {ok:response.ok,mode:data.effectiveMode||'unknown',storage:data.storage||{},features:data.features||{}};
  }catch(error){return {ok:false,note:sanitizeError(error?.message||error)};}
}
async function runDiagnostics(){
  const [idb,sw,storage,worker]=await Promise.all([indexedDbCheck(),serviceWorkerCheck(),storageInfo(),workerCheck()]);
  const camera=Boolean(navigator.mediaDevices?.getUserMedia);
  return {
    generatedAt:new Date().toISOString(),
    path:location.pathname,
    module:pathLabel(),
    online:navigator.onLine,
    safeMode:safeMode(),
    schema:{local:Number(localStorage.getItem(SCHEMA_KEY)||0),target:VERSION},
    localStorage:localStorageCheck(),
    indexedDB:idb,
    serviceWorker:sw,
    storage,
    camera:{available:camera,permissionRequested:false},
    worker,
    queues:queueSummary(),
    recent:readRecent().slice(0,5),
    errors:readErrors().length
  };
}
function diagnosticRows(data){
  const pct=data.storage?.ratio?Math.round(data.storage.ratio*100):0;
  const rows=[
    ['Lokal',data.localStorage.ok&&data.indexedDB.ok?'✓ Normal':'⚠ Periksa'],
    ['IndexedDB',data.indexedDB.ok?'✓':'✕'],
    ['Service Worker',data.serviceWorker.ok?'✓':'—'],
    ['Cloud Worker',data.worker.ok?'✓':'—'],
    ['Mode',data.worker.mode||'—'],
    ['Penyimpanan',data.storage?.supported?(pct+'% terpakai'):'—'],
    ['Kamera',data.camera.available?'tersedia':'—'],
    ['Antrean',String(data.queues.length)],
    ['Safe mode',data.safeMode?'aktif':'nonaktif'],
    ['Schema lokal',String(data.schema.local)+' / '+String(data.schema.target)]
  ];
  return rows.map(([a,b])=>'<div class="ag-shell-kv"><span>'+esc(a)+'</span><b>'+esc(b)+'</b></div>').join('');
}
function toolCommands(){
  const recent=readRecent();
  const fixed=TOOL_ROUTES.map(item=>({label:item.label,detail:item.path,keywords:item.keywords,run:()=>location.assign(item.path)}));
  const extra=[
    {label:'Jalankan diagnostic',detail:'Periksa perangkat dan cloud',keywords:'diagnostic cek kesehatan',run:()=>openDiagnostics()},
    {label:safeMode()?'Matikan Safe Mode':'Aktifkan Safe Mode',detail:'Mode lokal ringan',keywords:'safe ringan offline',run:()=>setSafeMode(!safeMode())},
    {label:'Salin laporan error',detail:'Tanpa data penelitian',keywords:'error bug laporan',run:async()=>{await copyErrorReport();passiveNotice('Laporan teknis disalin.');}}
  ];
  const recentCommands=recent.map(item=>({label:item.label,detail:'Terakhir · '+new Date(item.at).toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short'}),keywords:'recent terakhir '+item.type,run:()=>location.assign(item.path)}));
  return [...recentCommands,...extra,...fixed];
}
let palette=null;
function closePalette(){if(palette){palette.remove();palette=null;}}
function renderCommands(query=''){
  if(!palette)return;
  const list=palette.querySelector('[data-ag-shell-results]'),q=String(query||'').trim().toLocaleLowerCase('id-ID');
  const commands=toolCommands().filter(item=>!q||(item.label+' '+item.detail+' '+item.keywords).toLocaleLowerCase('id-ID').includes(q)).slice(0,14);
  list.innerHTML=commands.length?commands.map((item,i)=>'<button type="button" data-command="'+i+'"><span>'+esc(item.label)+'</span><small>'+esc(item.detail||'')+'</small></button>').join(''):'<div class="ag-shell-empty">Tidak ada perintah.</div>';
  list.querySelectorAll('[data-command]').forEach(button=>button.onclick=()=>{const cmd=commands[Number(button.dataset.command)];closePalette();cmd?.run?.();});
}
function openPalette(){
  closePalette();
  palette=document.createElement('div');palette.className='ag-shell-layer';palette.innerHTML='<div class="ag-shell-palette" role="dialog" aria-modal="true" aria-label="Cari dan perintah"><div class="ag-shell-search"><input type="search" inputmode="search" autocomplete="off" placeholder="Cari alat atau perintah…"><button type="button" aria-label="Tutup">×</button></div><div class="ag-shell-results" data-ag-shell-results></div><div class="ag-shell-hint">Ctrl+K · Esc</div></div>';
  document.body.append(palette);
  const input=palette.querySelector('input');palette.querySelector('.ag-shell-search button').onclick=closePalette;
  palette.onclick=event=>{if(event.target===palette)closePalette();};
  input.oninput=()=>renderCommands(input.value);renderCommands();setTimeout(()=>input.focus(),0);
}
async function openDiagnostics(){
  closePalette();
  const layer=document.createElement('div');layer.className='ag-shell-layer';
  layer.innerHTML='<div class="ag-shell-diagnostic" role="dialog" aria-modal="true"><div class="ag-shell-title"><div><b>Diagnostic Agrotik</b><small>Read-only · tidak meminta izin kamera</small></div><button type="button" aria-label="Tutup">×</button></div><div class="ag-shell-loading">Memeriksa…</div></div>';
  document.body.append(layer);layer.onclick=event=>{if(event.target===layer)layer.remove();};layer.querySelector('button').onclick=()=>layer.remove();
  const data=await runDiagnostics(),body=layer.querySelector('.ag-shell-loading');
  body.className='ag-shell-diagnostic-body';body.innerHTML=diagnosticRows(data)+'<div class="ag-shell-actions"><button type="button" data-copy>Salin diagnostic</button><button type="button" data-errors>Salin laporan error</button></div>';
  body.querySelector('[data-copy]').onclick=async()=>{await navigator.clipboard?.writeText?.(JSON.stringify(data,null,2));passiveNotice('Diagnostic disalin.');};
  body.querySelector('[data-errors]').onclick=async()=>{await copyErrorReport();passiveNotice('Laporan error disalin.');};
}
function markSessionStart(){
  try{
    const previous=safeJson(sessionStorage.getItem(SESSION_KEY),null);
    if(previous&&!previous.clean&&previous.path===location.pathname&&now()-Number(previous.at||0)<6*60*60*1000){
      document.documentElement.dataset.agrotikRecovered='1';
    }
    sessionStorage.setItem(SESSION_KEY,JSON.stringify({path:location.pathname,at:now(),clean:false}));
    const clean=()=>{try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({path:location.pathname,at:now(),clean:true}));}catch{}};
    addEventListener('pagehide',clean,{once:true});
  }catch{}
}
function bindActivity(){
  addRecent({type:'page',label:pathLabel(),path:location.pathname});
  const dataset=activeStatDataset();if(dataset)addRecent({type:'dataset',label:dataset,path:'/stat/',detail:'Dataset'});
  document.addEventListener('stat-dataset-changed',event=>addRecent({type:'dataset',label:String(event.detail?.name||activeStatDataset()||'Dataset').replace(/\.(csv|txt)$/i,''),path:'/stat/',detail:'Dataset'}));
  document.addEventListener('fieldzero-save-change',()=>addRecent({type:'game',label:'Field Zero',path:'/game/',detail:'Progres game'}));
  document.addEventListener('agrotik-measurement-saved',event=>addRecent({type:'measurement',label:event.detail?.label||event.detail?.sample||'Pengukuran',path:'/pengukur/',detail:'Pengukur'}));
  document.addEventListener('agrotik-chili-saved',event=>addRecent({type:'chili',label:event.detail?.sample||'Hitung Cabai',path:'/hitung-cabai/',detail:'Hitung Cabai'}));
}
function bindGlobalErrors(){
  addEventListener('error',event=>recordError(event.error||event.message,'window.error'));
  addEventListener('unhandledrejection',event=>recordError(event.reason,'unhandledrejection'));
}
function bindShortcuts(){
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLocaleLowerCase()==='k'){event.preventDefault();openPalette();return;}
    if(event.key==='Escape'&&palette)closePalette();
  });
}
export function initAgrotikShell(){
  ensureStyle();migrateLocalSchema();applySafeMode();markSessionStart();bindActivity();bindGlobalErrors();bindShortcuts();
  const idle=window.requestIdleCallback||((fn)=>setTimeout(fn,1200));idle(()=>storageInfo());
  window.AgrotikShell={openPalette,openDiagnostics,runDiagnostics,queueState,setQueueState,queueSummary,readRecent,addRecent,safeMode,setSafeMode,copyErrorReport,storageInfo,localSchemaVersion:()=>Number(localStorage.getItem(SCHEMA_KEY)||0)};
  document.dispatchEvent(new CustomEvent('agrotik-shell-ready'));
  return window.AgrotikShell;
}
initAgrotikShell();
