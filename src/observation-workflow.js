import {uid,parseParameters,parseObservationNumber,templateSteps,observationQueue,observationSummary,rawObservationTable,recapObservationTable,tableCsv,applyObservationChange,travelObservationHistory} from './observation-engine.js';
import {listObservations,loadObservation,saveObservation} from './observation-store.js';
import './observation.css';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>structuredClone(value);
let root,plan,draft,queue=[],cursor=0,view='list',timer,saveChain=Promise.resolve(),saveError='',returnFocus,navigationBusy=false;
const $=selector=>root.querySelector(selector);
const status=message=>{if($('#obsSave'))$('#obsSave').textContent=message;};
function datasetOptions(selected=''){
  const datasets=globalThis.StatisticalWebData?.listDatasets?.()||[];
  return '<option value="">Tanpa dataset — isi manual</option>'+datasets.map(({fileName,name})=>`<option value="${esc(fileName)}" ${fileName===selected?'selected':''}>${esc(name)}</option>`).join('');
}
function error(message){$('#obsError').textContent=message||'';$('#obsError').hidden=!message;}
function debounceSave(){clearTimeout(timer);timer=null;status('Menyimpan…');timer=setTimeout(()=>void persist(),300);}
async function persist(){
  clearTimeout(timer);timer=null;
  if(!plan)return true;
  saveChain=saveChain.then(async()=>{
    if(saveError)return false;
    try{
      const current=plan;
      const saved=await saveObservation(clone(current));
      current.revision=saved.revision;current.updatedAt=saved.updatedAt;
      status('Tersimpan di perangkat');return true;
    }catch(e){saveError=e.message;error(saveError);status('Belum tersimpan');return false;}
  });
  return saveChain;
}
function download(name,content,type='text/csv;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function backup(){if(plan)download(plan.name+'.json',JSON.stringify(plan,null,2),'application/json');}
function shell(){
  root.innerHTML=`<header class="obs-head"><button type="button" id="obsClose" aria-label="Tutup pengamatan">← Data</button><h1>Pengamatan</h1><span id="obsSave" role="status"></span><button type="button" id="obsBackup">Cadangan JSON</button></header><div id="obsError" role="alert" hidden></div><nav class="obs-tabs" aria-label="Tahap pengamatan"><button type="button" data-view="list">Daftar</button><button type="button" data-view="setup">Susun</button><button type="button" data-view="observe">Isi</button><button type="button" data-view="summary">Rekap</button></nav><main id="obsBody"></main>`;
  $('#obsClose').onclick=close;
  $('#obsBackup').onclick=backup;
  root.querySelectorAll('[data-view]').forEach(button=>button.onclick=async()=>{
    if(navigationBusy)return;
    if(button.dataset.view!=='list'&&!plan)return;
    if(view==='observe')commitInput();
    if(!await persist())return;
    if(['observe','summary'].includes(button.dataset.view)&&!plan?.configured){error('Susun parameter, unit, dan urutan dahulu.');return;}
    render(button.dataset.view);
  });
}
function render(next=view){
  view=next;error(saveError);root.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.disabled=!plan&&b.dataset.view!=='list';});
  if(view==='list')void renderList();
  if(view==='setup'){draft=clone(plan.configDraft||{name:plan.name,parameters:plan.parameters,units:plan.units,groups:plan.groups,orderMode:plan.orderMode,manualOrder:plan.manualOrder,sourceDataset:plan.sourceDataset||''});renderSetup();}
  if(view==='observe'){queue=observationQueue(plan);cursor=Math.min(plan.cursor||0,queue.length-1);renderEntry();}
  if(view==='summary')renderSummary();
}
async function renderList(){
  $('#obsBody').innerHTML='<p>Memuat pengamatan…</p>';
  try{
    const sessions=await listObservations();if(view!=='list')return;
    const activeDataset=globalThis.StatisticalWebData?.readActiveDataset?.().fileName||'';
    $('#obsBody').innerHTML=`<div class="obs-intro"><h2>Pengamatan lapang</h2><p>Susun sekali, isi sesuai urutan kerja. Sampel dapat berupa tanaman atau buah.</p><div class="obs-dataset-picker"><label>Dataset sumber <select id="obsDataset">${datasetOptions(activeDataset)}</select></label><div class="obs-actions"><button type="button" id="obsNew" class="primary">+ Pengamatan baru</button><button type="button" id="obsOpenDataset">Buka dataset di editor</button></div></div><label class="obs-file">Pulihkan cadangan JSON<input id="obsRestore" type="file" accept=".json,application/json"></label></div><div class="obs-session-list">${sessions.map(s=>`<button type="button" data-session="${esc(s.id)}"><strong>${esc(s.name)}</strong><span>${s.units.length} unit · ${s.parameters.length} parameter · ${s.configured?'Siap dilanjutkan':'Draf susunan'}</span><small>${esc(new Date(s.updatedAt).toLocaleString('id-ID'))}</small></button>`).join('')||'<p>Belum ada pengamatan. Data tersimpan di perangkat ini; unduh cadangan untuk berpindah perangkat.</p>'}</div>`;
    $('#obsOpenDataset').onclick=async()=>{
      try{
        const selected=$('#obsDataset').value;
        if(!selected)throw Error('Pilih dataset dari daftar terlebih dahulu.');
        await globalThis.StatisticalWebData.activateDataset(selected);
        if(!await close())return;
        const toggle=document.getElementById('projectToggle');
        if(toggle?.getAttribute('aria-expanded')!=='true')toggle?.click();
      }catch(e){error(e.message);}
    };
    $('#obsNew').onclick=async()=>{
      saveError='';const parameters=parseParameters('bb | Bobot buah | g\npb | Panjang buah | cm\ntb | Tebal buah | mm\nlb | Lebar buah | mm');
      plan={version:1,id:uid(),revision:0,name:'Pengamatan baru',sourceDataset:$('#obsDataset').value,parameters,units:[{id:uid(),code:'U1G1',block:'1',treatment:'G1',count:5,kind:'buah'}],groups:[{id:uid(),mode:'parameter',parameterIds:[parameters[0].id]},{id:uid(),mode:'sample',parameterIds:parameters.slice(1).map(p=>p.id)}],orderMode:'groups',manualOrder:'',values:{},drafts:{},undo:[],redo:[],cursor:0,configured:false};
      await persist();render('setup');
    };
    root.querySelectorAll('[data-session]').forEach(b=>b.onclick=async()=>{plan=await loadObservation(b.dataset.session);saveError='';status('Tersimpan di perangkat');render(plan.configured?'observe':'setup');});
    $('#obsRestore').onchange=async event=>{
      try{
        const file=event.target.files[0];if(!file)return;if(file.size>25*1024*1024)throw Error('Cadangan maksimal 25 MB.');
        const data=JSON.parse(await file.text());
        if(data.version!==1||!data.values||typeof data.values!=='object'||Array.isArray(data.values))throw Error('Format cadangan tidak dikenali.');
        const steps=observationQueue(data),valid=new Set(steps.map(s=>s.key));
        for(const [key,v] of Object.entries(data.values))if(!valid.has(key)||!['missing','measured'].includes(v?.status)||(v.status==='measured'&&!Number.isFinite(v.value)))throw Error('Isi pengamatan dalam cadangan tidak valid.');
        plan={...data,id:uid(),revision:0,name:data.name+' (pulihan)',undo:[],redo:[],configDraft:undefined,drafts:data.drafts||{}};saveError='';
        await persist();render(plan.configured?'observe':'setup');
      }catch(e){error('Gagal memulihkan: '+e.message);}
    };
  }catch(e){error(e.message);$('#obsBody').innerHTML='<p>Pengamatan tidak dapat dimuat. Data lama tidak dihapus.</p>';}
}
function stashDraft(){plan.configDraft=clone(draft);debounceSave();}
function unitRows(){return draft.units.map((u,i)=>`<tr data-unit="${i}"><td><input data-field="code" aria-label="Kode unit ${i+1}" value="${esc(u.code)}" maxlength="80"></td><td><input data-field="block" aria-label="Ulangan unit ${i+1}" value="${esc(u.block)}" maxlength="60"></td><td><input data-field="treatment" aria-label="Perlakuan unit ${i+1}" value="${esc(u.treatment)}" maxlength="80"></td><td><input data-field="count" type="number" min="1" max="500" aria-label="Jumlah sampel unit ${i+1}" value="${u.count}"></td><td><select data-field="kind" aria-label="Jenis sampel unit ${i+1}">${['buah','tanaman','lainnya'].map(k=>`<option ${u.kind===k?'selected':''}>${k}</option>`).join('')}</select></td><td><button type="button" data-remove-unit="${i}" aria-label="Hapus unit ${esc(u.code)}">×</button></td></tr>`).join('');}
function renderSetup(){
  const sourceDataset=draft.sourceDataset||'';
  $('#obsBody').innerHTML=`<div class="obs-setup-grid"><section class="obs-card"><h2>1. Parameter & unit</h2><label>Nama pengamatan<input id="obsName" value="${esc(draft.name)}" maxlength="100"></label><label>Parameter — satu per baris: kode | nama | satuan<textarea id="obsParameters" rows="5" spellcheck="false">${esc(draft.parametersText??draft.parameters.map(p=>[p.code,p.name,p.unit].join(' | ')).join('\n'))}</textarea></label><p class="obs-help">Panen berbeda dapat menjadi parameter terpisah, misalnya bb-p1 dan bb-p2.</p><button type="button" id="obsApplyParameters">Terapkan daftar parameter</button><h3>Unit percobaan</h3><label>Dataset sumber<select id="obsSourceDataset">${datasetOptions(sourceDataset)}</select></label><p class="obs-help">Sampel menjadi anak langsung unit: U1G1(1), U1G1(2), dan seterusnya. Jumlah boleh berbeda antarunit.</p><div class="obs-table-scroll"><table><thead><tr><th>Unit</th><th>Ulangan</th><th>Perlakuan</th><th>Sampel</th><th>Jenis</th><th></th></tr></thead><tbody id="obsUnits">${unitRows()}</tbody></table></div><div class="obs-actions"><button type="button" id="obsAddUnit">+ Unit</button><button type="button" id="obsImportUnits">Ambil unit dari dataset terpilih</button></div><div id="obsUnitMapping"></div></section><section class="obs-card"><h2>2. Susun urutan</h2><label>Penyusunan<select id="obsOrderMode"><option value="groups" ${draft.orderMode!=='manual'?'selected':''}>Kelompok parameter</option><option value="manual" ${draft.orderMode==='manual'?'selected':''}>Urutan rinci (bebas)</option></select></label><div id="obsOrderEditor"></div><h3>Pratinjau satu unit</h3><p id="obsSequence" class="obs-sequence"></p><p class="obs-help">Urutan diulang pada unit berikutnya. Langkah sampel di luar jumlah unit tersebut dilewati otomatis.</p><button type="button" class="primary" id="obsStart">Terapkan & mulai pengamatan</button></section></div>`;
  $('#obsName').oninput=e=>{draft.name=e.target.value;stashDraft();};
  $('#obsParameters').oninput=e=>{draft.parametersText=e.target.value;stashDraft();};
  $('#obsApplyParameters').onclick=()=>{try{applyParameterDraft();stashDraft();renderOrder();}catch(e){error(e.message);}};
  $('#obsUnits').oninput=e=>{
    const row=e.target.closest('[data-unit]'),field=e.target.dataset.field;if(!row||!field)return;
    draft.units[Number(row.dataset.unit)][field]=field==='count'?Number(e.target.value):e.target.value;stashDraft();preview();
  };
  $('#obsUnits').onclick=e=>{
    const b=e.target.closest('[data-remove-unit]');if(!b)return;
    const index=Number(b.dataset.removeUnit),unit=draft.units[index];
    if(Object.keys(plan.values).some(k=>JSON.parse(k)[0]===unit.id)){error('Unit sudah memiliki data. Unit tidak dihapus agar data tetap utuh.');return;}
    draft.units.splice(index,1);stashDraft();renderSetup();
  };
  $('#obsAddUnit').onclick=()=>{draft.units.push({id:uid(),code:'',block:'',treatment:'',count:draft.units.at(-1)?.count||5,kind:draft.units.at(-1)?.kind||'buah'});stashDraft();renderSetup();};
  $('#obsSourceDataset').onchange=e=>{draft.sourceDataset=e.target.value;stashDraft();$('#obsUnitMapping').replaceChildren();};
  $('#obsImportUnits').onclick=()=>void showUnitMapping();
  $('#obsOrderMode').onchange=e=>{
    if(e.target.value==='manual'&&!draft.manualOrder){try{draft.manualOrder=templateSteps(draft).map(s=>`${draft.parameters.find(p=>p.id===s.parameterId).code}-${s.sample}`).join(', ');}catch{}}
    draft.orderMode=e.target.value;stashDraft();renderOrder();
  };
  $('#obsStart').onclick=async()=>{
    try{
      applyParameterDraft();
      draft.name=draft.name.trim();draft.units=draft.units.map(u=>({...u,code:u.code.trim(),block:u.block.trim(),treatment:u.treatment.trim()}));
      const nextQueue=observationQueue(draft),keys=new Set(nextQueue.map(s=>s.key));
      if(Object.keys(plan.values).some(k=>!keys.has(k))||Object.keys(plan.drafts||{}).some(k=>!keys.has(k)))throw Error('Perubahan akan menghilangkan sampel/parameter yang sudah diisi. Pertahankan jumlah dan kode, atau buat pengamatan baru.');
      const previousKey=queue[plan.cursor||0]?.key;
      const {parametersText,...config}=draft;
      Object.assign(plan,config,{configured:true,configDraft:undefined,cursor:Math.max(0,nextQueue.findIndex(s=>s.key===previousKey))});
      if(await persist())render('observe');
    }catch(e){error(e.message);}
  };
  renderOrder();
}
function applyParameterDraft(){
  if(draft.parametersText===undefined)return;
  const next=parseParameters(draft.parametersText,draft.parameters);
  const ids=new Set(next.map(p=>p.id));
  draft.groups=draft.groups.map(g=>({...g,parameterIds:g.parameterIds.filter(id=>ids.has(id))}));
  draft.parameters=next;delete draft.parametersText;
}
function renderOrder(){
  $('#obsOrderEditor').innerHTML=draft.orderMode==='manual'?`<label>Urutan kode-sampel<textarea id="obsManual" rows="8" placeholder="bb-1, bb-2, pb-1, tb-1, pb-2, tb-2">${esc(draft.manualOrder||'')}</textarea></label><p class="obs-help">Pisahkan dengan koma. Untuk bb-p1 sampel 1, tulis bb-p1-1. Lengkapi sampai jumlah sampel terbesar.</p>`:`<div class="obs-groups">${draft.groups.map((g,i)=>`<section class="obs-group"><div class="obs-group-head"><strong>Kelompok ${i+1}</strong><button type="button" data-move="${i}" data-delta="-1" ${i===0?'disabled':''} aria-label="Naikkan kelompok ${i+1}">↑</button><button type="button" data-move="${i}" data-delta="1" ${i===draft.groups.length-1?'disabled':''} aria-label="Turunkan kelompok ${i+1}">↓</button><button type="button" data-delete-group="${i}" aria-label="Hapus kelompok ${i+1}">×</button></div><label>Pola<select data-mode="${i}"><option value="parameter" ${g.mode==='parameter'?'selected':''}>Per parameter → semua sampel</option><option value="sample" ${g.mode==='sample'?'selected':''}>Per sampel → semua parameter terpilih</option></select></label><div class="obs-checks">${draft.parameters.map(p=>`<label><input type="checkbox" data-group="${i}" value="${esc(p.id)}" ${g.parameterIds.includes(p.id)?'checked':''}>${esc(p.code)}</label>`).join('')}</div><small>Urutan: ${esc(g.parameterIds.map(id=>draft.parameters.find(p=>p.id===id)?.code).join(' → '))||'Pilih parameter sesuai urutan yang diinginkan'}</small></section>`).join('')}</div><button type="button" id="obsAddGroup">+ Kelompok</button>`;
  if($('#obsManual'))$('#obsManual').oninput=e=>{draft.manualOrder=e.target.value;stashDraft();preview();};
  $('#obsAddGroup')?.addEventListener('click',()=>{draft.groups.push({id:uid(),mode:'sample',parameterIds:[]});stashDraft();renderOrder();});
  root.querySelectorAll('[data-group]').forEach(input=>input.onchange=()=>{
    const g=draft.groups[Number(input.dataset.group)];
    g.parameterIds=input.checked?[...g.parameterIds,input.value]:g.parameterIds.filter(id=>id!==input.value);
    stashDraft();renderOrder();
  });
  root.querySelectorAll('[data-mode]').forEach(input=>input.onchange=()=>{draft.groups[Number(input.dataset.mode)].mode=input.value;stashDraft();preview();});
  root.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.move),j=i+Number(b.dataset.delta);[draft.groups[i],draft.groups[j]]=[draft.groups[j],draft.groups[i]];stashDraft();renderOrder();});
  root.querySelectorAll('[data-delete-group]').forEach(b=>b.onclick=()=>{draft.groups.splice(Number(b.dataset.deleteGroup),1);stashDraft();renderOrder();});
  preview();
}
function preview(){
  try{
    const steps=templateSteps(draft),max=Math.max(...draft.units.map(u=>u.count));
    $('#obsSequence').textContent=steps.slice(0,120).map(s=>`${draft.parameters.find(p=>p.id===s.parameterId).code}-${s.sample}`).join(' → ')+(steps.length>120?' …':'')+` · ${steps.length} langkah untuk ${max} sampel`;
    $('#obsSequence').classList.remove('obs-invalid');
  }catch(e){$('#obsSequence').textContent=e.message;$('#obsSequence').classList.add('obs-invalid');}
}
async function showUnitMapping(){
  try{
    if(!draft.sourceDataset)throw Error('Pilih dataset sumber di atas sebelum mengambil unit.');
    const requested=draft.sourceDataset;
    const data=await globalThis.StatisticalWebData?.readDataset?.(requested);
    if(view!=='setup'||draft.sourceDataset!==requested)return;
    if(!data?.headers?.length)throw Error('Dataset terpilih belum memiliki kolom.');
    error('');
  const options='<option value="">Tidak dipilih</option>'+data.headers.map((h,i)=>`<option value="${i}">${esc(h)}</option>`).join('');
  $('#obsUnitMapping').innerHTML=`<div class="obs-mapping"><p>${esc(data.name)} — pilih kolom identitas. Baris dengan unit yang sama digabung menjadi satu unit.</p><label>Kode unit (opsional jika ulangan & perlakuan dipilih)<select id="obsMapUnit">${options}</select></label><label>Ulangan<select id="obsMapBlock">${options}</select></label><label>Perlakuan / genotipe<select id="obsMapTreatment">${options}</select></label><label>Jumlah sampel awal<input id="obsMapCount" type="number" value="5" min="1" max="500"></label><button type="button" id="obsMapApply">Tambahkan unit</button></div>`;
  for(const [id,re] of [['obsMapUnit',/^(unit|unit percobaan|plot)$/i],['obsMapBlock',/^(ulangan|rep|replication|block|blok)$/i],['obsMapTreatment',/^(perlakuan|genotipe|treatment|genotype)$/i]]){
    const index=data.headers.findIndex(h=>re.test(h));if(index>=0)$('#'+id).value=String(index);
  }
  $('#obsMapApply').onclick=()=>{
    try{
      const unitCol=$('#obsMapUnit').value,blockCol=$('#obsMapBlock').value,treatmentCol=$('#obsMapTreatment').value,count=Number($('#obsMapCount').value);
      if(unitCol===''&&(blockCol===''||treatmentCol===''))throw Error('Pilih kode unit, atau pasangan ulangan dan perlakuan.');
      if(!Number.isInteger(count)||count<1||count>500)throw Error('Jumlah sampel harus 1–500.');
      const starterOnly=!plan.configured&&!Object.keys(plan.values).length&&draft.units.length===1&&draft.units[0].code==='U1G1'&&draft.units[0].block==='1'&&draft.units[0].treatment==='G1';
      const existingUnits=starterOnly?[]:draft.units;
      const units=new Map();
      for(const row of data.rows){
        const block=blockCol===''?'':String(row[blockCol]??'').trim(),treatment=treatmentCol===''?'':String(row[treatmentCol]??'').trim();
        const code=unitCol!==''?String(row[unitCol]??'').trim():(block&&treatment?`${/^U/i.test(block)?block:'U'+block}${/^[a-z]/i.test(treatment)?treatment:'G'+treatment}`:'');
        if(!code)continue;
        const existing=units.get(code.toLowerCase())||existingUnits.find(u=>u.code.toLowerCase()===code.toLowerCase());
        if(existing&&(existing.block!==block||existing.treatment!==treatment))throw Error(`Identitas ${code} memiliki ulangan/perlakuan berbeda. Periksa pemetaan.`);
        if(!existing)units.set(code.toLowerCase(),{id:uid(),code,block,treatment,count,kind:'buah'});
      }
      if(!units.size)throw Error('Tidak ada unit baru. Periksa kolom atau unit yang sudah ada.');
      if(starterOnly)draft.units=[];
      draft.units.push(...units.values());stashDraft();renderSetup();
    }catch(e){error(e.message);}
  };
  }catch(e){error(e.message);}
}
function current(){const step=queue[cursor];return {...step,unit:plan.units.find(u=>u.id===step.unitId),parameter:plan.parameters.find(p=>p.id===step.parameterId)};}
function commitInput(){
  if(view!=='observe'||!queue.length||!$('#obsValue'))return true;
  const s=current(),raw=$('#obsValue').value,note=$('#obsNote').value;
  try{
    const value=parseObservationNumber(raw),old=plan.values[s.key];
    if(value===null&&old?.status==='missing'){
      if(old.note!==note)applyObservationChange(plan,s.key,{...old,note,updatedAt:new Date().toISOString()});
    }else if(value===null){applyObservationChange(plan,s.key,null);}
    else if(old?.value!==value||old?.note!==note||old?.status!=='measured')applyObservationChange(plan,s.key,{value,note,status:'measured',updatedAt:new Date().toISOString()});
    delete plan.drafts[s.key];$('#obsValue').removeAttribute('aria-invalid');return true;
  }catch(e){
    plan.drafts[s.key]={raw,note};applyObservationChange(plan,s.key,null);$('#obsValue').setAttribute('aria-invalid','true');error(e.message);return false;
  }
}
function renderEntry(){
  const s=current(),entry=plan.values[s.key],storedDraft=plan.drafts[s.key];
  const done=queue.filter(q=>plan.values[q.key]).length;
  $('#obsBody').innerHTML=`<div class="obs-entry-layout"><section class="obs-card obs-entry"><div class="obs-entry-top"><label>Unit<select id="obsJumpUnit">${plan.units.map(u=>`<option value="${esc(u.id)}" ${u.id===s.unitId?'selected':''}>${esc(u.code)} · ${u.count} sampel</option>`).join('')}</select></label><span id="obsProgress">${done}/${queue.length} ditangani</span></div><progress id="obsProgressBar" value="${done}" max="${queue.length}"></progress><p class="obs-eyebrow">${esc(s.unit.kind)} · Ulangan ${esc(s.unit.block)||'—'} · ${esc(s.unit.treatment)||'—'}</p><h2 class="obs-sample">${esc(s.unit.code)}(${s.sample})</h2><label class="obs-value-label" for="obsValue">${esc(s.parameter.name)} <span>${esc(s.parameter.code)}${s.parameter.unit?' · '+esc(s.parameter.unit):''}</span></label><input id="obsValue" inputmode="decimal" autocomplete="off" value="${esc(storedDraft?.raw??(entry?.status==='measured'?entry.value:''))}" placeholder="Isi nilai"><p id="obsEntryStatus" class="obs-help">${entry?.status==='missing'?'Ditandai tidak tersedia':entry?'Nilai tersimpan':'Belum diisi'} · langkah ${cursor+1}/${queue.length}</p><label>Catatan (opsional)<input id="obsNote" value="${esc(storedDraft?.note??entry?.note??'')}" maxlength="300"></label><div class="obs-actions obs-entry-actions"><button type="button" id="obsPrevious" ${cursor===0?'disabled':''}>← Sebelumnya</button><button type="button" id="obsNext" class="primary">${cursor===queue.length-1?'Selesai →':'Berikutnya →'}</button></div><div class="obs-actions"><button type="button" id="obsMissing">Tidak tersedia</button><button type="button" id="obsClearValue">Kosongkan nilai</button><button type="button" id="obsUndo" ${plan.undo.length?'':'disabled'}>Urungkan</button><button type="button" id="obsRedo" ${plan.redo.length?'':'disabled'}>Ulangi</button></div><p class="obs-help">Enter: simpan dan lanjut. Nilai kosong tidak dianggap nol. Data disimpan otomatis di perangkat.</p></section><section class="obs-card"><h2>Urutan unit ini</h2><div class="obs-step-list">${queue.map((q,i)=>({...q,index:i})).filter(q=>q.unitId===s.unitId).map(q=>{const p=plan.parameters.find(p=>p.id===q.parameterId),v=plan.values[q.key];return `<button type="button" data-step="${q.index}" ${q.index===cursor?'aria-current="step"':''}><span>${esc(p.code)}-${q.sample}</span><b>${v?.status==='measured'?esc(v.value):v?.status==='missing'?'Tidak tersedia':'—'}</b></button>`;}).join('')}</div></section></div>`;
  const scheduleInput=()=>{
    clearTimeout(timer);timer=null;plan.drafts[s.key]={raw:$('#obsValue').value,note:$('#obsNote').value};status('Menyimpan…');
    timer=setTimeout(()=>{commitInput();void persist();updateProgress();},300);
  };
  $('#obsValue').oninput=scheduleInput;$('#obsNote').oninput=scheduleInput;
  $('#obsValue').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#obsNext').click();}};
  $('#obsNext').onclick=async()=>{
    if(!commitInput()){await persist();return;}
    if(!plan.values[s.key]){error('Isi angka atau pilih Tidak tersedia sebelum melanjutkan.');$('#obsValue').focus();return;}
    if(!await persist())return;
    if(cursor===queue.length-1){render('summary');return;}
    await jump(cursor+1);
  };
  $('#obsPrevious').onclick=()=>jump(cursor-1);
  $('#obsJumpUnit').onchange=e=>jump(queue.findIndex(q=>q.unitId===e.target.value));
  root.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>jump(Number(b.dataset.step)));
  $('#obsMissing').onclick=async()=>{
    clearTimeout(timer);timer=null;delete plan.drafts[s.key];applyObservationChange(plan,s.key,{value:null,status:'missing',note:$('#obsNote').value,updatedAt:new Date().toISOString()});
    if(await persist()){if(cursor<queue.length-1){cursor++;plan.cursor=cursor;await persist();renderEntry();}else render('summary');}
  };
  $('#obsClearValue').onclick=async()=>{clearTimeout(timer);timer=null;delete plan.drafts[s.key];applyObservationChange(plan,s.key,null);await persist();renderEntry();};
  for(const direction of ['Undo','Redo'])$('#obs'+direction).onclick=async()=>{
    clearTimeout(timer);timer=null;commitInput();travelObservationHistory(plan,direction.toLowerCase());await persist();renderEntry();
  };
  // Prevent repeated taps from advancing or mutating a different sample during an IDB write.
  for(const node of $('#obsBody').querySelectorAll('button,select')){
    const property=node.tagName==='SELECT'?'onchange':'onclick',handler=node[property];if(!handler)continue;
    node[property]=async event=>{
      if(navigationBusy)return;
      navigationBusy=true;const disabled=node.disabled;node.disabled=true;
      try{await handler(event);}finally{navigationBusy=false;if(node.isConnected)node.disabled=disabled;}
    };
  }
}
function updateProgress(){
  if(view!=='observe')return;const done=queue.filter(q=>plan.values[q.key]).length;
  $('#obsProgress').textContent=`${done}/${queue.length} ditangani`;$('#obsProgressBar').value=done;
  $('#obsUndo').disabled=!plan.undo.length;$('#obsRedo').disabled=!plan.redo.length;
  const s=current(),v=plan.values[s.key],b=root.querySelector(`[data-step="${cursor}"] b`);
  if(b)b.textContent=v?.status==='measured'?String(v.value):v?.status==='missing'?'Tidak tersedia':'—';
  $('#obsEntryStatus').textContent=(plan.drafts[s.key]?'Angka belum valid':v?.status==='missing'?'Tidak tersedia':v?'Nilai tercatat':'Belum diisi')+` · langkah ${cursor+1}/${queue.length}`;
}
async function jump(index){
  if(index<0||index>=queue.length)return;
  if(!commitInput()){await persist();return;}
  if(!await persist())return;
  cursor=index;plan.cursor=index;await persist();error('');renderEntry();$('#obsValue').focus();$('#obsValue').select();
}
function renderSummary(){
  const rows=observationSummary(plan),pending=rows.reduce((sum,r)=>sum+r.pending,0),missing=rows.reduce((sum,r)=>sum+r.missing,0);
  const number=value=>value===null?'—':Number(value.toPrecision(10)).toLocaleString('id-ID',{maximumFractionDigits:8});
  $('#obsBody').innerHTML=`<section class="obs-card"><h2>${esc(plan.name)} — Rekap per unit</h2><p>${pending} isian belum selesai · ${missing} ditandai tidak tersedia.</p><p class="obs-help">Rerata/jumlah hanya memakai nilai terisi. Sampel tetap tersimpan sebagai data mentah; sampel bukan ulangan tambahan. Kolom n, hilang, dan belum diisi disertakan pada ekspor.</p><div class="obs-reducers">${plan.parameters.map(p=>`<label>${esc(p.code)}<select data-reducer="${esc(p.id)}"><option value="mean" ${p.reducer!=='sum'?'selected':''}>Rerata</option><option value="sum" ${p.reducer==='sum'?'selected':''}>Jumlah sampel terukur</option></select></label>`).join('')}</div><div class="obs-table-scroll"><table><thead><tr><th>Unit</th><th>Parameter</th><th>n / rencana</th><th>Rerata</th><th>Jumlah</th><th>Hilang</th><th>Belum diisi</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.unit.code)}</td><td>${esc(r.parameter.code)} ${esc(r.parameter.unit)}</td><td>${r.n}/${r.expected}</td><td>${number(r.mean)}</td><td>${number(r.sum)}</td><td>${r.missing}</td><td>${r.pending}</td></tr>`).join('')}</tbody></table></div><div class="obs-actions"><button type="button" id="obsRawCsv">Unduh data sampel CSV</button><button type="button" id="obsRecapCsv">Unduh rekap CSV</button><button type="button" class="primary" id="obsToDataset">Buat dataset rekap di Stat</button><button type="button" id="obsResume">Lanjut isian kosong</button></div><p id="obsExportMessage" role="status"></p></section>`;
  root.querySelectorAll('[data-reducer]').forEach(select=>select.onchange=()=>{plan.parameters.find(p=>p.id===select.dataset.reducer).reducer=select.value;debounceSave();});
  $('#obsRawCsv').onclick=()=>download(plan.name+'-sampel.csv',tableCsv(rawObservationTable(plan)));
  $('#obsRecapCsv').onclick=()=>download(plan.name+'-rekap.csv',tableCsv(recapObservationTable(plan)));
  $('#obsResume').onclick=()=>{queue=observationQueue(plan);plan.cursor=Math.max(0,queue.findIndex(q=>!plan.values[q.key]));render('observe');};
  $('#obsToDataset').onclick=async()=>{
    if(!await persist())return;
    const detail={...recapObservationTable(plan),name:plan.name+' — rekap',source:'observation',treatment:'Rekap sampel per unit; periksa n dan data hilang sebelum analisis.'};
    document.dispatchEvent(new CustomEvent('dataset-import',{detail}));
    $('#obsExportMessage').textContent=detail.importResult?.ok?`Dataset baru “${detail.importResult.name}” dibuat. Data lama tidak ditimpa. Pilih kolom parameter hasil untuk analisis, bukan kolom jumlah sampel (n).`:(detail.importResult?.error||'Dataset tidak dapat dibuat. Gunakan unduhan CSV.');
  };
}
async function close(){
  if(navigationBusy)return;
  if(view==='observe')commitInput();
  if(!await persist())return;
  root.hidden=true;document.body.classList.remove('observation-open');returnFocus?.focus();return true;
}
export async function openObservations(){
  if(!root){root=document.createElement('section');root.id='observationWorkspace';root.hidden=true;root.setAttribute('aria-label','Pengamatan lapang');document.body.append(root);shell();}
  if(!root.hidden){await close();return;}
  returnFocus=document.activeElement;
  document.dispatchEvent(new CustomEvent('stat-close-floating',{detail:{except:'observations'}}));
  globalThis.AgrotikFieldLayout?.close?.();
  document.querySelector('#scientificModal')?.classList.remove('open');document.querySelector('#analysisResultDock')?.setAttribute('hidden','');
  document.body.classList.remove('analysis-results-open','analysis-mode-active');
  root.hidden=false;document.body.classList.add('observation-open');render(plan?.configured?'observe':'list');$('#obsClose').focus();
}
export function installObservationWorkflow(){
  if(document.getElementById('observationTab'))return;
  const nav=document.querySelector('.nav-primary')||document.querySelector('.nav');if(!nav)return;
  const make=(id,label)=>{const b=document.createElement('button');b.id=id;b.type='button';b.textContent=label;b.className='nav-tab';b.onclick=()=>void openObservations();return b;};
  const datasetTab=document.createElement('button');
  datasetTab.id='datasetNavTab';datasetTab.type='button';datasetTab.className='nav-tab';datasetTab.textContent='Dataset';
  datasetTab.onclick=()=>document.getElementById('projectToggle')?.click();
  nav.append(datasetTab);
  nav.append(make('observationTab','Pengamatan'));
  document.querySelector('#dataMenu')?.prepend(make('observationMenu','Pengamatan sampel'));
  const entry=make('observationQuick','Pengamatan');entry.title='Susun dan isi pengamatan sampel';document.querySelector('.sheet-header')?.append(entry);
  window.addEventListener('beforeunload',event=>{if(saveError||timer){event.preventDefault();event.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&plan){if(view==='observe')commitInput();void persist();}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&root&&!root.hidden){event.preventDefault();void close();}});
  globalThis.AgrotikObservations={open:openObservations};
}
