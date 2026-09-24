import {extractDoi,formatApa,formatHarvard,mergeUniqueReferences,normalizeDoi,referenceFromCrossref,toBibtex,toRis} from '../src/reference-core.js';

const KEY='statistical_web_reference_library_v1';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let library=readLibrary();
const status=$('#referenceStatus'),results=$('#referenceSearchResults'),libraryNode=$('#referenceLibrary'),countNode=$('#referenceCount');

function readLibrary(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[];}catch{return [];}}
function saveLibrary(){localStorage.setItem(KEY,JSON.stringify(library.slice(0,1000)));}
function setStatus(message,kind=''){status.textContent=message;status.className='status'+(kind?' '+kind:'');}
function authorsText(ref){const names=(ref.authors||[]).map(a=>a.literal||[a.given,a.family].filter(Boolean).join(' ')).filter(Boolean);return !names.length?'Tanpa nama':names.length<=3?names.join('; '):names.slice(0,3).join('; ')+'; dkk.';}
function doiHref(doi){return 'https://doi.org/'+encodeURIComponent(doi).replace(/%2F/gi,'/');}
function fileBase(){return 'mendeley-references-'+new Date().toISOString().slice(0,10);}
function downloadText(text,name,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function fetchJson(url){const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);try{const r=await fetch(url,{headers:{Accept:'application/json'},signal:c.signal});if(!r.ok)throw Error(r.status===404?'Referensi tidak ditemukan di Crossref.':'Crossref HTTP '+r.status);return await r.json();}catch(e){if(e.name==='AbortError')throw Error('Crossref tidak merespons dalam 15 detik.');throw e;}finally{clearTimeout(timer);}}
async function byDoi(doi){const p=await fetchJson('https://api.crossref.org/works/'+encodeURIComponent(doi));return referenceFromCrossref(p.message);}
async function byTitle(q){const p=await fetchJson('https://api.crossref.org/works?rows=5&query.bibliographic='+encodeURIComponent(q));return (p.message?.items||[]).map(referenceFromCrossref);}
function selectedReferences(){const ids=[...document.querySelectorAll('[data-reference-select]:checked')].map(x=>Number(x.value));return ids.length?library.filter((_,i)=>ids.includes(i)):[...library];}
function renderLibrary(){
  countNode.textContent=library.length+' referensi tersimpan di browser ini.';
  if(!library.length){libraryNode.innerHTML='<div class="empty">Belum ada referensi. Cari DOI/judul atau tambahkan banyak DOI.</div>';return;}
  libraryNode.innerHTML=library.map((ref,index)=>{const doi=normalizeDoi(ref.doi),meta=[authorsText(ref),ref.year,ref.journal,doi?'DOI: '+doi:''].filter(Boolean).join(' · '),link=doi?'<a href="'+esc(doiHref(doi))+'" target="_blank" rel="noopener noreferrer">Buka DOI</a>':'';return '<article class="card"><div class="card-head"><input class="selection" type="checkbox" data-reference-select value="'+index+'" aria-label="Pilih '+esc(ref.title)+'"><div class="card-title">'+esc(ref.title)+'<div class="card-meta">'+esc(meta)+'</div></div></div><div class="card-actions">'+link+'<button type="button" data-copy-citation="'+index+'">Salin sitasi APA</button></div></article>';}).join('');
  libraryNode.querySelectorAll('[data-copy-citation]').forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(formatApa(library[Number(b.dataset.copyCitation)]));setStatus('Sitasi APA disalin.','success');});
}
function persist(refs,message){library=refs;saveLibrary();renderLibrary();setStatus(message,'success');}
function addReferences(refs){const m=mergeUniqueReferences(library,refs),msg=m.added.length?m.added.length+' referensi ditambahkan'+(m.duplicates.length?'; '+m.duplicates.length+' duplikat dilewati.':'.'):'Tidak ada referensi baru; '+(m.duplicates.length||refs.length)+' duplikat ditemukan.';persist(m.references,msg);}
function renderSearch(refs){
  if(!refs.length){results.innerHTML='<div class="empty">Tidak ada hasil.</div>';return;}
  results.innerHTML=refs.map((ref,index)=>{const doi=normalizeDoi(ref.doi),meta=[authorsText(ref),ref.year,ref.journal,doi?'DOI: '+doi:''].filter(Boolean).join(' · '),link=doi?'<a href="'+esc(doiHref(doi))+'" target="_blank" rel="noopener noreferrer">Buka DOI</a>':'';return '<article class="card"><div class="card-title">'+esc(ref.title)+'</div><div class="card-meta">'+esc(meta)+'</div><div class="card-actions"><button type="button" data-add-reference="'+index+'" class="primary">Tambahkan ke pustaka</button>'+link+'</div></article>';}).join('');
  results.querySelectorAll('[data-add-reference]').forEach(b=>b.onclick=()=>addReferences([refs[Number(b.dataset.addReference)]]));
}
async function search(){const q=$('#referenceQuery').value.trim();if(!q)return setStatus('Masukkan DOI atau judul artikel.','error');const b=$('#referenceSearch');b.disabled=true;results.innerHTML='';setStatus('Mengambil metadata dari Crossref…');try{const doi=extractDoi(q),refs=doi?[await byDoi(doi)]:await byTitle(q);renderSearch(refs);setStatus(refs.length+' hasil ditemukan.','success');}catch(e){setStatus(e.message,'error');}finally{b.disabled=false;}}
async function addBulk(){const lines=$('#referenceBulk').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),dois=[...new Set(lines.map(extractDoi).filter(Boolean))].slice(0,50);if(!dois.length)return setStatus('Tidak ada DOI valid yang ditemukan.','error');const b=$('#referenceBulkAdd'),found=[],failed=[];b.disabled=true;try{for(let i=0;i<dois.length;i++){setStatus('Mengambil DOI '+(i+1)+' dari '+dois.length+'…');try{found.push(await byDoi(dois[i]));}catch{failed.push(dois[i]);}}const m=mergeUniqueReferences(library,found);library=m.references;saveLibrary();renderLibrary();setStatus(m.added.length+' ditambahkan, '+m.duplicates.length+' duplikat, '+failed.length+' gagal ditemukan.',failed.length?'':'success');}finally{b.disabled=false;}}
function requireRefs(){const refs=selectedReferences();if(!refs.length){setStatus('Belum ada referensi untuk diekspor.','error');return null;}return refs;}

$('#referenceSearch').onclick=search;
$('#referenceQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});
$('#referenceBulkAdd').onclick=addBulk;
$('#referenceSelectAll').onclick=()=>{const boxes=[...document.querySelectorAll('[data-reference-select]')],all=boxes.length&&boxes.every(x=>x.checked);boxes.forEach(x=>x.checked=!all);};
$('#referenceExportRis').onclick=()=>{const refs=requireRefs();if(!refs)return;downloadText(toRis(refs),fileBase()+'.ris','application/x-research-info-systems;charset=utf-8');setStatus(refs.length+' referensi diekspor ke RIS. Impor file ini di Mendeley.','success');};
$('#referenceExportBib').onclick=()=>{const refs=requireRefs();if(!refs)return;downloadText(toBibtex(refs),fileBase()+'.bib','application/x-bibtex;charset=utf-8');setStatus(refs.length+' referensi diekspor ke BibTeX.','success');};
$('#referenceCopyApa').onclick=async()=>{const refs=requireRefs();if(!refs)return;await navigator.clipboard.writeText(refs.map(formatApa).join('\n\n'));setStatus('Daftar sitasi APA disalin.','success');};
$('#referenceCopyHarvard').onclick=async()=>{const refs=requireRefs();if(!refs)return;await navigator.clipboard.writeText(refs.map(formatHarvard).join('\n\n'));setStatus('Daftar sitasi Harvard disalin.','success');};
$('#referenceDelete').onclick=()=>{const checked=[...document.querySelectorAll('[data-reference-select]:checked')].map(x=>Number(x.value));if(!checked.length)return setStatus('Centang referensi yang ingin dihapus.','error');if(!confirm('Hapus '+checked.length+' referensi dari pustaka lokal?'))return;const remove=new Set(checked);persist(library.filter((_,i)=>!remove.has(i)),checked.length+' referensi dihapus.');};
renderLibrary();
