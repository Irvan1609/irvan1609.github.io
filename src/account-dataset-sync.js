import {ACCOUNT_CONFIG} from '/account-config.js';

const FILES_KEY='statistical_web_csv_files_v1';
const ACTIVE_KEY='statistical_web_active_csv_v1';
const META_KEY='statistical_web_dataset_meta_v1';
const CATEGORY_KEY='statistical_web_category_metadata_v1';
const TREATMENT_KEY='statistical_web_treatment_metadata_v1';
const SYNC_PREFIX='statistical_web_cloud_sync_v1:';
const endpoint=String(ACCOUNT_CONFIG.endpoint||'').replace(/\/$/,'');
const encoder=new TextEncoder();

let syncing=false;
let retryTimer=null;
let periodicTimer=null;
let currentUser=null;

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
function uniqueName(stores,name,label='Lokal'){
  const base=displayName(name),stamp=new Date().toISOString().slice(0,16).replace(/[-:T]/g,'');
  let candidate=`${base} - ${label} ${stamp}.csv`,n=2;
  const lower=new Set(Object.keys(stores.files).map(key=>key.toLocaleLowerCase('id-ID')));
  while(lower.has(candidate.toLocaleLowerCase('id-ID')))candidate=`${base} - ${label} ${stamp} (${n++}).csv`;
  return candidate;
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
  return {response,data};
}
async function cloudRows(){
  const {response,data}=await api('/v1/datasets?include_deleted=1');
  if(!response.ok)throw Error(data.error||'Dataset cloud tidak dapat dibaca.');
  return Array.isArray(data.items)?data.items:[];
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
function syncBar(){
  let bar=document.getElementById('datasetSyncBar');
  if(bar)return bar;
  const panel=document.getElementById('projectPanel'),title=panel?.querySelector('.panel-title');
  if(!panel||!title)return null;
  bar=document.createElement('div');bar.id='datasetSyncBar';bar.className='dataset-sync-bar';
  bar.innerHTML='<span class="dataset-sync-dot" aria-hidden="true"></span><span id="datasetSyncState">Masuk untuk sinkronisasi</span><button id="syncDatasets" type="button">Sinkronkan</button>';
  title.insertAdjacentElement('afterend',bar);
  bar.querySelector('#syncDatasets').onclick=()=>syncNow({manual:true});
  return bar;
}
function setSyncStatus(text,state='idle'){
  const bar=syncBar(),label=bar?.querySelector('#datasetSyncState'),button=bar?.querySelector('#syncDatasets');
  if(bar)bar.dataset.state=state;
  if(label)label.textContent=text;
  if(button){
    button.disabled=state==='syncing'||!currentUser;
    button.textContent=state==='syncing'?'Menyinkronkan…':'Sinkronkan';
  }
}
function scheduleSync(delay=1400){
  clearTimeout(retryTimer);
  if(!currentUser)return;
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
  const remoteHash=remote.deletedAt?null:await remoteFingerprint(remote);
  const remoteChanged=Number(remote.revision)!==Number(track.revision)||(remoteHash&&remoteHash!==track.hash);
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
      let target=normalizeFileName(remote.name);
      if(Object.prototype.hasOwnProperty.call(stores.files,target))target=uniqueName(stores,target,'Cloud');
      putLocal(stores,target,remote.content,remote.meta);
      sync.items[id]={name:target,revision:remote.revision,hash:await hashItem(localItem(stores,target)),deleted:false};
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
    let target=normalizeFileName(remote.name);
    if(target!==track.name&&Object.prototype.hasOwnProperty.call(stores.files,target)){
      const preserved=uniqueName(stores,target,'Lokal');
      renameLocal(stores,target,preserved);
      counters.conflicts++;
    }
    if(target!==track.name)removeLocal(stores,track.name);
    putLocal(stores,target,remote.content,remote.meta);
    sync.items[id]={name:target,revision:remote.revision,hash:await hashItem(localItem(stores,target)),deleted:false};
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
    const localConflict=uniqueName(stores,track.name,'Lokal');
    renameLocal(stores,track.name,localConflict);
    let remoteName=normalizeFileName(remote.name);
    if(Object.prototype.hasOwnProperty.call(stores.files,remoteName))remoteName=uniqueName(stores,remoteName,'Cloud');
    putLocal(stores,remoteName,remote.content,remote.meta);
    sync.items[id]={name:remoteName,revision:remote.revision,hash:await hashItem(localItem(stores,remoteName)),deleted:false};
    counters.conflicts++;counters.downloaded++;counters.localChanged=true;
    return;
  }

  sync.items[id]={name:track.name,revision:remote.revision,hash:localHash,deleted:false};
}
async function syncNow({manual=false}={}){
  if(syncing||!currentUser||!window.IrvanAccount?.authenticated)return;
  syncing=true;setSyncStatus('Menyinkronkan…','syncing');
  try{
    const rows=await cloudRows(),remoteById=new Map(rows.map(row=>[row.id,row]));
    const stores=readStores(),sync=loadSyncState(currentUser.id);
    const counters={uploaded:0,downloaded:0,deleted:0,conflicts:0,localChanged:false};

    for(const [id,track] of Object.entries({...sync.items})){
      await resolveTracked({id,track,remote:remoteById.get(id),stores,sync,counters});
    }

    for(const remote of rows){
      if(remote.deletedAt||sync.items[remote.id])continue;
      let target=normalizeFileName(remote.name);
      const remoteHash=await remoteFingerprint(remote);
      if(Object.prototype.hasOwnProperty.call(stores.files,target)){
        const localHash=await hashItem(localItem(stores,target));
        if(localHash===remoteHash){
          sync.items[remote.id]={name:target,revision:remote.revision,hash:remoteHash,deleted:false};
          continue;
        }
        const preserved=uniqueName(stores,target,'Lokal');
        renameLocal(stores,target,preserved);
        counters.conflicts++;counters.localChanged=true;
      }
      putLocal(stores,target,remote.content,remote.meta);
      sync.items[remote.id]={name:target,revision:remote.revision,hash:remoteHash,deleted:false};
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
          const renamed=uniqueName(stores,name,'Lokal');
          renameLocal(stores,name,renamed);
          counters.conflicts++;counters.localChanged=true;
          const renamedItem=localItem(stores,renamed),saved=await putCloud(id,renamedItem,null);
          sync.items[id]={name:saved.name,revision:saved.revision,hash:await hashItem(renamedItem),deleted:false};
          counters.uploaded++;mapped.add(renamed);
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
    setSyncStatus(parts.length?parts.join(' · '):'Tersinkron','synced');
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
  if(!currentUser){
    setSyncStatus('Masuk untuk sinkronisasi','idle');
    return;
  }
  setSyncStatus('Menyiapkan sinkronisasi…','syncing');
  scheduleSync(250);
  periodicTimer=setInterval(()=>syncNow(),60000);
}
export function installAccountDatasetSync(){
  syncBar();
  document.addEventListener('accountchange',onAccount);
  document.addEventListener('stat-dataset-changed',()=>scheduleSync());
  window.addEventListener('storage',event=>{
    if([FILES_KEY,META_KEY,CATEGORY_KEY,TREATMENT_KEY].includes(event.key))scheduleSync(2200);
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentUser)scheduleSync(500);});
  window.addEventListener('online',()=>scheduleSync(500));
  if(window.IrvanAccount?.authenticated)onAccount({detail:{authenticated:true,user:window.IrvanAccount.user}});
}
