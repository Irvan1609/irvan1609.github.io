import './field-layout.css';

const STORE='statistical_web_field_layout_v1';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let current=null,config=null,selectedRow=null,dirty=false,multiMode=false,layoutEditMode=false,dragRow=null;
const selectedRows=new Set();

function api(){return globalThis.StatisticalWebData||null;}
function dataset(){
  const value=api()?.readActiveDataset?.();
  return value&&Array.isArray(value.headers)&&Array.isArray(value.rows)?value:{name:'Dataset',fileName:'dataset',headers:[],rows:[]};
}
function keyFor(data){return String(data.fileName||data.name||'dataset');}
function readStore(){try{const value=JSON.parse(localStorage.getItem(STORE)||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}}
function writeConfig(data,next){
  try{const store=readStore();store[keyFor(data)]=next;localStorage.setItem(STORE,JSON.stringify(store));}catch{}
}
function findColumn(headers,patterns,fallback=null){
  for(const pattern of patterns){const index=headers.findIndex(header=>pattern.test(String(header||'')));if(index>=0)return index;}
  return fallback;
}
function defaultConfig(data){
  const headers=data.headers||[];
  const id=findColumn(headers,[/^petak$/i,/plot/i,/unit/i,/kode/i,/^id$/i],0);
  const group=findColumn(headers,[/kelompok/i,/blok|block/i,/ulangan|rep/i],-1);
  const color=findColumn(headers,[/^perlakuan$/i,/kombinasi/i,/faktor\s*a/i,/varietas/i,/genotip/i,/treatment/i],id);
  const columns=Math.max(2,Math.min(10,Math.ceil(Math.sqrt(Math.max(1,data.rows.length)))));
  return {id,group,color,columns:Math.min(columns,6),serpentine:true,size:'medium',north:'N',roadEvery:0,colorMode:'treatment',heatmap:-1,filter:'all',order:{},statuses:{},notes:{}};
}
function normalizeConfig(data,saved){
  const base={...defaultConfig(data),...(saved||{})},max=Math.max(0,data.headers.length-1);
  const safeIndex=(value,fallback)=>Number.isInteger(Number(value))&&Number(value)>=-1&&Number(value)<=max?Number(value):fallback;
  base.id=safeIndex(base.id,0);base.group=safeIndex(base.group,-1);base.color=safeIndex(base.color,base.id);
  base.columns=Math.max(2,Math.min(12,Number(base.columns)||6));
  base.serpentine=base.serpentine!==false;
  base.size=['small','medium','large'].includes(base.size)?base.size:'medium';
  base.north=['N','E','S','W'].includes(base.north)?base.north:'N';
  base.roadEvery=Math.max(0,Math.min(8,Number(base.roadEvery)||0));
  base.colorMode=['treatment','completion','parameter'].includes(base.colorMode)?base.colorMode:'treatment';
  base.heatmap=safeIndex(base.heatmap,-1);
  base.filter=['all','empty','partial','complete','normal','missing','dead','damaged','harvested','border'].includes(base.filter)?base.filter:'all';
  base.order=base.order&&typeof base.order==='object'?base.order:{};
  base.statuses=base.statuses&&typeof base.statuses==='object'?base.statuses:{};
  base.notes=base.notes&&typeof base.notes==='object'?base.notes:{};
  return base;
}
function structuralHeader(header){
  return /(petak|plot|unit|kode|(^|\b)id(\b|$)|ulangan|replicate|rep\b|kelompok|blok|block|perlakuan|treatment|faktor\s*[ab]|kombinasi|petak utama|subplot|sub plot|varietas|genotip)/i.test(String(header||''));
}
function sampleNumeric(data,index){
  const values=data.rows.map(row=>String(row[index]??'').trim()).filter(Boolean).slice(0,50);
  return values.length>0&&values.every(value=>Number.isFinite(Number(value.replace(',','.'))));
}
function measurementColumns(data){
  return data.headers.map((header,index)=>({header,index})).filter(item=>!structuralHeader(item.header));
}
function rowProgress(data,row){
  const measures=measurementColumns(data);
  if(!measures.length)return {filled:0,total:0,status:'structure'};
  const filled=measures.filter(item=>String(row[item.index]??'').trim()!=='').length;
  return {filled,total:measures.length,status:filled===0?'empty':filled===measures.length?'complete':'partial'};
}
function hashHue(value){
  let hash=0;for(const char of String(value??'')){hash=(Math.imul(hash,31)+char.charCodeAt(0))|0;}
  return Math.abs(hash)%360;
}
function orderedEntries(entries,columns,serpentine){
  if(!serpentine)return entries;
  const out=[];
  for(let start=0;start<entries.length;start+=columns){
    const chunk=entries.slice(start,start+columns);
    if(Math.floor(start/columns)%2)chunk.reverse();
    out.push(...chunk);
  }
  return out;
}
function groupEntries(data){
  const groups=new Map();
  data.rows.forEach((row,index)=>{
    const label=config.group>=0?String(row[config.group]??'').trim()||'Tanpa kelompok':'Semua petak';
    if(!groups.has(label))groups.set(label,[]);
    groups.get(label).push({row,index});
  });
  return [...groups.entries()].map(([label,entries])=>{
    const order=Array.isArray(config.order?.[label])?config.order[label]:[];
    if(order.length){const rank=new Map(order.map((row,index)=>[Number(row),index]));entries.sort((a,b)=>(rank.get(a.index)??1e9)-(rank.get(b.index)??1e9)||a.index-b.index);}
    return [label,entries];
  });
}
function colorLabel(data,row){return config.color>=0?String(row[config.color]??'').trim():'';}
function plotLabel(data,row,index){
  const id=String(row[config.id]??'').trim()||String(index+1);
  const secondary=colorLabel(data,row);
  return {id,secondary:secondary&&secondary!==id?secondary:''};
}
function plotStatus(index){return String(config.statuses?.[index]||'normal');}
function plotNote(index){return String(config.notes?.[index]||'');}
function passesFilter(entry){
  if(config.filter==='all')return true;
  const status=plotStatus(entry.index),progress=rowProgress(current,entry.row);
  if(['empty','partial','complete'].includes(config.filter))return progress.status===config.filter;
  return status===config.filter;
}
function heatmapScale(){
  const index=Number(config.heatmap);
  if(config.colorMode!=='parameter'||index<0)return null;
  const values=current.rows.map(row=>Number(String(row[index]??'').replace(',','.'))).filter(Number.isFinite);
  if(!values.length)return null;
  const min=Math.min(...values),max=Math.max(...values);
  return {index,min,max};
}
function visualForPlot(entry,scale){
  const progress=rowProgress(current,entry.row),status=plotStatus(entry.index),color=colorLabel(current,entry.row);
  if(config.colorMode==='completion'){
    const hue=progress.status==='complete'?135:progress.status==='partial'?42:0;
    return {hue,heat:false,label:progress.total?progress.filled+'/'+progress.total:'struktur'};
  }
  if(config.colorMode==='parameter'&&scale){
    const value=Number(String(entry.row[scale.index]??'').replace(',','.'));
    if(Number.isFinite(value)){
      const ratio=scale.max===scale.min?0.5:Math.max(0,Math.min(1,(value-scale.min)/(scale.max-scale.min)));
      return {hue:220-(ratio*220),heat:true,label:String(entry.row[scale.index]??'')};
    }
  }
  return {hue:hashHue(color),heat:false,label:progress.total?progress.filled+'/'+progress.total:'struktur',status};
}
function matchingSearch(entry,data,query){
  if(!query)return true;
  return data.headers.some((_,i)=>String(entry.row[i]??'').toLocaleLowerCase('id-ID').includes(query));
}
function options(headers,selected,allowNone=false){
  return (allowNone?'<option value="-1">Tidak dikelompokkan</option>':'')+headers.map((header,index)=>`<option value="${index}" ${index===selected?'selected':''}>${esc(header)}</option>`).join('');
}
function ensureModal(){
  if($('#fieldLayoutModal'))return;
  document.body.insertAdjacentHTML('beforeend',`
    <div id="fieldLayoutModal" class="field-layout-modal" role="dialog" aria-modal="true" aria-labelledby="fieldLayoutTitle">
      <header class="field-layout-head">
        <div class="field-layout-title"><strong id="fieldLayoutTitle">Denah lahan</strong><span id="fieldLayoutDataset"></span></div>
        <div class="field-layout-head-actions">
          <button id="fieldLayoutEdit" type="button" aria-pressed="false">Susun</button>
          <button id="fieldMultiToggle" type="button" aria-pressed="false">Multi</button>
          <button id="fieldAddParameter" type="button">+ Parameter</button>
          <button id="fieldOpenTable" type="button">Tabel</button>
          <details class="field-layout-more"><summary>Lainnya</summary><div>
            <button id="fieldPrint" type="button">Cetak</button>
            <button id="fieldExportLayout" type="button">Ekspor denah</button>
            <button id="fieldImportLayout" type="button">Impor denah</button>
            <button id="fieldResetLayout" type="button">Reset susunan</button>
          </div></details>
          <button id="closeFieldLayout" type="button" aria-label="Tutup denah lahan">✕</button>
        </div>
      </header>
      <div class="field-layout-controls">
        <label>ID plot<select id="fieldIdColumn"></select></label>
        <label>Kelompok<select id="fieldGroupColumn"></select></label>
        <label>Warna<select id="fieldColorColumn"></select></label>
        <label>Mode warna<select id="fieldColorMode"><option value="treatment">Perlakuan</option><option value="completion">Kelengkapan</option><option value="parameter">Heatmap</option></select></label>
        <label id="fieldHeatmapWrap">Parameter<select id="fieldHeatmapColumn"></select></label>
        <label>Filter<select id="fieldFilter"><option value="all">Semua</option><option value="empty">Data kosong</option><option value="partial">Sebagian</option><option value="complete">Lengkap</option><option value="normal">Normal</option><option value="missing">Petak kosong</option><option value="dead">Tanaman mati</option><option value="damaged">Rusak</option><option value="harvested">Panen</option><option value="border">Border</option></select></label>
        <label>Kolom<input id="fieldColumns" type="number" min="2" max="12" inputmode="numeric"></label>
        <label>Jalan / baris<input id="fieldRoadEvery" type="number" min="0" max="8" inputmode="numeric"></label>
        <label>Utara<select id="fieldNorth"><option value="N">↑ N</option><option value="E">→ N</option><option value="S">↓ N</option><option value="W">← N</option></select></label>
        <label>Ukuran<select id="fieldPlotSize"><option value="small">Kecil</option><option value="medium">Sedang</option><option value="large">Besar</option></select></label>
        <label class="field-switch"><input id="fieldSerpentine" type="checkbox"><span>Zig-zag</span></label>
        <input id="fieldSearch" type="search" placeholder="Cari plot…" aria-label="Cari plot">
      </div>
      <div class="field-layout-stats" id="fieldLayoutStats"></div>
      <main class="field-layout-workspace">
        <section class="field-map-pane">
          <div id="fieldNorthArrow" class="field-north-arrow" aria-label="Arah utara">↑<span>N</span></div>
          <div id="fieldHeatLegend" class="field-heat-legend" hidden></div>
          <div id="fieldMap" class="field-map"></div>
        </section>
        <aside id="fieldPlotEditor" class="field-plot-editor" aria-live="polite">
          <div class="field-editor-empty">Klik satu plot untuk mengisi data.</div>
        </aside>
      </main>
    </div><input id="fieldLayoutImportInput" type="file" accept=".json,application/json" hidden>`);
  $('#closeFieldLayout').onclick=closeFieldLayout;
  $('#fieldOpenTable').onclick=()=>{
    const row=selectedRow;
    closeFieldLayout();
    if(Number.isInteger(row))api()?.focusCell?.(row,0);
  };
  $('#fieldAddParameter').onclick=addParameter;
  $('#fieldLayoutEdit').onclick=()=>{layoutEditMode=!layoutEditMode;$('#fieldLayoutEdit').setAttribute('aria-pressed',String(layoutEditMode));renderMap();if(Number.isInteger(selectedRow))renderEditor(selectedRow);};
  $('#fieldMultiToggle').onclick=()=>{multiMode=!multiMode;selectedRows.clear();$('#fieldMultiToggle').setAttribute('aria-pressed',String(multiMode));renderMap();renderBatchEditor();};
  $('#fieldPrint').onclick=()=>window.print();
  $('#fieldExportLayout').onclick=exportLayout;
  $('#fieldImportLayout').onclick=()=>$('#fieldLayoutImportInput').click();
  $('#fieldResetLayout').onclick=resetLayout;
  $('#fieldLayoutImportInput').onchange=importLayout;
  for(const id of ['fieldIdColumn','fieldGroupColumn','fieldColorColumn','fieldColorMode','fieldHeatmapColumn','fieldFilter','fieldColumns','fieldRoadEvery','fieldNorth','fieldPlotSize','fieldSerpentine']){
    $('#'+id).addEventListener('change',readControls);
  }
  $('#fieldSearch').addEventListener('input',renderMap);
  $('#fieldMap').addEventListener('click',event=>{
    const plot=event.target.closest('[data-field-row]');if(!plot)return;
    const row=Number(plot.dataset.fieldRow);
    if(multiMode){
      if(selectedRows.has(row))selectedRows.delete(row);else selectedRows.add(row);
      renderMap();renderBatchEditor();return;
    }
    selectRow(row);
  });
  $('#fieldMap').addEventListener('dragstart',event=>{
    const plot=event.target.closest('[data-field-row]');if(!layoutEditMode||!plot)return;
    dragRow=Number(plot.dataset.fieldRow);event.dataTransfer.effectAllowed='move';plot.classList.add('is-dragging');
  });
  $('#fieldMap').addEventListener('dragend',event=>{event.target.closest('[data-field-row]')?.classList.remove('is-dragging');dragRow=null;});
  $('#fieldMap').addEventListener('dragover',event=>{if(layoutEditMode&&event.target.closest('[data-field-row]'))event.preventDefault();});
  $('#fieldMap').addEventListener('drop',event=>{
    const target=event.target.closest('[data-field-row]');if(!layoutEditMode||!target||!Number.isInteger(dragRow))return;
    event.preventDefault();movePlotTo(dragRow,Number(target.dataset.fieldRow));dragRow=null;
  });
  $('#fieldPlotEditor').addEventListener('input',event=>{if(!event.target.closest('[data-batch-editor]'))dirty=true;});
  $('#fieldPlotEditor').addEventListener('click',event=>{
    if(event.target.closest('[data-field-save]'))saveEditor();
    if(event.target.closest('[data-field-prev]'))stepEditor(-1);
    if(event.target.closest('[data-field-next]'))stepEditor(1);
    const move=event.target.closest('[data-field-move]');if(move)moveSelectedPlot(Number(move.dataset.fieldMove));
    if(event.target.closest('[data-batch-apply]'))applyBatch();
    if(event.target.closest('[data-batch-select-visible]'))selectVisible();
    if(event.target.closest('[data-batch-clear]')){selectedRows.clear();renderMap();renderBatchEditor();}
    if(event.target.closest('[data-field-open-row]')){
      const row=selectedRow;closeFieldLayout();if(Number.isInteger(row))api()?.focusCell?.(row,0);
    }
  });
  $('#fieldPlotEditor').addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();saveEditor();}
  });
  document.addEventListener('keydown',event=>{
    const modal=$('#fieldLayoutModal');if(!modal?.classList.contains('open'))return;
    if(event.key==='Escape'&&!event.target.closest('input,select,textarea'))closeFieldLayout();
  });
  document.addEventListener('stat-dataset-changed',()=>{
    if(!$('#fieldLayoutModal')?.classList.contains('open')||dirty)return;
    const keep=selectedRow;refreshData();if(Number.isInteger(keep)&&keep<current.rows.length)selectRow(keep);
  });
}
function readControls(){
  if(!current)return;
  config={...config,
    id:Number($('#fieldIdColumn').value),
    group:Number($('#fieldGroupColumn').value),
    color:Number($('#fieldColorColumn').value),
    colorMode:$('#fieldColorMode').value,
    heatmap:Number($('#fieldHeatmapColumn').value),
    filter:$('#fieldFilter').value,
    columns:Math.max(2,Math.min(12,Number($('#fieldColumns').value)||6)),
    roadEvery:Math.max(0,Math.min(8,Number($('#fieldRoadEvery').value)||0)),
    north:$('#fieldNorth').value,
    size:$('#fieldPlotSize').value,
    serpentine:$('#fieldSerpentine').checked
  };
  writeConfig(current,config);renderMap();
  if(Number.isInteger(selectedRow))renderEditor(selectedRow);
}
function renderControls(){
  $('#fieldIdColumn').innerHTML=options(current.headers,config.id);
  $('#fieldGroupColumn').innerHTML=options(current.headers,config.group,true);
  $('#fieldColorColumn').innerHTML=options(current.headers,config.color);
  const measures=measurementColumns(current);
  $('#fieldHeatmapColumn').innerHTML='<option value="-1">Pilih parameter</option>'+measures.map(item=>`<option value="${item.index}" ${item.index===config.heatmap?'selected':''}>${esc(item.header)}</option>`).join('');
  $('#fieldColorMode').value=config.colorMode;
  $('#fieldFilter').value=config.filter;
  $('#fieldColumns').value=String(config.columns);
  $('#fieldRoadEvery').value=String(config.roadEvery||0);
  $('#fieldNorth').value=config.north;
  $('#fieldPlotSize').value=config.size;
  $('#fieldSerpentine').checked=config.serpentine;
  $('#fieldHeatmapWrap').hidden=config.colorMode!=='parameter';
}
function renderStats(){
  const progress=current.rows.map(row=>rowProgress(current,row));
  const complete=progress.filter(item=>item.status==='complete').length;
  const partial=progress.filter(item=>item.status==='partial').length;
  const empty=progress.filter(item=>item.status==='empty').length;
  const measures=measurementColumns(current).length;
  $('#fieldLayoutStats').innerHTML=`<span><b>${current.rows.length}</b> plot</span><span><b>${measures}</b> parameter</span>${measures?`<span><b>${complete}</b> lengkap</span><span><b>${partial}</b> sebagian</span><span><b>${empty}</b> kosong</span>`:'<span>Tambahkan parameter untuk mulai pengamatan.</span>'}`;
}
function renderMap(){
  if(!current)return;
  const query=String($('#fieldSearch')?.value||'').trim().toLocaleLowerCase('id-ID');
  const map=$('#fieldMap');map.className=`field-map field-size-${config.size}`;
  const groups=groupEntries(current);
  let visible=0;
  map.innerHTML=groups.map(([label,entries])=>{
    const ordered=orderedEntries(entries,config.columns,config.serpentine).filter(entry=>matchingSearch(entry,current,query));
    if(!ordered.length)return '';
    visible+=ordered.length;
    const plots=ordered.map(entry=>{
      const labels=plotLabel(current,entry.row,entry.index),progress=rowProgress(current,entry.row),color=colorLabel(current,entry.row),hue=hashHue(color);
      const selected=entry.index===selectedRow?' is-selected':'';
      const meter=progress.total?`${progress.filled}/${progress.total}`:'struktur';
      return `<button type="button" class="field-plot field-plot-${progress.status}${selected}" data-field-row="${entry.index}" style="--plot-hue:${hue}" title="Baris ${entry.index+1}">
        <b>${esc(labels.id)}</b>${labels.secondary?`<span>${esc(labels.secondary)}</span>`:'<span>Plot</span>'}<small>${meter}</small>
      </button>`;
    }).join('');
    return `<section class="field-block"><div class="field-block-head"><b>${esc(label)}</b><span>${ordered.length} plot</span></div><div class="field-block-grid" style="--field-columns:${config.columns}">${plots}</div></section>`;
  }).join('');
  if(!visible)map.innerHTML='<div class="field-map-empty">Tidak ada plot yang cocok.</div>';
  renderStats();
}
function fieldInput(data,row,index){
  const header=data.headers[index],value=String(row[index]??''),numeric=sampleNumeric(data,index);
  return `<label class="field-editor-field"><span>${esc(header)}</span><input data-field-col="${index}" value="${esc(value)}" ${numeric?'inputmode="decimal"':''} autocomplete="off"></label>`;
}
function renderEditor(rowIndex){
  const row=current.rows[rowIndex];if(!row)return;
  const labels=plotLabel(current,row,rowIndex),measures=measurementColumns(current),measureSet=new Set(measures.map(item=>item.index));
  const structural=current.headers.map((header,index)=>({header,index})).filter(item=>!measureSet.has(item.index));
  const progress=rowProgress(current,row);
  $('#fieldPlotEditor').innerHTML=`
    <div class="field-editor-head">
      <div><small>Plot ${rowIndex+1}</small><strong>${esc(labels.id)}</strong>${labels.secondary?`<span>${esc(labels.secondary)}</span>`:''}</div>
      <span class="field-editor-progress">${progress.total?`${progress.filled}/${progress.total} terisi`:'Belum ada parameter'}</span>
    </div>
    <div class="field-editor-nav"><button type="button" data-field-prev>‹ Sebelumnya</button><button type="button" data-field-next>Berikutnya ›</button></div>
    <div class="field-editor-fields">
      ${measures.length?`<div class="field-editor-section"><b>Pengamatan</b>${measures.map(item=>fieldInput(current,row,item.index)).join('')}</div>`:'<div class="field-editor-empty compact">Belum ada kolom pengamatan. Tekan <b>+ Parameter</b>.</div>'}
      <details class="field-editor-identity"><summary>Identitas plot</summary>${structural.map(item=>fieldInput(current,row,item.index)).join('')}</details>
    </div>
    <div class="field-editor-actions"><button type="button" data-field-open-row>Buka di tabel</button><button type="button" class="primary" data-field-save>Simpan</button></div>
    <p class="field-editor-status" id="fieldEditorStatus"></p>`;
  dirty=false;
}
function selectRow(index){
  if(dirty&&!confirm('Ada perubahan yang belum disimpan. Pindah plot tanpa menyimpan?'))return;
  selectedRow=index;dirty=false;renderMap();renderEditor(index);
  $('#fieldPlotEditor').scrollTop=0;
  requestAnimationFrame(()=>$('#fieldPlotEditor [data-field-col]:not([disabled])')?.focus({preventScroll:true}));
}
function saveEditor(){
  if(!Number.isInteger(selectedRow)||!current?.rows[selectedRow])return;
  const values=[...current.rows[selectedRow]];
  $('#fieldPlotEditor').querySelectorAll('[data-field-col]').forEach(input=>{values[Number(input.dataset.fieldCol)]=input.value.trim();});
  const result=api()?.replaceRow?.(selectedRow,values,'edit plot dari denah lahan');
  const status=$('#fieldEditorStatus');
  if(!result?.ok){if(status)status.textContent=result?.error||'Data belum dapat disimpan.';return;}
  dirty=false;refreshData(false);renderMap();renderEditor(selectedRow);
  const freshStatus=$('#fieldEditorStatus');if(freshStatus)freshStatus.textContent=result.changed?'✓ Tersimpan ke dataset.':'Tidak ada perubahan.';
}
function stepEditor(direction){
  if(!current?.rows.length)return;
  if(dirty){saveEditor();if(dirty)return;}
  let next=Number.isInteger(selectedRow)?selectedRow+direction:0;
  if(next<0)next=current.rows.length-1;if(next>=current.rows.length)next=0;
  selectRow(next);
}
function addParameter(){
  const name=prompt('Nama parameter baru, misalnya Tinggi Tanaman (cm):','');
  if(!name)return;
  const result=api()?.appendColumn?.(name,'tambah parameter dari denah lahan');
  if(!result?.ok){alert(result?.error||'Parameter belum dapat ditambahkan.');return;}
  refreshData(false);renderControls();renderMap();
  if(Number.isInteger(selectedRow))renderEditor(selectedRow);
}
function refreshData(render=true){
  current=dataset();
  const saved=readStore()[keyFor(current)];
  config=normalizeConfig(current,saved);
  if(render){renderControls();renderMap();}
}
function closeFieldLayout(){
  if(dirty&&!confirm('Ada perubahan plot yang belum disimpan. Tutup tanpa menyimpan?'))return;
  $('#fieldLayoutModal')?.classList.remove('open');document.body.classList.remove('field-layout-open');dirty=false;
}
export function openFieldLayout(){
  ensureModal();refreshData();
  $('#fieldLayoutDataset').textContent=`${current.name||'Dataset'} · ${current.rows.length} baris`;
  $('#fieldLayoutModal').classList.add('open');document.body.classList.add('field-layout-open');
  selectedRow=null;dirty=false;$('#fieldPlotEditor').innerHTML='<div class="field-editor-empty">Klik satu plot untuk mengisi data.</div>';
  renderMap();
}
