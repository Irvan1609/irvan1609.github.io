const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d');
let image=null,photo='',boxes=[],history=[],start=null,activeId=null,dirty=false,db;
const status=msg=>$('status').textContent=msg;
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('chili-labels-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('samples',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function transaction(mode,action){return new Promise((resolve,reject)=>{const t=db.transaction('samples',mode),r=action(t.objectStore('samples'));t.oncomplete=()=>resolve(r.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
function redraw(){
 if(!image)return;
 const width=Math.max(200,$('viewport').clientWidth),scale=Math.min(1,width/image.width)*Number($('zoom').value);
 canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
 ctx.drawImage(image,0,0,canvas.width,canvas.height);
 boxes.forEach((b,i)=>{const [x,y,w,h]=b.map((v,k)=>v*(k%2?canvas.height:canvas.width));ctx.strokeStyle='#ffdd00';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);ctx.fillStyle='#17202a';ctx.fillRect(x,y,32,22);ctx.fillStyle='white';ctx.font='bold 14px system-ui';ctx.fillText(i+1,x+4,y+16);});
 $('count').textContent=boxes.length+' buah';$('undo').disabled=!history.length;
}
function point(e){const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
function checkpoint(){history.push(boxes.map(b=>[...b]));dirty=true;}
canvas.onpointerdown=e=>{if(!image)return;canvas.setPointerCapture(e.pointerId);start=point(e);};
canvas.onpointerup=e=>{
 if(!start)return;const end=point(e),p=start;start=null;
 if($('mode').value==='delete'){const i=boxes.findLastIndex(([x,y,w,h])=>end[0]>=x&&end[0]<=x+w&&end[1]>=y&&end[1]<=y+h);if(i>=0){checkpoint();boxes.splice(i,1);}}
 else{const b=[Math.min(p[0],end[0]),Math.min(p[1],end[1]),Math.abs(p[0]-end[0]),Math.abs(p[1]-end[1])];if(b[2]*image.width>=3&&b[3]*image.height>=3){checkpoint();boxes.push(b);}}
 redraw();
};
canvas.onpointercancel=()=>start=null;
$('undo').onclick=()=>{if(history.length){boxes=history.pop();dirty=true;redraw();}};
$('zoom').onchange=redraw;window.addEventListener('resize',redraw);$('sample').oninput=()=>dirty=true;
function readFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});}
async function setImage(url){const next=new Image();next.src=url;await next.decode();image=next;photo=url;redraw();}
$('photo').onchange=async e=>{const file=e.target.files[0];if(!file)return;
 if(dirty&&!confirm('Abaikan koreksi yang belum disimpan?')){e.target.value='';return;}
 try{if(file.size>20*1024*1024)throw Error('Foto maksimal 20 MB.');if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('Gunakan JPG, PNG, atau WebP.');
 const url=await readFile(file);await setImage(url);boxes=[];history=[];activeId=null;dirty=true;$('sample').value=file.name.replace(/\.[^.]+$/,'');redraw();status('Buat kotak untuk setiap buah, lalu simpan setelah semua diperiksa.');}catch(err){status(err.message);}e.target.value='';};
$('save').onclick=async()=>{if(!image)return status('Pilih foto dahulu.');if(!$('sample').value.trim())return status('Isi kode sampel.');
 try{const id=activeId||crypto.randomUUID();await transaction('readwrite',s=>s.put({id,name:$('sample').value.trim(),image:photo,width:image.width,height:image.height,boxes:boxes.map(b=>[...b]),reviewed:true,updatedAt:new Date().toISOString()}));activeId=id;dirty=false;await list();status('Koreksi tersimpan di browser ini. Ekspor untuk membuat cadangan.');}catch{status('Penyimpanan gagal. Periksa ruang penyimpanan browser. Koreksi masih ada di layar.');}};
async function list(){const rows=await transaction('readonly',s=>s.getAll());$('records').replaceChildren();for(const row of rows){const li=document.createElement('li');li.textContent=row.name+' — '+row.boxes.length+' buah';const edit=document.createElement('button');edit.textContent='Buka';edit.onclick=async()=>{if(dirty&&!confirm('Abaikan koreksi yang belum disimpan?'))return;try{await setImage(row.image);boxes=row.boxes.map(b=>[...b]);history=[];activeId=row.id;$('sample').value=row.name;dirty=false;redraw();status('Sampel tersimpan dibuka.');}catch{status('Foto tidak dapat dibuka.');}};li.append(edit);$('records').append(li);}}
function valid(r){return r&&typeof r.id==='string'&&typeof r.name==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(r.image)&&Number.isInteger(r.width)&&r.width>0&&Number.isInteger(r.height)&&r.height>0&&r.reviewed===true&&Array.isArray(r.boxes)&&r.boxes.every(b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=0&&b[1]>=0&&b[2]>0&&b[3]>0&&b[0]+b[2]<=1.000001&&b[1]+b[3]<=1.000001);}
$('export').onclick=async()=>{try{const samples=await transaction('readonly',s=>s.getAll());if(!samples.length)return status('Belum ada koreksi tersimpan.');const data={version:1,format:'chili-boxes',className:'cabai',boxFormat:'normalized top-left x,y,width,height',samples};const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='data-pelatihan-cabai.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Cadangan diekspor. Foto dan kotak penanda disertakan.');}catch{status('Ekspor gagal. Coba kembali.');}};
$('import').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>100*1024*1024)throw Error('Cadangan maksimal 100 MB.');const d=JSON.parse(await f.text());if(d.version!==1||d.format!=='chili-boxes'||!Array.isArray(d.samples)||!d.samples.every(valid))throw Error('Format cadangan tidak valid.');await new Promise((resolve,reject)=>{const t=db.transaction('samples','readwrite');for(const r of d.samples)t.objectStore('samples').put({...r,id:crypto.randomUUID()});t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});await list();status('Cadangan dipulihkan sebagai salinan; sampel lama tetap tersimpan.');}catch(err){status(err.message||'Pemulihan gagal.');}e.target.value='';};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
try{db=await openDB();await list();}catch{status('Penyimpanan browser tidak tersedia. Aktifkan penyimpanan untuk menyimpan koreksi.');$('save').disabled=true;$('export').disabled=true;$('import').disabled=true;}
