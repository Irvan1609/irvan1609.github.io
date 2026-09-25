const FILES_KEY='statistical_web_csv_files_v1';
const ACTIVE_KEY='statistical_web_active_csv_v1';
const META_KEY='statistical_web_dataset_meta_v1';
const CATEGORY_KEY='statistical_web_category_metadata_v1';
const TREATMENT_KEY='statistical_web_treatment_metadata_v1';
const SYNC_PREFIX='statistical_web_cloud_sync_v1:';
const OWNER_KEY='statistical_web_cloud_owner_v1';
const CONFLICT_PREFIX='statistical_web_cloud_conflicts_v1:';
const endpoint='https://hitung-cabai-api.andyirvan1609.workers.dev';
const encoder=new TextEncoder();

let syncing=false;
let retryTimer=null;
let periodicTimer=null;
let currentUser=null;
let syncAllowed=true;
const FALLBACK_SYNC_MS=10*60*1000;

const safeObject=(key)=>{
  try{
    const value=JSON.parse(localStorage.getItem(key)||'{}');
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }catch{return {};}
};
const displayName=name=>String(name||'dataset').replace(/\.(?:csv|txt)$/i,'');
const normalizeFileName=name=>{
  const base=String(name||'dataset').trim().replace(/\.(?:csv|txt)$/i,'')||'dataset';
  return base+'.csv';
};
const clone=value=>JSON.parse(JSON.stringify(value??{}));

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object'){
    const out={};
    for(const key of Object.keys(value).sort())out[key]=stable(value[key]);
    return out;
  }
  return value;
}
async function hashItem(item){
  const text=JSON.stringify(stable({name:item.name,content:item.content||'',meta:item.meta||{}}));
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(text));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function readStores(){
  return {
    files:safeObject(FILES_KEY),
    meta:safeObject(META_KEY),
    categories:safeObject(CATEGORY_KEY),
    treatments:safeObject(TREATMENT_KEY)
  };
}
function bundleFor(stores,fileName){
  const key=displayName(fileName),prefix=key+'::',treatment={};
  for(const [entry,value] of Object.entries(stores.treatments))if(entry.startsWith(prefix))treatment[entry.slice(prefix.length)]=clone(value);
  return {
    dataset:clone(stores.meta[fileName]||{plant:'',treatment:''}),
    category:clone(stores.categories[key]||{}),
    treatment
  };
}
function removeLocal(stores,fileName){
  const key=displayName(fileName),prefix=key+'::';
  delete stores.files[fileName];
  delete stores.meta[fileName];
  delete stores.categories[key];
  for(const entry of Object.keys(stores.treatments))if(entry.startsWith(prefix))delete stores.treatments[entry];
}
function putLocal(stores,fileName,content,metaBundle){
  const name=normalizeFileName(fileName),key=displayName(name),prefix=key+'::',bundle=metaBundle&&typeof metaBundle==='object'?metaBundle:{};
  stores.files[name]=String(content??'');
  stores.meta[name]=clone(bundle.dataset||{plant:'',treatment:''});
  if(bundle.category&&Object.keys(bundle.category).length)stores.categories[key]=clone(bundle.category);
  else delete stores.categories[key];
  for(const entry of Object.keys(stores.treatments))if(entry.startsWith(prefix))delete stores.treatments[entry];
  for(const [suffix,value] of Object.entries(bundle.treatment||{}))stores.treatments[prefix+suffix]=clone(value);
  return name;
}
function renameLocal(stores,from,to){
  if(from===to||!Object.prototype.hasOwnProperty.call(stores.files,from))return to;
  const content=stores.files[from],bundle=bundleFor(stores,from);
  removeLocal(stores,from);
  return putLocal(stores,to,content,bundle);
}
function disposableWorkspace(stores=readStores()){
  const names=Object.keys(stores.files);
  if(names.length>1)return false;
  if(!names.length)return true;
  return isDisposableDefault(localItem(stores,names[0]));
}
function writeStores(stores){
  localStorage.setItem(FILES_KEY,JSON.stringify(stores.files));
  localStorage.setItem(META_KEY,JSON.stringify(stores.meta));
  localStorage.setItem(CATEGORY_KEY,JSON.stringify(stores.categories));
  localStorage.setItem(TREATMENT_KEY,JSON.stringify(stores.treatments));
  const active=localStorage.getItem(ACTIVE_KEY);
  if(!active||!Object.prototype.hasOwnProperty.call(stores.files,active)){
    const next=Object.keys(stores.files)[0]||'dataset.csv';
    if(!Object.prototype.hasOwnProperty.call(stores.files,next))stores.files[next]='';
    localStorage.setItem(FILES_KEY,JSON.stringify(stores.files));
    localStorage.setItem(ACTIVE_KEY,next);
  }
}
function loadSyncState(userId){
  try{
    const raw=JSON.parse(localStorage.getItem(SYNC_PREFIX+userId)||'{}');
    return {items:raw?.items&&typeof raw.items==='object'?raw.items:{},lastSyncAt:raw?.lastSyncAt||null};
  }catch{return {items:{},lastSyncAt:null};}
}
function saveSyncState(userId,state){
  localStorage.setItem(SYNC_PREFIX+userId,JSON.stringify(state));
}
function conflictStore(userId){
  try{
    const value=JSON.parse(localStorage.getItem(CONFLICT_PREFIX+userId)||'[]');
    return Array.isArray(value)?value:[];
  }catch{return [];}
}
function archiveConflict(item,{reason='konflik sinkronisasi',source='lokal'}={}){
  if(!currentUser||!item)return;
  try{
    const list=conflictStore(currentUser.id);
    list.unshift({
      id:crypto.randomUUID(),
      date:new Date().toISOString(),
      reason,
      source,
      name:item.name,
      content:String(item.content??''),
      meta:clone(item.meta||{})
    });
    localStorage.setItem(CONFLICT_PREFIX+currentUser.id,JSON.stringify(list.slice(0,20)));
  }catch{}
}
function legacyLocalConflictBase(name){
  const match=String(name||'').match(/^(.*) - Lokal \d{12}(?: \(\d+\))?\.csv$/i);
  return match?normalizeFileName(match[1]):'';
}
function cleanupLegacyLocalLabels(stores,sync,counters){
  for(const name of Object.keys(stores.files)){
    const base=legacyLocalConflictBase(name);
    if(!base)continue;
    if(Object.prototype.hasOwnProperty.call(stores.files,base)){
      archiveConflict(localItem(stores,name),{reason:'duplikat lama berlabel Lokal',source:'lokal'});
      removeLocal(stores,name);
      counters.conflicts++;counters.localChanged=true;
      continue;
    }
    renameLocal(stores,name,base);
    for(const item of Object.values(sync.items)){
      if(!item.deleted&&item.name===name)item.name=base;
    }
    counters.localChanged=true;
  }
}
function token(){
  return window.IrvanAccount?.getToken?.()||'';
}
async function api(path,options={}){
  const session=token();
  if(!session)throw Error('Sesi akun tidak tersedia.');
  const headers=new Headers(options.headers||{});
  headers.set('Authorization',`Bearer ${session}`);
  if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const response=await fetch(endpoint+path,{...options,headers});
  const data=await response.json().catch(()=>({}));
  if(response.status===401){
    window.IrvanAccount?.refresh?.();
    throw Error('Sesi akun berakhir. Silakan masuk kembali.');
  }
  if(response.status===403&&data?.error==='membership_required'){
    await window.IrvanAccount?.refresh?.();
    throw Error('Sinkronisasi cloud memerlukan membership aktif.');
  }
  return {response,data};
}
async function cloudRows(){
  const {response,data}=await api('/v1/datasets?include_deleted=1');
  if(!response.ok)throw Error(data.error||'Dataset cloud tidak dapat dibaca.');
  return Array.isArray(data.items)?data.items:[];
}
async function getCloud(id){
  const {response,data}=await api('/v1/datasets/'+encodeURIComponent(id));
  if(!response.ok)throw Error(data.error||'Dataset cloud tidak dapat dibaca.');
  return data.item;
}
async function putCloud(id,item,expectedRevision=null){
  const {response,data}=await api('/v1/datasets/'+encodeURIComponent(id),{
    method:'PUT',
    body:JSON.stringify({name:item.name,content:item.content,meta:item.meta,expectedRevision})
  });
  if(!response.ok){
    const error=Error(data.error||'Dataset tidak dapat disinkronkan.');
    error.status=response.status;error.payload=data;throw error;
  }
  return data.item;
}
async function deleteCloud(id,expectedRevision){
  const {response,data}=await api('/v1/datasets/'+encodeURIComponent(id),{
    method:'DELETE',
    body:JSON.stringify({expectedRevision})
  });
  if(!response.ok){
    const error=Error(data.error||'Dataset cloud tidak dapat dihapus.');
    error.status=response.status;error.payload=data;throw error;
  }
  return data.item;
}
function localItem(stores,name){
  return {name,content:String(stores.files[name]??''),meta:bundleFor(stores,name)};
}
function isDisposableDefault(item){
  if(normalizeFileName(item?.name)!=='dataset.csv')return false;
  const meta=item?.meta||{},dataset=meta.dataset||{};
  return !String(item?.content||'').trim()&&!String(dataset.plant||'').trim()&&!String(dataset.treatment||'').trim()&&
    !Object.keys(meta.category||{}).length&&!Object.keys(meta.treatment||{}).length;
}
function syncBar(){
  let bar=document.getElementById('datasetSyncBar');
  if(bar)return bar;
  const panel=document.getElementById('projectPanel'),title=panel?.querySelector('.panel-title');
  if(!panel||!title)return null;
  bar=document.createElement('div');bar.id='datasetSyncBar';bar.className='dataset-sync-bar';
  bar.innerHTML='<span class="dataset-sync-dot" aria-hidden="true"></span><span id="datasetSyncState">Belum dicadangkan ke cloud</span><button id="syncDatasets" type="button">Sinkronkan</button>';
  title.insertAdjacentElement('afterend',bar);
  bar.querySelector('#syncDatasets').onclick=()=>syncNow({manual:true});
  return bar;
}
function setSyncStatus(text,state='idle'){
  const bar=syncBar(),label=bar?.querySelector('#datasetSyncState'),button=bar?.querySelector('#syncDatasets');
  if(bar)bar.dataset.state=state;
  if(label)label.textContent=text;
  if(button){
    button.disabled=state==='syncing'||!currentUser||!syncAllowed;
    button.textContent=state==='syncing'?'Menyinkronkan…':'Sinkronkan';
  }
}
function scheduleSync(delay=3500){
  clearTimeout(retryTimer);
  if(!currentUser||!syncAllowed)return;
  retryTimer=setTimeout(()=>syncNow(),delay);
}
async function remoteFingerprint(row){
  return hashItem({name:normalizeFileName(row.name),content:String(row.content??''),meta:row.meta||{}});
}
function mappedNameSet(sync){
  return new Set(Object.values(sync.items).filter(item=>!item.deleted&&item.name).map(item=>item.name));
}
async function resolveTracked({id,track,remote,stores,sync,counters}){
  const localExists=Object.prototype.hasOwnProperty.call(stores.files,track.name);
  const local=localExists?localItem(stores,track.name):null;
  const localHash=local?await hashItem(local):null;

  if(!remote){
    delete sync.items[id];
    return;
  }
  const remoteChanged=Number(remote.revision)!==Number(track.revision);
  const localChanged=localExists?localHash!==track.hash:true;

  if(remote.deletedAt){
    if(!localExists){
      sync.items[id]={name:track.name,revision:remote.revision,hash:track.hash,deleted:true};
      return;
    }
    if(!localChanged){
      removeLocal(stores,track.name);counters.downloaded++;counters.localChanged=true;
      sync.items[id]={name:track.name,revision:remote.revision,hash:track.hash,deleted:true};
    }else{
      delete sync.items[id];
      counters.conflicts++;
    }
    return;
  }

  if(!localExists){
    if(remoteChanged){
      const full=await getCloud(id);
      let target=normalizeFileName(full.name);
      if(Object.prototype.hasOwnProperty.call(stores.files,target)){
        archiveConflict(localItem(stores,target),{reason:'nama dataset bentrok saat menerima pembaruan cloud',source:'lokal'});
        removeLocal(stores,target);
        counters.conflicts++;counters.localChanged=true;
      }
      putLocal(stores,target,full.content,full.meta);
      sync.items[id]={name:target,revision:full.revision,hash:await hashItem(localItem(stores,target)),deleted:false};
      counters.downloaded++;counters.localChanged=true;
    }else{
      try{
        const deleted=await deleteCloud(id,track.revision);
        sync.items[id]={name:track.name,revision:deleted.revision,hash:track.hash,deleted:true};
        counters.deleted++;
      }catch(error){
        if(error.status===409){delete sync.items[id];counters.conflicts++;}
        else throw error;
      }
    }
    return;
  }

  if(!localChanged&&remoteChanged){
    const full=await getCloud(id);
    let target=normalizeFileName(full.name);
    if(target!==track.name&&Object.prototype.hasOwnProperty.call(stores.files,target)){
      archiveConflict(localItem(stores,target),{reason:'nama dataset bentrok saat menerima versi cloud',source:'lokal'});
      removeLocal(stores,target);
      counters.conflicts++;
    }
    if(target!==track.name)removeLocal(stores,track.name);
    putLocal(stores,target,full.content,full.meta);
    sync.items[id]={name:target,revision:full.revision,hash:await hashItem(localItem(stores,target)),deleted:false};
    counters.downloaded++;counters.localChanged=true;
    return;
  }

  if(localChanged&&!remoteChanged){
    try{
      const saved=await putCloud(id,local,track.revision);
      sync.items[id]={name:local.name,revision:saved.revision,hash:await hashItem(local),deleted:false};
      counters.uploaded++;
    }catch(error){
      if(error.status===409){delete sync.items[id];counters.conflicts++;}
      else throw error;
    }
    return;
  }

  if(localChanged&&remoteChanged){
    const full=await getCloud(id);
    archiveConflict(local,{reason:'perubahan lokal dan cloud terjadi bersamaan',source:'lokal'});
    removeLocal(stores,track.name);
    let remoteName=normalizeFileName(full.name);
    if(Object.prototype.hasOwnProperty.call(stores.files,remoteName)){
      archiveConflict(localItem(stores,remoteName),{reason:'nama dataset bentrok saat menerima konflik cloud',source:'lokal'});
      removeLocal(stores,remoteName);
    }
    putLocal(stores,remoteName,full.content,full.meta);
    sync.items[id]={name:remoteName,revision:full.revision,hash:await hashItem(localItem(stores,remoteName)),deleted:false};
    counters.conflicts++;counters.downloaded++;counters.localChanged=true;
    return;
  }

  sync.items[id]={name:track.name,revision:remote.revision,hash:localHash,deleted:false};
}
async function syncNow({manual=false}={}){
  if(syncing||!currentUser||!syncAllowed||!window.IrvanAccount?.authenticated)return;
  if(document.hidden&&!manual)return;
  syncing=true;setSyncStatus('Menyinkronkan…','syncing');
  try{
    const rows=await cloudRows(),remoteById=new Map(rows.map(row=>[row.id,row]));
    const stores=readStores(),sync=loadSyncState(currentUser.id);
    const counters={uploaded:0,downloaded:0,deleted:0,conflicts:0,localChanged:false};
    cleanupLegacyLocalLabels(stores,sync,counters);

    for(const [id,track] of Object.entries({...sync.items})){
      await resolveTracked({id,track,remote:remoteById.get(id),stores,sync,counters});
    }

    for(const remote of rows){
      if(remote.deletedAt||sync.items[remote.id])continue;
      const full=await getCloud(remote.id);
      let target=normalizeFileName(full.name);
      const remoteHash=await remoteFingerprint(full);
      if(Object.prototype.hasOwnProperty.call(stores.files,target)){
        const existingLocal=localItem(stores,target),localHash=await hashItem(existingLocal);
        if(localHash===remoteHash){
          sync.items[remote.id]={name:target,revision:remote.revision,hash:remoteHash,deleted:false};
          continue;
        }
        if(isDisposableDefault(existingLocal)){
          removeLocal(stores,target);
          counters.localChanged=true;
        }else{
          archiveConflict(existingLocal,{reason:'dataset lokal berbeda dari versi cloud pertama',source:'lokal'});
          removeLocal(stores,target);
          counters.conflicts++;counters.localChanged=true;
        }
      }
      putLocal(stores,target,full.content,full.meta);
      sync.items[remote.id]={name:target,revision:full.revision,hash:remoteHash,deleted:false};
      counters.downloaded++;counters.localChanged=true;
    }

    let mapped=mappedNameSet(sync);
    for(const name of Object.keys(stores.files)){
      if(mapped.has(name))continue;
      const item=localItem(stores,name);
      const id=crypto.randomUUID();
      try{
        const saved=await putCloud(id,item,null);
        sync.items[id]={name:saved.name,revision:saved.revision,hash:await hashItem(item),deleted:false};
        counters.uploaded++;mapped.add(name);
      }catch(error){
        if(error.status===409&&error.payload?.error==='name_conflict'){
          archiveConflict(item,{reason:'nama dataset sudah ada di cloud',source:'lokal'});
          counters.conflicts++;
        }else throw error;
      }
    }

    sync.lastSyncAt=new Date().toISOString();
    saveSyncState(currentUser.id,sync);
    if(counters.localChanged){
      writeStores(stores);
      document.dispatchEvent(new CustomEvent('stat-cloud-sync-applied',{detail:{...counters}}));
    }
    const parts=[];
    if(counters.uploaded)parts.push(`${counters.uploaded} diunggah`);
    if(counters.downloaded)parts.push(`${counters.downloaded} diterima`);
    if(counters.deleted)parts.push(`${counters.deleted} dihapus`);
    if(counters.conflicts)parts.push(`${counters.conflicts} konflik diamankan`);
    const syncTime=new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    setSyncStatus(parts.length?`Tersinkron ${syncTime} · ${parts.join(' · ')}`:`Tersinkron ${syncTime}`,'synced');
  }catch(error){
    console.error('Dataset sync failed',error);
    setSyncStatus(error.message||'Sinkronisasi gagal','error');
    if(!manual)scheduleSync(8000);
  }finally{
    syncing=false;
  }
}
function onAccount(event){
  currentUser=event.detail?.authenticated?event.detail.user:null;
  clearInterval(periodicTimer);periodicTimer=null;
  syncAllowed=true;
  const bar=syncBar();
  if(!currentUser){
    if(bar)bar.hidden=false;
    setSyncStatus('Belum dicadangkan ke cloud','idle');
    return;
  }
  if(!currentUser.features?.datasetSync){
    syncAllowed=false;
    if(bar)bar.hidden=false;
    setSyncStatus('Cadangan cloud: tidak tersedia untuk akun ini','idle');
    return;
  }
  if(bar)bar.hidden=false;
  const owner=localStorage.getItem(OWNER_KEY)||'';
  if(!owner||owner===currentUser.id||disposableWorkspace()){
    localStorage.setItem(OWNER_KEY,currentUser.id);
  }else{
    syncAllowed=false;
    setSyncStatus('Sinkronisasi dijeda: browser ini terkait akun lain','error');
    return;
  }
  const previous=loadSyncState(currentUser.id);
  setSyncStatus(previous.lastSyncAt?`Terakhir tersinkron ${new Date(previous.lastSyncAt).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}`:'Belum dicadangkan ke cloud','pending');
  scheduleSync(300);
  periodicTimer=setInterval(()=>{if(!document.hidden)syncNow();},FALLBACK_SYNC_MS);
}
export function installAccountDatasetSync(){
  const bar=syncBar();if(bar){bar.hidden=false;setSyncStatus('Belum dicadangkan ke cloud','idle');}
  document.addEventListener('accountchange',onAccount);
  document.addEventListener('stat-dataset-changed',event=>{
    const detail=event.detail||{};
    if(currentUser&&detail.type==='rename'&&detail.previous&&detail.name){
      const sync=loadSyncState(currentUser.id);
      for(const item of Object.values(sync.items)){
        if(!item.deleted&&item.name===detail.previous)item.name=detail.name;
      }
      saveSyncState(currentUser.id,sync);
    }
    if(currentUser&&syncAllowed)setSyncStatus('Perubahan belum dicadangkan','pending');
    scheduleSync();
  });
  window.addEventListener('storage',event=>{
    if([FILES_KEY,META_KEY,CATEGORY_KEY,TREATMENT_KEY].includes(event.key))scheduleSync(2200);
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentUser&&syncAllowed)scheduleSync(900);});
  window.addEventListener('online',()=>scheduleSync(900));
  if(window.IrvanAccount?.authenticated)onAccount({detail:{authenticated:true,user:window.IrvanAccount.user}});
}
