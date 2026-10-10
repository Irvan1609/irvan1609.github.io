const DB_NAME='agrotik-observations-v1';
function open(){
  return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(Error('Penyimpanan lokal tidak tersedia di browser ini.'));return;}
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('sessions',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('Tutup tab Agrotik lain lalu coba lagi.'));
  });
}
async function read(action){
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('sessions','readonly'),request=action(tx.objectStore('sessions'));
    tx.oncomplete=()=>{db.close();resolve(request.result);};
    tx.onabort=tx.onerror=()=>{db.close();reject(tx.error||request.error||Error('Gagal membaca pengamatan.'));};
  });
}
export async function listObservations(){
  return (await read(store=>store.getAll())).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
export async function loadObservation(id){return read(store=>store.get(id));}
export async function saveObservation(plan){
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('sessions','readwrite'),store=tx.objectStore('sessions');
    const request=store.get(plan.id);let record,error;
    request.onsuccess=()=>{
      if((request.result?.revision||0)!==(plan.revision||0)){
        error=Error('Pengamatan berubah di tab lain. Unduh cadangan perubahan Anda, lalu muat ulang pengamatan. Data tab lain tidak ditimpa.');tx.abort();return;
      }
      record={...plan,revision:(plan.revision||0)+1,updatedAt:new Date().toISOString()};
      store.put(record);
    };
    tx.oncomplete=()=>{db.close();resolve(record);};
    tx.onabort=tx.onerror=()=>{db.close();reject(error||tx.error||Error('Penyimpanan gagal. Unduh cadangan sebelum menutup halaman.'));};
  });
}
