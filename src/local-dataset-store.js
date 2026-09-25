const DB_NAME='agrotik-stat-local-v1';
const DB_VERSION=1;
const DATASET_STORE='datasets';
const SNAPSHOT_STORE='snapshots';
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

function openDb(){
  if(typeof indexedDB==='undefined')return Promise.reject(Error('IndexedDB tidak tersedia.'));
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(DATASET_STORE))db.createObjectStore(DATASET_STORE,{keyPath:'name'});
      if(!db.objectStoreNames.contains(SNAPSHOT_STORE)){
        const store=db.createObjectStore(SNAPSHOT_STORE,{keyPath:'id'});
        store.createIndex('dataset','dataset',{unique:false});
        store.createIndex('date','date',{unique:false});
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

export async function saveLocalDataset(name,content){
  const cleanName=String(name||'dataset.csv'),text=String(content??''),now=new Date().toISOString();
  if(opfsAvailable()){
    try{
      await writeOpfs(cleanName,text);
      await idbRequest(DATASET_STORE,'readwrite',store=>store.put({name:cleanName,backend:'opfs',size:datasetBytes(text),updatedAt:now}));
      return {backend:'opfs',size:datasetBytes(text)};
    }catch(error){console.warn('OPFS fallback to IndexedDB',error);}
  }
  await idbRequest(DATASET_STORE,'readwrite',store=>store.put({name:cleanName,backend:'idb',content:text,size:datasetBytes(text),updatedAt:now}));
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
