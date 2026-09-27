const $=s=>document.querySelector(s);
const fmtBytes=n=>{const v=Number(n||0);if(v<1024)return v+' B';if(v<1048576)return (v/1024).toFixed(1)+' KB';if(v<1073741824)return (v/1048576).toFixed(1)+' MB';return (v/1073741824).toFixed(2)+' GB';};
const kv=(a,b)=>'<div class="kv"><span>'+a+'</span><b>'+b+'</b></div>';
async function render(){
  const api=window.AgrotikResilience;if(!api){$('#status').textContent='Modul diagnostic belum siap.';return;}
  $('#status').textContent='Memeriksa…';
  const d=await api.runDiagnostics({includeNetwork:true});
  $('#checks').innerHTML=d.checks.map(c=>'<div class="check '+(c.ok?'ok':'')+'"><i class="dot"></i><div><b>'+c.label+'</b><span>'+c.detail+'</span></div></div>').join('');
  $('#storage').innerHTML=kv('Terpakai',fmtBytes(d.storage.usage))+kv('Kuota browser',fmtBytes(d.storage.quota))+kv('Persentase',Math.round((d.storage.ratio||0)*100)+'%')+kv('Persisten',d.storage.persisted?'Ya':'Belum');
  const q=d.queue||{},stat=q.stat||{},game=q.game||{};
  $('#queue').innerHTML=kv('Stat',stat.status||'tidak ada')+kv('Dataset tertunda',stat.pendingDatasets||0)+kv('Operasi tertunda',stat.pendingOperations||0)+kv('Field Zero',game.status||'tidak ada')+kv('Konflik game',game.conflict?'Ada':'Tidak');
  $('#recovery').innerHTML=kv('Dataset aktif',d.recovery?.activeDataset||'—')+kv('Versi dataset lokal',d.recovery?.statVersions||0)+kv('Checkpoint Field Zero',d.recovery?.gameCheckpoints||0)+kv('Safe Mode',d.safeMode?'Aktif':'Nonaktif')+kv('Rollback cache',d.rollback?.available?'Tersedia':'Belum tersedia')+kv('Rollback aktif',d.rollback?.enabled?'Ya':'Tidak')+kv('Worker',d.health?.apiVersion||'—');
  $('#safe').textContent=d.safeMode?'Keluar Safe Mode':'Aktifkan Safe Mode';
  $('#rollback').textContent=d.rollback?.enabled?'Kembali ke versi terbaru':'Gunakan versi sebelumnya';$('#rollback').disabled=!d.rollback?.available&&!d.rollback?.enabled;
  $('#errors').textContent=d.errors?.length?JSON.stringify(d.errors,null,2):'Belum ada error yang tercatat.';
  $('#status').textContent='Pemeriksaan selesai · '+new Date(d.generatedAt).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
}
$('#run').onclick=render;
$('#copy').onclick=()=>window.AgrotikResilience?.copyErrorReport?.();
$('#safe').onclick=()=>window.AgrotikResilience?.toggleSafeMode?.();
$('#rollback').onclick=async()=>{const s=await window.AgrotikResilience?.rollbackStatus?.();window.AgrotikResilience?.setRollback?.(!s?.enabled);};
render();