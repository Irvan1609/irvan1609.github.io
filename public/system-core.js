const SYSTEM_VERSION='2026.09.27.1';
const ENDPOINT='https://hitung-cabai-api.andyirvan1609.workers.dev';
const SAFE_KEY='agrotik_safe_mode_v1';
const RECENT_KEY='agrotik_recent_activity_v1';
const QUEUE_KEY='agrotik_queue_state_v1';
const ERROR_KEY='agrotik_error_reports_v1';
const STORAGE_KEY='agrotik_storage_state_v1';
const DRAFT_PREFIX='agrotik_crash_draft_v1:';
const HEARTBEAT_PREFIX='agrotik_page_heartbeat_v1:';
const MAX_RECENT=8;
const MAX_ERRORS=8;
const route=location.pathname;
let safeMode=false;try{safeMode=localStorage.getItem(SAFE_KEY)==='1';}catch{}
let palette=null,diagnostic=null,storageState=null,heartbeatTimer=null;

function safeJson(value,fallback){try{return JSON.parse(value);}catch{return fallback;}}
function read(key,fallback){try{return safeJson(localStorage.getItem(key),fallback);}catch{return fallback;}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function now(){return new Date().toISOString();}
function trimText(value,max=1800){return String(value??'').replace(/https?:\/\/\S+/g,url=>url.split('?')[0]).slice(0,max);}
function pathLabel(path=route){
  if(path.startsWith('/stat'))return 'Statistical Web';
  if(path.startsWith('/pengukur'))return 'Pengukur';
  if(path.startsWith('/hitung-cabai'))return 'Hitung Cabai';
  if(path.startsWith('/game'))return 'Field Zero';
  if(path.startsWith('/mendeley'))return 'Mendeley';
  if(path.startsWith('/print-skripsi'))return 'Print Skripsi';
  if(path.startsWith('/develop'))return 'Develop';
  if(path.startsWith('/account'))return 'Akun';
  return 'Beranda';
}
function activity(label=pathLabel(),href=route,kind='module'){
  if(!label||href==='/')return;
  const list=read(RECENT_KEY,[]).filter(item=>item&&item.href!==href&&item.label!==label);
  list.unshift({label:String(label).slice(0,90),href:String(href||'/').slice(0,240),kind:String(kind||'module').slice(0,30),at:now()});
  write(RECENT_KEY,list.slice(0,MAX_RECENT));renderRecent();
}
function recent(){return read(RECENT_KEY,[]).filter(Boolean).slice(0,MAX_RECENT);}

function reportQueue(source,{pending=0,failed=0,label=''}={}){
  const state=read(QUEUE_KEY,{});
  state[source]={pending:Math.max(0,Number(pending)||0),failed:Math.max(0,Number(failed)||0),label:String(label||source).slice(0,50),updatedAt:now()};
  write(QUEUE_KEY,state);
  document.dispatchEvent(new CustomEvent('agrotik-queue-state',{detail:queueSnapshot()}));
}
function queueSnapshot(){
  const items=read(QUEUE_KEY,{});
  const entries=Object.entries(items).map(([source,value])=>({source,...value}));
  return {entries,pending:entries.reduce((n,x)=>n+(Number(x.pending)||0),0),failed:entries.reduce((n,x)=>n+(Number(x.failed)||0),0)};
}
function retryQueues(){document.dispatchEvent(new Event('agrotik-retry-queues'));window.dispatchEvent(new Event('online'));}
function clearQueueFailures(){
  const state=read(QUEUE_KEY,{});
  for(const key of Object.keys(state))state[key]={...state[key],failed:0,updatedAt:now()};
  write(QUEUE_KEY,state);document.dispatchEvent(new CustomEvent('agrotik-queue-state',{detail:queueSnapshot()}));
}

function recordError(error,source='runtime'){
  const message=trimText(error?.message||error||'Unknown error',500);
  if(!message)return;
  const item={at:now(),source,route,message,stack:trimText(error?.stack||'',1800),version:SYSTEM_VERSION,userAgent:navigator.userAgent.slice(0,240)};
  const list=read(ERROR_KEY,[]);list.unshift(item);write(ERROR_KEY,list.slice(0,MAX_ERRORS));
}
window.addEventListener('error',event=>recordError(event.error||event.message,'window.error'));
window.addEventListener('unhandledrejection',event=>recordError(event.reason,'unhandledrejection'));

async function updateStorage(){
  if(!navigator.storage?.estimate)return null;
  try{
    const result=await navigator.storage.estimate(),usage=Number(result.usage)||0,quota=Number(result.quota)||0,ratio=quota?usage/quota:0;
    storageState={usage,quota,ratio,level:ratio>=.95?'critical':ratio>=.85?'high':ratio>=.70?'watch':'normal',at:now()};
    write(STORAGE_KEY,storageState);
    document.documentElement.dataset.storagePressure=storageState.level;
    return storageState;
  }catch{return null;}
}
function formatBytes(value){
  let n=Number(value)||0;const units=['B','KB','MB','GB'];let i=0;
  while(n>=1024&&i<units.length-1){n/=1024;i++;}
  return (i?n.toFixed(n>=100?0:n>=10?1:2):String(Math.round(n)))+' '+units[i];
}

function fieldKey(el){
  if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement))return '';
  if(el.type==='password'||el.type==='email'||el.type==='file'||el.type==='hidden'||el.type==='search'||el.type==='checkbox'||el.type==='radio'||el.dataset.noCrashDraft!==undefined)return '';
  const id=el.id||el.name;if(!id||/token|secret|password|csrf|auth/i.test(id))return '';
  return id.slice(0,100);
}
function draftKey(){return DRAFT_PREFIX+route;}
function heartbeatKey(){return HEARTBEAT_PREFIX+route;}
function saveDraft(){
  const fields={};
  document.querySelectorAll('input,textarea,select').forEach(el=>{
    const key=fieldKey(el);if(!key)return;
    const value=String(el.value??'');if(value&&value.length<=5000)fields[key]=value;
  });
  const payload={at:now(),fields};
  if(JSON.stringify(payload).length<30000)write(draftKey(),payload);
}
function restoreDraftIfCrash(){
  const beat=read(heartbeatKey(),null),draft=read(draftKey(),null);
  const unclean=beat&&Date.now()-Date.parse(beat.at||0)<6*3600000;
  if(!unclean||!draft||Date.now()-Date.parse(draft.at||0)>24*3600000)return;
  let restored=0;
  for(const [key,value] of Object.entries(draft.fields||{})){
    const el=[...document.querySelectorAll('input,textarea,select')].find(node=>fieldKey(node)===key);
    if(el&&!String(el.value||'').trim()){el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));restored++;}
  }
  if(restored)activity('Draft dipulihkan · '+pathLabel(),route,'recovery');
}
function installCrashRecovery(){
  const previous=read(heartbeatKey(),null);
  restoreDraftIfCrash();
  const pulse=()=>write(heartbeatKey(),{at:now(),version:SYSTEM_VERSION});
  pulse();heartbeatTimer=setInterval(pulse,15000);
  let timer=null;
  document.addEventListener('input',event=>{if(!fieldKey(event.target))return;clearTimeout(timer);timer=setTimeout(saveDraft,1200);},{passive:true});
  document.addEventListener('change',event=>{if(fieldKey(event.target))saveDraft();},{passive:true});
  window.addEventListener('pagehide',()=>{clearInterval(heartbeatTimer);try{localStorage.removeItem(heartbeatKey());}catch{}});
  if(previous&&Date.now()-Date.parse(previous.at||0)>24*3600000){try{localStorage.removeItem(heartbeatKey());}catch{}}
}

function renderRecent(){
  if(route!=='/'||!document.body)return;
  const items=recent().filter(item=>item.href&&item.href!=='/').slice(0,4);
  let section=document.getElementById('agrotikRecent');
  if(!items.length){section?.remove();return;}
  if(!section){
    section=document.createElement('section');section.id='agrotikRecent';section.className='agrotik-recent';
    const hero=document.querySelector('.hero');(hero?.parentNode||document.querySelector('main')||document.body).insertBefore(section,hero?.nextSibling||null);
  }
  section.innerHTML='<div class="agrotik-recent-inner"><div class="agrotik-recent-title"><b>Terakhir dibuka</b><small>Lokal di perangkat ini</small></div><div class="agrotik-recent-list">'+items.map(item=>'<a href="'+esc(item.href)+'"><span>'+esc(item.kind==='dataset'?'▦':'↗')+'</span><b>'+esc(item.label)+'</b></a>').join('')+'</div></div>';
}

function statusRow(label,state,detail=''){
  const icon=state==='ok'?'✓':state==='warn'?'!':state==='bad'?'×':'·';
  return '<div class="ag-system-row '+state+'"><i>'+icon+'</i><span><b>'+esc(label)+'</b><small>'+esc(detail)+'</small></span></div>';
}
async function idbCheck(){
  if(!('indexedDB'in window))return {state:'bad',detail:'Tidak tersedia'};
  return new Promise(resolve=>{
    const req=indexedDB.open('agrotik-diagnostic-v1',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('test');
    req.onsuccess=()=>{req.result.close();indexedDB.deleteDatabase('agrotik-diagnostic-v1');resolve({state:'ok',detail:'Siap'});};
    req.onerror=()=>resolve({state:'bad',detail:'Gagal dibuka'});
  });
}
async function workerHealth(){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),4500);
  try{
    const response=await fetch(ENDPOINT+'/v1/health',{cache:'no-store',signal:ctrl.signal}),data=await response.json().catch(()=>({}));
    return {state:response.ok?'ok':'warn',data,detail:response.ok?'API '+(data.apiVersion||'aktif'):'HTTP '+response.status};
  }catch{return {state:navigator.onLine?'warn':'bad',data:{},detail:navigator.onLine?'Tidak terjangkau':'Offline'};}
  finally{clearTimeout(timer);}
}
async function serviceWorkerStatus(){
  if(!('serviceWorker'in navigator))return {state:'warn',detail:'Tidak didukung'};
  try{
    const reg=await navigator.serviceWorker.getRegistration('/');
    return {state:reg?.active?'ok':'warn',detail:reg?.active?'Aktif':'Belum aktif'};
  }catch{return {state:'warn',detail:'Tidak dapat diperiksa'};}
}
async function moduleAvailability(){
  const routes=['/stat/','/pengukur/','/hitung-cabai/','/game/'];
  if(navigator.onLine===false)return {state:'warn',detail:'Offline · cache dipakai saat tersedia'};
  const results=await Promise.all(routes.map(async path=>{try{const r=await fetch(path,{cache:'no-store'});return r.ok;}catch{return false;}}));
  const ok=results.filter(Boolean).length;return {state:ok===routes.length?'ok':ok?'warn':'bad',detail:ok+'/'+routes.length+' modul dapat dibuka'};
}
async function runDiagnostics(){
  const [storage,idb,worker,sw,modules]=await Promise.all([updateStorage(),idbCheck(),workerHealth(),serviceWorkerStatus(),moduleAvailability()]),queue=queueSnapshot();
  let local='ok';try{const k='__agrotik_diag__';localStorage.setItem(k,'1');localStorage.removeItem(k);}catch{local='bad';}
  let persisted=false;try{persisted=Boolean(await navigator.storage?.persisted?.());}catch{}
  const h=worker.data||{};
  return {
    generatedAt:now(),version:SYSTEM_VERSION,safeMode,route,
    checks:[
      {label:'Data lokal',state:local,detail:local==='ok'?'localStorage siap':'Tidak dapat menulis'},
      {label:'IndexedDB',...idb},
      {label:'Penyimpanan',state:storage?.level==='critical'?'bad':storage?.level==='high'?'warn':'ok',detail:storage?(formatBytes(storage.usage)+' / '+formatBytes(storage.quota)+(persisted?' · persisten':'')):'Tidak dapat diukur'},
      {label:'Service Worker',...sw},
      {label:'Modul utama',...modules},
      {label:'Kamera',state:navigator.mediaDevices?.getUserMedia?'ok':'warn',detail:navigator.mediaDevices?.getUserMedia?'Didukung perangkat':'Tidak tersedia'},
      {label:'Worker API',state:worker.state,detail:worker.detail},
      {label:'D1',state:h.storage?.d1?'ok':'warn',detail:h.storage?.d1?'Terhubung':'Tidak terdeteksi'},
      {label:'R2 foto',state:h.storage?.imagesR2?'ok':'warn',detail:h.storage?.imagesR2?'Aktif':'Fallback D1'},
      {label:'R2 backup',state:h.storage?.backupsR2?'ok':'warn',detail:h.storage?.backupsR2?'Aktif':'Belum aktif'},
      {label:'Login',state:window.IrvanAccount?.authenticated?'ok':'warn',detail:window.IrvanAccount?.authenticated?'Masuk':'Mode lokal'},
      {label:'Antrean sinkron',state:queue.failed?'warn':'ok',detail:queue.pending+' menunggu · '+queue.failed+' gagal'}
    ],
    queue,storage,health:h,errors:read(ERROR_KEY,[])
  };
}
function reportText(data){
  const lines=['Agrotik diagnostic '+data.generatedAt,'Versi '+data.version,'Rute '+data.route,'Safe mode '+(data.safeMode?'aktif':'nonaktif'),''];
  data.checks.forEach(x=>lines.push((x.state==='ok'?'OK':x.state==='bad'?'FAIL':'WARN')+' · '+x.label+' · '+x.detail));
  const errors=(data.errors||[]).slice(0,3);
  if(errors.length){lines.push('','Error terakhir:');errors.forEach(e=>lines.push(e.at+' · '+e.source+' · '+e.message));}
  return lines.join('\n');
}
function copyText(text){
  if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text);
  const ta=document.createElement('textarea');ta.value=text;document.body.append(ta);ta.select();document.execCommand('copy');ta.remove();return Promise.resolve();
}
async function rollbackStatus(){
  if(!navigator.serviceWorker?.controller)return null;
  return new Promise(resolve=>{
    const ch=new MessageChannel(),timer=setTimeout(()=>resolve(null),1500);
    ch.port1.onmessage=event=>{clearTimeout(timer);resolve(event.data||null);};
    navigator.serviceWorker.controller.postMessage({type:'GET_ROLLBACK_STATUS'},[ch.port2]);
  });
}
async function requestRollback(){
  if(!navigator.serviceWorker?.controller)return false;
  const status=await rollbackStatus();if(!status?.previous)return false;
  navigator.serviceWorker.controller.postMessage({type:'ROLLBACK_PREVIOUS'});setTimeout(()=>location.reload(),250);return true;
}
async function clearRollback(){
  navigator.serviceWorker?.controller?.postMessage({type:'CLEAR_ROLLBACK'});setTimeout(()=>location.reload(),250);
}
async function openDiagnostics(){
  diagnostic??=document.createElement('div');diagnostic.id='agrotikDiagnostic';diagnostic.className='ag-system-backdrop';diagnostic.innerHTML='<div class="ag-system-sheet" role="dialog" aria-modal="true"><header><div><b>Diagnostik Agrotik</b><small>Pemeriksaan lokal · tidak membaca isi dataset</small></div><button data-close aria-label="Tutup">×</button></header><div class="ag-system-body"><div class="ag-system-loading">Memeriksa…</div></div><footer><button data-copy>Salin laporan</button><button data-retry>Coba sinkron lagi</button><button data-safe>Safe mode</button><button data-rollback>Versi sebelumnya</button></footer></div>';
  if(!diagnostic.isConnected)document.body.append(diagnostic);
  diagnostic.hidden=false;
  const body=diagnostic.querySelector('.ag-system-body'),data=await runDiagnostics(),rollback=await rollbackStatus();
  body.innerHTML='<div class="ag-system-summary">'+data.checks.map(x=>statusRow(x.label,x.state,x.detail)).join('')+'</div>';
  diagnostic.querySelector('[data-copy]').onclick=()=>copyText(reportText(data));
  diagnostic.querySelector('[data-retry]').onclick=()=>{retryQueues();diagnostic.hidden=true;};
  diagnostic.querySelector('[data-safe]').textContent=safeMode?'Keluar safe mode':'Safe mode';
  diagnostic.querySelector('[data-safe]').onclick=()=>{localStorage.setItem(SAFE_KEY,safeMode?'0':'1');location.reload();};
  const rb=diagnostic.querySelector('[data-rollback]');rb.disabled=!rollback?.previous;
  rb.textContent=rollback?.enabled?'Kembali ke versi terbaru':'Versi sebelumnya';
  rb.onclick=()=>rollback?.enabled?clearRollback():requestRollback();
  diagnostic.querySelector('[data-close]').onclick=()=>diagnostic.hidden=true;
  diagnostic.onclick=event=>{if(event.target===diagnostic)diagnostic.hidden=true;};
}
function commandList(){
  const list=[
    {label:'Statistical Web',hint:'Analisis data',href:'/stat/'},
    {label:'Pengukur',hint:'Citra & kalibrasi',href:'/pengukur/'},
    {label:'Hitung Cabai',hint:'Deteksi dan data buah',href:'/hitung-cabai/'},
    {label:'Field Zero',hint:'Rancob & pemuliaan',href:'/game/'},
    {label:'Diagnostik',hint:'Periksa perangkat & cloud',run:openDiagnostics},
    {label:'Sinkronkan sekarang',hint:'Coba antrean cloud',run:()=>retryQueues()},
    {label:safeMode?'Keluar safe mode':'Safe mode',hint:'Mode ringan tanpa cloud opsional',run:()=>{localStorage.setItem(SAFE_KEY,safeMode?'0':'1');location.reload();}}
  ];
  if(window.IrvanAccount?.user?.features?.develop)list.push({label:'Develop',hint:'Admin & status server',href:'/develop/'});
  for(const item of recent().slice(0,4))list.push({label:item.label,hint:'Terakhir dibuka',href:item.href});
  return list;
}
function openPalette(){
  palette??=document.createElement('div');palette.id='agrotikPalette';palette.className='ag-system-backdrop';palette.innerHTML='<div class="ag-command" role="dialog" aria-modal="true"><input type="search" placeholder="Cari alat atau perintah…" aria-label="Cari perintah"><div class="ag-command-list"></div></div>';
  if(!palette.isConnected)document.body.append(palette);
  palette.hidden=false;const input=palette.querySelector('input'),list=palette.querySelector('.ag-command-list');
  const render=()=>{const q=input.value.toLowerCase().trim(),items=commandList().filter(x=>(x.label+' '+x.hint).toLowerCase().includes(q)).slice(0,10);list.innerHTML=items.map((x,i)=>'<button type="button" data-i="'+i+'"><b>'+esc(x.label)+'</b><small>'+esc(x.hint)+'</small></button>').join('');list.querySelectorAll('button').forEach((button,i)=>button.onclick=()=>{const item=items[i];palette.hidden=true;if(item.href)location.assign(item.href);else item.run?.();});};
  input.oninput=render;render();setTimeout(()=>input.focus(),0);
  palette.onclick=event=>{if(event.target===palette)palette.hidden=true;};
}
function renderSystemStyle(){
  if(document.querySelector('link[data-agrotik-system]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/system-core.css?v=20260927-1';link.dataset.agrotikSystem='1';document.head.append(link);
}
function install(){
  renderSystemStyle();
  document.documentElement.toggleAttribute('data-agrotik-safe',safeMode);
  activity(pathLabel(),route,'module');
  renderRecent();installCrashRecovery();void updateStorage();
  document.addEventListener('stat-dataset-changed',event=>{const name=event.detail?.name||event.detail?.fileName||localStorage.getItem('statistical_web_active_csv_v1')||'';if(name)activity(String(name).replace(/\.csv$/i,''),'/stat/','dataset');});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openPalette();}if(event.key==='Escape'){if(palette)palette.hidden=true;if(diagnostic)diagnostic.hidden=true;}});
  document.dispatchEvent(new Event('agrotik-system-ready'));
  if(route.startsWith('/diagnostic')||new URLSearchParams(location.search).get('diagnostic')==='1')setTimeout(openDiagnostics,80);
}
window.AgrotikSystem={version:SYSTEM_VERSION,safeMode,activity,reportQueue,queueSnapshot,retryQueues,clearQueueFailures,openDiagnostics,openPalette,runDiagnostics,requestRollback,clearRollback,updateStorage};
install();
