import './reference-manager.css';
import {extractDoi,formatApa,formatHarvard,mergeUniqueReferences,normalizeDoi,referenceFromCrossref,toBibtex,toRis} from './reference-core.js';

const KEY='statistical_web_reference_library_v1';
const $=(selector,root=document)=>root.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function readLibrary(){
  try{
    const value=JSON.parse(localStorage.getItem(KEY)||'[]');
    return Array.isArray(value)?value:[];
  }catch{return [];}
}
function saveLibrary(references){localStorage.setItem(KEY,JSON.stringify(references.slice(0,1000)));}
function authorsText(reference){
  const names=(reference.authors||[]).map(a=>a.literal||[a.given,a.family].filter(Boolean).join(' ')).filter(Boolean);
  if(!names.length)return 'Tanpa nama';
  if(names.length<=3)return names.join('; ');
  return names.slice(0,3).join('; ')+'; dkk.';
}
function doiHref(doi){return 'https://doi.org/'+encodeURIComponent(doi).replace(/%2F/gi,'/');}
function downloadText(text,name,type='text/plain;charset=utf-8'){
  const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function fileBase(){return 'mendeley-references-'+new Date().toISOString().slice(0,10);}

async function fetchJson(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
    if(!response.ok)throw Error(response.status===404?'Referensi tidak ditemukan di Crossref.':'Crossref HTTP '+response.status);
    return await response.json();
  }catch(error){
    if(error.name==='AbortError')throw Error('Crossref tidak merespons dalam 15 detik.');
    throw error;
  }finally{clearTimeout(timer);}
}
async function byDoi(doi){
  const payload=await fetchJson('https://api.crossref.org/works/'+encodeURIComponent(doi));
  return referenceFromCrossref(payload.message);
}
async function byTitle(query){
  const payload=await fetchJson('https://api.crossref.org/works?rows=5&query.bibliographic='+encodeURIComponent(query));
  return (payload.message?.items||[]).map(referenceFromCrossref);
}

export function installReferenceManager(){
  const toolbar=$('.toolbar');
  if(!toolbar||$('#referenceManager'))return;

  const command=document.createElement('button');
  command.id='referenceManager';
  command.type='button';
  command.textContent='Referensi / Mendeley';
  toolbar.append(command);

  document.body.insertAdjacentHTML('beforeend',`<div id="referenceModal" class="modal-backdrop"><div class="modal reference-modal" role="dialog" aria-modal="true" aria-labelledby="referenceTitle"><div class="modal-head"><strong id="referenceTitle">Referensi / Mendeley</strong><button id="closeReference" type="button" aria-label="Tutup pengelola referensi">✕</button></div><div class="modal-body"><p class="reference-intro">Cari artikel berdasarkan DOI atau judul, simpan metadata ke pustaka lokal browser, lalu ekspor <b>RIS</b> atau <b>BibTeX</b>. Untuk Mendeley Reference Manager, impor file RIS melalui <b>Add new → Import library</b>.</p><div class="reference-search-row"><label>DOI atau judul artikel<input id="referenceQuery" autocomplete="off" placeholder="10.xxxx/xxxxx atau judul artikel"></label><button id="referenceSearch" class="primary" type="button">Cari metadata</button></div><div id="referenceStatus" class="reference-status" role="status" aria-live="polite"></div><div id="referenceSearchResults" class="reference-results"></div><details class="reference-bulk"><summary>Tambahkan banyak DOI sekaligus</summary><textarea id="referenceBulk" placeholder="Satu DOI per baris&#10;10.xxxx/xxxxx&#10;https://doi.org/10.xxxx/yyyyy"></textarea><button id="referenceBulkAdd" type="button">Ambil semua DOI</button></details><div class="reference-toolbar"><button id="referenceSelectAll" type="button">Pilih semua</button><button id="referenceExportRis" class="primary" type="button">Ekspor RIS untuk Mendeley</button><button id="referenceExportBib" type="button">Ekspor BibTeX</button><button id="referenceCopyApa" type="button">Salin APA</button><button id="referenceCopyHarvard" type="button">Salin Harvard</button><span class="spacer"></span><button id="referenceDelete" type="button">Hapus dipilih</button></div><div id="referenceCount" class="reference-count"></div><div id="referenceLibrary" class="reference-library"></div><div class="reference-help"><b>Catatan:</b> metadata berasal dari Crossref dan sebaiknya diperiksa sebelum digunakan. DOI duplikat tidak ditambahkan dua kali. Jika tidak ada referensi yang dicentang, tombol ekspor akan mengekspor seluruh pustaka.</div></div><div class="modal-foot"><button id="closeReference2" type="button">Tutup</button></div></div></div>`);

  const modal=$('#referenceModal'),status=$('#referenceStatus'),libraryNode=$('#referenceLibrary'),countNode=$('#referenceCount'),results=$('#referenceSearchResults');
  let library=readLibrary();

  const setStatus=(message,kind='')=>{
    status.textContent=message;
    status.className='reference-status'+(kind?' '+kind:'');
  };
  const selected=()=>{
    const keys=[...modal.querySelectorAll('[data-reference-select]:checked')].map(x=>x.value);
    return keys.length?library.filter((_,i)=>keys.includes(String(i))):[...library];
  };
  const renderLibrary=()=>{
    countNode.textContent=library.length+' referensi tersimpan di browser ini.';
    if(!library.length){
      libraryNode.innerHTML='<div class="reference-empty">Belum ada referensi. Cari DOI/judul atau tambahkan banyak DOI.</div>';
      return;
    }
    libraryNode.innerHTML=library.map((ref,index)=>{
      const doi=normalizeDoi(ref.doi);
      const meta=[authorsText(ref),ref.year,ref.journal,doi?'DOI: '+doi:''].filter(Boolean).join(' · ');
      return `<article class="reference-card"><div class="reference-card-head"><input class="reference-selection" type="checkbox" data-reference-select value="${index}" aria-label="Pilih ${esc(ref.title)}"><div class="reference-card-title">${esc(ref.title)}<div class="reference-card-meta">${esc(meta)}</div></div></div><div class="reference-card-actions">${doi?`<a href="${esc(doiHref(doi))}" target="_blank" rel="noopener noreferrer">Buka DOI</a>`:''}<button type="button" data-copy-citation="${index}">Salin sitasi</button></div></article>`;
    }).join('');
    libraryNode.querySelectorAll('[data-copy-citation]').forEach(button=>button.onclick=async()=>{
      const ref=library[Number(button.dataset.copyCitation)];
      await navigator.clipboard.writeText(formatApa(ref));
      setStatus('Sitasi APA disalin.','success');
    });
  };
  const persist=(refs,message)=>{
    library=refs;saveLibrary(library);renderLibrary();setStatus(message,'success');
  };
  const addReferences=refs=>{
    const merged=mergeUniqueReferences(library,refs);
    const message=merged.added.length
      ? merged.added.length+' referensi ditambahkan'+(merged.duplicates.length?'; '+merged.duplicates.length+' duplikat dilewati.':'.')
      : 'Tidak ada referensi baru; '+(merged.duplicates.length||refs.length)+' duplikat ditemukan.';
    persist(merged.references,message);
  };
  const renderSearch=refs=>{
    if(!refs.length){
      results.innerHTML='<div class="reference-empty">Tidak ada hasil.</div>';
      return;
    }
    results.innerHTML=refs.map((ref,index)=>{
      const doi=normalizeDoi(ref.doi);
      const meta=[authorsText(ref),ref.year,ref.journal,doi?'DOI: '+doi:''].filter(Boolean).join(' · ');
      return `<article class="reference-card"><div class="reference-card-title">${esc(ref.title)}</div><div class="reference-card-meta">${esc(meta)}</div><div class="reference-card-actions"><button type="button" data-add-reference="${index}" class="primary">Tambahkan ke pustaka</button>${doi?`<a href="${esc(doiHref(doi))}" target="_blank" rel="noopener noreferrer">Buka DOI</a>`:''}</div></article>`;
    }).join('');
    results.querySelectorAll('[data-add-reference]').forEach(button=>button.onclick=()=>addReferences([refs[Number(button.dataset.addReference)]]));
  };

  async function search(){
    const query=$('#referenceQuery').value.trim();
    if(!query)return setStatus('Masukkan DOI atau judul artikel.','error');
    const button=$('#referenceSearch');
    button.disabled=true;results.innerHTML='';setStatus('Mengambil metadata dari Crossref…');
    try{
      const doi=extractDoi(query),refs=doi?[await byDoi(doi)]:await byTitle(query);
      renderSearch(refs);
      setStatus(refs.length+' hasil ditemukan.','success');
    }catch(error){setStatus(error.message,'error');}
    finally{button.disabled=false;}
  }

  async function addBulk(){
    const lines=$('#referenceBulk').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const dois=[...new Set(lines.map(extractDoi).filter(Boolean))].slice(0,50);
    if(!dois.length)return setStatus('Tidak ada DOI valid yang ditemukan.','error');
    const button=$('#referenceBulkAdd');
    button.disabled=true;
    const found=[],failed=[];
    try{
      for(let i=0;i<dois.length;i++){
        setStatus('Mengambil DOI '+(i+1)+' dari '+dois.length+'…');
        try{found.push(await byDoi(dois[i]));}catch{failed.push(dois[i]);}
      }
      const merged=mergeUniqueReferences(library,found);
      library=merged.references;saveLibrary(library);renderLibrary();
      setStatus(merged.added.length+' ditambahkan, '+merged.duplicates.length+' duplikat, '+failed.length+' gagal ditemukan.',failed.length?'':'success');
    }finally{button.disabled=false;}
  }

  const requireRefs=()=>{
    const refs=selected();
    if(!refs.length){setStatus('Belum ada referensi untuk diekspor.','error');return null;}
    return refs;
  };

  $('#referenceSearch').onclick=search;
  $('#referenceQuery').addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();search();}
  });
  $('#referenceBulkAdd').onclick=addBulk;
  $('#referenceSelectAll').onclick=()=>{
    const boxes=[...modal.querySelectorAll('[data-reference-select]')];
    const all=boxes.length&&boxes.every(x=>x.checked);
    boxes.forEach(x=>x.checked=!all);
  };
  $('#referenceExportRis').onclick=()=>{
    const refs=requireRefs();if(!refs)return;
    downloadText(toRis(refs),fileBase()+'.ris','application/x-research-info-systems;charset=utf-8');
    setStatus(refs.length+' referensi diekspor ke RIS. Impor file ini di Mendeley.','success');
  };
  $('#referenceExportBib').onclick=()=>{
    const refs=requireRefs();if(!refs)return;
    downloadText(toBibtex(refs),fileBase()+'.bib','application/x-bibtex;charset=utf-8');
    setStatus(refs.length+' referensi diekspor ke BibTeX.','success');
  };
  $('#referenceCopyApa').onclick=async()=>{
    const refs=requireRefs();if(!refs)return;
    await navigator.clipboard.writeText(refs.map(formatApa).join('\n\n'));
    setStatus('Daftar sitasi APA disalin.','success');
  };
  $('#referenceCopyHarvard').onclick=async()=>{
    const refs=requireRefs();if(!refs)return;
    await navigator.clipboard.writeText(refs.map(formatHarvard).join('\n\n'));
    setStatus('Daftar sitasi Harvard disalin.','success');
  };
  $('#referenceDelete').onclick=()=>{
    const checked=[...modal.querySelectorAll('[data-reference-select]:checked')].map(x=>Number(x.value));
    if(!checked.length)return setStatus('Centang referensi yang ingin dihapus.','error');
    if(!confirm('Hapus '+checked.length+' referensi dari pustaka lokal?'))return;
    const remove=new Set(checked);
    persist(library.filter((_,i)=>!remove.has(i)),checked.length+' referensi dihapus.');
  };

  const close=()=>modal.classList.remove('open');
  command.onclick=()=>{
    results.innerHTML='';setStatus('');renderLibrary();modal.classList.add('open');
    setTimeout(()=>$('#referenceQuery').focus(),0);
  };
  $('#closeReference').onclick=close;
  $('#closeReference2').onclick=close;
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal.classList.contains('open'))close();});
}
