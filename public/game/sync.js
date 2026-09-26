const META_PREFIX='agrotik_fz_cloud_sync_v1:';
const SYNC_DELAY=20000,MAX_DIRTY_WAIT=60000;
let user=null,busy=false,timer=0,dirtySince=0,pendingConflict=null,ready=false;

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const rupiah=value=>'Rp'+Math.max(0,Math.round(Number(value)||0)).toLocaleString('id-ID');
function game(){return window.FieldZeroGame||null;}
function metaKey(){return META_PREFIX+(user?.id||'anonymous');}
function readMeta(){
  try{return JSON.parse(localStorage.getItem(metaKey())||'null');}catch{return null;}
}
function writeMeta(value){
  try{localStorage.setItem(metaKey(),JSON.stringify({userId:user?.id||'',...value,syncedAt:Date.now()}));}catch{}
}
function setStatus(status,title){
  const button=$('#cloudSync');if(!button)return;
  button.dataset.syncStatus=status;
  button.title=title;button.setAttribute('aria-label',title);
}
function notice(message){
  const el=$('#toast');if(!el)return;
  el.textContent=message;el.classList.add('show');
  clearTimeout(notice.timer);notice.timer=setTimeout(()=>el.classList.remove('show'),1800);
}
async function api(path,options={}){
  const request=window.IrvanAccount?.request;
  if(!window.IrvanAccount?.authenticated||!request)throw Object.assign(Error('Masuk untuk sinkronisasi.'),{status:401});
  const response=await request(path,{...options,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=Error(data.message||data.error||'Sinkronisasi gagal.');
    error.status=response.status;error.data=data;throw error;
  }
  return data;
}
function summary(save){
  return game()?.getSaveSummary?.(save)||{season:1,day:1,level:1,coins:0,rp:0,xp:0,planted:0,history:0,vault:0,legacy:0};
}
function summaryHtml(label,save,extra=''){
  const p=summary(save);
  return `<article class="sync-save-card"><span>${esc(label)}</span><b>Musim ${p.season} · Hari ${p.day}</b><div><small>Lv ${p.level}</small><small>${rupiah(p.coins)}</small><small>${p.rp} RP</small></div><div><small>${p.planted} tanaman</small><small>${p.vault} benih</small><small>${p.history} musim tersimpan</small></div>${extra?`<em>${esc(extra)}</em>`:''}</article>`;
}
function closeConflict(){
  const modal=$('#syncConflictModal');if(modal)modal.hidden=true;
}
function showConflict(localSave,cloud){
  pendingConflict={localSave,cloud};
  setStatus('conflict','Konflik save · pilih progres');
  const modal=$('#syncConflictModal');if(!modal)return;
  const when=cloud.updatedAt?new Date(cloud.updatedAt).toLocaleString('id-ID'):'';
  $('#syncConflictBody').innerHTML=summaryHtml('Perangkat ini',localSave,'Belum dikirim')+
    summaryHtml('Cloud',cloud.save,(cloud.deviceLabel||'Perangkat lain')+(when?' · '+when:''));
  modal.hidden=false;
}
async function useCloud(){
  const conflict=pendingConflict;if(!conflict)return;
  const g=game(),cloud=conflict.cloud;
  if(!g?.importSave?.(cloud.save))return setStatus('error','Save cloud tidak dapat dimuat');
  const fp=g.fingerprintSave(cloud.save);
  writeMeta({revision:cloud.revision,fingerprint:fp,updatedAt:cloud.updatedAt||null});
  pendingConflict=null;dirtySince=0;closeConflict();setStatus('synced','Progres tersinkron antar perangkat');notice('☁ Progres cloud dimuat');
}
async function keepLocal(){
  const conflict=pendingConflict;if(!conflict)return;
  const revision=Number(conflict.cloud?.revision)||0;
  pendingConflict=null;closeConflict();
  await pushLocal(revision,{manual:true});
}
function adoptCloud(cloud,{announce=true}={}){
  const g=game();if(!g?.importSave?.(cloud.save))return false;
  const fp=g.fingerprintSave(cloud.save);
  writeMeta({revision:cloud.revision,fingerprint:fp,updatedAt:cloud.updatedAt||null});
  dirtySince=0;setStatus('synced','Progres tersinkron antar perangkat');
  if(announce)notice('☁ Progres perangkat lain dimuat');
  return true;
}
async function pushLocal(baseRevision,{manual=false,keepalive=false}={}){
  const g=game();if(!user||!g||busy)return;
  const save=g.exportSave(),fingerprint=g.fingerprintSave(save);
  busy=true;setStatus('syncing','Menyimpan progres ke cloud…');
  try{
    const data=await api('/v1/game/save',{method:'PUT',body:JSON.stringify({save,baseRevision}),keepalive});
    writeMeta({revision:data.revision,fingerprint,updatedAt:data.updatedAt||null});
    dirtySince=0;setStatus('synced','Progres tersinkron antar perangkat');
    if(manual)notice('☁ Progres tersimpan');
  }catch(error){
    if(error.status===409&&error.data?.save){
      const cloud=error.data,cloudFp=g.fingerprintSave(cloud.save);
      if(cloudFp===fingerprint){
        writeMeta({revision:cloud.revision,fingerprint:cloudFp,updatedAt:cloud.updatedAt||null});
        dirtySince=0;setStatus('synced','Progres tersinkron antar perangkat');
      }else showConflict(save,cloud);
    }else{
      setStatus(navigator.onLine?'error':'offline',navigator.onLine?'Sinkronisasi gagal · ketuk untuk coba lagi':'Offline · progres aman di perangkat');
      if(manual)notice(navigator.onLine?'☁ Sinkronisasi gagal':'Offline · progres tetap tersimpan lokal');
    }
  }finally{busy=false;}
}
async function reconcile({manual=false}={}){
  const g=game();if(!user||!g||busy)return;
  busy=true;setStatus('syncing','Memeriksa progres cloud…');
  try{
    const cloud=await api('/v1/game/save');
    const localSave=g.exportSave(),localFp=g.fingerprintSave(localSave),meta=readMeta();
    if(!cloud.save){
      busy=false;return pushLocal(0,{manual});
    }
    const cloudFp=g.fingerprintSave(cloud.save);
    if(localFp===cloudFp){
      writeMeta({revision:cloud.revision,fingerprint:cloudFp,updatedAt:cloud.updatedAt||null});
      dirtySince=0;setStatus('synced','Progres tersinkron antar perangkat');return;
    }
    if(!meta||meta.userId!==user.id){
      if(g.isFreshSave?.(localSave))adoptCloud(cloud,{announce:true});
      else showConflict(localSave,cloud);
      return;
    }
    const knownRevision=Number(meta.revision)||0;
    if(Number(cloud.revision)>knownRevision){
      const localDirty=localFp!==meta.fingerprint;
      if(localDirty)showConflict(localSave,cloud);
      else adoptCloud(cloud,{announce:true});
      return;
    }
    if(Number(cloud.revision)===knownRevision){
      if(localFp!==meta.fingerprint){
        busy=false;return pushLocal(knownRevision,{manual});
      }
      setStatus('synced','Progres tersinkron antar perangkat');dirtySince=0;return;
    }
    showConflict(localSave,cloud);
  }catch(error){
    setStatus(navigator.onLine?'error':'offline',navigator.onLine?'Cloud tidak dapat diperiksa · ketuk untuk coba lagi':'Offline · progres aman di perangkat');
    if(manual)notice(navigator.onLine?'☁ Cloud tidak dapat diperiksa':'Offline · progres tetap lokal');
  }finally{busy=false;}
}
function schedule(){
  if(!user||pendingConflict)return;
  if(!dirtySince)dirtySince=Date.now();
  clearTimeout(timer);
  const elapsed=Date.now()-dirtySince,delay=elapsed>=MAX_DIRTY_WAIT?100:SYNC_DELAY;
  setStatus('pending','Perubahan lokal menunggu sinkronisasi');
  timer=setTimeout(()=>reconcile(),delay);
}
function onAccount(event){
  user=event?.detail?.authenticated?event.detail.user:null;
  clearTimeout(timer);dirtySince=0;pendingConflict=null;closeConflict();
  if(!user){setStatus('local','Progres lokal · masuk untuk sinkron antar perangkat');return;}
  setStatus('syncing','Memeriksa progres cloud…');
  if(ready)reconcile();
}
function bind(){
  ready=Boolean(game());
  $('#cloudSync')?.addEventListener('click',()=>{
    if(!window.IrvanAccount?.authenticated)return window.IrvanAccount?.login?.();
    if(pendingConflict)return showConflict(pendingConflict.localSave,pendingConflict.cloud);
    reconcile({manual:true});
  });
  $('#syncUseCloud')?.addEventListener('click',useCloud);
  $('#syncKeepLocal')?.addEventListener('click',keepLocal);
  $('#syncConflictLater')?.addEventListener('click',closeConflict);
  $('#syncConflictModal')?.addEventListener('click',event=>{if(event.target.id==='syncConflictModal')closeConflict();});
  document.addEventListener('accountchange',onAccount);
  document.addEventListener('fieldzero-ready',()=>{ready=true;if(user)reconcile();});
  document.addEventListener('fieldzero-save-change',schedule);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'&&user&&dirtySince&&!pendingConflict)reconcile();
  });
  window.addEventListener('online',()=>{if(user)reconcile();});
  window.addEventListener('offline',()=>setStatus('offline','Offline · progres aman di perangkat'));
  if(window.IrvanAccount?.authenticated)onAccount({detail:{authenticated:true,user:window.IrvanAccount.user}});
  else setStatus('local','Progres lokal · masuk untuk sinkron antar perangkat');
  if(game()){ready=true;if(user)reconcile();}
}
bind();
