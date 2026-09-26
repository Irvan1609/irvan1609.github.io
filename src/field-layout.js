import './field-layout.css';

const STORE='statistical_web_field_layout_v1';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let current=null,config=null,selectedRow=null,dirty=false,multiMode=false,layoutEditMode=false,dragRow=null,autoSaveTimer=0;
const selectedRows=new Set(),layoutUndo=[],layoutRedo=[];

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
function cloneConfig(value=config){try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value));}}
function pushLayoutHistory(reason='ubah denah'){
  if(!config)return;
  layoutUndo.push({config:cloneConfig(),reason});while(layoutUndo.length>40)layoutUndo.shift();layoutRedo.length=0;
}
function applyConfigSnapshot(snapshot){
  if(!snapshot?.config)return;
  config=normalizeConfig(current,cloneConfig(snapshot.config));writeConfig(current,config);renderControls();renderMap();
  if(multiMode)renderBatchEditor();else if(Number.isInteger(selectedRow))renderEditor(selectedRow);
}
function undoLayout(){
  const item=layoutUndo.pop();if(!item)return;
  layoutRedo.push({config:cloneConfig(),reason:item.reason});applyConfigSnapshot(item);
}
function redoLayout(){
  const item=layoutRedo.pop();if(!item)return;
  layoutUndo.push({config:cloneConfig(),reason:item.reason});applyConfigSnapshot(item);
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
  return {id,group,color,columns:Math.min(columns,6),serpentine:true,size:'medium',north:'N',roadEvery:0,colorMode:'treatment',heatmap:-1,filter:'all',order:{},statuses:{},notes:{},uids:[],observer:'',session:{label:'',parameter:-1,date:''},fieldMode:false,flipX:false,flipY:false,roadAfter:{},objects:[],plotMeta:{},sampleGroups:[]};
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
  base.uids=Array.isArray(base.uids)?base.uids.map(String):[];
  while(base.uids.length<data.rows.length)base.uids.push(crypto.randomUUID());
  if(base.uids.length>data.rows.length)base.uids.length=data.rows.length;
  base.observer=String(base.observer||'');
  base.session=base.session&&typeof base.session==='object'?{label:String(base.session.label||''),parameter:safeIndex(base.session.parameter,-1),date:String(base.session.date||'')}:{label:'',parameter:-1,date:''};
  base.fieldMode=base.fieldMode===true;base.flipX=base.flipX===true;base.flipY=base.flipY===true;
  base.roadAfter=base.roadAfter&&typeof base.roadAfter==='object'?base.roadAfter:{};
  base.objects=Array.isArray(base.objects)?base.objects.filter(item=>item&&typeof item==='object').slice(0,100):[];
  base.plotMeta=base.plotMeta&&typeof base.plotMeta==='object'?base.plotMeta:{};
  base.sampleGroups=Array.isArray(base.sampleGroups)?base.sampleGroups.filter(group=>group&&Array.isArray(group.members)&&group.meanHeader):[];
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
    if(order.length){const rank=new Map(order.map((key,index)=>[String(key),index]));entries.sort((a,b)=>(rank.get(plotKey(a.index))??1e9)-(rank.get(plotKey(b.index))??1e9)||a.index-b.index);}
    return [label,entries];
  });
}
function colorLabel(data,row){return config.color>=0?String(row[config.color]??'').trim():'';}
function plotLabel(data,row,index){
  const id=String(row[config.id]??'').trim()||String(index+1);
  const secondary=colorLabel(data,row);
  return {id,secondary:secondary&&secondary!==id?secondary:''};
}
function plotKey(index){return String(config?.uids?.[index]||('#'+index));}
function plotUid(index){return plotKey(index);}
function plotStatus(index){return String(config.statuses?.[plotKey(index)]||config.statuses?.[index]||'normal');}
function plotNote(index){return String(config.notes?.[plotKey(index)]||config.notes?.[index]||'');}
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
          <button id="fieldUndo" type="button" title="Undo denah" aria-label="Undo denah">↶</button>
          <button id="fieldRedo" type="button" title="Redo denah" aria-label="Redo denah">↷</button>
          <button id="fieldModeToggle" type="button" aria-pressed="false">Lapangan</button>
          <button id="fieldLayoutEdit" type="button" aria-pressed="false">Susun</button>
          <button id="fieldMultiToggle" type="button" aria-pressed="false">Multi</button>
          <button id="fieldAddParameter" type="button">+ Parameter</button>
          <button id="fieldOpenTable" type="button">Tabel</button>
          <details class="field-layout-more"><summary>Lainnya</summary><div>
            <button id="fieldValidateBlocks" type="button">Periksa blok</button>
            <button id="fieldCreateSessionColumn" type="button">Parameter waktu</button>
            <button id="fieldSamplePlants" type="button">Sampel tanaman</button>
            <button id="fieldPrint" type="button">Cetak</button>
            <button id="fieldExportLayout" type="button">Ekspor denah</button>
            <button id="fieldImportLayout" type="button">Impor denah</button>
            <button id="fieldResetLayout" type="button">Reset susunan</button>
          </div></details>
          <button id="closeFieldLayout" type="button" aria-label="Tutup denah lahan">✕</button>
        </div>
      </header>
      <div class="field-layout-controls">
        <label>Pengamat<input id="fieldObserver" type="text" placeholder="Nama / inisial" autocomplete="off"></label>
        <label>Sesi<input id="fieldSessionLabel" type="text" placeholder="mis. 28 HST" autocomplete="off"></label>
        <label>Parameter aktif<select id="fieldActiveParameter"></select></label>
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
  $('#fieldModeToggle').onclick=toggleFieldMode;
  $('#fieldValidateBlocks').onclick=validateBlocks;
  $('#fieldCreateSessionColumn').onclick=createSessionColumn;
  $('#fieldSamplePlants').onclick=setupSamplePlants;
  $('#fieldUndo').onclick=undoLayout;$('#fieldRedo').onclick=redoLayout;
  $('#fieldLayoutEdit').onclick=()=>{layoutEditMode=!layoutEditMode;$('#fieldLayoutEdit').setAttribute('aria-pressed',String(layoutEditMode));renderMap();if(Number.isInteger(selectedRow))renderEditor(selectedRow);};
  $('#fieldMultiToggle').onclick=()=>{multiMode=!multiMode;selectedRows.clear();$('#fieldMultiToggle').setAttribute('aria-pressed',String(multiMode));renderMap();renderBatchEditor();};
  $('#fieldPrint').onclick=()=>window.print();
  $('#fieldExportLayout').onclick=exportLayout;
  $('#fieldImportLayout').onclick=()=>$('#fieldLayoutImportInput').click();
  $('#fieldResetLayout').onclick=resetLayout;
  $('#fieldLayoutImportInput').onchange=importLayout;
  for(const id of ['fieldObserver','fieldSessionLabel','fieldActiveParameter','fieldIdColumn','fieldGroupColumn','fieldColorColumn','fieldColorMode','fieldHeatmapColumn','fieldFilter','fieldColumns','fieldRoadEvery','fieldNorth','fieldPlotSize','fieldSerpentine']){
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
  $('#fieldPlotEditor').addEventListener('input',event=>{
    if(event.target.closest('[data-batch-editor]'))return;
    dirty=true;clearTimeout(autoSaveTimer);autoSaveTimer=setTimeout(()=>saveEditor({quiet:true,rerender:false}),650);
  });
  $('#fieldPlotEditor').addEventListener('click',event=>{
    if(event.target.closest('[data-field-save]'))saveEditor();
    if(event.target.closest('[data-field-prev]'))stepEditor(-1);
    if(event.target.closest('[data-field-next]'))stepEditor(1);
    if(event.target.closest('[data-field-next-incomplete]'))nextIncomplete();
    const score=event.target.closest('[data-quick-score]');if(score){const input=$('#fieldPlotEditor [data-field-active-input]');if(input){input.value=score.dataset.quickScore;input.dispatchEvent(new Event('input',{bubbles:true}));saveEditor({quiet:true,rerender:false});}}
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
    const inField=!!event.target.closest('input,select,textarea');
    const mod=event.ctrlKey||event.metaKey;
    if(mod&&event.key.toLowerCase()==='z'&&!event.shiftKey){event.preventDefault();event.stopImmediatePropagation();undoLayout();return;}
    if((mod&&event.key.toLowerCase()==='y')||(mod&&event.shiftKey&&event.key.toLowerCase()==='z')){event.preventDefault();event.stopImmediatePropagation();redoLayout();return;}
    if(event.key==='Escape'&&!inField){event.preventDefault();closeFieldLayout();return;}
    if(!inField&&event.key==='ArrowLeft'){event.preventDefault();stepEditor(-1);return;}
    if(!inField&&event.key==='ArrowRight'){event.preventDefault();stepEditor(1);return;}
    if(!inField&&(event.key==='s'||event.key==='S')){event.preventDefault();$('#fieldLayoutEdit')?.click();return;}
    if(!inField&&(event.key==='m'||event.key==='M')){event.preventDefault();$('#fieldMultiToggle')?.click();}
  },true);
  document.addEventListener('stat-dataset-changed',event=>{
    if(!$('#fieldLayoutModal')?.classList.contains('open'))return;
    const patch=event.detail?.patch;
    if(patch?.kind==='delete_row'&&Array.isArray(config?.uids)){
      const row=Number(patch.row);if(Number.isInteger(row)&&row>=0)config.uids.splice(row,1);
      writeConfig(current,config);
    }else if(patch?.kind==='append_row'&&Array.isArray(config?.uids)){
      config.uids.push(crypto.randomUUID());writeConfig(current,config);
    }
    if(dirty)return;
    const keep=selectedRow;refreshData();
    if(multiMode)renderBatchEditor();else if(Number.isInteger(keep)&&keep<current.rows.length){selectedRow=keep;renderEditor(keep);}
  });
}

function groupLabelForRow(index){
  const row=current?.rows?.[index];if(!row)return '';
  return config.group>=0?String(row[config.group]??'').trim()||'Tanpa kelompok':'Semua petak';
}
function rawGroupOrder(label){
  const rows=[];current.rows.forEach((row,index)=>{if(groupLabelForRow(index)===label)rows.push(index);});
  const savedKeys=Array.isArray(config.order?.[label])?config.order[label].map(String):[];
  const byKey=new Map(rows.map(index=>[plotKey(index),index]));
  const saved=savedKeys.map(key=>byKey.get(key)).filter(index=>Number.isInteger(index));
  return [...saved,...rows.filter(index=>!saved.includes(index))];
}
function movePlotTo(source,target){
  const sourceGroup=groupLabelForRow(source),targetGroup=groupLabelForRow(target);
  if(!sourceGroup||sourceGroup!==targetGroup)return;
  const order=rawGroupOrder(sourceGroup),from=order.indexOf(source),to=order.indexOf(target);
  if(from<0||to<0||from===to)return;
  pushLayoutHistory('susun plot');order.splice(from,1);order.splice(to,0,source);
  config={...config,order:{...config.order,[sourceGroup]:order.map(plotKey)},serpentine:false};
  writeConfig(current,config);renderControls();renderMap();
}
function moveSelectedPlot(direction){
  if(!Number.isInteger(selectedRow))return;
  const group=groupLabelForRow(selectedRow),order=rawGroupOrder(group),from=order.indexOf(selectedRow),to=from+direction;
  if(from<0||to<0||to>=order.length)return;
  pushLayoutHistory('geser plot');[order[from],order[to]]=[order[to],order[from]];
  config={...config,order:{...config.order,[group]:order.map(plotKey)},serpentine:false};
  writeConfig(current,config);renderControls();renderMap();renderEditor(selectedRow);
}
function selectVisible(){
  selectedRows.clear();
  $('#fieldMap')?.querySelectorAll('[data-field-row]').forEach(plot=>selectedRows.add(Number(plot.dataset.fieldRow)));
  renderMap();renderBatchEditor();
}

function activeParameterIndex(){
  const index=Number(config?.session?.parameter);
  return Number.isInteger(index)&&index>=0&&index<current.headers.length&&!structuralHeader(current.headers[index])?index:-1;
}
function sampleGroupForIndex(index){
  const header=current.headers[index];if(!header)return null;
  return (config.sampleGroups||[]).find(group=>group.members.includes(header)||group.meanHeader===header)||null;
}
function observationIndices(){
  const active=activeParameterIndex();
  if(active<0)return measurementColumns(current).map(item=>item.index);
  const group=sampleGroupForIndex(active);
  if(!group)return [active];
  return group.members.map(header=>current.headers.indexOf(header)).filter(index=>index>=0);
}
function rowIncomplete(index){
  const row=current.rows[index];if(!row)return false;
  if(['missing','dead'].includes(plotStatus(index)))return false;
  const indices=observationIndices();
  if(!indices.length)return rowProgress(current,row).status!=='complete';
  return indices.some(col=>String(row[col]??'').trim()==='');
}
function nextIncomplete(){
  const route=[...($('#fieldMap')?.querySelectorAll('[data-field-row]')||[])].map(plot=>Number(plot.dataset.fieldRow)).filter(Number.isInteger);
  if(!route.length)return;
  const start=Math.max(-1,route.indexOf(selectedRow));
  for(let offset=1;offset<=route.length;offset++){
    const row=route[(start+offset+route.length)%route.length];
    if(rowIncomplete(row)){selectRow(row);return;}
  }
  const status=$('#fieldEditorStatus');if(status)status.textContent='✓ Semua plot pada tampilan ini sudah terisi.';
}
function toggleFieldMode(){
  pushLayoutHistory('mode lapangan');
  config={...config,fieldMode:!config.fieldMode};writeConfig(current,config);
  $('#fieldLayoutModal')?.classList.toggle('field-mode',config.fieldMode);
  $('#fieldModeToggle')?.setAttribute('aria-pressed',String(config.fieldMode));
  renderControls();renderMap();
  if(config.fieldMode&&!Number.isInteger(selectedRow))nextIncomplete();
  else if(Number.isInteger(selectedRow))renderEditor(selectedRow);
}
function validateBlocks(){
  const groups=groupEntries(current),lines=[];
  for(const [label,entries] of groups){
    const missing=entries.filter(entry=>rowIncomplete(entry.index));
    if(missing.length)lines.push(label+': '+missing.length+' belum lengkap — '+missing.slice(0,8).map(entry=>plotLabel(current,entry.row,entry.index).id).join(', ')+(missing.length>8?'…':''));
    else lines.push(label+': lengkap ✓');
  }
  alert(lines.join('\n'));
}
function createSessionColumn(){
  const active=activeParameterIndex(),label=String(config.session?.label||'').trim();
  if(active<0)return alert('Pilih Parameter aktif terlebih dahulu.');
  if(!label)return alert('Isi nama sesi, misalnya 28 HST.');
  const base=String(current.headers[active]),name=base+' '+label;
  const existing=current.headers.findIndex(header=>header.toLocaleLowerCase('id-ID')===name.toLocaleLowerCase('id-ID'));
  let index=existing;
  if(index<0){
    const result=api()?.appendColumn?.(name,'tambah parameter waktu dari denah');
    if(!result?.ok)return alert(result?.error||'Parameter waktu belum dapat dibuat.');
    index=result.index;refreshData(false);
  }
  pushLayoutHistory('parameter waktu');
  config={...config,session:{...config.session,label,parameter:index,date:new Date().toISOString().slice(0,10)}};writeConfig(current,config);
  renderControls();renderMap();if(Number.isInteger(selectedRow))renderEditor(selectedRow);
}
function setupSamplePlants(){
  const active=activeParameterIndex();if(active<0)return alert('Pilih Parameter aktif terlebih dahulu.');
  const count=Math.max(2,Math.min(20,Number(prompt('Jumlah tanaman sampel per plot:','5'))||0));if(!count)return;
  const base=String(current.headers[active]).replace(/\s+T\d+$/i,'').replace(/\s+Rerata$/i,'').trim();
  const members=[];
  for(let i=1;i<=count;i++){
    const name=base+' T'+i;
    let index=current.headers.findIndex(header=>header===name);
    if(index<0){const result=api()?.appendColumn?.(name,'tambah tanaman sampel');if(!result?.ok)return alert(result?.error||'Kolom sampel gagal dibuat.');refreshData(false);index=result.index;}
    members.push(name);
  }
  const meanHeader=base+' Rerata';
  let meanIndex=current.headers.findIndex(header=>header===meanHeader);
  if(meanIndex<0){const result=api()?.appendColumn?.(meanHeader,'tambah rerata sampel');if(!result?.ok)return alert(result?.error||'Kolom rerata gagal dibuat.');refreshData(false);meanIndex=result.index;}
  pushLayoutHistory('setup tanaman sampel');
  const others=(config.sampleGroups||[]).filter(group=>group.meanHeader!==meanHeader);
  config={...config,sampleGroups:[...others,{base,members,meanHeader}],session:{...config.session,parameter:current.headers.indexOf(members[0])}};writeConfig(current,config);
  renderControls();renderMap();if(Number.isInteger(selectedRow))renderEditor(selectedRow);
}
function applySampleMeans(values){
  for(const group of config.sampleGroups||[]){
    const memberIndexes=group.members.map(header=>current.headers.indexOf(header)).filter(index=>index>=0),meanIndex=current.headers.indexOf(group.meanHeader);
    if(meanIndex<0||!memberIndexes.length)continue;
    const nums=memberIndexes.map(index=>Number(String(values[index]??'').replace(',','.')));
    if(nums.every(Number.isFinite))values[meanIndex]=String(nums.reduce((a,b)=>a+b,0)/nums.length);
    else values[meanIndex]='';
  }
}

function statusOptions(selected='',includeKeep=false){
  const list=[['normal','Normal'],['missing','Petak kosong'],['dead','Tanaman mati'],['damaged','Rusak'],['harvested','Panen'],['border','Border']];
  return (includeKeep?'<option value="">Jangan ubah status</option>':'')+list.map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
}
function renderBatchEditor(){
  if(!multiMode)return;
  const host=$('#fieldPlotEditor');if(!host)return;
  const measures=measurementColumns(current),count=selectedRows.size;
  host.innerHTML=`
    <div class="field-editor-head"><div><small>Mode massal</small><strong>${count} plot dipilih</strong><span>Klik plot untuk menambah/mengurangi pilihan</span></div></div>
    <div class="field-batch-toolbar"><button type="button" data-batch-select-visible>Pilih terlihat</button><button type="button" data-batch-clear>Kosongkan pilihan</button></div>
    <div class="field-batch-editor" data-batch-editor>
      <label>Parameter<select data-batch-column><option value="-1">Tanpa mengubah nilai</option>${measures.map(item=>`<option value="${item.index}">${esc(item.header)}</option>`).join('')}</select></label>
      <label>Nilai<input data-batch-value autocomplete="off" inputmode="decimal" placeholder="Nilai untuk semua plot"></label>
      <label>Status<select data-batch-status>${statusOptions('',true)}</select></label>
      <button type="button" class="primary" data-batch-apply ${count?'':'disabled'}>Terapkan ke ${count} plot</button>
      <p class="field-editor-status" id="fieldBatchStatus"></p>
    </div>`;
}
function applyBatch(){
  const rows=[...selectedRows].filter(index=>index>=0&&index<current.rows.length);
  if(!rows.length)return;
  const col=Number($('#fieldPlotEditor [data-batch-column]')?.value??-1);
  const value=String($('#fieldPlotEditor [data-batch-value]')?.value??'').trim();
  const status=String($('#fieldPlotEditor [data-batch-status]')?.value||'');
  const changes=col>=0?rows.map(row=>({row,col,value})):[];
  const result=changes.length?api()?.updateCells?.(changes,'isi massal dari denah lahan'):{ok:true,changed:false,count:0};
  if(!result?.ok){const out=$('#fieldBatchStatus');if(out)out.textContent=result?.error||'Perubahan massal gagal.';return;}
  if(col>=0&&value===''&&!confirm(`Nilai kosong akan diterapkan ke ${rows.length} plot dan dapat menghapus data parameter terpilih. Lanjutkan?`))return;
  if((col>=0||status)&&rows.length>1&&!confirm(`Terapkan perubahan massal ke ${rows.length} plot?`))return;
  if(status){
    pushLayoutHistory('status massal');const statuses={...config.statuses};for(const row of rows)statuses[plotKey(row)]=status;
    config={...config,statuses};writeConfig(current,config);
  }
  refreshData(false);renderMap();renderBatchEditor();
  const out=$('#fieldBatchStatus');if(out)out.textContent=`✓ ${rows.length} plot diperbarui.`;
}
function exportLayout(){
  const payload={version:2,dataset:keyFor(current),rows:current.rows.length,headers:[...current.headers],config};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=(String(current.name||'dataset').replace(/[^a-z0-9._-]+/gi,'-')||'dataset')+'-denah.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
async function importLayout(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  try{
    const payload=JSON.parse(await file.text());
    if(!payload||typeof payload!=='object'||!payload.config)throw Error('File denah tidak valid.');
    if(Number(payload.rows)!==current.rows.length)throw Error(`Jumlah plot berbeda: file ${payload.rows}, dataset ${current.rows.length}.`);
    const incoming=Array.isArray(payload.headers)?payload.headers.map(String):[];
    if(incoming.length!==current.headers.length||incoming.some((header,index)=>header!==String(current.headers[index])))throw Error('Struktur kolom file denah berbeda dari dataset aktif.');
    if(payload.dataset&&String(payload.dataset)!==keyFor(current)&&!confirm('Nama dataset pada file denah berbeda. Struktur plot cocok. Tetap impor?'))return;
    pushLayoutHistory('impor denah');config=normalizeConfig(current,payload.config);writeConfig(current,config);renderControls();renderMap();
    if(Number.isInteger(selectedRow))renderEditor(selectedRow);
  }catch(error){alert(error.message||'File denah tidak dapat dibaca.');}
}
function resetLayout(){
  if(!confirm('Reset susunan fisik denah? Status dan catatan plot tetap dipertahankan.'))return;
  const base=defaultConfig(current);pushLayoutHistory('reset susunan');
  config={...config,columns:base.columns,serpentine:true,north:'N',roadEvery:0,order:{},roadAfter:{},flipX:false,flipY:false};
  writeConfig(current,config);layoutEditMode=false;$('#fieldLayoutEdit')?.setAttribute('aria-pressed','false');renderControls();renderMap();
}

function readControls(){
  if(!current)return;
  pushLayoutHistory('ubah pengaturan denah');config={...config,
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
  if($('#fieldUndo'))$('#fieldUndo').disabled=!layoutUndo.length;if($('#fieldRedo'))$('#fieldRedo').disabled=!layoutRedo.length;
}
function renderStats(){
  const progress=current.rows.map(row=>rowProgress(current,row));
  const complete=progress.filter(item=>item.status==='complete').length;
  const partial=progress.filter(item=>item.status==='partial').length;
  const empty=progress.filter(item=>item.status==='empty').length;
  const flagged=current.rows.reduce((sum,_,index)=>sum+(plotStatus(index)!=='normal'?1:0),0);
  const measures=measurementColumns(current).length;
  $('#fieldLayoutStats').innerHTML=`<span><b>${current.rows.length}</b> plot</span><span><b>${measures}</b> parameter</span>${measures?`<span><b>${complete}</b> lengkap</span><span><b>${partial}</b> sebagian</span><span><b>${empty}</b> kosong</span>`:'<span>Tambahkan parameter untuk mulai pengamatan.</span>'}<span><b>${flagged}</b> status khusus</span>${multiMode?`<span><b>${selectedRows.size}</b> dipilih</span>`:''}`;
}
function renderMap(){
  if(!current)return;
  const query=String($('#fieldSearch')?.value||'').trim().toLocaleLowerCase('id-ID');
  const scale=heatmapScale(),map=$('#fieldMap');
  map.className=`field-map field-size-${config.size}${layoutEditMode?' field-layout-editing':''}${multiMode?' field-multi-mode':''}`;
  const arrow=$('#fieldNorthArrow');if(arrow)arrow.dataset.direction=config.north;
  const legend=$('#fieldHeatLegend');
  if(legend){
    if(scale){
      legend.hidden=false;legend.innerHTML=`<b>${esc(current.headers[scale.index])}</b><span>${esc(String(scale.min))}</span><i></i><span>${esc(String(scale.max))}</span>`;
    }else if(config.colorMode==='treatment'){
      const values=[...new Set(current.rows.map(row=>colorLabel(current,row)).filter(Boolean))].slice(0,8);
      legend.hidden=!values.length;legend.innerHTML=values.map(value=>`<span class="field-legend-chip" style="--legend-hue:${hashHue(value)}"><i></i>${esc(value)}</span>`).join('');
    }else if(config.colorMode==='completion'){
      legend.hidden=false;legend.innerHTML='<span class="field-legend-chip"><i style="--legend-hue:135"></i>Lengkap</span><span class="field-legend-chip"><i style="--legend-hue:42"></i>Sebagian</span><span class="field-legend-chip"><i style="--legend-hue:0"></i>Kosong</span>';
    }else legend.hidden=true;
  }
  const groups=groupEntries(current);
  let visible=0;
  map.innerHTML=groups.map(([label,entries])=>{
    const ordered=orderedEntries(entries,config.columns,config.serpentine).filter(entry=>matchingSearch(entry,current,query)&&passesFilter(entry));
    if(!ordered.length)return '';
    visible+=ordered.length;
    const plots=ordered.map((entry,index)=>{
      const labels=plotLabel(current,entry.row,entry.index),progress=rowProgress(current,entry.row),visual=visualForPlot(entry,scale),status=plotStatus(entry.index),note=plotNote(entry.index);
      const selected=entry.index===selectedRow?' is-selected':'',multi=selectedRows.has(entry.index)?' is-multi-selected':'',special=status!=='normal'?` field-status-${status}`:'';
      const draggable=layoutEditMode?' draggable="true"':'';
      const statusLabel={missing:'Kosong',dead:'Mati',damaged:'Rusak',harvested:'Panen',border:'Border'}[status]||'';
      const plot=`<button type="button" class="field-plot field-plot-${progress.status}${selected}${multi}${special}${visual.heat?' is-heatmap':''}" data-field-row="${entry.index}" data-field-group="${esc(label)}" ${draggable} style="--plot-hue:${visual.hue}" title="Baris ${entry.index+1}${note?' · '+esc(note):''}">
        <b>${esc(labels.id)}</b>${labels.secondary?`<span>${esc(labels.secondary)}</span>`:'<span>Plot</span>'}<small>${esc(visual.label)}</small>${statusLabel?`<em>${statusLabel}</em>`:''}
      </button>`;
      const road=config.roadEvery>0&&(index+1)%(config.columns*config.roadEvery)===0&&index<ordered.length-1?`<div class="field-road" role="separator"><span>Jalan</span></div>`:'';
      return plot+road;
    }).join('');
    return `<section class="field-block"><div class="field-block-head"><b>${esc(label)}</b><span>${ordered.length} plot${layoutEditMode?' · tarik untuk susun':''}</span></div><div class="field-block-grid" style="--field-columns:${config.columns}">${plots}</div></section>`;
  }).join('');
  if(!visible)map.innerHTML='<div class="field-map-empty">Tidak ada plot yang cocok dengan filter.</div>';
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
    ${layoutEditMode?'<div class="field-layout-move"><button type="button" data-field-move="-1">← Geser</button><button type="button" data-field-move="1">Geser →</button></div>':''}
    <div class="field-editor-fields">
      ${measures.length?`<div class="field-editor-section"><b>Pengamatan</b>${measures.map(item=>fieldInput(current,row,item.index)).join('')}</div>`:'<div class="field-editor-empty compact">Belum ada kolom pengamatan. Tekan <b>+ Parameter</b>.</div>'}
      <div class="field-editor-meta">
        <label><span>Status plot</span><select data-field-status>${statusOptions(plotStatus(rowIndex))}</select></label>
        <label><span>Catatan lapang</span><textarea data-field-note rows="2" placeholder="Mis. rebah, serangan, petak pinggir…">${esc(plotNote(rowIndex))}</textarea></label>
      </div>
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
function saveEditor({quiet=false,rerender=true}={}){
  if(!Number.isInteger(selectedRow)||!current?.rows[selectedRow])return;
  clearTimeout(autoSaveTimer);
  const values=[...current.rows[selectedRow]];
  $('#fieldPlotEditor').querySelectorAll('[data-field-col]').forEach(input=>{values[Number(input.dataset.fieldCol)]=input.value.trim();});
  const result=api()?.replaceRow?.(selectedRow,values,'edit plot dari denah lahan');
  const status=$('#fieldEditorStatus');
  if(!result?.ok){if(status)status.textContent=result?.error||'Data belum dapat disimpan.';return;}
  const nextStatus=String($('#fieldPlotEditor [data-field-status]')?.value||'normal');
  const nextNote=String($('#fieldPlotEditor [data-field-note]')?.value||'').trim();
  const statuses={...config.statuses},notes={...config.notes},meta={...config.plotMeta};
  const key=plotKey(selectedRow),beforeStatus=plotStatus(selectedRow),beforeNote=plotNote(selectedRow);
  if(beforeStatus!==nextStatus||beforeNote!==nextNote)pushLayoutHistory('status/catatan plot');
  delete statuses[selectedRow];delete notes[selectedRow];
  if(nextStatus==='normal')delete statuses[key];else statuses[key]=nextStatus;
  if(nextNote)notes[key]=nextNote;else delete notes[key];
  meta[key]={...(meta[key]||{}),updatedAt:new Date().toISOString(),observer:String(config.observer||'')};
  config={...config,statuses,notes,plotMeta:meta};writeConfig(current,config);
  dirty=false;refreshData(false);renderMap();
  if(rerender)renderEditor(selectedRow);
  const freshStatus=$('#fieldEditorStatus');if(freshStatus&&!quiet)freshStatus.textContent=result.changed?'✓ Data dan status tersimpan.':'✓ Status/catatan tersimpan.';
}
function stepEditor(direction){
  if(!current?.rows.length)return;
  if(dirty){saveEditor();if(dirty)return;}
  const route=[...($('#fieldMap')?.querySelectorAll('[data-field-row]')||[])].map(plot=>Number(plot.dataset.fieldRow)).filter(Number.isInteger);
  if(!route.length)return;
  let index=route.indexOf(selectedRow);
  if(index<0)index=direction>0?-1:0;
  index=(index+direction+route.length)%route.length;
  selectRow(route[index]);
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
  $('#fieldLayoutModal')?.classList.remove('open');document.body.classList.remove('field-layout-open');
  dirty=false;multiMode=false;layoutEditMode=false;selectedRows.clear();selectedRow=null;
}
export function openFieldLayout(){
  ensureModal();refreshData();
  $('#fieldLayoutDataset').textContent=`${current.name||'Dataset'} · ${current.rows.length} baris`;
  $('#fieldLayoutModal').classList.add('open');document.body.classList.add('field-layout-open');
  selectedRow=null;dirty=false;multiMode=false;layoutEditMode=false;selectedRows.clear();
  $('#fieldMultiToggle').setAttribute('aria-pressed','false');$('#fieldLayoutEdit').setAttribute('aria-pressed','false');
  $('#fieldPlotEditor').innerHTML='<div class="field-editor-empty">Klik satu plot untuk mengisi data.</div>';
  renderControls();renderMap();
}
