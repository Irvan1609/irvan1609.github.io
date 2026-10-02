const DB_NAME='agrotik-stat-local-v1';
const DB_VERSION=4;
const DATASET_STORE='datasets';
const IDENTITY_INDEX='dataset_uid';
const LEGACY_MIGRATION_KEY='core-migration-v1';
const SNAPSHOT_STORE='snapshots';
const META_STORE='meta';
const HISTORY_STORE='history';
const ANALYSIS_STORE='analyses';
const SYNC_STORE='sync_queue';
const TRASH_STORE='trash';
export const LOCAL_POINTER_PREFIX='@agrotik-local:';
export const OFFLOAD_THRESHOLD_BYTES=192*1024;
const encoder=new TextEncoder();

export function datasetBytes(content){return encoder.encode(String(content??'')).byteLength;}
export function shouldOffloadDataset(content,threshold=OFFLOAD_THRESHOLD_BYTES){return datasetBytes(content)>=threshold;}
export function localPointer(name){return LOCAL_POINTER_PREFIX+encodeURIComponent(String(name||'dataset.csv'));}
export function isLocalPointer(value){return String(value||'').startsWith(LOCAL_POINTER_PREFIX);}
export async function requestPersistentStorage(){
  try{return Boolean(await globalThis.navigator?.storage?.persist?.());}catch{return false;}
}
export async function localStoreInfo(){
  let schema=null;
  try{schema=await idbRequest(META_STORE,'readonly',store=>store.get('schema'));}catch{}
  let estimate={usage:0,quota:0};
  try{estimate=await globalThis.navigator?.storage?.estimate?.()||estimate;}catch{}
  return {dbName:DB_NAME,schemaVersion:Number(schema?.version||DB_VERSION),migratedAt:schema?.migratedAt||null,usage:Number(estimate.usage||0),quota:Number(estimate.quota||0),opfs:opfsAvailable()};
}

function openDb(){
  if(typeof indexedDB==='undefined')return Promise.reject(Error('IndexedDB tidak tersedia.'));
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=event=>{
      const db=request.result,tx=request.transaction,oldVersion=Number(event.oldVersion||0);
      if(!db.objectStoreNames.contains(DATASET_STORE))db.createObjectStore(DATASET_STORE,{keyPath:'name'});
      const datasetStore=tx.objectStore(DATASET_STORE);
      if(!datasetStore.indexNames.contains(IDENTITY_INDEX))datasetStore.createIndex(IDENTITY_INDEX,IDENTITY_INDEX,{unique:true});
      if(!db.objectStoreNames.contains(SNAPSHOT_STORE)){
        const store=db.createObjectStore(SNAPSHOT_STORE,{keyPath:'id'});
        store.createIndex('dataset','dataset',{unique:false});
        store.createIndex('date','date',{unique:false});
      }
      if(!db.objectStoreNames.contains(HISTORY_STORE)){
        const store=db.createObjectStore(HISTORY_STORE,{keyPath:'id'});
        store.createIndex('dataset_uid','dataset_uid',{unique:false});
        store.createIndex('date','date',{unique:false});
      }
      if(!db.objectStoreNames.contains(ANALYSIS_STORE)){
        const store=db.createObjectStore(ANALYSIS_STORE,{keyPath:'analysis_uid'});
        store.createIndex('dataset_uid','dataset_uid',{unique:false});
        store.createIndex('date','date',{unique:false});
      }
      if(!db.objectStoreNames.contains(TRASH_STORE)){
        const store=db.createObjectStore(TRASH_STORE,{keyPath:'trash_id'});
        store.createIndex('dataset_uid','dataset_uid',{unique:false});
        store.createIndex('expiresAt','expiresAt',{unique:false});
      }
      if(!db.objectStoreNames.contains(SYNC_STORE)){
        const store=db.createObjectStore(SYNC_STORE,{keyPath:'change_id'});
        store.createIndex('dataset_uid','dataset_uid',{unique:false});
        store.createIndex('createdAt','createdAt',{unique:false});
      }
      if(oldVersion<2&&!db.objectStoreNames.contains(META_STORE)){
        const meta=db.createObjectStore(META_STORE,{keyPath:'key'});
        meta.put({key:'schema',version:2,migratedAt:new Date().toISOString()});
      }else if(db.objectStoreNames.contains(META_STORE)){
        tx.objectStore(META_STORE).put({key:'schema',version:DB_VERSION,migratedAt:new Date().toISOString()});
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('IndexedDB tidak dapat dibuka.'));
  });
}
async function idbRequest(storeName,mode,action){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,mode),store=tx.objectStore(storeName),request=action(store);
    tx.oncomplete=()=>{resolve(request?.result);db.close();};
    tx.onerror=()=>{reject(tx.error||request?.error||Error('Operasi IndexedDB gagal.'));db.close();};
    tx.onabort=()=>{reject(tx.error||Error('Operasi IndexedDB dibatalkan.'));db.close();};
  });
}
function opfsAvailable(){return Boolean(globalThis.navigator?.storage?.getDirectory);}
function opfsFileName(name){return encodeURIComponent(String(name||'dataset.csv'))+'.csvdata';}
async function opfsDirectory(){
  const root=await navigator.storage.getDirectory();
  return root.getDirectoryHandle('agrotik-stat',{create:true});
}
async function writeOpfs(name,content){
  const dir=await opfsDirectory(),handle=await dir.getFileHandle(opfsFileName(name),{create:true}),writer=await handle.createWritable();
  await writer.write(String(content??''));await writer.close();
}
async function readOpfs(name){
  const dir=await opfsDirectory(),handle=await dir.getFileHandle(opfsFileName(name)),file=await handle.getFile();
  return file.text();
}
async function deleteOpfs(name){
  try{const dir=await opfsDirectory();await dir.removeEntry(opfsFileName(name));}catch{}
}

export async function saveLocalDataset(name,content,{dataset_uid=null}={}){
  const cleanName=String(name||'dataset.csv'),text=String(content??''),now=new Date().toISOString();
  if(opfsAvailable()){
    try{
      await writeOpfs(cleanName,text);
      await idbRequest(DATASET_STORE,'readwrite',store=>store.put({name:cleanName,dataset_uid:dataset_uid||null,backend:'opfs',size:datasetBytes(text),updatedAt:now}));
      return {backend:'opfs',size:datasetBytes(text)};
    }catch(error){console.warn('OPFS fallback to IndexedDB',error);}
  }
  await idbRequest(DATASET_STORE,'readwrite',store=>store.put({name:cleanName,dataset_uid:dataset_uid||null,backend:'idb',content:text,size:datasetBytes(text),updatedAt:now}));
  return {backend:'idb',size:datasetBytes(text)};
}
export async function loadLocalDataset(name){
  const cleanName=String(name||'dataset.csv'),record=await idbRequest(DATASET_STORE,'readonly',store=>store.get(cleanName));
  if(!record)return null;
  if(record.backend==='opfs'){
    try{return await readOpfs(cleanName);}catch{return null;}
  }
  return String(record.content??'');
}
export async function deleteLocalDataset(name){
  const cleanName=String(name||'dataset.csv'),record=await idbRequest(DATASET_STORE,'readonly',store=>store.get(cleanName)).catch(()=>null);
  if(record?.backend==='opfs')await deleteOpfs(cleanName);
  await idbRequest(DATASET_STORE,'readwrite',store=>store.delete(cleanName)).catch(()=>{});
}
export async function renameLocalDataset(from,to){
  const content=await loadLocalDataset(from);if(content===null)return false;
  await saveLocalDataset(to,content);await deleteLocalDataset(from);return true;
}
export async function copyLocalDataset(from,to){
  const content=await loadLocalDataset(from);if(content===null)return false;
  await saveLocalDataset(to,content);return true;
}
export async function saveLocalSnapshot(dataset,{date=new Date().toISOString(),reason='edit',csv='',meta={}}={}){
  const id=crypto.randomUUID(),record={id,dataset:String(dataset),date,reason:String(reason),csv:String(csv),meta};
  await idbRequest(SNAPSHOT_STORE,'readwrite',store=>store.put(record));
  const rows=await listLocalSnapshots(dataset,1000).catch(()=>[]);
  const stale=rows.slice(20);
  if(stale.length){
    const db=await openDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(SNAPSHOT_STORE,'readwrite'),store=tx.objectStore(SNAPSHOT_STORE);
      stale.forEach(row=>store.delete(row.id));
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};
    });
  }
  return id;
}
export async function listLocalSnapshots(dataset,limit=12){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(SNAPSHOT_STORE,'readonly'),index=tx.objectStore(SNAPSHOT_STORE).index('dataset'),request=index.getAll(IDBKeyRange.only(String(dataset)));
    request.onsuccess=()=>{const rows=(request.result||[]).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,limit);resolve(rows);};
    request.onerror=()=>reject(request.error);
    tx.oncomplete=()=>db.close();tx.onerror=()=>db.close();tx.onabort=()=>db.close();
  });
}
export async function getLocalSnapshot(id){return idbRequest(SNAPSHOT_STORE,'readonly',store=>store.get(id));}
export async function deleteLocalSnapshots(dataset){
  const rows=await listLocalSnapshots(dataset,1000).catch(()=>[]);
  if(!rows.length)return;
  const db=await openDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(SNAPSHOT_STORE,'readwrite'),store=tx.objectStore(SNAPSHOT_STORE);
    rows.forEach(row=>store.delete(row.id));tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
export async function renameLocalSnapshots(from,to){
  const rows=await listLocalSnapshots(from,1000).catch(()=>[]);
  if(!rows.length)return;
  const db=await openDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(SNAPSHOT_STORE,'readwrite'),store=tx.objectStore(SNAPSHOT_STORE);
    rows.forEach(row=>store.put({...row,dataset:String(to)}));tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};
  });
}

export async function saveLocalHistory(entry){
  const record={...entry,id:String(entry?.id||globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random()),date:entry?.date||new Date().toISOString()};
  await idbRequest(HISTORY_STORE,'readwrite',store=>store.put(record));
  return record.id;
}
export async function listLocalHistory(dataset_uid,limit=100){
  if(!dataset_uid)return [];
  try{return await idbRequest(HISTORY_STORE,'readonly',store=>store.index('dataset_uid').getAll(IDBKeyRange.only(String(dataset_uid)))).then(rows=>rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,limit));}catch{return [];}
}
export async function saveLocalAnalysis(entry){
  if(!entry?.analysis_uid)throw Error('analysis_uid wajib diisi.');
  await idbRequest(ANALYSIS_STORE,'readwrite',store=>store.put({...entry,schemaVersion:Number(entry.schemaVersion||1),updatedAt:new Date().toISOString()}));
  return entry.analysis_uid;
}
export async function getLocalAnalysis(analysis_uid){
  if(!analysis_uid)return null;
  try{return await idbRequest(ANALYSIS_STORE,'readonly',store=>store.get(String(analysis_uid)));}catch{return null;}
}
export async function listLocalAnalyses(dataset_uid,limit=100){
  if(!dataset_uid)return [];
  try{return await idbRequest(ANALYSIS_STORE,'readonly',store=>store.index('dataset_uid').getAll(IDBKeyRange.only(String(dataset_uid)))).then(rows=>rows.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,limit));}catch{return [];}
}
export async function queueLocalSync(change){
  const change_id=String(change?.change_id||globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random());
  await idbRequest(SYNC_STORE,'readwrite',store=>store.put({...change,change_id,createdAt:change?.createdAt||new Date().toISOString()}));
  return change_id;
}
export async function listLocalSyncQueue(limit=500){try{return await idbRequest(SYNC_STORE,'readonly',store=>store.getAll()).then(rows=>rows.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))).slice(0,limit));}catch{return [];}}
export async function removeLocalSync(change_id){if(!change_id)return false;try{await idbRequest(SYNC_STORE,'readwrite',store=>store.delete(String(change_id)));return true;}catch{return false;}}

export async function getLocalDatasetRecordByUid(dataset_uid){
  if(!dataset_uid)return null;
  try{return await idbRequest(DATASET_STORE,'readonly',store=>store.index(IDENTITY_INDEX).get(String(dataset_uid)));}catch{return null;}
}

export async function listLocalDatasetRecords(){
  try{return await idbRequest(DATASET_STORE,'readonly',store=>store.getAll());}catch{return [];}
}

export async function migrateLegacyResearchStores({meta={},history=[],analyses=[]}={}){
  const result={meta:0,history:0,analyses:0,skipped:false};
  try{
    const marker=await idbRequest(META_STORE,'readonly',store=>store.get(LEGACY_MIGRATION_KEY));
    if(marker?.done){result.skipped=true;return result;}
    const db=await openDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction([META_STORE,HISTORY_STORE,ANALYSIS_STORE],'readwrite');
      const metaStore=tx.objectStore(META_STORE),historyStore=tx.objectStore(HISTORY_STORE),analysisStore=tx.objectStore(ANALYSIS_STORE);
      Object.entries(meta||{}).forEach(([key,value])=>metaStore.put({key:'dataset-meta:'+key,value,schemaVersion:1,updatedAt:new Date().toISOString()}));
      (Array.isArray(history)?history:[]).forEach(entry=>historyStore.put({...entry,id:String(entry.id||entry.analysis_uid||globalThis.crypto?.randomUUID?.()),dataset_uid:entry.dataset_uid||null,schemaVersion:1}));
      (Array.isArray(analyses)?analyses:[]).forEach(entry=>{if(entry?.analysis_uid)analysisStore.put({...entry,schemaVersion:Number(entry.schemaVersion||1)});});
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error||Error('Migrasi storage gagal.'));};tx.onabort=()=>{db.close();reject(tx.error||Error('Migrasi storage dibatalkan.'));};
    });
    await idbRequest(META_STORE,'readwrite',store=>store.put({key:LEGACY_MIGRATION_KEY,done:true,date:new Date().toISOString(),schemaVersion:1}));
    result.meta=Object.keys(meta||{}).length;result.history=Array.isArray(history)?history.length:0;result.analyses=Array.isArray(analyses)?analyses.length:0;
    return result;
  }catch(error){return {...result,error};}
}

export async function moveLocalDatasetToTrash(record,{retentionMs=86400000,reason='delete'}={}){
  const trash_id=String(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random());
  const now=new Date(),expiresAt=new Date(now.getTime()+Math.max(0,Number(retentionMs)||0)).toISOString();
  await idbRequest(TRASH_STORE,'readwrite',store=>store.put({trash_id,dataset_uid:record?.dataset_uid||null,name:record?.name||null,record,reason,deletedAt:now.toISOString(),expiresAt}));
  return trash_id;
}
export async function listLocalTrash(limit=100){try{return await idbRequest(TRASH_STORE,'readonly',store=>store.getAll()).then(rows=>rows.sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt))).slice(0,limit));}catch{return [];}}
export async function purgeExpiredLocalTrash(now=new Date().toISOString()){
  const rows=await listLocalTrash(10000),expired=rows.filter(row=>String(row.expiresAt)<String(now));
  if(!expired.length)return 0;
  const db=await openDb();
  await new Promise((resolve,reject)=>{const tx=db.transaction(TRASH_STORE,'readwrite'),store=tx.objectStore(TRASH_STORE);expired.forEach(row=>store.delete(row.trash_id));tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});
  return expired.length;
}
