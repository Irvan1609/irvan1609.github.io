const DB_NAME='agrotik_field_media_v1',STORE='photos';

function db(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      const database=request.result,store=database.createObjectStore(STORE,{keyPath:'id'});
      store.createIndex('dataset_uid',['dataset','uid'],{unique:false});
      store.createIndex('createdAt','createdAt',{unique:false});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('Media lokal tidak dapat dibuka.'));
  });
}
function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function imageBitmap(file){
  if(typeof createImageBitmap==='function')return createImageBitmap(file);
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;await image.decode();return image;
  }finally{URL.revokeObjectURL(url);}
}
export async function compressFieldPhoto(file,{maxSide=1280,quality=.72}={}){
  if(!file?.type?.startsWith('image/'))throw Error('Pilih file gambar.');
  const image=await imageBitmap(file),w=image.width||image.naturalWidth,h=image.height||image.naturalHeight,scale=Math.min(1,maxSide/Math.max(w,h));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  canvas.getContext('2d',{alpha:false}).drawImage(image,0,0,canvas.width,canvas.height);
  if(typeof image.close==='function')image.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
  if(blob)return blob;
  return await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
}
export async function saveFieldPhoto({dataset,uid,file,label='',observer='',session=''}){
  if(!dataset||!uid)throw Error('Identitas plot tidak tersedia.');
  const blob=await compressFieldPhoto(file),record={id:crypto.randomUUID(),dataset:String(dataset),uid:String(uid),label:String(label),observer:String(observer),session:String(session),createdAt:new Date().toISOString(),blob};
  const database=await db(),tx=database.transaction(STORE,'readwrite');tx.objectStore(STORE).put(record);await txDone(tx);database.close();return record;
}
export async function listFieldPhotos(dataset,uid){
  const database=await db(),tx=database.transaction(STORE,'readonly'),index=tx.objectStore(STORE).index('dataset_uid'),request=index.getAll([String(dataset),String(uid)]);
  const rows=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error);});
  database.close();return rows.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
export async function deleteFieldPhoto(id){
  const database=await db(),tx=database.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(String(id));await txDone(tx);database.close();
}
