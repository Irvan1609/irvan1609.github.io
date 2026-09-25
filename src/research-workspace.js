import {saveLocalSnapshot,listLocalSnapshots,getLocalSnapshot} from './local-dataset-store.js';
import {parseNumber} from './number-format.js';

const PROJECTS_KEY='agrotik_research_projects_v1';
const ACTIVE_PROJECT_KEY='agrotik_active_research_project_v1';
const FIELD_MODE_KEY='agrotik_field_mode_v1';
const MAX_TRACE=240;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||('p-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
const now=()=>new Date().toISOString();
const activeDataset=()=>globalThis.StatisticalWebData?.readActiveDataset?.()||null;
const cleanFileName=value=>String(value||'dataset.csv').trim().replace(/\.(?:txt)$/i,'.csv');

function readJson(key,fallback){
  try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback;}catch{return fallback;}
}
function writeJson(key,value){localStorage.setItem(key,JSON.stringify(value));return value;}
function normalizeProject(project){
  return {
    id:String(project?.id||uid()),
    name:String(project?.name||'Proyek penelitian').trim().slice(0,100)||'Proyek penelitian',
    createdAt:String(project?.createdAt||now()),
    updatedAt:String(project?.updatedAt||now()),
    datasets:Array.isArray(project?.datasets)?[...new Set(project.datasets.map(cleanFileName))]:[],
    metadata:{
      crop:String(project?.metadata?.crop||'').slice(0,100),
      location:String(project?.metadata?.location||'').slice(0,140),
      season:String(project?.metadata?.season||'').slice(0,100),
      design:String(project?.metadata?.design||'').slice(0,120),
      objective:String(project?.metadata?.objective||'').slice(0,500)
    },
    recipes:Array.isArray(project?.recipes)?project.recipes.slice(0,60):[],
    trace:Array.isArray(project?.trace)?project.trace.slice(0,MAX_TRACE):[]
  };
}
function projects(){return readJson(PROJECTS_KEY,[]).map(normalizeProject);}
function saveProjects(items){return writeJson(PROJECTS_KEY,items.map(normalizeProject));}
function activeProjectId(){return localStorage.getItem(ACTIVE_PROJECT_KEY)||'';}
function setActiveProjectId(id){if(id)localStorage.setItem(ACTIVE_PROJECT_KEY,id);else localStorage.removeItem(ACTIVE_PROJECT_KEY);}
function currentProject(){const items=projects();return items.find(item=>item.id===activeProjectId())||items[0]||null;}
function updateProject(id,updater){
  const items=projects(),index=items.findIndex(item=>item.id===id);
  if(index<0)return null;
  const next=normalizeProject(updater({...items[index],metadata:{...items[index].metadata},datasets:[...items[index].datasets],recipes:[...items[index].recipes],trace:[...items[index].trace]}));
  next.updatedAt=now();items[index]=next;saveProjects(items);return next;
}
function addTrace(projectId,type,label,dataset='',details={}){
  return updateProject(projectId,project=>{project.trace=[{id:uid(),date:now(),type,label:String(label||type),dataset:String(dataset||''),details},...project.trace].slice(0,MAX_TRACE);return project;});
}
function attachDataset(projectId,fileName){
  const file=cleanFileName(fileName);return updateProject(projectId,project=>{if(!project.datasets.includes(file))project.datasets.push(file);return project;});
}

function valuesByColumn(dataset,index){
  return (dataset.rows||[]).map(row=>String(row[index]??'').trim()).filter(Boolean);
}
function numericShare(values){
  if(!values.length)return 0;
  return values.filter(value=>Number.isFinite(parseNumber(value))).length/values.length;
}
export function inspectDatasetForResearch(dataset){
  const headers=Array.isArray(dataset?.headers)?dataset.headers:[],rows=Array.isArray(dataset?.rows)?dataset.rows:[];
  const findings=[];let blankRows=0,blankCells=0;
  const signatures=new Map();let duplicateRows=0;
  rows.forEach((row,index)=>{
    const normalized=headers.map((_,i)=>String(row?.[i]??'').trim());
    if(normalized.every(value=>!value)){blankRows++;return;}
    blankCells+=normalized.filter(value=>!value).length;
    const signature=JSON.stringify(normalized);
    if(signatures.has(signature))duplicateRows++;else signatures.set(signature,index);
  });
  const columns=headers.map((name,index)=>{
    const values=valuesByColumn({rows},index),share=numericShare(values),kind=share>=.8?'numeric':share<=.2?'categorical':'mixed';
    if(kind==='mixed')findings.push({level:'warn',message:`${name}: campuran nilai numerik dan teks; periksa tipe data.`});
    return {index,name:String(name||`Kolom ${index+1}`),kind,n:values.length,numericShare:share,unique:new Set(values).size};
  });
  if(!headers.length)findings.push({level:'error',message:'Dataset belum mempunyai kolom.'});
  if(!rows.length)findings.push({level:'error',message:'Dataset belum mempunyai baris pengamatan.'});
  if(blankRows)findings.push({level:'info',message:`${blankRows} baris kosong terdeteksi.`});
  if(blankCells)findings.push({level:'warn',message:`${blankCells} sel kosong terdeteksi pada baris yang berisi data.`});
  if(duplicateRows)findings.push({level:'warn',message:`${duplicateRows} baris identik terdeteksi; pastikan bukan duplikasi unit percobaan.`});
  const duplicatedHeaders=headers.filter((name,index)=>headers.findIndex(other=>String(other).toLowerCase()===String(name).toLowerCase())!==index);
  if(duplicatedHeaders.length)findings.push({level:'error',message:'Nama kolom duplikat terdeteksi.'});
  const errors=findings.filter(item=>item.level==='error').length,warnings=findings.filter(item=>item.level==='warn').length;
  return {rows:rows.length,columns:headers.length,blankRows,blankCells,duplicateRows,columnProfiles:columns,findings,errors,warnings,status:errors?'Perlu diperbaiki':warnings?'Perlu diperiksa':'Baik'};
}

export function inferAnalysisSuggestions(dataset){
  const audit=inspectDatasetForResearch(dataset),headers=(dataset?.headers||[]).map(String);
  const numeric=audit.columnProfiles.filter(column=>column.kind==='numeric'),categorical=audit.columnProfiles.filter(column=>column.kind==='categorical');
  const replicate=categorical.find(column=>/(ulangan|rep(?:licate|lication)?|kelompok|blok|block)/i.test(column.name))
    || audit.columnProfiles.find(column=>/(ulangan|rep(?:licate|lication)?|kelompok|blok|block)/i.test(column.name));
  const factorCandidates=categorical.filter(column=>column!==replicate&&column.unique>=2&&column.unique<=30);
  const suggestions=[];
  if(factorCandidates.length>=2&&replicate)suggestions.push({key:'frak',label:'Faktorial RAK',reason:'Terdeteksi ≥2 faktor kategorik dan kolom blok/ulangan.'});
  else if(factorCandidates.length>=2)suggestions.push({key:'fral',label:'Faktorial RAL',reason:'Terdeteksi ≥2 faktor kategorik tanpa indikator blok yang jelas.'});
  else if(factorCandidates.length&&replicate)suggestions.push({key:'rak',label:'RAK',reason:'Terdeteksi faktor perlakuan dan kolom blok/ulangan.'});
  else if(factorCandidates.length)suggestions.push({key:'ral',label:'RAL',reason:'Terdeteksi satu faktor kategorik dan parameter respons.'});
  if(numeric.length>=2)suggestions.push({key:'correlation',label:'Korelasi / regresi',reason:'Terdapat sedikitnya dua kolom numerik.'});
  if(headers.some(name=>/(lokasi|environment|lingkungan)/i.test(name))&&headers.some(name=>/(genotip|genotype|varietas|variety)/i.test(name)))suggestions.push({key:'combined',label:'ANOVA gabungan / multilokasi',reason:'Nama kolom menunjukkan struktur genotipe × lingkungan.'});
  return suggestions.slice(0,4);
}

export function computeProjectCompleteness(project,datasetAudit,{snapshotCount=0}={}){
  const p=normalizeProject(project||{});let score=0;
  if(p.datasets.length)score+=20;
  if(p.metadata.crop)score+=10;
  if(p.metadata.location)score+=10;
  if(p.metadata.design)score+=10;
  if(p.metadata.objective)score+=10;
  if(datasetAudit?.rows>0&&datasetAudit?.columns>1)score+=10;
  if(datasetAudit&&!datasetAudit.errors)score+=10;
  if(p.recipes.length)score+=10;
  if(snapshotCount)score+=5;
  if(p.trace.some(item=>item.type==='analysis'))score+=5;
  return Math.min(100,score);
}

function parseCsv(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<String(text||'').length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"')quoted=false;
      else cell+=ch;
    }else if(ch==='"')quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
    else if(ch!=='\r')cell+=ch;
  }
  if(cell.length||row.length){row.push(cell);rows.push(row);}
  return rows;
}
function importDatasetPayload(name,csv,metadata={}){
  const rows=parseCsv(csv);if(rows.length<2)throw Error(`${name}: isi dataset tidak valid.`);
  const detail={name:String(name||'dataset').replace(/\.csv$/i,''),headers:rows[0],rows:rows.slice(1),plant:metadata.plant||'',treatment:metadata.treatment||''};
  document.dispatchEvent(new CustomEvent('dataset-import',{detail}));
  if(!detail.importResult?.ok)throw Error(detail.importResult?.error||`${name}: impor gagal.`);
  return detail.importResult.name;
}
function download(name,text,type='application/json'){
  const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function safeName(value){return String(value||'proyek').trim().replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,70)||'proyek';}
function formatDate(value){try{return new Date(value).toLocaleString('id-ID');}catch{return String(value||'');}}
function activeProjectOrCreate(){
  let project=currentProject();if(project){setActiveProjectId(project.id);return project;}
  project=normalizeProject({name:'Proyek penelitian',datasets:[]});saveProjects([project]);setActiveProjectId(project.id);return project;
}
function recipeSignature(detail){
  return JSON.stringify([detail.dataset,detail.design,detail.options?.a,detail.options?.b,detail.options?.rep,detail.options?.parameters,detail.options?.transforms,detail.options?.alpha,detail.options?.posthoc,detail.options?.assumptions,detail.options?.contrastMode]);
}
function saveAnalysisEvent(detail){
  const project=currentProject();if(!project||!detail?.dataset)return;
  const file=cleanFileName(detail.fileName||detail.dataset),signature=recipeSignature(detail);
  updateProject(project.id,item=>{
    if(!item.datasets.includes(file))item.datasets.push(file);
    const recipe={id:uid(),signature,date:now(),name:`${detail.designLabel||detail.design} · ${String(detail.dataset).replace(/\.csv$/i,'')}`,dataset:file,design:detail.design,options:detail.options,summary:detail.summary||[]};
    item.recipes=[recipe,...item.recipes.filter(existing=>existing.signature!==signature)].slice(0,60);
    item.trace=[{id:uid(),date:now(),type:'analysis',label:`Analisis ${detail.designLabel||detail.design}`,dataset:file,details:{parameters:detail.summary?.length||0}},...item.trace].slice(0,MAX_TRACE);
    return item;
  });
  refreshUi();
}

let modal=null,strip=null;
function projectOptions(items,active){
  return items.map(item=>`<option value="${esc(item.id)}" ${item.id===active?'selected':''}>${esc(item.name)}</option>`).join('');
}
async function renderWorkspace(){
  if(!modal)return;
  const dataset=activeDataset(),audit=inspectDatasetForResearch(dataset||{}),items=projects(),project=activeProjectOrCreate();
  const snapshots=dataset?.fileName?await listLocalSnapshots(dataset.fileName,20).catch(()=>[]):[],score=computeProjectCompleteness(project,audit,{snapshotCount:snapshots.length});
  const suggestions=inferAnalysisSuggestions(dataset||{});
  modal.querySelector('[data-project-select]').innerHTML=projectOptions(items,project.id);
  modal.querySelector('[data-project-name]').value=project.name;
  for(const key of ['crop','location','season','design','objective'])modal.querySelector(`[data-project-meta="${key}"]`).value=project.metadata[key]||'';
  modal.querySelector('[data-project-score]').textContent=`${score}%`;
  modal.querySelector('[data-project-dataset-count]').textContent=`${project.datasets.length} dataset`;
  modal.querySelector('[data-project-current]').textContent=dataset?.name||'Tidak ada dataset aktif';
  modal.querySelector('[data-project-membership]').textContent=dataset?.fileName&&project.datasets.includes(dataset.fileName)?'Dataset aktif sudah masuk proyek':'Dataset aktif belum masuk proyek';
  modal.querySelector('[data-inspector]').innerHTML=`<div class="research-status ${audit.errors?'bad':audit.warnings?'warn':'good'}"><b>${esc(audit.status)}</b><span>${audit.rows} baris × ${audit.columns} kolom</span></div>${audit.findings.length?`<ul>${audit.findings.map(item=>`<li class="${item.level}">${esc(item.message)}</li>`).join('')}</ul>`:'<p>Tidak ditemukan masalah data dasar.</p>'}`;
  modal.querySelector('[data-guidance]').innerHTML=suggestions.length?suggestions.map(item=>`<button type="button" data-analysis-suggestion="${esc(item.key)}"><b>${esc(item.label)}</b><span>${esc(item.reason)}</span></button>`).join(''):'<p>Belum cukup struktur data untuk memberi saran deterministik.</p>';
  modal.querySelector('[data-recipes]').innerHTML=project.recipes.length?project.recipes.map(recipe=>`<div class="research-list-row"><div><b>${esc(recipe.name)}</b><small>${esc(recipe.dataset)} · ${formatDate(recipe.date)}</small></div><button type="button" data-run-recipe="${esc(recipe.id)}">Jalankan ulang</button></div>`).join(''):'<p>Recipe akan tersimpan otomatis setelah analisis dijalankan.</p>';
  modal.querySelector('[data-snapshots]').innerHTML=snapshots.length?snapshots.map(item=>`<div class="research-list-row"><div><b>${esc(item.reason||'Snapshot')}</b><small>${formatDate(item.date)}</small></div><button type="button" data-restore-snapshot="${esc(item.id)}">Buka salinan</button></div>`).join(''):'<p>Belum ada snapshot manual untuk dataset aktif.</p>';
  modal.querySelector('[data-trace]').innerHTML=project.trace.length?project.trace.slice(0,40).map(item=>`<div class="research-trace-row"><time>${formatDate(item.date)}</time><span><b>${esc(item.label)}</b>${item.dataset?` · ${esc(item.dataset)}`:''}</span></div>`).join(''):'<p>Belum ada jejak analisis proyek.</p>';
  refreshStrip(project,score);
}
function refreshStrip(project=currentProject(),score=null){
  if(!strip)return;
  const dataset=activeDataset(),p=project;
  strip.querySelector('[data-strip-name]').textContent=p?.name||'Belum ada proyek';
  strip.querySelector('[data-strip-meta]').textContent=p?`${p.datasets.length} dataset${score===null?'':` · ${score}%`}`:(dataset?'Kelola penelitian':'Buat proyek');
}
function refreshUi(){refreshStrip();if(modal?.classList.contains('open'))void renderWorkspace();}

async function exportProject(){
  const project=currentProject();if(!project)return;
  const payload={format:'agrotik-project',version:1,exportedAt:now(),project,datasets:[]};
  for(const fileName of project.datasets){
    const csv=await globalThis.StatisticalWebData?.readDatasetContent?.(fileName);
    if(typeof csv==='string'&&csv.trim())payload.datasets.push({fileName,csv});
  }
  addTrace(project.id,'export','Ekspor proyek .agrotik','',{datasets:payload.datasets.length});
  download(`${safeName(project.name)}.agrotik`,JSON.stringify(payload,null,2),'application/vnd.agrotik+json');
  refreshUi();
}
async function importProject(file){
  const payload=JSON.parse(await file.text());
  if(payload?.format!=='agrotik-project'||payload?.version!==1||!payload?.project||!Array.isArray(payload.datasets))throw Error('File .agrotik tidak dikenali.');
  const imported=[];
  for(const item of payload.datasets){
    if(!item?.csv)continue;
    imported.push(importDatasetPayload(item.fileName,item.csv,item.metadata||{}));
  }
  const project=normalizeProject({...payload.project,id:uid(),name:`${payload.project.name} (impor)`,datasets:imported,createdAt:now(),updatedAt:now(),trace:[]});
  project.trace.unshift({id:uid(),date:now(),type:'import',label:'Impor proyek .agrotik',dataset:'',details:{datasets:imported.length}});
  const items=projects();items.unshift(project);saveProjects(items);setActiveProjectId(project.id);refreshUi();await renderWorkspace();
}
async function createSnapshot(){
  const dataset=activeDataset();if(!dataset?.fileName)throw Error('Tidak ada dataset aktif.');
  const csv=await globalThis.StatisticalWebData?.readDatasetContent?.(dataset.fileName);
  await saveLocalSnapshot(dataset.fileName,{reason:'Snapshot manual',csv,meta:{plant:dataset.plant||'',treatment:dataset.treatment||'',projectId:currentProject()?.id||''}});
  const project=currentProject();if(project)addTrace(project.id,'snapshot','Snapshot dataset',dataset.fileName,{});
  await renderWorkspace();
}
async function restoreSnapshot(id){
  const snapshot=await getLocalSnapshot(id);if(!snapshot?.csv)throw Error('Snapshot tidak dapat dibaca.');
  const restored=importDatasetPayload(`${String(snapshot.dataset||'dataset').replace(/\.csv$/i,'')} snapshot`,snapshot.csv,snapshot.meta||{});
  const project=currentProject();if(project){attachDataset(project.id,restored);addTrace(project.id,'restore','Membuka salinan snapshot',restored,{source:snapshot.dataset});}
  refreshUi();await renderWorkspace();
}
function installModal(){
  if(document.getElementById('researchWorkspaceModal'))return document.getElementById('researchWorkspaceModal');
  const node=document.createElement('div');node.id='researchWorkspaceModal';node.className='modal-backdrop research-workspace-backdrop';
  node.innerHTML=`<div class="modal research-workspace-modal" role="dialog" aria-modal="true" aria-labelledby="researchWorkspaceTitle">
    <div class="modal-head"><div><strong id="researchWorkspaceTitle">Project Workspace</strong><small>Semua metadata, recipe, snapshot, dan jejak di bawah ini disimpan lokal di perangkat.</small></div><button type="button" data-close-workspace aria-label="Tutup">✕</button></div>
    <div class="modal-body research-workspace-body">
      <section class="research-project-hero"><div><label>Proyek<select data-project-select></select></label><label>Nama proyek<input data-project-name maxlength="100"></label></div><div class="research-score"><b data-project-score>0%</b><span>Kelengkapan</span><small data-project-dataset-count>0 dataset</small></div></section>
      <div class="research-action-row"><button type="button" data-new-project>Proyek baru</button><button type="button" data-attach-dataset>Masukkan dataset aktif</button><button type="button" data-snapshot>Snapshot</button><button type="button" data-export-project>Ekspor .agrotik</button><label class="button-like">Impor .agrotik<input data-import-project type="file" accept=".agrotik,application/json" hidden></label><button type="button" data-field-mode aria-pressed="false">Field Mode</button></div>
      <p class="research-current"><b data-project-current>—</b><span data-project-membership></span></p>
      <section class="research-section"><h3>Metadata penelitian</h3><div class="research-meta-grid"><label>Tanaman<input data-project-meta="crop"></label><label>Lokasi<input data-project-meta="location"></label><label>Musim / periode<input data-project-meta="season"></label><label>Rancangan<input data-project-meta="design"></label><label class="wide">Tujuan penelitian<textarea data-project-meta="objective" rows="2"></textarea></label></div></section>
      <section class="research-two-column"><div class="research-section"><h3>Agronomic Data Inspector</h3><div data-inspector></div></div><div class="research-section"><h3>Saran analisis</h3><p class="research-help">Saran berbasis struktur data, bukan AI/cloud.</p><div class="research-guidance" data-guidance></div></div></section>
      <section class="research-two-column"><div class="research-section"><h3>Analysis Recipe</h3><div data-recipes></div></div><div class="research-section"><h3>Snapshot / Time Travel</h3><div data-snapshots></div></div></section>
      <section class="research-section"><h3>Research Trace</h3><div class="research-trace" data-trace></div></section>
    </div>
    <div class="modal-foot"><span class="research-local-note">Local-first · tidak mengirim data proyek ke Cloudflare</span><button type="button" data-close-workspace>Tutup</button></div>
  </div>`;
  document.body.append(node);
  node.querySelectorAll('[data-close-workspace]').forEach(button=>button.onclick=()=>node.classList.remove('open'));
  node.querySelector('[data-project-select]').onchange=event=>{setActiveProjectId(event.target.value);void renderWorkspace();};
  node.querySelector('[data-project-name]').onchange=event=>{const project=currentProject();if(project)updateProject(project.id,item=>{item.name=event.target.value;return item;});refreshUi();};
  node.querySelectorAll('[data-project-meta]').forEach(input=>input.onchange=()=>{const project=currentProject();if(project)updateProject(project.id,item=>{item.metadata[input.dataset.projectMeta]=input.value.trim();return item;});refreshUi();});
  node.querySelector('[data-new-project]').onclick=()=>{const name=prompt('Nama proyek baru:','Proyek penelitian');if(!name?.trim())return;const project=normalizeProject({name:name.trim()});const items=projects();items.unshift(project);saveProjects(items);setActiveProjectId(project.id);void renderWorkspace();};
  node.querySelector('[data-attach-dataset]').onclick=()=>{const dataset=activeDataset(),project=currentProject();if(dataset?.fileName&&project){attachDataset(project.id,dataset.fileName);addTrace(project.id,'dataset','Dataset ditambahkan ke proyek',dataset.fileName,{});void renderWorkspace();}};
  node.querySelector('[data-snapshot]').onclick=()=>void createSnapshot().catch(error=>alert(error.message));
  node.querySelector('[data-export-project]').onclick=()=>void exportProject().catch(error=>alert(error.message));
  node.querySelector('[data-import-project]').onchange=event=>{const file=event.target.files?.[0];event.target.value='';if(file)void importProject(file).catch(error=>alert(error.message));};
  node.querySelector('[data-field-mode]').onclick=()=>{const enabled=!document.documentElement.classList.contains('field-mode');document.documentElement.classList.toggle('field-mode',enabled);localStorage.setItem(FIELD_MODE_KEY,enabled?'1':'0');node.querySelector('[data-field-mode]').setAttribute('aria-pressed',String(enabled));};
  node.onclick=event=>{
    const suggestion=event.target.closest('[data-analysis-suggestion]');
    if(suggestion){node.classList.remove('open');document.dispatchEvent(new CustomEvent('agrotik-open-analysis',{detail:{key:suggestion.dataset.analysisSuggestion}}));return;}
    const recipeButton=event.target.closest('[data-run-recipe]');
    if(recipeButton){const project=currentProject(),recipe=project?.recipes.find(item=>item.id===recipeButton.dataset.runRecipe);if(recipe){node.classList.remove('open');document.dispatchEvent(new CustomEvent('agrotik-run-recipe',{detail:{recipe}}));}return;}
    const restore=event.target.closest('[data-restore-snapshot]');
    if(restore)void restoreSnapshot(restore.dataset.restoreSnapshot).catch(error=>alert(error.message));
  };
  return node;
}
export async function openResearchWorkspace(){
  modal=installModal();modal.classList.add('open');
  const field=document.documentElement.classList.contains('field-mode');modal.querySelector('[data-field-mode]').setAttribute('aria-pressed',String(field));
  await renderWorkspace();
}
function installStrip(){
  const panel=document.getElementById('projectPanel'),title=panel?.querySelector('.panel-title');if(!panel||!title)return null;
  if(panel.querySelector('.research-project-strip'))return panel.querySelector('.research-project-strip');
  const node=document.createElement('button');node.type='button';node.className='research-project-strip';node.innerHTML='<span><b data-strip-name>Belum ada proyek</b><small data-strip-meta>Kelola penelitian</small></span><span aria-hidden="true">›</span>';
  node.onclick=()=>void openResearchWorkspace();title.insertAdjacentElement('afterend',node);return node;
}
export function installResearchWorkspace(){
  document.documentElement.classList.toggle('field-mode',localStorage.getItem(FIELD_MODE_KEY)==='1');
  strip=installStrip();modal=installModal();refreshStrip();
  document.addEventListener('stat-dataset-changed',refreshUi);
  document.addEventListener('agrotik-analysis-complete',event=>saveAnalysisEvent(event.detail||{}));
  window.addEventListener('storage',event=>{if([PROJECTS_KEY,ACTIVE_PROJECT_KEY,FIELD_MODE_KEY].includes(event.key))refreshUi();});
}
