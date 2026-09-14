import {openTool} from './data-tools.js';
const KEY='statistical_web_drive_backup_v1';
export const DEFAULT_ENDPOINT='https://script.google.com/macros/s/AKfycbzxSk-P1EiHLsoBs6giyTOORtdLAV4Nm8sljdM1rkcmTJ0Gz4x8idEYUdq09uEBXLgh/exec';
export const MAX_BYTES=2*1024*1024;
let busy=false;
export function validEndpoint(value){
  return typeof value==='string'&&/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value);
}
function config(){
  const disabled={enabled:false,endpoint:DEFAULT_ENDPOINT};
  try{
    const raw=localStorage.getItem(KEY);
    // Owner-authorized default applies only when no preference has been saved.
    // Explicit opt-out and malformed stored preferences remain disabled.
    if(raw===null)return {enabled:true,endpoint:DEFAULT_ENDPOINT};
    const stored=JSON.parse(raw);
    if(!stored||typeof stored!=='object'||Array.isArray(stored))return disabled;
    const endpoint=validEndpoint(stored.endpoint)?stored.endpoint:'';
    // Corrupt storage must not throw or turn a truthy string into upload consent.
    return {enabled:stored.enabled===true&&!!endpoint,endpoint};
  }catch{return disabled;}
}
function status(text){const el=document.getElementById('driveBackupStatus');if(el)el.textContent=text;}
export async function rawWorkbook(dataset){
  if(!dataset.headers?.length||!dataset.rows?.length)throw Error('Dataset kosong.');
  if(dataset.headers.length>16384||dataset.rows.length>100000)throw Error('Dataset melebihi batas cadangan.');
  if(new TextEncoder().encode(JSON.stringify(dataset)).length>MAX_BYTES)throw Error('Data mentah melebihi batas 2 MiB.');
  const {default:ExcelJS}=await import('exceljs');
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Data mentah');
  // Preserve raw input, identifiers, decimal separators and formula-like text literally.
  sheet.addRow(dataset.headers.map(v=>String(v??'')));
  dataset.rows.forEach(row=>sheet.addRow(dataset.headers.map((_,i)=>String(row[i]??''))));
  sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];
  const bytes=new Uint8Array(await book.xlsx.writeBuffer());
  if(bytes.byteLength>MAX_BYTES)throw Error('Berkas Excel melebihi batas 2 MiB.');
  return bytes;
}
export async function backupRawDataset(dataset){
  const c=config();
  if(!c.enabled||!validEndpoint(c.endpoint)){status('Cadangan Drive belum aktif.');return;}
  if(busy){status('Cadangan sebelumnya masih dikirim; pengiriman baru dilewati.');return;}
  busy=true;
  let timer;
  try{
    status('Menyiapkan cadangan data mentah…');
    const bytes=await rawWorkbook(dataset);
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const controller=new AbortController();timer=setTimeout(()=>controller.abort(),30000);
    status('Mengirim data mentah ke Drive…');
    // Apps Script ContentService does not provide a configurable CORS receipt.
    // An opaque response is NOT evidence that Drive accepted the file.
    await fetch(c.endpoint,{method:'POST',mode:'no-cors',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({version:1,name:dataset.name,data:btoa(binary)}),signal:controller.signal});
    status('Permintaan cadangan terkirim; penyimpanan Drive belum terkonfirmasi.');
  }catch(e){status('Cadangan tidak dapat dikonfirmasi: '+(e.name==='AbortError'?'batas waktu pengiriman tercapai.':e.message)+' Data lokal tetap tersedia.');}
  finally{clearTimeout(timer);busy=false;}
}
export function installDriveBackup(){
  const toolbar=document.querySelector('.toolbar');
  toolbar.insertAdjacentHTML('beforeend','<button id="configureDriveBackup">Cadangan Drive</button>');
  document.getElementById('scienceRunStatus').insertAdjacentHTML('afterend','<p id="driveBackupStatus" class="form-help" role="status"></p>');
  status(config().enabled?'Cadangan Drive aktif: data mentah akan dikirim setelah analisis berhasil.':'Cadangan Drive nonaktif pada browser ini.');
  document.getElementById('configureDriveBackup').onclick=()=>{
    openTool('Cadangan data mentah ke Drive',`<p>Opsional: kirim dataset aktif dalam Excel setelah analisis berhasil. Tidak mengirim hasil, grafik, dataset lain, atau riwayat. Kolom disimpan sebagai teks agar isi asli tidak berubah.</p><label>URL penerima Google Apps Script<input id="driveBackupEndpoint" type="url" placeholder="https://script.google.com/macros/s/…/exec"></label><label><input id="driveBackupEnabled" type="checkbox"> Aktifkan pengiriman otomatis pada browser ini</label><p>Tujuan: folder Irvan1609@github.io. Penerima tanpa login terbuka untuk unggahan publik. Folder tujuan juga dibagikan kepada pemegang tautan. Batas 2 MiB per berkas; data lokal tidak dihapus. Biarkan tab terbuka selama pengiriman.</p><p>Browser tidak dapat memastikan keberhasilan penyimpanan melalui penerima ini. Periksa Drive secara langsung; situs tidak membaca kembali berkas.</p><button id="saveDriveBackup">Simpan pengaturan</button><p id="driveBackupConfigStatus" role="status"></p>`);
    const c=config();document.getElementById('driveBackupEndpoint').value=c.endpoint||'';document.getElementById('driveBackupEnabled').checked=!!c.enabled;
    document.getElementById('saveDriveBackup').onclick=()=>{
      const endpoint=document.getElementById('driveBackupEndpoint').value.trim(),enabled=document.getElementById('driveBackupEnabled').checked;
      const out=document.getElementById('driveBackupConfigStatus');
      if((endpoint||enabled)&&!validEndpoint(endpoint)){out.textContent='Gunakan URL deployment Apps Script berakhiran /exec.';return;}
      try{localStorage.setItem(KEY,JSON.stringify({endpoint,enabled}));out.textContent='Pengaturan tersimpan. Berlaku pada analisis berikutnya.';status(enabled?'Cadangan Drive aktif: data mentah akan dikirim setelah analisis berhasil.':'Cadangan Drive nonaktif pada browser ini.');}catch{out.textContent='Pengaturan tidak dapat disimpan pada browser ini.';}
    };
  };
}
