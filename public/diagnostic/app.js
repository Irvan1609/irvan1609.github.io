const $=s=>document.querySelector(s);
let last=null;
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function waitShell(){return new Promise(resolve=>{if(window.AgrotikShell)return resolve(window.AgrotikShell);document.addEventListener('agrotik-shell-ready',()=>resolve(window.AgrotikShell),{once:true});setTimeout(()=>resolve(window.AgrotikShell||null),2500);});}
function fmtBytes(n){const x=Number(n||0);if(!x)return '0 B';const u=['B','KB','MB','GB'];let i=0,v=x;while(v>=1024&&i<u.length-1){v/=1024;i++;}return v.toFixed(i?1:0)+' '+u[i];}
function renderQueue(shell){
  const items=shell?.queueSummary?.()||[],root=$('#queue');
  if(!items.length){root.innerHTML='<span class="muted">Tidak ada antrean yang terdeteksi.</span>';return;}
  const route={datasets:'/stat/',game:'/game/',ai:'/hitung-cabai/'};
  root.innerHTML=items.map(item=>'<article><div><b>'+esc(item.key)+'</b><small>'+esc(item.state||'pending')+' · '+esc(item.message||'')+'</small></div><div><b>'+Number(item.count||0)+'</b> <a href="'+esc(route[item.key]||'/')+'">Buka</a></div></article>').join('');
}
function rows(data){
  const storage=data.storage||{},pct=storage.ratio?Math.round(storage.ratio*100):0;
  return [
    ['Lokal',data.localStorage?.ok&&data.indexedDB?.ok?'✓ Normal':'⚠ Periksa'],
    ['IndexedDB',data.indexedDB?.ok?'✓':'✕'],
    ['Service Worker',data.serviceWorker?.ok?'✓':'—'],
    ['Cloud Worker',data.worker?.ok?'✓':'—'],
    ['Mode cloud',data.worker?.mode||'—'],
    ['Storage',storage.supported?(pct+'% · '+fmtBytes(storage.usage)+' / '+fmtBytes(storage.quota)):'—'],
    ['Storage persistent',storage.persisted===true?'✓':storage.persisted===false?'belum':'—'],
    ['Kamera API',data.camera?.available?'tersedia':'—'],
    ['Safe Mode',data.safeMode?'aktif':'nonaktif'],
    ['Schema lokal',(data.schema?.local??0)+' / '+(data.schema?.target??0)],
    ['Error sesi',String(data.errors||0)],
    ['Antrean',String(data.queues?.length||0)]
  ];
}
async function run(){
  const shell=await waitShell();if(!shell){$('#state').textContent='Diagnostic shell belum tersedia.';return;}
  $('#run').disabled=true;$('#state').textContent='Memeriksa…';
  try{
    last=await shell.runDiagnostics();$('#grid').hidden=false;$('#grid').innerHTML=rows(last).map(([a,b])=>'<div class="item"><span>'+esc(a)+'</span><b>'+esc(b)+'</b></div>').join('');
    $('#state').textContent='Pemeriksaan selesai · '+new Date(last.generatedAt).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    $('#copy').disabled=$('#copyError').disabled=false;$('#safe').textContent=last.safeMode?'Matikan Safe Mode':'Aktifkan Safe Mode';renderQueue(shell);
  }finally{$('#run').disabled=false;}
}
$('#run').onclick=run;
$('#copy').onclick=async()=>{if(last)await navigator.clipboard?.writeText?.(JSON.stringify(last,null,2));};
$('#copyError').onclick=async()=>{const shell=await waitShell();await shell?.copyErrorReport?.();};
$('#safe').onclick=async()=>{const shell=await waitShell();shell?.setSafeMode?.(!shell.safeMode?.());};
document.addEventListener('agrotik-queue-change',async()=>renderQueue(await waitShell()));
setTimeout(run,250);
